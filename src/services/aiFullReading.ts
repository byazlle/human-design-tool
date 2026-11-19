/**
 * 「完整档」编排的薄适配层（v4.0.0 · ARCH §3 / §4.4）。
 *
 * v3.5.0 的 `runFullReading` 自带一整套调度：`resolveSchedule` 分批、`Promise.all` 并发、
 * 失败项串行重跑、`stepMode` 串并行分支。v4.0.0 把这些**全部**交给
 * `aiScheduler.runSlidingWindow` + `aiReadingRunner.runReadingPlan`，
 * 本文件只做三件事：
 *
 * 1. 把两种调用形态翻译成一份 `ReadingPlan`：
 *    - 调用方给了 `tasks`（关系场 / 自定义计划）→ 用它构造 plan；
 *    - 否则（单人整盘，旧默认路径）→ 调 `planReading()` 让计划器决定任务清单。
 * 2. 把 `ReadingProgress` 适配成旧的 `AiProgress`（严格 8 字段）+ `FullReadingUpdate`；
 * 3. 把 `FullStreamHooks` 接进每条请求（每项一行状态，不传则完全走非流式）。
 *
 * ★ 本文件**不再**持有任何事实块构造逻辑：单人整盘的事实块在 `chartFacts.ts`，
 *   关系场的事实块在 `aiRelationshipReading.ts`，融合输入的压缩在 `aiReadingRunner.ts`。
 *   仓库里只允许存在一份「分项事实」实现（T02A 已把 `chartFacts` 的实验函数导出）。
 */
import { chartSummaryOf, explain, resolveStyle } from './aiClient'
import { errText } from './aiAttempt'
import {
  DEFAULT_AI_MAX_CONCURRENCY,
  clampMaxConcurrency,
} from './aiConcurrency'
import { ALL_READING_DIMS } from './chartFacts'
import { planReading } from './aiReadingPlan'
import { runReadingPlan, type ExplainFn } from './aiReadingRunner'
import { DEFAULT_ANGLE, READING_ANGLES, angleOf } from './readingAngles'
import type { AiStreamEvents } from './aiTransport'
import type {
  AiStyle,
  ReadingPlan,
  ReadingProgress,
  ReadingRequest,
  ReadingTask,
} from '../types/aiReading'
import type { AiAudience, AiConfig, AiStepMode, BodyGraph } from '../types/hd'
import type {
  AiProgress,
  FullReport,
  FullReportSection,
  FullSectionKind,
} from '../types/report'

/**
 * 旧常量：保留导出名与值（3），仅作默认最高并发数的别名。
 * ★ 不参与任何分批计算——调度由 `aiScheduler` 的滑动窗口负责。
 */
export const PARALLEL_CONCURRENCY = DEFAULT_AI_MAX_CONCURRENCY

/**
 * 融合时每项最多注入的字符数（v3.x 口径，保留常量供旧调用点/旧测试引用）。
 *
 * ★ 执行层已改用 `aiReadingRunner.fusionExcerptChars(entry)` 按入口分档
 * （A 800 / B 400 / C 200）；本常量只在 `buildFusionInput` 里使用。
 */
export const FUSION_EXCERPT_CHARS = 300

/** 兼容旧编排契约的任务形状（关系场 / 自定义 plan 仍按它注入） */
export interface FullTask {
  key: string
  title: string
  kind: FullSectionKind
  scope: 'full-dimension' | 'full-gate' | 'full-channel'
  offline: string
}

/** 进度回调载荷：形状与 v2.2.0 逐字一致（`progress` 恒为 8 字段的 AiProgress） */
export interface FullReadingUpdate {
  progress: AiProgress
  /** 按任务原始顺序排列的、已完成的分项（随进度增长） */
  sections: FullReportSection[]
  fusion: string
  summary: string
  skipped: string[]
}

/** 调用方可注入的「编排计划」：用于关系场等非单人整盘场景 */
export interface FullReadingPlan {
  /** 自定义任务清单；不传时由 `planReading()` 决定 */
  tasks?: FullTask[]
  /** 自定义离线事实块（仅用于生成摘要与兼容旧调用点，执行期由各任务的 offline 承载） */
  factBlock?: string
  /** 自定义盘面摘要；覆盖 `chartSummaryOf(chart)` */
  summary?: string
  /** 融合任务的【用户选择】角度标签 */
  fusionAngle?: string
}

export interface FullReadingOptions extends FullReadingPlan {
  cfg: AiConfig
  chart: BodyGraph
  title: string
  /**
   * 最高并发数 N（1–99）。
   * ★ 新字段；不传时依次回落 `aiConcurrency`（旧设定值）→ 1（旧 `stepMode === 'serial'`）→ 3。
   */
  maxConcurrency?: number
  signal?: AbortSignal
  onUpdate?: (update: FullReadingUpdate) => void
  /** @deprecated 串并行已并入 `maxConcurrency`：`'serial'` 等价于 1。 */
  stepMode?: AiStepMode
  /** @deprecated 旧「AI 并发数」，仅作 `maxConcurrency` 的回落来源。 */
  aiConcurrency?: number
  /**
   * @deprecated 旧「并发上限」，**已无意义**：v4.0.0 只有一个旋钮。
   * 保留字段只为让旧调用点在 T03 迁移前不爆类型；值一律忽略。
   */
  aiConcurrencyLimit?: number
  /** 表达风格；不传按 `audience` 回落，再缺省按专业版 */
  style?: AiStyle
  /** @deprecated 用 `style`（值相同、语义反转：新 pro 必须阐释术语）。 */
  audience?: AiAudience
  /** @deprecated token 上限已整体取消（请求恒 128000）；字段保留但不生效。 */
  tokenBudget?: number
  /** v3.0.0 逐路流式：每个分项与融合各一行状态；不传时保持一次性请求路径 */
  streams?: FullStreamHooks
}

export interface FullStreamHooks {
  eventsFor: (key: string, label: string) => AiStreamEvents
  finish: (key: string, ok: boolean, error?: string) => void
}

/* ── 事实与融合文本（纯函数，契约不变）──────────────────── */

/**
 * 关系场（合盘 / 双盘对比）判定，与 `aiClient.chartSummaryOf` 的口径一致：
 * `mergedAsChart()` 产出的合图 personality / design 恒为空。
 */
export function isRelationshipChart(chart: BodyGraph): boolean {
  return chart.personality.length === 0 && chart.design.length === 0
}

const KIND_LABEL: Record<FullSectionKind, string> = {
  module: '模块',
  dimension: '维度',
  gate: '闸门',
  channel: '通道',
}

/**
 * 融合输入：只给每项前 `FUSION_EXCERPT_CHARS` 字要点 + 标题，并注明完整分项已在报告中。
 *
 * ★ 保留本函数是为了兼容既有引用（`aiFullReading.test.ts` 的纯函数断言）。
 *   新代码（`aiReadingRunner`）用 `buildFusionExcerpts(entry, …)`，按入口分档截断。
 */
export function buildFusionInput(sections: FullReportSection[], skipped: string[]): string {
  const lines = [
    `【分项要点】共 ${sections.length} 项。完整分项已在报告中，以下只列每项标题与前 ${FUSION_EXCERPT_CHARS} 字要点；未列出的内容当作没有，不要推断。`,
    '',
  ]
  sections.forEach((s, i) => {
    const excerpt = s.content.replace(/\s+/g, ' ').trim().slice(0, FUSION_EXCERPT_CHARS)
    lines.push(`### ${i + 1}. ${s.title}（${KIND_LABEL[s.kind]}）`, excerpt, '')
  })
  if (skipped.length) {
    lines.push(
      `【未完成分项】${skipped.join('、')}（重试后仍失败，本次报告不含这些分项，请勿据此推断）`,
      '',
    )
  }
  return lines.join('\n')
}

/** 从融合输出里拆出「最终总结论」，不新增任何内容 */
export function splitFusion(raw: string): { fusion: string; summary: string } {
  // 模型常把标题写成「## 五、最终总结论」或加粗，序号阿拉伯/中文都要认，
  // 否则总结论会被并进整合分析，导出里看不到独立一节。
  const match = raw.match(
    /^#{1,4}\s*(?:[0-9一二三四五六七八九十]+[.、．]?\s*)?[*_]{0,2}最终总结论[*_]{0,2}\s*$/m,
  )
  if (!match || match.index === undefined) return { fusion: raw.trim(), summary: '' }
  return {
    fusion: raw.slice(0, match.index).trim(),
    summary: raw.slice(match.index).trim(),
  }
}

/* ── 选项 → 计划 ─────────────────────────────────────── */

/** 最高并发数：`maxConcurrency` → 旧 `aiConcurrency` → 旧 `stepMode` → 默认 3 */
export function resolveMaxConcurrencyOf(options: {
  maxConcurrency?: number
  aiConcurrency?: number
  stepMode?: AiStepMode
}): number {
  if (options.stepMode === 'serial') return 1
  const raw = options.maxConcurrency ?? options.aiConcurrency
  return clampMaxConcurrency(raw, DEFAULT_AI_MAX_CONCURRENCY)
}

/** 融合角度标签 → 内置角度（找不到就用默认「综合解读」） */
function angleOfLabel(label: string) {
  return (
    READING_ANGLES.find((a) => a.label === label || a.key === label) ??
    (label ? { ...DEFAULT_ANGLE, label } : angleOf(DEFAULT_ANGLE.key))
  )
}

/** 由 `FullReadingOptions` 生成 `ReadingPlan`（本文件唯一的编排决策点） */
export function buildPlanFromOptions(
  options: FullReadingOptions,
  style: AiStyle,
): ReadingPlan {
  const fusionAngle = options.fusionAngle ?? '全盘整合分析与最终总结论'
  let plan: ReadingPlan

  if (options.tasks?.length) {
    // 关系场 / 自定义计划：任务与顺序由调用方给定，本层不重排、不增删
    const tasks: ReadingTask[] = options.tasks.map((t) => ({
      key: t.key,
      title: t.title,
      scope: t.scope,
      ref: t.key,
      offline: t.offline,
      kind: t.kind,
    }))
    plan = {
      entry: 'composite',
      detail: 'full',
      singleShot: false,
      tasks,
      fusion: {
        key: 'fusion',
        title: fusionAngle,
        scope: 'full-fusion',
        ref: 'fusion',
        offline: `【本次分项标题】${fusionAngle}`,
        kind: 'summary',
      },
      title: options.title,
    }
  } else {
    // 单人整盘：任务清单交给计划器（八大维度各 1 篇 + 融合）
    const angle = angleOfLabel(fusionAngle)
    plan = planReading({
      entry: 'composite',
      detail: 'full',
      style,
      chart: options.chart,
      dims: ALL_READING_DIMS,
      direction: { key: angle.key, label: angle.label, prompt: angle.prompt, custom: '' },
      archiveName: options.title,
    })
    if (plan.fusion) {
      plan.fusion = { ...plan.fusion, title: fusionAngle, offline: `【本次分项标题】${fusionAngle}` }
    }
  }

  return { ...plan, title: options.title }
}

/** `ReadingProgress`（10 字段）→ `AiProgress`（8 字段，旧契约一字不改） */
export function toAiProgress(progress: ReadingProgress): AiProgress {
  return {
    done: progress.done,
    total: progress.total,
    current: progress.current,
    phase: progress.phase,
    elapsedMs: progress.elapsedMs,
    etaMs: progress.etaMs,
    skipped: progress.skipped,
    failed: progress.failed,
  }
}

/* ── 执行 ───────────────────────────────────────────── */

/**
 * 跑完整套完整档解读。成功返回 `FullReport`；取消抛 `AiError('已取消','cancelled')`。
 * 分项失败只进 `skipped`，报告仍由其他分项构成，绝不伪造内容。
 *
 * ★ 本函数不重试：重试由调度器（`retry: 1`）在同一个并发槽内完成，
 *   这里再包一层 `withRetry` 会变成 4 次尝试（风险 R13）。
 */
export async function runFullReading(options: FullReadingOptions): Promise<FullReport> {
  const { cfg, chart, title, signal } = options
  const style = resolveStyle(options.style ?? options.audience)
  const plan = buildPlanFromOptions(options, style)
  const maxConcurrency = resolveMaxConcurrencyOf(options)
  const summary = options.summary ?? chartSummaryOf(chart)
  const fusionAngle = plan.fusion?.title ?? options.fusionAngle ?? '全盘整合分析与最终总结论'

  /** key → 分节（按任务原始顺序输出，落定顺序只用于「随生成增长」） */
  const byKey = new Map<string, FullReportSection>()
  const orderedSections = (): FullReportSection[] =>
    plan.tasks.flatMap((t) => {
      const hit = byKey.get(t.key)
      return hit ? [hit] : []
    })

  const emit = (
    progress: ReadingProgress,
    fusion: string,
    finalSummary: string,
    skipped: string[],
  ): void => {
    options.onUpdate?.({
      progress: toAiProgress(progress),
      sections: orderedSections(),
      fusion,
      summary: finalSummary,
      skipped,
    })
  }

  /** 流式钩子：每条请求一行状态；重试会重新调用 `eventsFor`（重新 begin 那一行） */
  const streams = options.streams
  const explainWithStreams: ExplainFn | undefined = streams
    ? async (args) => {
        const key = args.scope === 'full-fusion' ? 'fusion' : String(args.ref ?? '')
        const label = args.scope === 'full-fusion' ? fusionAngle : String(args.angle ?? key)
        try {
          const text = await explain({ ...args, onStream: streams.eventsFor(key, label) })
          streams.finish(key, true)
          return text
        } catch (err) {
          streams.finish(key, false, errText(err))
          throw err
        }
      }
    : undefined

  const req: ReadingRequest = {
    entry: 'composite',
    detail: 'full',
    style,
    chart,
    chartSummary: summary,
    dims: options.tasks?.length ? undefined : ALL_READING_DIMS,
    direction: {
      key: angleOfLabel(fusionAngle).key,
      label: fusionAngle,
      prompt: '',
      custom: '',
    },
    archiveName: title,
  }

  const getProgress = (): ReadingProgress => ({
    done: 0,
    total: plan.tasks.length + (plan.fusion ? 1 : 0),
    current: '',
    phase: '准备分项任务',
    elapsedMs: 0,
    etaMs: null,
    skipped: [],
    failed: [],
    inFlight: 0,
    maxConcurrency,
  })
  /** 最近一次进度快照：末帧沿用它，保证 elapsedMs 是真实耗时而不是 0 */
  let lastProgress: ReadingProgress = getProgress()

  const report = await runReadingPlan({
    req,
    plan,
    cfg,
    chartSummary: summary,
    maxConcurrency,
    signal,
    onUpdate: (progress) => {
      lastProgress = progress
      emit(progress, '', '', [])
    },
    onSection: (section) => byKey.set(section.key, section),
    explainFn: explainWithStreams,
  })

  // 末帧：把融合 / 总结论与完整 skipped 一次补齐（中途帧只报进度）
  emit(
    {
      ...lastProgress,
      done: lastProgress.total,
      current: '已完成',
      phase: '已完成',
      inFlight: 0,
      skipped: report.skipped,
      failed: [],
    },
    report.fusion,
    report.summary,
    report.skipped,
  )

  return { ...report, title }
}
