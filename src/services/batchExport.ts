/**
 * v3.0.0：批量解读「保存位置 + 完成后自动导出 md，一人一份」。
 *
 * 设计取舍：
 * - 正文一律走 `reportToMarkdown()`，与单盘手动导出**逐字一致**（含页眉与免责声明），
 *   不写裸正文，避免两种导出口径漂移。
 * - 桌面端：主进程选目录 + 静默写盘（`flag:'wx'` 保证不覆盖，重名自动 -2/-3）。
 * - 网页 / 安卓：没有目录能力，退化为逐个下载，并在 UI 明示（浏览器自己决定落点）。
 * - 每份独立成功 / 失败，失败的进清单而不是整体回滚——批量跑到一半失败不丢已完成部分。
 */
import { getDesktopBridge } from './desktopBridge'
import { reportToMarkdown, safeFileName } from './aiExport'
import type { AiAudience, AiDetailMode } from '../types/hd'

export const OUTPUT_DIR_KEY = 'hdt.batch.outputDir.v1'
export const AUTO_EXPORT_KEY = 'hdt.batch.autoExport.v1'

export interface BatchExportItem {
  archiveId: string
  name: string
  title: string
  content: string
  mode: AiDetailMode
  scope: string
  ref: string
  /** ISO 生成时刻；不传按当前本地时间生成文件名 */
  at?: string
}

export interface BatchExportResult {
  /** directory = 静默写入所选目录；download = 浏览器逐个下载；none = 无可用通道 */
  mode: 'directory' | 'download' | 'none'
  written: { name: string; filePath: string }[]
  failed: { name: string; error: string }[]
  /** 实际使用的目录（directory 模式） */
  dirPath?: string
}

interface DirResult {
  ok?: boolean
  canceled?: boolean
  dirPath?: string
  error?: string
}

interface WriteResult {
  ok?: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

function bridgeFile():
  | {
      defaultDir?: () => Promise<DirResult>
      pickDir?: () => Promise<DirResult>
      writeInDir?: (payload: { dirPath: string; fileName: string; content: string }) => Promise<WriteResult>
    }
  | undefined {
  return getDesktopBridge()?.file as unknown as ReturnType<typeof bridgeFile>
}

/** 是否具备原生目录能力（网页 / 安卓为 false） */
export function canPickDirectory(): boolean {
  return Boolean(bridgeFile()?.pickDir && bridgeFile()?.writeInDir)
}

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式下写不进去不影响本次导出 */
  }
}

export function getOutputDir(): string {
  return readStored(OUTPUT_DIR_KEY)
}

export function setOutputDir(dir: string): void {
  store(OUTPUT_DIR_KEY, dir)
}

/** 默认开启自动导出：用户要的就是「解读完成后自动导出」 */
export function isAutoExport(): boolean {
  return readStored(AUTO_EXPORT_KEY) !== '0'
}

export function setAutoExport(on: boolean): void {
  store(AUTO_EXPORT_KEY, on ? '1' : '0')
}

/** 首次进入时向主进程要一个默认目录（<文档>/HumanDesign解读），用户可随时改 */
export async function ensureDefaultOutputDir(): Promise<string> {
  const saved = getOutputDir()
  if (saved || !canPickDirectory()) return saved
  try {
    const res = await bridgeFile()?.defaultDir?.()
    if (res?.ok && res.dirPath) {
      setOutputDir(res.dirPath)
      return res.dirPath
    }
  } catch {
    /* 拿不到就让用户手动选 */
  }
  return ''
}

/** 弹出系统目录选择器；取消时返回空串，不改变已记住的目录 */
export async function pickOutputDir(): Promise<string> {
  if (!canPickDirectory()) return ''
  try {
    const res = await bridgeFile()?.pickDir?.()
    if (res?.ok && res.dirPath) {
      setOutputDir(res.dirPath)
      return res.dirPath
    }
  } catch {
    /* 对话框被系统拦截时保持原值 */
  }
  return getOutputDir()
}

/** 本地时间戳 yyyyMMdd-HHmm（与 UTC 的手动导出文件名区分，便于按本地时间找人） */
function localStamp(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const at = Number.isNaN(d.getTime()) ? new Date() : d
  const p = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`
}

const AUDIENCE_LABEL: Record<AiAudience, string> = { pro: '专业版', plain: '简明版' }

/**
 * 文件名：`<档案名>-<范围>-<受众>-<yyyyMMdd-HHmm>.md`。
 * basename 截到 56 字符，给主进程的不覆盖后缀 `-2` 留位，保证加后缀后仍 ≤60。
 */
export function batchFileName(item: BatchExportItem, audience: AiAudience): string {
  const base = safeFileName(
    `${item.name}-${item.scope}-${AUDIENCE_LABEL[audience]}-${localStamp(item.at)}`,
  ).slice(0, 56)
  return `${base || 'AI 解读'}.md`
}

/** 与手动导出逐字一致的 Markdown 全文 */
export function batchMarkdown(
  item: BatchExportItem,
  audience: AiAudience,
): string {
  return reportToMarkdown({
    title: item.title || item.name,
    mode: item.mode,
    content: item.content,
    generatedAt: item.at,
    meta: {
      chartName: item.name,
      scope: item.scope,
      ref: item.ref,
    },
  })
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 会让部分浏览器来不及取流，延后一拍
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * 逐份导出。dirPath 为空且具备桌面能力时，自动取已记住 / 默认目录。
 * 不抛异常：单份失败只记进 failed，让批量流程继续。
 */
export async function exportBatchReadings(
  items: BatchExportItem[],
  options: { dirPath?: string; audience?: AiAudience } = {},
): Promise<BatchExportResult> {
  const audience = options.audience ?? 'pro'
  const usable = items.filter((i) => i.content.trim())
  if (!usable.length) return { mode: 'none', written: [], failed: [] }

  const file = bridgeFile()
  let dirPath = options.dirPath || getOutputDir()
  if (file?.writeInDir && !dirPath) dirPath = await ensureDefaultOutputDir()

  if (file?.writeInDir && dirPath) {
    const result: BatchExportResult = { mode: 'directory', written: [], failed: [], dirPath }
    for (const item of usable) {
      try {
        const res = await file.writeInDir({
          dirPath,
          fileName: batchFileName(item, audience),
          content: batchMarkdown(item, audience),
        })
        if (res?.ok && res.filePath) result.written.push({ name: item.name, filePath: res.filePath })
        else result.failed.push({ name: item.name, error: res?.error || '写入失败' })
      } catch (err) {
        result.failed.push({ name: item.name, error: (err as Error)?.message || '写入异常' })
      }
    }
    return result
  }

  // 网页 / 安卓：逐个下载。浏览器会按自身设置决定保存位置，无法指定目录。
  const result: BatchExportResult = { mode: 'download', written: [], failed: [] }
  for (const item of usable) {
    try {
      const fileName = batchFileName(item, audience)
      download(fileName, batchMarkdown(item, audience))
      result.written.push({ name: item.name, filePath: fileName })
    } catch (err) {
      result.failed.push({ name: item.name, error: (err as Error)?.message || '下载失败' })
    }
  }
  return result
}
