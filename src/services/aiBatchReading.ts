/**
 * 跨档案批量生成解读（v2.4.0 主功能，v4.0.0 换调度器）。
 *
 * 与 v2.3.0 的「单盘内批量勾选」不同：这里对**档案库中的多份档案**各生成一份解读。
 * v4.0.0 起不再有 `resolveSchedule` 分批，也不再区分串行/并行开关：
 * 一律走 `aiScheduler.runSlidingWindow`，并发数就是 `maxConcurrency`（1–99），
 * 起速每秒 1 个、满载后落定即补（ARCH §4）。
 *
 * ★ 关键：任务的 scope / ref / offline 拼装与手动解读**完全相同**
 *   （共用 `chartFacts.ts`），因此 `aiClient.cacheKey()` 一致 ——
 *   先手动生成过的档案在批量时直接命中缓存，不重复消耗额度；反之亦然。
 *
 * 失败语义：单份失败由调度器在同一个并发槽内重试 1 次，仍失败则记入 `failed`
 * 并继续其他份；取消整体上抛 `AiError('已取消','cancelled')`，但**已完成的项会保留**
 * （通过 onUpdate 已逐项发布，调用方据 outcome 落库）。
 *
 * 本模块不碰 store、不写 localStorage —— 持久化由调用方（composable）负责。
 */
import type { AiAudience, AiConfig, AiDetailMode, AiStepMode, AiStyle, BodyGraph } from '../types/hd'
import { chartSummaryOf, explain, resolveStyle } from './aiClient'
import { DEFAULT_AI_MAX_CONCURRENCY, clampMaxConcurrency } from './aiConcurrency'
import { runSlidingWindow, type SlideTask } from './aiScheduler'
import { errText } from './aiAttempt'
import type { AiStreamEvents } from './aiTransport'
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
  /** 盘面摘要，与手动解读同为 `chartSummaryOf(chart)`（必须一致，否则缓存键分裂） */
  chartSummary?: string
  /**
   * 注入【用户选择】的解读角度，与手动解读同为「自定义方向优先，否则角度标签」。
   * ★ 不能塞标题：标题里带档案名，同一张盘在批量与手动下会得到不同的
   *   【用户选择】角度行，模型看到的口径就不一致了。标题另有 `title` 承载。
   */
  angle: string
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
      // ★ 必须与手动解读同为 `chartSummaryOf(chart)`：
      // `aiClient.cacheKey()` 把 chartSummary 拼进内容哈希，若这里留空，
      // 同一张盘的「先手动生成」与「批量生成」会得到两个不同的缓存键，
      // 缓存在两处各存一份、永远互相不命中，用户会看到重复计费。
      chartSummary: chartSummaryOf(item.chart),
      // 与手动解读（SingleChartView.requestUnifiedAi）同口径：自定义方向优先，否则角度标签
      angle: options.customDirection || options.angleLabel,
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
  /** v2.5.0：输出因单份 token 上限被截断，内容可能不完整（不写缓存） */
  truncated?: boolean
}

export interface BatchReport {
  outcomes: BatchOutcome[]
  ok: number
  failed: string[]
  skipped: string[]
  totalChars: number
  generatedAt: string
  /** 触顶（内容可能不完整）的档案名，供 UI 明确提示而不是当成正常完成 */
  truncatedNames: string[]
  /**
   * 实际使用的调度（v4.0.0 单旋钮）。
   * 旧结构是 `{ required, limit, batchWidth, batchCount, degraded }`——
   * 「分几批」这个概念已经不存在了，现在只有「最高并发数」。
   */
  scheduleInfo: { total: number; maxConcurrency: number; startedAt: string }
}

export interface BatchOptions {
  cfg: AiConfig
  tasks: BatchTask[]
  /** 预检跳过的档案（由 buildBatchTasks 产出），原样带进报告 */
  skipped?: string[]
  /** 最高并发数 N（1–99）：多份档案之间并发，单份档案内部仍是 1 次 `explain` */
  maxConcurrency: number
  /** 表达风格；不传按 `audience` 回落，再缺省专业版 */
  style?: AiStyle
  /** @deprecated 用 `style`（值相同、语义反转）。 */
  audience?: AiAudience
  signal?: AbortSignal
  /**
   * v3.0.0 逐路流式钩子：每份档案独立一行状态。
   * 不传时所有 explain() 仍走一次性请求路径，行为逐字不变。
   */
  streams?: BatchStreamHooks
  onUpdate?: (payload: {
    progress: BatchProgress
    /** 已完成项的结果（含失败），便于调用方增量落库 */
    outcomes: BatchOutcome[]
  }) => void
  /** @deprecated 串并行已并入 `maxConcurrency`（1 即串行）；字段保留但**不生效**。 */
  stepMode?: AiStepMode
  /** @deprecated 旧「并发上限」已删除；字段保留但**不生效**。 */
  concurrencyLimit?: number
  /** @deprecated token 上限已整体取消（请求恒 128000）；字段保留但**不生效**。 */
  tokenBudget?: number
}

/** v3.0.0：批量逐路状态钩子。eventsFor 每次重试都会重新调用，负责重新 begin 那一行 */
export interface BatchStreamHooks {
  eventsFor: (task: BatchTask) => AiStreamEvents
  finish: (task: BatchTask, ok: boolean, error?: string) => void
}

/**
 * 执行批量生成。
 *
 * 调度：`runSlidingWindow(tasks, { maxConcurrency, retry: 1 })`——
 * 起速每秒 1 份、满载后任一落定立即补发；失败在同一并发槽内重试 1 次。
 */
export async function runBatchReading(options: BatchOptions): Promise<BatchReport> {
  const { cfg, tasks, signal } = options
  const style = resolveStyle(options.style ?? options.audience)
  const maxConcurrency = clampMaxConcurrency(options.maxConcurrency, DEFAULT_AI_MAX_CONCURRENCY)
  const total = tasks.length
  const startedAt = Date.now()
  const generatedAt = new Date().toISOString()
  const scheduleInfo = { total, maxConcurrency, startedAt: generatedAt }

  /** index → 结果；用 Map 保证并行完成后仍按任务原序输出 */
  const outcomes = new Map<number, BatchOutcome>()
  /** index → 是否触顶；必须按「本次 explain 调用」收集，不能用模块级变量（并发会串台） */
  const truncatedFlags = new Map<number, boolean>()
  const failed: string[] = []
  const skipped = [...(options.skipped ?? [])]
  let ok = 0
  let done = 0
  let inFlight = 0
  let current = total ? `准备生成 ${total} 份解读` : '没有可生成的档案'
  const durations: number[] = []

  const publish = (phase: string): void => {
    const elapsedMs = Date.now() - startedAt
    const remaining = Math.max(0, total - done)
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null
    const progress: BatchProgress = {
      done,
      total,
      current,
      phase,
      elapsedMs,
      // ETA 按「最高并发数」归一：N 个同时在跑，剩余量要除以 N 才是墙钟时间
      etaMs: avg !== null && remaining > 0 ? Math.round((avg * remaining) / Math.max(1, maxConcurrency)) : null,
      ok,
      okIds: [...outcomes.values()].filter((o) => o.content).map((o) => o.archiveId),
      failed: [...failed],
      skipped: [...skipped],
    }
    try {
      options.onUpdate?.({ progress, outcomes: [...outcomes.values()] })
    } catch {
      /* UI 回调异常不得中断执行 */
    }
  }

  const basePhase = total > 1 ? `批量生成（最高并发数 ${maxConcurrency}）` : '批量生成'
  publish(total ? basePhase : '已完成')
  if (!total) {
    return {
      outcomes: [],
      ok: 0,
      failed,
      skipped,
      totalChars: 0,
      generatedAt,
      truncatedNames: [],
      scheduleInfo,
    }
  }

  const slideTasks: SlideTask<string>[] = tasks.map((task, index) => ({
    key: `${index}:${task.archiveId}`,
    label: task.name,
    run: async (runSignal: AbortSignal): Promise<string> => {
      // 截断标记按本次调用重置：重试会重新走一遍 run
      truncatedFlags.set(index, false)
      const t0 = Date.now()
      try {
        const content = await explain({
          cfg,
          entry: 'composite',
          scope: task.scope,
          ref: task.ref,
          offline: task.offline,
          chartSummary: task.chartSummary,
          detailMode: task.mode,
          style,
          angle: task.angle,
          signal: runSignal,
          onStream: options.streams?.eventsFor(task),
          onStage: (e) => {
            if (e.stage === 'completed') truncatedFlags.set(index, Boolean(e.truncated))
          },
        })
        durations.push(Date.now() - t0)
        options.streams?.finish(task, true)
        return content
      } catch (err) {
        durations.push(Date.now() - t0)
        options.streams?.finish(task, false, errText(err))
        throw err
      }
    },
  }))

  await runSlidingWindow(slideTasks, {
    maxConcurrency,
    retry: 1,
    signal,
    onProgress: (p) => {
      done = p.done
      inFlight = p.inFlight
      if (p.current) current = p.current
      publish(basePhase)
    },
    onSettled: (result) => {
      const index = Number(result.key.split(':')[0])
      const task = tasks[index]
      const outcome: BatchOutcome = {
        archiveId: task.archiveId,
        name: task.name,
        scope: task.scope,
        ref: task.ref,
        mode: task.mode,
        title: task.title,
        content: result.ok ? (result.value ?? '') : '',
        error: result.ok ? '' : (result.error ?? '未知错误'),
        truncated: result.ok ? Boolean(truncatedFlags.get(index)) : false,
      }
      outcomes.set(index, outcome)
      if (outcome.error) failed.push(`${task.name}：${outcome.error}`)
      else ok += 1
    },
  })

  const ordered = [...outcomes.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  current = '已完成'
  done = total
  inFlight = 0
  publish('已完成')

  return {
    outcomes: ordered,
    ok,
    failed,
    skipped,
    totalChars: ordered.reduce((sum, o) => sum + o.content.length, 0),
    generatedAt,
    truncatedNames: ordered.filter((o) => o.truncated && o.content).map((o) => o.name),
    scheduleInfo,
  }
}
