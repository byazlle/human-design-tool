/**
 * AI 解读报告导出（需求 #10）：MD / Word / HTML / PDF 四格式，三档解读共用一份序列化。
 *
 * 设计要点：
 * - 三种档位先统一 `reportToMarkdown()`：精简/详细是单篇 Markdown，完整是结构化
 *   `FullReport` 按「八大维度 → 逐闸门 → 逐通道 → 全盘整合 → 最终总结论」展开；
 *   之后 MD / Word / HTML / PDF 都从这一份文本出图，避免四套排版逻辑各自漂移。
 * - Word 用已装的 docx@9，且**动态 import()**，不进主 bundle（风险表）。
 * - PDF 不用 jsPDF 默认字体（中文乱码）：桌面端走 Electron `printToPDF`，
 *   浏览器/安卓退化为打印专用页 + `window.print()`（Q4.1 已确认可接受）。
 * - 保存位置：桌面端原生「另存为」(file:save-report / file:save-pdf)；
 *   浏览器/安卓退化为 `Blob + a.download` 到默认下载目录。
 * - renderMarkdown 不支持表格；这里在导出侧补一个表格分块渲染器，
 *   把 Markdown 表格转成真正的 `<table>`，Word 则降级为以 `｜` 分隔的纯文本行。
 */
import type { Paragraph as DocxParagraph } from 'docx'
import { renderMarkdown } from './markdown'
import { getDesktopBridge, type FileResult } from './desktopBridge'
import type { AiDetailMode } from '../types/hd'
import type {
  FullReport,
  FullSectionKind,
  ReportFormat,
  ReportInput,
  ReportMeta,
} from '../types/report'

/** 导出按钮的固定顺序 */
export const REPORT_FORMATS: readonly ReportFormat[] = ['md', 'docx', 'html', 'pdf'] as const

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  md: 'MD',
  docx: 'Word',
  html: 'HTML',
  pdf: 'PDF',
}

const REPORT_EXTENSIONS: Record<ReportFormat, string> = {
  md: 'md',
  docx: 'docx',
  html: 'html',
  pdf: 'pdf',
}

const MODE_LABEL: Record<AiDetailMode, string> = {
  concise: '精简',
  detailed: '详细',
  full: '完整',
}

const DISCLAIMER =
  '本报告由用户自行配置的 AI 接口生成，内容仅基于本盘结构与离线释义，不构成医疗、命运、吉凶或投资建议；如与事实不符，请以盘面数据与离线释义为准。'

const SECTION_TITLES: Record<FullSectionKind, string> = {
  dimension: '八大维度专项解读',
  gate: '逐闸门专项解读',
  channel: '逐通道专项解读',
}

const SECTION_ORDER: readonly FullSectionKind[] = ['dimension', 'gate', 'channel'] as const
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八'] as const

export interface ExportResult {
  ok: boolean
  canceled?: boolean
  format: ReportFormat
  fileName: string
  message: string
}

/* ── 工具 ──────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 行内 Markdown → HTML（表格单元格用；正文仍交给 renderMarkdown） */
function inlineHtml(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/** 去掉行内 Markdown 标记，供 Word 纯文本段落使用 */
function stripInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim()
}

/** 纯计数：去空白后的字符数，仅用于页眉「约 N 字」 */
function charCount(s: string): string {
  return String(s.replace(/\s/g, '').length)
}

/** 用 UTC 时间，避免导出结果随本机时区变化 */
function utcStamp(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
function utcDateTime(iso?: string): string {
  return utcStamp(iso).replace('T', ' ').slice(0, 19) + ' UTC'
}
function utcDate(iso?: string): string {
  return utcStamp(iso).slice(0, 10).replace(/-/g, '')
}

/** 文件名去掉 Windows/Unix 非法字符，长度截断，避免另存为对话框报错 */
function safeFileName(s: string): string {
  const cleaned = s
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'AI 解读报告').slice(0, 60)
}

export function reportFileName(input: ReportInput, format: ReportFormat): string {
  return `${safeFileName(input.title)}-${MODE_LABEL[input.mode]}-${utcDate(input.generatedAt)}.${REPORT_EXTENSIONS[format]}`
}

function metaText(meta?: ReportMeta): string[] {
  if (!meta) return []
  const lines: string[] = []
  if (meta.chartName) lines.push(`> 盘面：${meta.chartName}`)
  if (meta.scope) lines.push(`> 范围：${meta.scope}${meta.ref ? ` · ${meta.ref}` : ''}`)
  return lines
}

/* ── 统一序列化 ──────────────────────────────────────── */

/**
 * 完整版结构化报告 → Markdown。
 * 空内容（重试后仍失败被跳过）的分项不进正文，只在末尾「附」里列出。
 */
export function serializeFullReport(report: FullReport): string {
  const out: string[] = []
  let sectionNo = 0
  const pushSection = (title: string, body: string) => {
    if (!body.trim()) return
    sectionNo += 1
    const prefix = CN_NUM[sectionNo - 1] ?? String(sectionNo)
    out.push(`## ${prefix}、${title}`, '', body.trim(), '')
  }

  for (const kind of SECTION_ORDER) {
    const list = report.sections.filter((s) => s.kind === kind && s.content.trim())
    if (!list.length) continue
    const parts = list.map((s, i) => `### ${i + 1}. ${s.title}\n\n${s.content.trim()}`)
    pushSection(SECTION_TITLES[kind], parts.join('\n\n'))
  }
  pushSection('全盘整合分析', report.fusion)
  pushSection('最终总结论', report.summary)

  if (report.skipped.length) {
    pushSection(
      '附：未完成的专项',
      report.skipped
        .map((k) => `- ${k}（重试后仍失败，已跳过；本次报告不含该分项）`)
        .join('\n'),
    )
  }
  return out.join('\n').trim()
}

/** 三档统一入口：返回带页眉与免责声明的 Markdown 全文 */
export function reportToMarkdown(input: ReportInput): string {
  const body = (input.report ? serializeFullReport(input.report) : input.content).trim()
  const head = [
    `# ${input.title.trim() || 'AI 解读报告'}`,
    '',
    `> 解读档位：${MODE_LABEL[input.mode]}｜生成时间：${utcDateTime(input.generatedAt)}`,
    ...metaText(input.meta),
    `> 全文约 ${charCount(body)} 字`,
    '',
    '---',
    '',
    body || '（暂无内容）',
    '',
    '---',
    '',
    DISCLAIMER,
  ]
  return head.join('\n')
}

/* ── Markdown → HTML（导出专用，补表格支持）────────── */

function splitCells(line: string): string[] {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

function isTableLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 2
}

function isTableSeparator(line: string): boolean {
  if (!isTableLine(line)) return false
  const cells = splitCells(line)
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
}

function renderHtmlTable(rows: string[][]): string {
  const [head, ...body] = rows
  // 以表头列数为准补齐/截断，避免越界单元格被静默丢弃
  const width = head.length
  const th = Array.from({ length: width }, (_, i) => `<th>${inlineHtml(head[i] ?? '')}</th>`).join('')
  const trs = body
    .map((row) => {
      const tds = Array.from({ length: width }, (_, i) => `<td>${inlineHtml(row[i] ?? '')}</td>`).join('')
      return `<tr>${tds}</tr>`
    })
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

/**
 * 把 Markdown 转成 HTML 片段：普通段落复用 renderMarkdown（已做 HTML 转义），
 * 表格块单独走 `<table>`，避免 renderMarkdown 把 `|` 行当普通文本。
 */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let buffer: string[] = []
  const flush = () => {
    if (buffer.length) {
      out.push(renderMarkdown(buffer.join('\n')))
      buffer = []
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (isTableLine(line) && isTableSeparator(lines[i + 1] ?? '')) {
      flush()
      const rows: string[][] = [splitCells(line)]
      i += 1 // 跳过分隔行
      while (i + 1 < lines.length && isTableLine(lines[i + 1])) {
        i += 1
        rows.push(splitCells(lines[i]))
      }
      out.push(renderHtmlTable(rows))
    } else {
      buffer.push(line)
    }
  }
  flush()
  return out.join('\n')
}

/** 可独立打开 / 可打印的完整 HTML 文档（CSS 内联，离线可用） */
export function reportToHtml(input: ReportInput): string {
  const title = escapeHtml(input.title.trim() || 'AI 解读报告')
  const body = markdownToHtml(reportToMarkdown(input))
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  @page { size: A4; margin: 18mm 16mm; }
  body {
    margin: 0; padding: 24px;
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
    font-size: 14px; line-height: 1.8; color: #1f2937; background: #fff;
  }
  .report { max-width: 860px; margin: 0 auto; }
  h1, h2, h3, h4 { color: #111827; line-height: 1.45; }
  h1 { font-size: 24px; padding-bottom: 8px; border-bottom: 2px solid #7c3aed; margin: 0 0 18px; }
  h2 { font-size: 19px; margin: 28px 0 12px; padding-left: 10px; border-left: 4px solid #7c3aed; }
  h3 { font-size: 16px; margin: 20px 0 10px; }
  h4 { font-size: 14px; color: #4b5563; }
  p { margin: 0 0 12px; }
  ul, ol { margin: 0 0 12px; padding-left: 1.5em; }
  li { margin-bottom: 4px; }
  blockquote { margin: 0 0 14px; padding: 8px 14px; background: #f5f3ff; border-left: 3px solid #a78bfa; color: #4b5563; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 22px 0; }
  code { padding: 1px 5px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; font-size: .9em; }
  strong { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; font-weight: 700; }
  .toolbar {
    max-width: 860px; margin: 0 auto 18px; padding: 10px 14px;
    background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #4b5563;
  }
  .toolbar button {
    padding: 6px 14px; border: 1px solid #7c3aed; border-radius: 6px;
    background: #7c3aed; color: #fff; cursor: pointer; font-size: 13px;
  }
  @media print {
    body { padding: 0; font-size: 12px; }
    .no-print { display: none !important; }
    h2 { break-after: avoid; }
    table, blockquote { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button type="button" onclick="window.print()">打印 / 另存为 PDF</button>
  <span>在打印对话框里选择「另存为 PDF」，即可自行指定保存文件夹。</span>
</div>
<main class="report">
${body}
</main>
</body>
</html>`
}

/* ── Markdown → Word 纯文本块 ────────────────────────── */

export interface ReportLine {
  kind: 'heading' | 'paragraph' | 'bullet' | 'number' | 'quote' | 'hr' | 'table'
  /** heading 时为 1–4 */
  level: number
  text: string
  /** kind='table' 时为整张表格的所有行 */
  cells?: string[][]
}

/** 纯函数，便于回归测试；Word 生成器只消费它的输出 */
export function parseReportLines(md: string): ReportLine[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: ReportLine[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue

    if (isTableLine(line) && isTableSeparator(lines[i + 1] ?? '')) {
      const rows: string[][] = [splitCells(line).map(stripInline)]
      i += 1
      while (i + 1 < lines.length && isTableLine(lines[i + 1])) {
        i += 1
        rows.push(splitCells(lines[i]).map(stripInline))
      }
      out.push({ kind: 'table', level: 0, text: '', cells: rows })
      continue
    }
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line)) {
      out.push({ kind: 'hr', level: 0, text: '' })
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      out.push({ kind: 'heading', level: h[1].length, text: stripInline(h[2]) })
      continue
    }
    if (line.startsWith('>')) {
      out.push({ kind: 'quote', level: 0, text: stripInline(line.replace(/^>\s?/, '')) })
      continue
    }
    const ul = line.match(/^[-*]\s+(.+)$/)
    if (ul) {
      out.push({ kind: 'bullet', level: 0, text: stripInline(ul[1]) })
      continue
    }
    if (/^\d+[.、]\s*(.+)$/.test(line)) {
      // 保留原始序号：Word 里不用 numbering 配置也能看清顺序
      out.push({ kind: 'number', level: 0, text: stripInline(line) })
      continue
    }
    out.push({ kind: 'paragraph', level: 0, text: stripInline(line) })
  }
  return out
}

/** 动态 import('docx')，避免进入主 bundle；返回可直接下载的 Blob */
export async function buildWordBlob(md: string, title = 'AI 解读报告'): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const FONT = 'Microsoft YaHei'
  const run = (text: string, bold = false) => new TextRun({ text, font: FONT, bold })
  const headings = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
  ]
  const children: DocxParagraph[] = []

  for (const line of parseReportLines(md)) {
    switch (line.kind) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: headings[Math.min(Math.max(line.level, 1), 4) - 1],
            children: [run(line.text, true)],
            spacing: { before: 260, after: 120 },
          }),
        )
        break
      case 'bullet':
        children.push(
          new Paragraph({ bullet: { level: 0 }, children: [run(line.text)], spacing: { after: 60 } }),
        )
        break
      case 'number':
      case 'quote':
        children.push(
          new Paragraph({
            indent: { left: 360 },
            children: [run(line.text)],
            spacing: { after: 60 },
          }),
        )
        break
      case 'table':
        // 表格降级为纯文本行（需求文档已知边界：renderMarkdown 不支持表格）
        for (const row of line.cells ?? []) {
          children.push(
            new Paragraph({ children: [run(row.join(' ｜ '))], spacing: { after: 40 } }),
          )
        }
        break
      case 'hr':
        break
      default:
        children.push(new Paragraph({ children: [run(line.text)], spacing: { after: 120 } }))
    }
  }
  if (!children.length) children.push(new Paragraph({ children: [run('（暂无内容）')] }))

  const doc = new Document({
    creator: 'HumanDesignTool',
    title,
    description: 'AI 解读报告（由用户自行配置的 AI 接口生成）',
    sections: [{ properties: {}, children }],
  })
  return Packer.toBlob(doc)
}

/* ── 保存：桌面原生另存为 / 浏览器下载 ───────────────── */

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟回收，避免部分浏览器尚未开始下载就被撤销
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function saveTextFile(fileName: string, text: string, mime: string): Promise<FileResult> {
  const bridge = getDesktopBridge()
  if (bridge?.file.saveReport) {
    return bridge.file.saveReport({ defaultName: fileName, content: text, encoding: 'utf8' })
  }
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName)
  return { ok: true }
}

async function saveBinaryFile(fileName: string, blob: Blob): Promise<FileResult> {
  const bridge = getDesktopBridge()
  if (bridge?.file.saveReport) {
    const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
    return bridge.file.saveReport({ defaultName: fileName, content: base64, encoding: 'base64' })
  }
  downloadBlob(blob, fileName)
  return { ok: true }
}

interface PdfResult extends FileResult {
  /** 打印窗口被拦截 / PDF 生成失败时改为提供可打印 HTML */
  fallbackHtml?: boolean
  fallbackReason?: string
}

async function savePdfFile(fileName: string, html: string): Promise<PdfResult> {
  const htmlName = fileName.replace(/\.pdf$/i, '.html')
  const bridge = getDesktopBridge()
  if (bridge?.file.savePdf) {
    const res = await bridge.file.savePdf({ defaultName: fileName, html })
    if (res.ok || res.canceled) return res
    // 某些环境下隐藏窗口的 printToPDF 会失败；不伪造 PDF，改给可打印 HTML
    await saveTextFile(htmlName, html, 'text/html')
    return {
      ok: true,
      fallbackHtml: true,
      fallbackReason: `PDF 生成失败（${res.error ?? '未知错误'}），已改为下载可打印 HTML`,
    }
  }
  // 浏览器 / 安卓：打印专用页，用户自己在打印对话框里选「另存为 PDF」并指定位置
  const win = window.open('', '_blank')
  if (!win) {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), htmlName)
    return { ok: true, fallbackHtml: true }
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  win.setTimeout(() => {
    try {
      win.print()
    } catch {
      /* 浏览器禁用打印时，页面内的按钮仍可手动触发 */
    }
  }, 400)
  return { ok: true }
}

/** 导出入口：组件只需要传格式与报告内容，保存细节全部在这里收口 */
export async function exportReport(
  format: ReportFormat,
  input: ReportInput,
): Promise<ExportResult> {
  const fileName = reportFileName(input, format)
  const base: Omit<ExportResult, 'ok' | 'message'> = { format, fileName }
  try {
    const md = reportToMarkdown(input)
    let result: PdfResult
    let fallbackNote = ''

    switch (format) {
      case 'md':
        result = await saveTextFile(fileName, md, 'text/markdown')
        break
      case 'html':
        result = await saveTextFile(fileName, reportToHtml(input), 'text/html')
        break
      case 'docx':
        result = await saveBinaryFile(fileName, await buildWordBlob(md, input.title))
        break
      case 'pdf':
        result = await savePdfFile(fileName, reportToHtml(input))
        if (result.fallbackHtml) {
          fallbackNote =
            result.fallbackReason ||
            '打印窗口被拦截，已改为下载 HTML，请在浏览器中打开后打印为 PDF'
        }
        break
    }

    if (result.canceled || (!result.ok && !result.error)) {
      return { ...base, ok: true, canceled: true, message: '已取消导出' }
    }
    if (!result.ok) {
      return { ...base, ok: false, message: `导出失败：${result.error ?? '未知错误'}` }
    }
    const native = getDesktopBridge()?.file.saveReport || getDesktopBridge()?.file.savePdf
    const message =
      fallbackNote ||
      (format === 'pdf' && !native
        ? '已打开打印窗口，选择「另存为 PDF」即可指定保存文件夹'
        : native
          ? `已保存：${result.filePath || fileName}`
          : '已开始下载到浏览器默认目录')
    return { ...base, ok: true, message }
  } catch (err) {
    return {
      ...base,
      ok: false,
      message: `导出失败：${(err as Error).message || '未知错误'}`,
    }
  }
}
