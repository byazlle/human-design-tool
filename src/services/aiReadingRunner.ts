/**
 * 计划执行器（v4.0.0 · ARCH §3 / §4 / §7.2）。
 *
 * 三件事只在这里做，别处不做：
 * 1. **单次档 vs 多请求**：`plan.singleShot === true` → 只发 1 次 `explain`（**不包重试**，
 *    单次档失败就失败，让用户看到真实错误；包一层会让一次偶发失败变成 4 次扣费）；
 *    否则交给 `runSlidingWindow`（`retry: 1` 由调度器在同一个并发槽内完成）。
 * 2. **融合最后单独跑**：全部逐条任务落定后（含失败跳过项）才发融合请求，
 *    与逐条任务**不允许重叠**——否则融合会把还没写完的分项当依据。
 * 3. **进度与报告**：进度写 `ReadingProgress`（10 字段，扩展 `AiProgress`），
 *    报告 `sections` 按**计划顺序**排列（不是落定顺序，落定顺序只用于实时展示）。
 *
 * 融合输入的压缩口径按 §3.5 参数化：A 800 / B 400 / C 200 字。
 * 结构与既有 `buildFusionInput` 一致（标题 + 每项要点 + 「未完成分项…请勿据此推断」），
 * T02B 删除 `aiFullReading` 时应改为复用本文件的 `buildFusionExcerpts`，避免两份措辞漂移。
 */
import type { AiConfig } from '../types/hd'
import type { FullReport, FullReportSection } from '../types/report'
import type { AiEntry, ReadingPlan, ReadingProgress, ReadingRequest, ReadingTask } from '../types/aiReading'
import { explain as explainViaClient } from './aiClient'
import type { AiStageEvent } from './aiClient'
import type { AiStreamEvents } from './aiTransport'
import { runSlidingWindow, slidePhaseText, type SlideProgress } from './aiScheduler'
import { checkEvidenceCoverage, checkItemCoverage } from './aiEvidence'
import { sortedChannels, sortedGates } from './chartFacts'
import { A5_DIRECTION_KEYS } from './readingAngles'
import { angleOf } from './readingAngles'

/** `explain` 的可注入签名（测试用假实现，生产用 `aiClient.explain`） */
export type ExplainFn = (args: Parameters<typeof explainViaClient>[0]) => Promise<string>

export interface RunReadingOptions {
  req: ReadingRequest
  plan: ReadingPlan
  cfg: AiConfig
  /** 盘面事实块（合盘由调用方注入定制摘要） */
  chartSummary?: string
  /** 最高并发数 N（1–99），由设置项 `aiConcurrency` 提供 */
  maxConcurrency: number
  signal?: AbortSignal
  onUpdate?: (progress: ReadingProgress) => void
  /**
   * 某个分项落定且成功时回调（按**落定顺序**），用于「报告随生成增长」。
   *
   * 为什么不塞进 `ReadingProgress`：那 10 个字段是状态区契约（T03/T04 直接绑定），
   * 分节内容属于报告域，混进去会让「进度」与「内容」两件事互相绑架。
   */
  onSection?: (section: FullReportSection) => void
  /**
   * 流式观测：**只在单次档透传**。
   * 多请求档每条任务各写一段正文，透传会让「实时预览」变成几段文字互相穿插，
   * 反而不可读；那一档用进度条表达即可（§4.2 已知副作用的同类取舍）。
   */
  streams?: AiStreamEvents
  onStage?: (event: AiStageEvent) => void
  explainFn?: ExplainFn
}

/** 融合输入每项截断字数（§3.5） */
export function fusionExcerptChars(entry: AiEntry): number {
  if (entry === 'full') return 800
  if (entry === 'composite') return 400
  return 200
}

const ENTRY_LABEL: Record<AiEntry, string> = {
  full: '全盘',
  composite: '综合',
  selection: '勾选',
}

/** 从融合输出里拆出「最终总结论」（与 `aiFullReading.splitFusion` 同口径，T02B 收敛为一份） */
export function splitFusionSummary(raw: string): { fusion: string; summary: string } {
  const match = raw.match(
    /^#{1,4}\s*(?:[0-9一二三四五六七八九十]+[.、．]?\s*)?[*_]{0,2}最终总结论[*_]{0,2}\s*$/m,
  )
  if (!match || match.index === undefined) return { fusion: raw.trim(), summary: '' }
  return { fusion: raw.slice(0, match.index).trim(), summary: raw.slice(match.index).trim() }
}

/**
 * 融合输入：每项标题 + 前 N 字要点 + 未完成分项清单。
 *
 * 「未完成分项…请勿据此推断」是硬要求：不写这句，模型会拿 5 个分项里的 4 个
 * 编出第 5 个的结论（v3.x 真实出现过）。
 */
export function buildFusionExcerpts(
  entry: AiEntry,
  sections: FullReportSection[],
  skipped: string[],
): string {
  const chars = fusionExcerptChars(entry)
  const lines = [
    `【分项要点】共 ${sections.length} 项。完整分项已在报告中，以下只列每项标题与前 ${chars} 字要点；未列出的内容当作没有，不要推断。`,
    '',
  ]
  sections.forEach((s, i) => {
    const excerpt = s.content.replace(/\s+/g, ' ').trim().slice(0, chars)
    lines.push(`### ${i + 1}. ${s.title}`, excerpt, '')
  })
  if (skipped.length) {
    lines.push(
      `【未完成分项】${skipped.join('、')}（重试后仍失败，本次报告不含这些分项，请勿据此推断）`,
      '',
    )
  }
  return lines.join('\n')
}

/** 任务的 `kind` → 报告的 `FullSectionKind`（`summary` 只属于融合，不进 sections） */
function sectionKindOf(task: ReadingTask): FullReportSection['kind'] {
  return task.kind === 'summary' ? 'module' : task.kind
}

/** 空报告（勾选为空 / 计划为空时返回，不抛错） */
function emptyReport(plan: ReadingPlan, req: ReadingRequest): FullReport {
  return {
    title: plan.title,
    entry: req.entry,
    sections: [],
    fusion: '',
    summary: '',
    totalChars: 0,
    skipped: [],
    generatedAt: new Date().toISOString(),
  }
}

/** 某任务的 progress 文案：逐条阶段统一走调度器的起速 / 稳态文案 */
function phaseOf(progress: SlideProgress, maxConcurrency: number, reportTotal?: number): string {
  return slidePhaseText(progress, maxConcurrency, reportTotal)
}

/**
 * 逐条任务的覆盖自检（只告警，不阻断）：
 * ② 全部通道 / ③ 全部闸门 / ⑤ 五个方向 都必须「逐项各占一个三级标题」。
 */
function auditCoverage(task: ReadingTask, content: string, req: ReadingRequest): void {
  try {
    if (task.scope === 'full-all-channels') {
      const keys = sortedChannels(req.chart).map((c) => c.key)
      const { missing } = checkItemCoverage(content, keys)
      if (missing.length) console.warn(`[AI] 通道通解漏项：${missing.join('、')}（${task.key}）`)
      return
    }
    if (task.scope === 'full-all-gates') {
      const gates = sortedGates(req.chart).map((g) => String(g.gate))
      const { missing } = checkItemCoverage(content, gates)
      if (missing.length) console.warn(`[AI] 闸门通解漏项：${missing.join('、')}（${task.key}）`)
      return
    }
    if (task.scope === 'full-trajectory') {
      const labels = A5_DIRECTION_KEYS.map((k) => angleOf(k).label)
      const { missing } = checkItemCoverage(content, labels)
      if (missing.length) console.warn(`[AI] 五方向漏项：${missing.join('、')}（${task.key}）`)
      return
    }
    if (task.scope === 'selection-fusion') {
      const links = (content.match(/联动|叠加|互相影响/g) ?? []).length
      if (links < 3) console.warn(`[AI] 关联汇总疑似不足 3 组联动（${task.key}）`)
      return
    }
    // 依据前置：详细 / 完整档的每一段都该有依据，缺了只提示
    const coverage = checkEvidenceCoverage(content, task.offline)
    if (coverage.total > 0 && coverage.withEvidence < coverage.total) {
      console.warn(
        `[AI] ${task.key} 有 ${coverage.total - coverage.withEvidence} 段缺依据（共 ${coverage.total} 段）`,
      )
    }
  } catch {
    /* 自检永远不打断主流程 */
  }
}

/**
 * 执行计划。
 *
 * @returns 完整报告；`sections` 与计划顺序一致，失败项进 `skipped`（内容为空串）。
 * @throws AiError('已取消','cancelled') / 单次档的原始错误
 */
export async function runReadingPlan(options: RunReadingOptions): Promise<FullReport> {
  const { plan, req, cfg } = options
  const explainFn: ExplainFn = options.explainFn ?? explainViaClient
  const totalRequests = plan.tasks.length + (plan.fusion ? 1 : 0)
  if (plan.tasks.length === 0) return emptyReport(plan, req)

  const startedAt = Date.now()

  const emit = (progress: ReadingProgress): void => {
    try {
      options.onUpdate?.(progress)
    } catch {
      /* UI 回调异常不得中断执行 */
    }
  }

  const baseProgress = (
    done: number,
    inFlight: number,
    current: string,
    phase: string,
  ): ReadingProgress => ({
    done,
    total: totalRequests,
    current,
    phase,
    elapsedMs: Date.now() - startedAt,
    etaMs: null,
    skipped: [],
    failed: [],
    inFlight,
    maxConcurrency: options.maxConcurrency,
  })

  /* ── 单次档：1 请求，不重试 ── */
  if (plan.singleShot) {
    const task = plan.tasks[0]
    emit(baseProgress(0, 1, task.title, '单次生成 · 已启动 1 / 1'))
    const content = await explainFn({
      cfg,
      entry: req.entry,
      scope: task.scope,
      ref: task.ref,
      offline: task.offline,
      chartSummary: options.chartSummary,
      detailMode: req.detail,
      style: req.style,
      dims: req.entry === 'composite' ? req.dims : undefined,
      angle: req.direction?.label,
      signal: options.signal,
      onStage: options.onStage,
      onStream: options.streams,
    })
    auditCoverage(task, content, req)
    const section: FullReportSection = {
      kind: sectionKindOf(task),
      key: task.key,
      title: task.title,
      content,
    }
    emit(baseProgress(1, 0, task.title, '已完成'))
    return {
      title: plan.title,
      entry: req.entry,
      sections: [section],
      fusion: '',
      summary: '',
      totalChars: content.length,
      skipped: [],
      generatedAt: new Date().toISOString(),
    }
  }

  /* ── 多请求档：滑动窗口 → 融合（单独执行） ── */
  const contents = new Map<string, string>()
  const skipped: string[] = []
  const failed: string[] = []
  const taskList = plan.tasks

  const slideTasks = taskList.map((task) => ({
    key: task.key,
    label: task.title,
    run: async (signal: AbortSignal): Promise<string> =>
      explainFn({
        cfg,
        entry: req.entry,
        scope: task.scope,
        ref: task.ref,
        offline: task.offline,
        chartSummary: options.chartSummary,
        detailMode: req.detail,
        style: req.style,
        dims: dimsForTask(task, req),
        angle: angleForTask(task),
        signal,
      }),
  }))

  const results = await runSlidingWindow(slideTasks, {
    maxConcurrency: options.maxConcurrency,
    retry: 1,
    signal: options.signal,
    onProgress: (progress) => {
      emit(
        baseProgress(
          progress.done,
          progress.inFlight,
          progress.current,
          phaseOf(progress, options.maxConcurrency, plan.tasks.length + (plan.fusion ? 1 : 0)),
        ),
      )
    },
    onSettled: (result) => {
      if (result.ok && typeof result.value === 'string') {
        contents.set(result.key, result.value)
        const task = taskList.find((t) => t.key === result.key)
        if (task) {
          const section: FullReportSection = {
            kind: sectionKindOf(task),
            key: task.key,
            title: task.title,
            content: result.value,
          }
          try {
            options.onSection?.(section)
          } catch {
            /* UI 回调异常不得中断执行 */
          }
          auditCoverage(task, result.value, req)
        }
      } else {
        failed.push(result.label)
        skipped.push(result.label)
      }
    },
  })

  // 按**计划顺序**组装分节（落定顺序只用于实时展示）
  const sections: FullReportSection[] = taskList.map((task) => ({
    kind: sectionKindOf(task),
    key: task.key,
    title: task.title,
    content: contents.get(task.key) ?? '',
  }))
  // 按计划顺序组装分节（落定顺序的审计已在 onSettled 里逐项做过）

  /* ── 融合：全部落定后单独跑，失败只记 skipped ── */
  let fusion = ''
  let summary = ''
  if (plan.fusion) {
    const doneTasks = results.filter((r) => r.ok).length
    emit(baseProgress(doneTasks, 0, plan.fusion.title, '融合（最后一步，单独执行）· 已完成 0 / 1'))
    try {
      // 融合不经过调度器（它必须最后单独跑），因此重试要在这里自己兜一次：
      // 融合是最贵的一篇，单次偶发 5xx 直接丢弃会让整份报告失去结论（与 v3.5.0 行为一致）。
      let fusionAttempt = 0
      let raw = ''
      for (;;) {
        try {
          raw = await explainFn({
            cfg,
            entry: req.entry,
            scope: plan.fusion.scope,
            ref: plan.fusion.ref,
            offline: [plan.fusion.offline, buildFusionExcerpts(req.entry, sections, skipped)]
              .filter(Boolean)
              .join('\n\n'),
            chartSummary: options.chartSummary,
            detailMode: req.detail,
            style: req.style,
            // 融合篇同样受白名单约束：入口 B 必须拿到 req.dims，
            // 否则 system 里的 {DIMS} 会退化成「未提供维度清单」兜底文案。
            dims: dimsForTask(plan.fusion, req),
            // 融合篇的【用户选择】角度 = 该融合任务的标题（如「全盘整合分析与最终总结论」）
            angle: plan.fusion.title,
            signal: options.signal,
          })
          break
        } catch (err) {
          fusionAttempt += 1
          if (options.signal?.aborted || fusionAttempt >= 2) throw err
          console.warn(`[AI] 融合首次失败，重试 1 次：${(err as Error).message}`)
        }
      }
      const split = splitFusionSummary(raw)
      fusion = split.fusion
      summary = split.summary
      if (req.entry === 'selection') {
        fusion = raw.trim()
        summary = ''
      }
    } catch (err) {
      if (options.signal?.aborted) throw err
      // 融合失败不伪造：报告仍由全部分项构成
      skipped.push(plan.fusion.title)
      failed.push(plan.fusion.title)
      console.warn(`[AI] 融合失败，报告只含分项：${(err as Error).message}`)
    }
    emit(baseProgress(totalRequests, 0, plan.fusion.title, '已完成'))
  }

  const totalChars =
    sections.reduce((sum, s) => sum + s.content.length, 0) + fusion.length + summary.length

  emit({
    ...baseProgress(totalRequests, 0, plan.fusion?.title ?? taskList[taskList.length - 1].title, '已完成'),
    skipped,
    failed,
  })

  return {
    title: plan.title,
    entry: req.entry,
    sections,
    fusion,
    summary,
    totalChars,
    skipped,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * 逐条任务的 `angle`（进【用户选择】、也进「只写【用户选择】指定的这一项：X」）。
 *
 * 融合 / 通解三类 scope 不传：它们不是「某一项」，传了会让模型把整篇收窄成一个标题。
 */
function angleForTask(task: ReadingTask): string | undefined {
  if (task.scope === 'full-fusion' || task.scope === 'selection-fusion') return undefined
  if (task.scope === 'full-all-channels' || task.scope === 'full-all-gates') return undefined
  return task.title
}

/**
 * 逐条任务的维度白名单。
 *
 * 入口 B 的完整档每个分项只写一个维度，所以 system 的 `{DIMS}` 必须收窄成该维度——
 * 否则白名单会写着「只允许出现 8 个维度」，与「只写这一项」直接冲突，
 * 模型通常选择写全 8 个（v3.x 的完整档实测表现）。
 */
function dimsForTask(task: ReadingTask, req: ReadingRequest): ReadingRequest['dims'] {
  if (req.entry !== 'composite') return undefined
  if (task.key.startsWith('B-dim:')) {
    const dim = task.key.slice('B-dim:'.length)
    return [dim as NonNullable<ReadingRequest['dims']>[number]]
  }
  return req.dims
}
