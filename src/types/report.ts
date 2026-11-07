/**
 * AI 解读报告与「完整版」编排的共享数据模型（#9 / #10 共用）。
 *
 * 放在 types/ 而不是某个 service 里，是为了让 aiFullReading.ts（生产）、
 * stores/ui.ts（状态）、aiExport.ts（导出）、AiReadingPanel.vue（展示）
 * 都引用同一份结构，避免四处各自定义导致字段漂移。
 */
import type { AiDetailMode } from './hd'

/** 报告导出的四种格式（Q4.2：三档解读都支持） */
export type ReportFormat = 'md' | 'docx' | 'html' | 'pdf'

/** 完整版分项的三种来源 */
export type FullSectionKind = 'dimension' | 'gate' | 'channel'

/** 完整版单个分项：一次独立的 explain() 结果 */
export interface FullReportSection {
  kind: FullSectionKind
  /** 稳定 key，如 `dimension:综合解读` / `gate:13` / `channel:20-34` */
  key: string
  /** 用于展示与报告小标题 */
  title: string
  /** 该项的 Markdown 正文；重试后仍失败则为空串，key 记入 FullReport.skipped */
  content: string
}

/**
 * 完整版整套报告（#9）。
 * 顺序约定：sections 按 dimension → gate → channel 排列，末尾再接 fusion + summary。
 */
export interface FullReport {
  title: string
  sections: FullReportSection[]
  /** 全盘整合分析（full-fusion 产出） */
  fusion: string
  /** 最终总结论（从 fusion 里拆出的最后一段，见 aiFullReading.ts） */
  summary: string
  /** 全部分项 + fusion 的字符数合计，目标 15000–25000 */
  totalChars: number
  /** 重试 1 次后仍失败、被跳过的分项标题 */
  skipped: string[]
  generatedAt: string
}

/** 报告页眉里可选的上下文，全部由调用方提供，不做任何推断 */
export interface ReportMeta {
  scope?: string
  ref?: string
  chartName?: string
}

/**
 * 导出输入：三档统一走一份 Markdown 序列化。
 * - 精简 / 详细：content 为 AI 返回的单篇 Markdown 全文；
 * - 完整：report 为结构化整套报告；传入时优先按它序列化（content 作为兜底）。
 */
export interface ReportInput {
  title: string
  mode: AiDetailMode
  content: string
  report?: FullReport | null
  meta?: ReportMeta
  /** ISO 时间；不传则取当前时间 */
  generatedAt?: string
}

/** 完整版编排的实时进度（Q3.4：显示当前到哪一项 + 预计剩余） */
export interface AiProgress {
  done: number
  total: number
  /** 当前项名称 */
  current: string
  /** 阶段：分项请求 / 全盘融合 / 已完成 */
  phase: string
  elapsedMs: number
  /** 预计剩余毫秒；样本不足时为 null */
  etaMs: number | null
  skipped: string[]
  failed: string[]
}
