/**
 * 跨档案批量生成解读（v2.4.0 主功能）。
 *
 * 与 v2.3.0 的「单盘内批量勾选」不同：这里对**档案库中的多份档案**各生成一份完整解读。
 * 复用既有并发调度 `resolveSchedule()`（唯一闸门 `N ≤ aiConcurrencyLimit`），
 * 不新增第二套并发概念、不新增设置项。
 *
 * ★ 关键：任务的 scope / ref / offline 拼装与手动解读**完全相同**
 *   （共用 `chartFacts.ts`），因此 `aiClient.cacheKey()` 一致 ——
 *   先手动生成过的档案在批量时直接命中缓存，不重复消耗额度；反之亦然。
 *
 * 失败语义与 `aiFullReading.ts` 对齐：单项失败重试 1 次，仍失败则记入 `failed`
 * 并继续后续项；取消则整体上抛 `AiError('已取消','cancelled')`，但**已完成的项会保留**
 * （通过 onUpdate 已逐项发布，调用方据 outcome 落库）。
 *
 * 本模块不碰 store、不写 localStorage —— 持久化由调用方（composable）负责。
 */
import type { AiConfig, AiDetailMode, AiStepMode, BodyGraph } from '../types/hd'
import { explain } from './aiClient'
import { resolveSchedule } from './aiConcurrency'
import { cancelledError, errText, isCancelled, withRetry } from './aiAttempt'
import {
  buildUnifiedFacts,
  directionPrompt,
  unifiedScopeRef,
  type ReadingDimKey,
} from './chartFacts'

/** 一份档案的批量任务（已展开好提示词输入，执行期不再读 store） */
export interface BatchTask {
  archiveId: string
  /** 档案名，用于标题与进度显示 */
  name: string
  /** 缓存与落库共用的 scope / ref */
  scope: string
  ref: string
  /** 面板 / 报告标题 */
  title: string
  /** 【离线释义】正文（事实块 + 角度 + 收束指令） */
  offline: string
  /** 盘面摘要，供防幻觉复核；与手动解读同为 `undefined`（事实已在 offline 内） */
  chartSummary?: string
  mode: AiDetailMode
}

export interface BatchBuildOptions {
  dimensions: ReadingDimKey[]
  angleKey: string
  angleLabel: string
  anglePrompt: string
  customDirection: string
  detailMode: AiDetailMode
  /** 标题后缀（如「批量生成」），便于在解读列表里区分来源 */
  titleSuffix?: string
}

export interface BatchInput {
  archiveId: string
  name: string
  chart: BodyGraph | null | undefined
  /** 重算失败原因；有值时该档案不生成，记为「跳过」而不是「失败」 */
  chartError?: string
}

/**
 * 展开批量任务清单（纯函数，可单测）。
 *
 * @returns tasks 可执行任务；skipped 因缺盘面 / 盘面错误而跳过的档案名与原因
 */
export function buildBatchTasks(
  inputs: BatchInput[],
  options: BatchBuildOptions,
): { tasks: BatchTask[]; skipped: Array<{ archiveId: string; name: string; reason: string }> } {
  const tasks: BatchTask[] = []
  const skipped: Array<{ archiveId: string; name: string; reason: string }> = []
  const ref = unifiedScopeRef(options.dimensions, options.angleKey, options.customDirection)
  const direction = directionPrompt(
    options.angleLabel,
    options.anglePrompt,
    options.customDirection,
  )

  for (const item of inputs) {
    if (item.chartError) {
      skipped.push({ archiveId: item.archiveId, name: item.name, reason: `盘面重算失败：${item.chartError}` })
      continue
    }
    if (!item.chart) {
      skipped.push({ archiveId: item.archiveId, name: item.name, reason: '尚无盘面快照' })
      continue
    }
    const facts = buildUnifiedFacts(item.chart, options.dimensions)
    tasks.push({
      archiveId: item.archiveId,
      name: item.name,
      scope: 'unified',
      ref,
      title: [
        item.name,
        'AI 综合解读',
        options.customDirection || options.angleLabel,
        options.titleSuffix,
      ]
        .filter(Boolean)
        .join(' · '),
      offline: `${facts}\n\n${direction}\n\n请把以上所有勾选维度作为一个整体来综合解读：先给出整体画像结论，再分别说明各维度如何相互影响，最后给落地建议。`,
      chartSummary: undefined,
      mode: options.detailMode,
    })
  }
  return { tasks, skipped }
}

/** 批量生成进度（结构与 `AiProgress` 对齐，额外给出成功/跳过计数供界面区分） */
export interface BatchProgress {
  done: number
  total: number
  /** 当前处理项名称 */
  current: string
  /** 阶段：批量生成 / 已完成 */
  phase: string
  elapsedMs: number
  etaMs: number | null
  /** 成功项数 */
  ok: number
  /** 成功项的档案 id（按完成顺序），供结果条提供「查看」跳转 */
  okIds: string[]
  /** 失败项标题（重试后仍失败） */
  failed: string[]
  /** 跳过项标题（缺盘面等，不算失败） */
  skipped: string[]
}

export interface BatchOutcome {
  archiveId: string
  name: string
  scope: string
  ref: string
  mode: AiDetailMode
  title: string
  /** 成功时为空串 */
  content: string
  /** 非空表示该项失败 */
  error: string
}

export interface BatchReport {
  outcomes: BatchOutcome[]
  ok: number
  failed: string[]
  skipped: string[]
  totalChars: number
  generatedAt: string
  /** 实际使用的调度（含是否降级），供 UI 提示 N/Y/K */
  scheduleInfo: { required: number; limit: number; batchWidth: number; batchCount: number; degraded: boolean }
}

export interface BatchOptions {
  cfg: AiConfig
  tasks: BatchTask[]
  /** 预检跳过的档案（由 buildBatchTasks 产出），原样带进报告 */
  skipped?: string[]
  stepMode: AiStepMode
  /** 并发上限 Y */
  concurrencyLimit: number
  signal?: AbortSignal
  onUpdate?: (payload: {
    progress: BatchProgress
    /** 已完成项的结果（含失败），便于调用方增量落库 */
    outcomes: BatchOutcome[]
  }) => void
}

/**
 * 执行批量生成。
 *
 * 调度：`resolveSchedule(tasks.length, limit, stepMode)` ——
 * 未超限时一个 `Promise.all` 一次性发起全部 N 项；超限时按 `batchWidth = Y` 分 K 批。
 * 串行模式 `batchWidth = 1`。
 */
export async function runBatchReading(options: BatchOptions): Promise<BatchReport> {
  const { cfg, tasks, signal } = options
  const schedule = resolveSchedule(tasks.length, options.concurrencyLimit, options.stepMode)
  const total = tasks.length
  const startedAt = Date.now()
  const generatedAt = new Date().toISOString()

  const outcomes = new Map<number, BatchOutcome>()
  const durations: number[] = []
  const failed: string[] = []
  let ok = 0
  let done = 0
  const skipped = [...(options.skipped ?? [])]
  const degradedNote = `超出并发上限 ${schedule.limit}，已分批执行（共 ${schedule.batchCount} 批）`

  const publish = (current: string, phase: string) => {
    const elapsedMs = Date.now() - startedAt
    const remaining = Math.max(0, total - done)
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null
    // 与 aiFullReading 同口径：按批宽归一，避免一次性并发下 ETA 失真
    const divisor = Math.max(1, schedule.batchWidth)
    options.onUpdate?.({
      progress: {
        done,
        total,
        current,
        phase,
        elapsedMs,
        etaMs: avg !== null && remaining > 0 ? Math.round((avg * remaining) / divisor) : null,
        ok,
        okIds: [...outcomes.values()].filter((o) => o.content).map((o) => o.archiveId),
        failed: [...failed],
        skipped: [...skipped],
      },
      outcomes: [...outcomes.values()],
    })
  }

  const attempt = async (
    index: number,
  ): Promise<{ index: number; outcome: BatchOutcome; cancelled: boolean }> => {
    // 取消不抛：并批时 Promise.all 会放大成多个 rejection（易变未处理拒绝），
    // 统一用 cancelled 标记返回，由调用方在批边界上抛一次。
    if (signal?.aborted) {
      return {
        index,
        cancelled: true,
        outcome: {
          archiveId: tasks[index].archiveId,
          name: tasks[index].name,
          scope: tasks[index].scope,
          ref: tasks[index].ref,
          mode: tasks[index].mode,
          title: tasks[index].title,
          content: '',
          error: '',
        },
      }
    }
    const task = tasks[index]
    const base = {
      archiveId: task.archiveId,
      name: task.name,
      scope: task.scope,
      ref: task.ref,
      mode: task.mode,
      title: task.title,
    }
    try {
      const content = await withRetry(
        () =>
          explain({
            cfg,
            scope: task.scope,
            ref: task.ref,
            offline: task.offline,
            chartSummary: task.chartSummary,
            detailMode: task.mode,
            angle: task.title,
            signal,
          }),
        signal,
      )
      return { index, cancelled: false, outcome: { ...base, content, error: '' } }
    } catch (err) {
      // 取消：不记为失败，交给调用方上抛（已发布的结果不丢）
      if (isCancelled(err, signal)) return { index, cancelled: true, outcome: { ...base, content: '', error: '' } }
      return { index, cancelled: false, outcome: { ...base, content: '', error: errText(err) } }
    }
  }

  const settle = (index: number, outcome: BatchOutcome) => {
    outcomes.set(index, outcome)
    if (outcome.error) failed.push(`${outcome.name}：${outcome.error}`)
    else ok += 1
    done += 1
    publish(
      schedule.degraded ? degradedNote : outcome.name,
      schedule.degraded ? degradedNote : '批量生成',
    )
  }

  // 首帧即发布（≤300ms 可见），N/Y/K 提示从这一帧起就存在
  publish(
    total ? `准备生成 ${total} 份解读` : '没有可生成的档案',
    schedule.degraded ? degradedNote : '批量生成',
  )
  if (!total) {
    return {
      outcomes: [],
      ok: 0,
      failed,
      skipped,
      totalChars: 0,
      generatedAt,
      scheduleInfo: schedule,
    }
  }

  if (options.stepMode === 'serial') {
    for (let i = 0; i < total; i += 1) {
      if (signal?.aborted) throw cancelledError(signal)
      publish(tasks[i].name, '批量生成（串行）')
      const t0 = Date.now()
      const r = await attempt(i)
      durations.push(Date.now() - t0)
      if (r.cancelled) throw cancelledError(signal)
      settle(r.index, r.outcome)
    }
  } else {
    const width = Math.max(1, schedule.batchWidth)
    for (let start = 0; start < total; start += width) {
      if (signal?.aborted) throw cancelledError(signal)
      const batch = tasks.slice(start, start + width).map((_, k) => start + k)
      publish(
        schedule.degraded
          ? `${degradedNote}｜本批 ${batch.length} 份`
          : `一次性并发 ${total} 份（上限 ${schedule.limit}）`,
        '批量生成',
      )
      const t0 = Date.now()
      const settled = await Promise.all(batch.map((i) => attempt(i)))
      durations.push((Date.now() - t0) / Math.max(1, batch.length))
      // 先落盘本批已完成的项（不丢结果），再在批边界统一上抛取消
      let hitCancel = false
      for (const s of settled) {
        if (s.cancelled) {
          hitCancel = true
          continue
        }
        settle(s.index, s.outcome)
      }
      if (hitCancel || signal?.aborted) throw cancelledError(signal)
    }
  }

  const ordered = [...outcomes.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  publish('已完成', '已完成')
  return {
    outcomes: ordered,
    ok,
    failed,
    skipped,
    totalChars: ordered.reduce((sum, o) => sum + o.content.length, 0),
    generatedAt,
    scheduleInfo: schedule,
  }
}
