/**
 * AI「完整版」多轮分步编排（需求 #9 / Q3.4）。
 *
 * 单人整盘：任务 = 8 个 READING_ANGLES 维度 + chart.gates 逐个已激活闸门
 *      + chart.channels 逐条已成型通道 + 最后 1 次 full-fusion 全盘融合。
 * 关系场（合盘 / 双盘对比）：由 aiRelationshipReading.ts 注入自定义任务清单与合规事实块，
 *      维度改用合盘六个既有维度 + 四类连接动力学 + 逐共享闸门 + 逐合并通道，
 *      绝不输出合盘不存在的类型 / 内在权威 / 定义型 / 轮回交叉。
 * 每项独立调 explain()：scope=full-dimension / full-gate / full-channel / full-fusion，
 * detailMode='full'，chartSummary 默认 chartSummaryOf(chart)（可由调用方注入），
 * offline 只用项目内既有离线释义，不补全、不推断任何人类图业务规则。
 *
 * 执行策略（Q3.4 已确认口径）：
 * - 串行 / 并发由 AiStepMode 决定；并发失败 → 自动切串行，逐项重跑剩余（含失败项）。
 * - 单项失败 → 先重试 1 次，仍失败则跳过继续，记入 skipped。
 * - 全程可取消（AbortSignal）；取消抛 AiError('已取消','cancelled')，由编排层处理。
 * - 融合只注入每项前 300 字要点 + 标题，避免 45 个分项全文撑爆模型上下文。
 */
import { AiError, chartSummaryOf, explain } from './aiClient'
import {
  cancelledError as cancelled,
  errText,
  isCancelled,
  withRetry,
} from './aiAttempt'
import { READING_ANGLES } from './readingAngles'
import { gateInsightOf } from './gateInsight'
import { CENTER_TEXT, getChannel, getGate } from './interpretations'
import { CHANNEL_BY_KEY, GATE_CENTER, GATE_NAMES } from '../engine/gateData'
import {
  AUTHORITY_LABELS,
  CENTER_LABELS,
  DEFINITION_LABELS,
  TYPE_LABELS,
  type AiConfig,
  type AiStepMode,
  type BodyGraph,
  type ChannelActivation,
  type GateActivation,
} from '../types/hd'
import type {
  AiProgress,
  FullReport,
  FullReportSection,
  FullSectionKind,
} from '../types/report'
import {
  DEFAULT_AI_CONCURRENCY,
  DEFAULT_AI_CONCURRENCY_LIMIT,
  clampConcurrency,
  resolveSchedule,
} from './aiConcurrency'

/**
 * 保留导出名与值 3，仅作 `aiConcurrency` 的默认值来源（旧配置迁移后设定值不突变）。
 * ★ 不再参与任何分批计算：批宽由 `resolveSchedule()` 决定（ARCH §11.3.2 / AC-C8）。
 */
export const PARALLEL_CONCURRENCY = DEFAULT_AI_CONCURRENCY

/** 融合时每项最多注入的字符数（风险表：全文会超上下文） */
export const FUSION_EXCERPT_CHARS = 300

export interface FullTask {
  key: string
  title: string
  kind: FullSectionKind
  scope: 'full-dimension' | 'full-gate' | 'full-channel'
  offline: string
}

export interface FullReadingUpdate {
  progress: AiProgress
  /** 按任务原始顺序排列的、已完成的分项（随进度增长） */
  sections: FullReportSection[]
  fusion: string
  summary: string
  skipped: string[]
}

/**
 * 调用方可注入的「编排计划」：用于关系场等非单人整盘场景。
 * 不传时完全退化为 v2.2.0 既有的单人整盘编排，行为不变。
 */
export interface FullReadingPlan {
  /** 自定义任务清单；覆盖默认的「八大维度 + 逐闸门 + 逐通道」 */
  tasks?: FullTask[]
  /** 自定义离线事实块；覆盖 baseFacts(chart) */
  factBlock?: string
  /** 自定义盘面摘要；覆盖 chartSummaryOf(chart) */
  summary?: string
  /** 融合任务的【用户选择】角度标签 */
  fusionAngle?: string
}

export interface FullReadingOptions extends FullReadingPlan {
  cfg: AiConfig
  chart: BodyGraph
  title: string
  stepMode: AiStepMode
  signal?: AbortSignal
  /** 每项完成 / 失败 / 阶段切换时回调，供 UI 实时更新进度与模块化报告 */
  onUpdate?: (update: FullReadingUpdate) => void
  /** v2.3.0「AI 并发数」：设定值 / 展示值 / 校验对象；★ 不参与调度切片 */
  aiConcurrency?: number
  /** v2.3.0「并发上限」：★ 唯一闸门；不传时回落 DEFAULT_AI_CONCURRENCY_LIMIT */
  aiConcurrencyLimit?: number
}

/* ── 事实文本：全部取自项目既有离线释义 ─────────────────── */

/**
 * 关系场（合盘 / 双盘对比）判定，与 aiClient.chartSummaryOf 的口径一致：
 * mergedAsChart() 产出的合图 personality / design 恒为空。
 */
export function isRelationshipChart(chart: BodyGraph): boolean {
  return chart.personality.length === 0 && chart.design.length === 0
}

/** 全盘共享的离线事实块（类型 / 权威 / 中心 / 交叉 / 已激活结构） */
function baseFacts(chart: BodyGraph): string {
  const parts: string[] = []
  if (isRelationshipChart(chart)) {
    // 规范 §3.8：合图里的 type/authority/definition 只是渲染占位，不得进入解读事实。
    parts.push(
      [
        '【关系场】本盘为两人合图（连接盘），没有独立的类型、内在权威、定义型与轮回交叉。',
        `【双方人生角色】${chart.profile}`,
        '【口径约束】只讨论影响力方向、共鸣区、共同放大区与四类连接通道；个体层面的结论不进入关系场。',
      ].join('\n'),
    )
  } else {
    parts.push(
      [
        `【类型】${TYPE_LABELS[chart.type]}｜策略：${chart.strategy}`,
        `【内在权威】${AUTHORITY_LABELS[chart.authority]}`,
        `【人生角色】${chart.profile}｜定义型：${DEFINITION_LABELS[chart.definition]}`,
      ].join('\n'),
    )
  }

  const centers = chart.centers.map((ct) => {
    const t = CENTER_TEXT[ct.id]
    return `${CENTER_LABELS[ct.id]}（${ct.defined ? '已定义' : '开放'}）：${
      (ct.defined ? t.defined : t.open).replace(/\s+/g, ' ')
    }`
  })
  parts.push(`【九大中心离线释义】\n${centers.join('\n')}`)
  if (chart.incarnationCross) parts.push(`【轮回交叉】${chart.incarnationCross}`)

  const gates = chart.gates.map((g) => {
    const ins = gateInsightOf(g.gate)
    return `闸门 ${g.gate} ${GATE_NAMES[g.gate]?.zh ?? ''}（${ins.trait}）`
  })
  parts.push(`【已激活闸门（${gates.length}）】\n${gates.join('\n') || '这张盘未显示'}`)

  const channels = chart.channels.map((c) => {
    const t = getChannel(c.key)
    return `${t.title}：${t.text.replace(/\s+/g, ' ')}`
  })
  parts.push(`【已成型通道（${channels.length}）】\n${channels.join('\n') || '这张盘未显示'}`)
  return parts.join('\n\n')
}

function activationSides(chart: BodyGraph, gate: number): string {
  const sides: string[] = []
  if (chart.personality.some((p) => p.gate === gate)) sides.push('人格侧（显意识）')
  if (chart.design.some((p) => p.gate === gate)) sides.push('设计侧（潜意识）')
  return sides.join('、')
}

function gateFacts(chart: BodyGraph, g: GateActivation, facts: string): string {
  const text = getGate(g.gate)
  const ins = gateInsightOf(g.gate)
  const center = GATE_CENTER[g.gate]
  const state = chart.centers.find((c) => c.id === center)?.defined ? '已定义' : '开放'
  const sides = activationSides(chart, g.gate)
  return [
    `【本次分项】闸门 ${g.gate} ${GATE_NAMES[g.gate]?.zh ?? ''}`,
    `【闸门】${text.title}｜关键词：${text.keyword}｜所属中心：${CENTER_LABELS[center]}（${state}）`,
    `【激活星体】${g.stars.join('、') || '这张盘未显示'}${sides ? `｜${sides}` : ''}`,
    `【离线释义】${text.text.replace(/\s+/g, ' ')}`,
    `【补充洞察】特质：${ins.trait}；成长：${ins.growth}；扎根：${ins.grounding}；驱动：${ins.drive}`,
    facts,
  ].join('\n\n')
}

function channelFacts(chart: BodyGraph, c: ChannelActivation, facts: string): string {
  const text = getChannel(c.key)
  const def = CHANNEL_BY_KEY[c.key]
  const centers = def ? def.centers.map((id) => CENTER_LABELS[id]).join(' ↔ ') : ''
  const gateLines = c.gates.map((g) => {
    const ins = gateInsightOf(g)
    return `闸门 ${g} ${GATE_NAMES[g]?.zh ?? ''}（${ins.trait}）`
  })
  return [
    `【本次分项】${text.title}`,
    `【两端中心】${centers || '这张盘未显示'}｜【两端闸门】${c.gates.join(' ↔ ')}`,
    `【离线释义】${text.text.replace(/\s+/g, ' ')}`,
    `【两端闸门基础特质】${gateLines.join('；')}`,
    facts,
  ].join('\n\n')
}

/** 任务清单：顺序固定为 八大维度 → 逐闸门 → 逐通道 */
export function buildFullTasks(chart: BodyGraph, factBlock?: string): FullTask[] {
  const tasks: FullTask[] = []
  const facts = factBlock ?? baseFacts(chart)

  for (const angle of READING_ANGLES) {
    tasks.push({
      key: `dimension:${angle.key}`,
      title: angle.label,
      kind: 'dimension',
      scope: 'full-dimension',
      offline: [
        `【本次分项标题】${angle.label}`,
        `【解读方向】${angle.label}：${angle.desc}`,
        angle.prompt,
        facts,
      ].join('\n\n'),
    })
  }

  for (const g of chart.gates) {
    tasks.push({
      key: `gate:${g.gate}`,
      title: `闸门 ${g.gate} · ${GATE_NAMES[g.gate]?.zh ?? ''}`,
      kind: 'gate',
      scope: 'full-gate',
      offline: gateFacts(chart, g, facts),
    })
  }

  for (const c of chart.channels) {
    tasks.push({
      key: `channel:${c.key}`,
      title: `通道 ${c.key} · ${CHANNEL_BY_KEY[c.key]?.nameZh ?? ''}`,
      kind: 'channel',
      scope: 'full-channel',
      offline: channelFacts(chart, c, facts),
    })
  }
  return tasks
}

const KIND_LABEL: Record<FullSectionKind, string> = {
  dimension: '维度',
  gate: '闸门',
  channel: '通道',
}

/** 融合输入：只给每项前 300 字要点 + 标题，明确注明完整分项已在报告中 */
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

/* ── 编排 ───────────────────────────────────────────── */

interface TaskOutcome {
  index: number
  content?: string
  error?: string
}

/**
 * 跑完整套完整版解读。成功返回 FullReport；取消抛 AiError('已取消','cancelled')。
 * 即使部分分项失败也会返回报告（skipped 里列出），不伪造任何解读内容。
 */
export async function runFullReading(options: FullReadingOptions): Promise<FullReport> {
  const { cfg, chart, title, signal } = options
  const tasks = options.tasks ?? buildFullTasks(chart, options.factBlock)
  const summary = options.summary ?? chartSummaryOf(chart)
  const fusionAngle = options.fusionAngle ?? '全盘整合分析与最终总结论'
  const generatedAt = new Date().toISOString()
  const total = tasks.length + 1 // +1 = full-fusion
  const startedAt = Date.now()

  // ★ Q-C1：`aiConcurrency` 不切片分批，唯一闸门是「任务所需并发数 N ≤ 并发上限 Y」
  const requiredConcurrency = tasks.length // 不含融合；运行时计算、不持久化
  const limit = clampConcurrency(options.aiConcurrencyLimit, DEFAULT_AI_CONCURRENCY_LIMIT)
  const configured = clampConcurrency(options.aiConcurrency, DEFAULT_AI_CONCURRENCY) // 仅展示 X
  const schedule = resolveSchedule(requiredConcurrency, limit, options.stepMode)
  const degradedNote = schedule.degraded
    ? `本次需并发 ${requiredConcurrency} 项，超过并发上限 ${limit}，已按上限 ${limit} 分 ${schedule.K} 批执行（全部 ${requiredConcurrency} 项都会执行，不会减少）；可在设置页提高并发上限以启用一次性并发`
    : ''
  const parallelPhase = schedule.degraded
    ? `分项解读（按上限 ${limit} 分 ${schedule.K} 批）`
    : `分项解读（一次性并发 ${requiredConcurrency} 项）`
  const initialPhase = options.stepMode === 'parallel' ? parallelPhase : '分项解读（串行）'
  const initialCurrent = schedule.degraded
    ? degradedNote
    : options.stepMode === 'parallel'
      ? `一次性并发 ${requiredConcurrency} 项（设定并发数 ${configured} / 上限 ${limit}）`
      : '准备分项任务'

  /** index → 成功的内容；用 Map 保证并行完成后仍按任务原序输出 */
  const contentByIndex = new Map<number, string>()
  const durations: number[] = []
  const skipped: string[] = []
  const failed: string[] = []
  let done = 0
  const mode: 'serial' | 'parallel' = options.stepMode === 'parallel' ? 'parallel' : 'serial'
  let current = initialCurrent
  let phase = initialPhase
  let fusion = ''
  let finalSummary = ''

  const orderedSections = (): FullReportSection[] =>
    tasks.flatMap((t, i) => {
      const content = contentByIndex.get(i)
      return content ? [{ kind: t.kind, key: t.key, title: t.title, content }] : []
    })

  /** 仅用于写入 AiProgress.phase 的展示文案；融合段调用点实参逐字不动 */
  const FUSION_PHASE_LABEL: Record<string, string> = {
    '全盘整合分析与最终总结论': '全盘整合分析（最后一步，单独执行）',
    '关系场整合分析与最终总结论': '关系场整合分析与最终总结论（最后一步，单独执行）',
  }

  const publish = (nextCurrent: string, nextPhase: string) => {
    current = nextCurrent
    // ★ 仅融合段的 publish 才映射：nextCurrent 必须等于本次 fusionAngle，且 nextPhase
    //   为融合段实参；分项标题恰巧同名时不会误映射。
    //   `分项解读（串行）` 与 `已完成` 不在映射表内，逐字不变。
    phase =
      nextCurrent === fusionAngle && nextPhase === '全盘整合分析'
        ? (FUSION_PHASE_LABEL[nextCurrent] ?? nextPhase)
        : nextPhase
    const elapsedMs = Date.now() - startedAt
    const remaining = Math.max(0, total - done)
    const avg = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null
    const divisor = Math.max(1, schedule.batchWidth) // 未超限 = N；降级 = Y；串行 = 1
    const progress: AiProgress = {
      done,
      total,
      current,
      phase,
      elapsedMs,
      etaMs: avg !== null && remaining > 0 ? Math.round((avg * remaining) / divisor) : null,
      skipped: [...skipped],
      failed: [...failed],
    }
    options.onUpdate?.({
      progress,
      sections: orderedSections(),
      fusion,
      summary: finalSummary,
      skipped: [...skipped],
    })
  }

  const callTask = (task: FullTask) =>
    explain({
      cfg,
      scope: task.scope,
      ref: task.key,
      offline: task.offline,
      chartSummary: summary,
      detailMode: 'full',
      angle: task.title,
      signal,
    })

  /** 单项：失败重试 1 次；取消向上抛，不当作失败 */
  const attempt = async (index: number): Promise<TaskOutcome> => {
    if (signal?.aborted) throw cancelled(signal)
    try {
      const content = await withRetry(() => callTask(tasks[index]), signal)
      return { index, content }
    } catch (err) {
      if (isCancelled(err, signal)) throw err
      return { index, error: errText(err) }
    }
  }

  const finalizeOk = (index: number, content: string) => {
    contentByIndex.set(index, content)
    done += 1
    publish(schedule.degraded ? degradedNote : tasks[index].title, phase)
  }
  const finalizeFail = (index: number, message: string) => {
    const task = tasks[index]
    skipped.push(task.title)
    failed.push(`${task.title}：${message}`)
    done += 1
    publish(schedule.degraded ? degradedNote : task.title, phase)
  }

  // 首帧即发布状态（≤300ms 可见）；条件 ② 的 N/Y/K 常驻提示从这里起就存在
  publish(initialCurrent, initialPhase)

  // 预切批次：未超限时 batches.length === 1，一个 Promise.all 一次性发起全部 N 项；
  // 条件 ② 降级时按上限 Y 分 K 批，indices 覆盖全部 N 项，一个不少、不跳过、不截断。
  const width = Math.max(1, schedule.batchWidth)
  const indices = tasks.map((_, i) => i)
  const batches: number[][] = []
  for (let i = 0; i < indices.length; i += width) batches.push(indices.slice(i, i + width))

  let pending = tasks.map((_, i) => i)
  while (pending.length) {
    if (signal?.aborted) throw cancelled(signal)

    if (mode === 'serial') {
      const index = pending.shift()!
      if (contentByIndex.has(index)) continue
      publish(tasks[index].title, '分项解读（串行）')
      const t0 = Date.now()
      const outcome = await attempt(index)
      durations.push(Date.now() - t0)
      if (signal?.aborted) throw cancelled(signal)
      if (outcome.content) finalizeOk(index, outcome.content)
      else finalizeFail(index, outcome.error ?? '未知错误')
      continue
    }

    // ★ Q-C1：`aiConcurrency` 不切片，唯一闸门 `N ≤ limit`。
    // parallel 分支不消费 pending（不留「剩余待启动」队列），一次性批次由 batches 驱动。
    for (const batch of batches) {
      if (signal?.aborted) throw cancelled(signal)
      publish(
        schedule.degraded
          ? `${degradedNote}｜本批 ${batch.length} 项`
          : `一次性并发 ${requiredConcurrency} 项（设定并发数 ${configured} / 上限 ${limit}）`,
        parallelPhase,
      )
      const t0 = Date.now()
      const outcomes = await Promise.all(batch.map((i) => attempt(i)))
      // 按实际批大小归一，避免一次性并发下 ETA 失真
      durations.push((Date.now() - t0) / Math.max(1, batch.length))
      if (signal?.aborted) throw cancelled(signal)

      for (const outcome of outcomes) {
        if (outcome.content) finalizeOk(outcome.index, outcome.content)
      }
      // 仅对「重试 1 次后仍失败」的 M 项串行逐个重跑 1 次；成功项不重跑（AC-C13）
      const failedIdx = outcomes.filter((o) => !o.content).map((o) => o.index)
      if (failedIdx.length) {
        publish(`${failedIdx.length} 项失败，正在串行重跑`, '并发失败，失败项改串行重跑')
        for (const i of failedIdx) {
          if (signal?.aborted) throw cancelled(signal) // 取消优先，不做失败项串行重跑
          const t1 = Date.now()
          const outcome = await attempt(i)
          durations.push(Date.now() - t1)
          if (signal?.aborted) throw cancelled(signal)
          if (outcome.content) finalizeOk(i, outcome.content)
          else finalizeFail(i, outcome.error ?? '未知错误')
        }
      }
    }
    break
  }
  // 全部批次 + 失败项串行重跑完成后才进入融合例外：
  // ★ 位置保持在循环之后，请求数恒 1，最后单独执行（不与任何分项请求重叠）。

  // ── 全盘融合（最后 1 项）────────────────────────────
  publish(fusionAngle, '全盘整合分析')
  const fusionT0 = Date.now()
  try {
    const raw = await withRetry(
      () =>
        explain({
          cfg,
          scope: 'full-fusion',
          ref: 'fusion',
          offline: buildFusionInput(orderedSections(), skipped),
          chartSummary: summary,
          detailMode: 'full',
          angle: fusionAngle,
          signal,
        }),
      signal,
    )
    const split = splitFusion(raw)
    fusion = split.fusion
    finalSummary = split.summary
  } catch (err) {
    if (isCancelled(err, signal)) throw cancelled(signal)
    // 融合失败不伪造：跳过该项，报告仍由分项构成
    skipped.push('全盘整合与最终总结论')
    failed.push(`全盘整合与最终总结论：${errText(err)}`)
    fusion = ''
    finalSummary = ''
  }
  durations.push(Date.now() - fusionT0)
  if (signal?.aborted) throw cancelled(signal)
  done = total
  publish('已完成', '已完成')

  const sections = orderedSections()
  const totalChars =
    sections.reduce((n, s) => n + s.content.replace(/\s/g, '').length, 0) +
    fusion.replace(/\s/g, '').length

  return {
    title,
    sections,
    fusion,
    summary: finalSummary,
    totalChars,
    skipped: [...skipped],
    generatedAt,
  }
}
