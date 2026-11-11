/**
 * 桌面壳能力的单一入口（preload.cjs 注入 window.hdDesktop）。
 *
 * 新增的 saveReport / savePdf 做成**可选**：旧版安装包只暴露 file.save，
 * 缺少新方法时应自动退化为浏览器下载，而不是报错。
 * 统一在这里做类型转换，避免各组件重复写 `(window as unknown as ...)`。
 */

export interface SaveReportPayload {
  defaultName: string
  /** encoding='base64' 时，content 为二进制的 base64 文本 */
  content: string
  encoding?: 'utf8' | 'base64'
}

export interface SavePdfPayload {
  defaultName: string
  /** 完整的可打印 HTML 文档（含 CJK 字体与 @media print 规则） */
  html: string
}

export interface FileResult {
  ok: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

interface DesktopFileApi {
  save: (payload: { defaultName?: string; content: string }) => Promise<FileResult>
  open: () => Promise<{
    ok: boolean
    canceled?: boolean
    filePath?: string
    content?: string
    error?: string
  }>
  saveReport?: (payload: SaveReportPayload) => Promise<FileResult>
  savePdf?: (payload: SavePdfPayload) => Promise<FileResult>
  /** v3.0.0 批量导出目录能力；老安装包缺这些字段时前端退化为逐个下载 */
  defaultDir?: () => Promise<DirResult>
  pickDir?: () => Promise<DirResult>
  writeInDir?: (payload: {
    dirPath: string
    fileName: string
    content: string
  }) => Promise<FileResult>
}

export interface DirResult {
  ok: boolean
  canceled?: boolean
  dirPath?: string
  error?: string
}

interface DesktopAiApi {
  request: (payload: {
    id: string
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeoutMs: number
  }) => Promise<{
    ok?: boolean
    status?: number
    bodyText?: string
    error?: string
    errorKind?: string
  }>
  cancel?: (id: string) => void
  /** v3.0.0 流式请求：payload 与 request 一致，结果形态与 request 一致 */
  stream?: (payload: {
    id: string
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeoutMs: number
  }) => Promise<{
    ok?: boolean
    status?: number
    bodyText?: string
    error?: string
    errorKind?: string
  }>
  /** v3.0.0 订阅流式事件，返回取消订阅函数；老安装包缺字段时前端降级为整段请求 */
  onStreamEvent?: (
    handler: (payload: {
      id: string
      kind: 'connected' | 'delta' | 'fallback'
      text?: string
      status?: number
      reason?: string
    }) => void,
  ) => () => void
}

interface DesktopBridge {
  isDesktop?: boolean
  platform?: string
  version?: string
  file: DesktopFileApi
  /** v2.5.0：AI 接口代理（老安装包没有这个字段，调用方需按缺失降级） */
  ai?: DesktopAiApi
}

/** 网页 / 安卓下返回 null */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as unknown as { hdDesktop?: DesktopBridge }).hdDesktop
  return bridge && bridge.file ? bridge : null
}

/** 是否具备「原生另存为」能力（Q4.1） */
export function canSaveReportNatively(): boolean {
  return Boolean(getDesktopBridge()?.file.saveReport)
}
