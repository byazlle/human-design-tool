/**
 * 批量生成解读的编排（v2.4.0）。
 *
 * 职责边界：
 * - `services/aiBatchReading.ts` 负责「怎么跑」（调度、重试、进度），不碰 store；
 * - 本 composable 负责「跑谁、结果存哪」：从 archive / settings 取输入，
 *   逐项完成后写入 `readings` store，并把进度推给 ui store 供弹层展示。
 *
 * 状态放在 ui store（与 `aiReading` 平级），因为批量生成要在多个视图里可见
 * （档案库页发起、切页后仍能看到进度），组件局部状态做不到这一点。
 */
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useArchiveStore } from '../stores/archive'
import { useReadingsStore, makeReading } from '../stores/readings'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useAiStreams } from './useAiStreams'
import { runBatchReading, buildBatchTasks, type BatchOutcome, type BatchReport } from '../services/aiBatchReading'
import { angleOf } from '../services/readingAngles'
import { ALL_READING_DIMS, type ReadingDimKey } from '../services/chartFacts'
import { AiError } from '../services/aiClient'
import type { AiDetailMode } from '../types/hd'

export interface BatchRunOptions {
  /** 待生成的档案 id（顺序即执行顺序） */
  archiveIds: string[]
  dimensions: ReadingDimKey[]
  angleKey: string
  customDirection: string
  /** 缺省用设置里的当前档位 */
  detailMode?: AiDetailMode
  /** 本次每份解读的 token 总预算；缺省用设置里的全局值（0 = 不限制） */
  tokenBudget?: number
  /** 已有解读的处理：skip 跳过（默认）/ overwrite 覆盖 */
  onExisting?: 'skip' | 'overwrite'
}

export function useAiBatch() {
  const archiveStore = useArchiveStore()
  const readings = useReadingsStore()
  const settings = useSettingsStore()
  const ui = useUiStore()
  const streams = useAiStreams()
  const { batch: batchState } = storeToRefs(ui)

  /** v3.0.0：每份档案一行实时状态，key 与档案 id 绑定，并发不串台 */
  const streamKey = (archiveId: string) => `batch:${archiveId}`
  const streamHooks = {
    eventsFor: (task: { archiveId: string; name: string }) => {
      const key = streamKey(task.archiveId)
      streams.begin(key, task.name)
      return {
        onConnected: () => streams.connected(key),
        onDelta: (text: string) => streams.delta(key, text),
        onFallback: (reason: string) => streams.fallback(key, reason),
      }
    },
    finish: (task: { archiveId: string }, ok: boolean, error?: string) =>
      streams.finish(streamKey(task.archiveId), ok, error),
  }

  const controller = ref<AbortController | null>(null)
  /** 已完成的项（含失败），用于「重跑失败项」与结果列表 */
  const lastOutcomes = ref<BatchOutcome[]>([])
  const lastReport = ref<BatchReport | null>(null)

  const running = computed(() => batchState.value.running)
  const configured = computed(() => settings.aiConfigured)

  /**
   * 预检查：返回本次实际会生成的数量与要跳过的数量。
   * 档案库页在点「开始生成」前用它显示「将生成 N 份 / 跳过 M 份（已有解读）」，
   * 避免用户点下去才发现一大批被跳过（或反被覆盖）。
   */
  function preview(options: BatchRunOptions) {
    const ids = options.archiveIds
    const dims = options.dimensions.length ? options.dimensions : ALL_READING_DIMS
    const mode = options.detailMode ?? settings.aiDetailMode
    const angle = angleOf(options.angleKey)
    const ref = `${dims.join('+')}:${options.angleKey}:${options.customDirection || '-'}`

    const existing = ids.filter(
      (id) => readings.find(id, 'unified', ref, mode, settings.aiAudience) !== null,
    )
    const onExisting = options.onExisting ?? 'skip'
    const toRun = onExisting === 'overwrite' ? ids : ids.filter((id) => !existing.includes(id))

    const inputs = toRun
      .map((id) => archiveStore.byId(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ archiveId: a.id, name: a.name, chart: a.chart, chartError: a.chartError }))

    const { tasks, skipped } = buildBatchTasks(inputs, {
      dimensions: dims,
      angleKey: options.angleKey,
      angleLabel: angle.label,
      anglePrompt: angle.prompt,
      customDirection: options.customDirection,
      detailMode: mode,
    })

    return {
      runnable: tasks.length,
      skipped: skipped.map((s) => `${s.name}（${s.reason}）`),
      /** 因已有解读而跳过（onExisting='skip' 时） */
      existing: existing.length,
      hadConfigured: settings.aiConfigured,
    }
  }

  /** 中断当前批量生成；已完成的项已在 store 中，不会丢 */
  function abort() {
    controller.value?.abort()
  }

  /**
   * 执行批量生成。
   * @returns 报告；取消时抛出（已完成的项仍已落库），其余异常原样上抛
   */
  async function run(options: BatchRunOptions): Promise<BatchReport | null> {
    if (batchState.value.running) return null
    if (!settings.aiConfigured) {
      ui.notify('尚未配置 AI 接口，请先到设置页填写', 'error')
      return null
    }
    const dims = options.dimensions.length ? options.dimensions : ALL_READING_DIMS
    if (!dims.length) {
      ui.notify('请至少选择一个解读维度', 'error')
      return null
    }

    const mode = options.detailMode ?? settings.aiDetailMode
    const angle = angleOf(options.angleKey)
    const onExisting = options.onExisting ?? 'skip'
    const scopeRef = `${dims.join('+')}:${options.angleKey}:${options.customDirection || '-'}`

    // 先筛掉已有解读的档案（除非明确要求覆盖），否则会白白重复消耗额度
    const existingIds = new Set(
      options.archiveIds.filter(
        (id) => readings.find(id, 'unified', scopeRef, mode, settings.aiAudience) !== null,
      ),
    )
    const targetIds =
      onExisting === 'overwrite'
        ? options.archiveIds
        : options.archiveIds.filter((id) => !existingIds.has(id))

    const inputs = targetIds
      .map((id) => archiveStore.byId(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => ({ archiveId: a.id, name: a.name, chart: a.chart, chartError: a.chartError }))

    const { tasks, skipped } = buildBatchTasks(inputs, {
      dimensions: dims,
      angleKey: options.angleKey,
      angleLabel: angle.label,
      anglePrompt: angle.prompt,
      customDirection: options.customDirection,
      detailMode: mode,
    })

    const skippedLabels = skipped.map((s) => `${s.name}（${s.reason}）`)
    if (!tasks.length) {
      ui.notify(
        skippedLabels.length
          ? `没有可生成的档案：${skippedLabels.length} 份因缺盘面被跳过`
          : onExisting === 'skip' && existingIds.size
            ? `选中的 ${existingIds.size} 份都已有该维度的解读，无需重复生成`
            : '没有可生成的档案',
        'error',
      )
      return null
    }

    const ctrl = new AbortController()
    controller.value = ctrl
    lastOutcomes.value = []
    lastReport.value = null

    ui.beginBatch(tasks.length, {
      current: `准备生成 ${tasks.length} 份解读`,
      phase: '批量生成',
    })

    try {
      const report = await runBatchReading({
        cfg: settings.ai,
        tasks,
        skipped: skippedLabels,
        stepMode: settings.aiStepMode,
        concurrencyLimit: settings.aiConcurrencyLimit,
        audience: settings.aiAudience,
        tokenBudget: options.tokenBudget ?? settings.aiTokenBudget,
        signal: ctrl.signal,
        streams: streamHooks,
        onUpdate: ({ progress, outcomes }) => {
          ui.setBatchProgress(progress)
          // 增量落库：每一有结果的项立刻写盘，中途取消或刷新都不丢已完成的部分
          persistOutcomes(outcomes, mode)
          lastOutcomes.value = outcomes
        },
      })

      persistOutcomes(report.outcomes, mode)
      lastOutcomes.value = report.outcomes
      lastReport.value = report

      const truncatedCount = report.truncatedNames.length
      const summary =
        `${report.ok} 份已生成` +
        (report.failed.length ? `，${report.failed.length} 份失败` : '') +
        (report.skipped.length ? `，跳过 ${report.skipped.length} 份` : '') +
        (truncatedCount ? `，其中 ${truncatedCount} 份触顶可能不完整` : '')
      ui.finishBatch(summary, report.failed.length === 0 && truncatedCount === 0)
      return report
    } catch (err) {
      const isCancel = err instanceof AiError && err.kind === 'cancelled'
      if (isCancel) {
        // 取消不是错误：已完成的项已落库，如实告知完成了几份
        ui.finishBatch(`已中断，已完成的 ${lastOutcomes.value.filter((o) => o.content).length} 份已保存`, true)
        return null
      }
      ui.finishBatch(`批量生成失败：${(err as Error).message}`, false)
      throw err
    } finally {
      controller.value = null
    }
  }

  /**
   * 把结果写入 readings store。
   *
   * 只写成功项——失败项没有内容可存，写空记录会污染「已有解读」判定，
   * 导致用户重跑时被误判为已完成而跳过。
   */
  function persistOutcomes(outcomes: BatchOutcome[], mode: AiDetailMode) {
    const records = outcomes
      .filter((o) => o.content)
      .map((o) =>
        makeReading({
          archiveId: o.archiveId,
          scope: o.scope,
          ref: o.ref,
          mode,
          title: o.title,
          content: o.content,
          audience: settings.aiAudience,
          truncated: o.truncated,
        }),
      )
    if (records.length) readings.putMany(records)
  }

  /** 只重跑上次失败的那些档案 */
  async function retryFailed(base: Omit<BatchRunOptions, 'archiveIds'>): Promise<BatchReport | null> {
    const failedIds = lastOutcomes.value.filter((o) => o.error).map((o) => o.archiveId)
    if (!failedIds.length) {
      ui.notify('没有需要重试的档案', 'error')
      return null
    }
    // 失败项没有落库，因此不会被「已有解读」过滤掉
    return run({ ...base, archiveIds: failedIds, onExisting: 'overwrite' })
  }

  return {
    running,
    configured,
    state: batchState,
    lastOutcomes,
    lastReport,
    preview,
    run,
    retryFailed,
    abort,
  }
}
