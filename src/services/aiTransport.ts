/**
 * AI 接口的统一传输层。
 *
 * 为什么需要它：
 * 部分中转站（实测 `https://www.hyai666.top`）**不返回任何 CORS 响应头** ——
 * OPTIONS 预检返回 403、POST 响应里 `access-control-allow-origin` 为 `null`。
 * 而带 `Authorization` 与 `Content-Type: application/json` 的请求必然触发预检，
 * 于是同一接口在浏览器 / Electron 渲染进程 / Android WebView 里「永远连不上」，
 * 在 Node 主进程里却完全正常（实测 `/v1/chat/completions` 返回 200）。
 *
 * 因此把出网动作收敛到一处：
 *   1. 桌面端 → 主进程 IPC（Chromium 网络栈在主进程没有同源策略）；
 *   2. 安卓端 → 原生桥上转（WebView 的 `shouldInterceptRequest` 之外的普通 fetch 受同源约束）；
 *   3. 网页 / 测试环境 → 退回全局 `fetch`，行为与旧版逐字一致。
 *
 * 这一层只负责「把一次 HTTP 往返搬过去」，不理解 chat/completions 的语义。
 */
import { getDesktopBridge } from './desktopBridge'
import { SseDecoder, parseSseDelta, synthChatResponse, type SseFrame } from './sse'

export interface AiHttpInit {
  url: string
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  /** 传输层超时；缺省 60 秒。与业务侧的 `cfg.timeoutMs` 语义一致但不共用同一定时器 */
  timeoutMs?: number
  /** 外部取消信号（用户点「中断」） */
  signal?: AbortSignal
}

export interface AiHttpResult {
  ok: boolean
  status: number
  bodyText: string
  /** 无 HTTP 状态可用时的原因（DNS / 连接被拒 / 超时 / 跨域） */
  error?: string
  errorKind?: 'network' | 'timeout' | 'cancelled'
}

interface NativeAiApi {
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
  /** v3.0.0 流式：老安装包没有这两个字段时自动退回一次性请求 */
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
  onStreamEvent?: (handler: (payload: {
    id: string
    kind: 'connected' | 'delta' | 'fallback'
    text?: string
    status?: number
    reason?: string
  }) => void) => () => void
}

/** 安卓原生桥的形态（MainActivity 里 `addJavascriptInterface` 注入） */
interface AndroidAiBridge {
  aiRequest: (id: string, payloadJson: string) => void
  aiCancel?: (id: string) => void
}

let seq = 0
function nextId(): string {
  seq += 1
  return `hdt-ai-${Date.now()}-${seq}`
}

/** 安卓桥的异步回填表：Java 线程跑完 HTTP 后调 `window.__hdAiResolve(id, json)` 兑现 */
const androidPending = new Map<string, (result: AiHttpResult) => void>()

function windowOf(): (Window & {
  hdAndroid?: AndroidAiBridge
  __hdAiResolve?: (id: string, payload: string) => void
}) | null {
  return typeof window === 'undefined' ? null : (window as never)
}

function desktopAi(): NativeAiApi | null {
  const bridge = getDesktopBridge() as unknown as { ai?: NativeAiApi } | null
  return bridge?.ai?.request ? bridge.ai : null
}

function androidAi(): AndroidAiBridge | null {
  const w = windowOf()
  return w?.hdAndroid?.aiRequest ? w.hdAndroid : null
}

/** 是否走原生通道（桌面主进程或安卓桥）。UI 用它决定是否提示「网页端可能受跨域限制」 */
export function aiTransportKind(): 'desktop' | 'android' | 'web' {
  if (desktopAi()) return 'desktop'
  if (androidAi()) return 'android'
  return 'web'
}

function registerAndroidResolver() {
  const w = windowOf()
  if (!w || w.__hdAiResolve) return
  w.__hdAiResolve = (id: string, payload: string) => {
    const settle = androidPending.get(id)
    if (!settle) return
    androidPending.delete(id)
    try {
      const raw = JSON.parse(payload) as Partial<AiHttpResult>
      settle({
        ok: Boolean(raw.ok),
        status: Number(raw.status) || 0,
        bodyText: typeof raw.bodyText === 'string' ? raw.bodyText : '',
        error: typeof raw.error === 'string' ? raw.error : undefined,
        errorKind:
          raw.errorKind === 'timeout' || raw.errorKind === 'cancelled'
            ? raw.errorKind
            : raw.error === undefined
              ? undefined
              : 'network',
      })
    } catch (err) {
      settle({
        ok: false,
        status: 0,
        bodyText: '',
        error: `原生桥返回了不可解析的结果：${(err as Error)?.message ?? '未知错误'}`,
        errorKind: 'network',
      })
    }
  }
}

async function nativeRequest(api: NativeAiApi, init: AiHttpInit): Promise<AiHttpResult> {
  const id = nextId()
  const timeoutMs = Math.max(1000, Math.min(3600000, init.timeoutMs ?? 60000))
  const onAbort = () => api.cancel?.(id)
  if (init.signal) {
    if (init.signal.aborted) {
      return { ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' }
    }
    init.signal.addEventListener('abort', onAbort)
  }
  try {
    const raw = await api.request({
      id,
      url: init.url,
      method: init.method ?? 'POST',
      headers: init.headers ?? {},
      body: init.body,
      timeoutMs,
    })
    const abortedByUser = Boolean(init.signal?.aborted)
    const errorKind = abortedByUser
      ? 'cancelled'
      : raw.errorKind === 'timeout'
        ? 'timeout'
        : raw.error
          ? 'network'
          : undefined
    return {
      ok: Boolean(raw.ok),
      status: Number(raw.status) || 0,
      bodyText: typeof raw.bodyText === 'string' ? raw.bodyText : '',
      error: abortedByUser ? '已取消' : raw.error,
      errorKind,
    }
  } finally {
    if (init.signal) init.signal.removeEventListener('abort', onAbort)
  }
}

async function androidRequest(api: AndroidAiBridge, init: AiHttpInit): Promise<AiHttpResult> {
  registerAndroidResolver()
  const id = nextId()
  const timeoutMs = Math.max(1000, Math.min(3600000, init.timeoutMs ?? 60000))
  const payload = JSON.stringify({
    url: init.url,
    method: init.method ?? 'POST',
    headers: init.headers ?? {},
    body: init.body ?? null,
    timeoutMs,
  })

  const wait = new Promise<AiHttpResult>((resolve) => androidPending.set(id, resolve))
  const onAbort = () => {
    api.aiCancel?.(id)
    const settle = androidPending.get(id)
    if (settle) {
      androidPending.delete(id)
      settle({ ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' })
    }
  }
  if (init.signal) {
    if (init.signal.aborted) return onAbort(), { ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' }
    init.signal.addEventListener('abort', onAbort)
  }

  try {
    api.aiRequest(id, payload)
    return await wait
  } catch (err) {
    androidPending.delete(id)
    return {
      ok: false,
      status: 0,
      bodyText: '',
      error: `原生桥调用失败：${(err as Error)?.message ?? '未知错误'}`,
      errorKind: 'network',
    }
  } finally {
    if (init.signal) init.signal.removeEventListener('abort', onAbort)
  }
}

async function browserRequest(init: AiHttpInit): Promise<AiHttpResult> {
  const controller = new AbortController()
  const timeoutMs = Math.max(1000, Math.min(3600000, init.timeoutMs ?? 60000))
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timer)
      return { ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' }
    }
    init.signal.addEventListener('abort', onAbort)
  }

  try {
    const res = await fetch(init.url, {
      method: init.method ?? 'POST',
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    })
    const bodyText = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, bodyText }
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError'
    if (aborted) {
      const byUser = Boolean(init.signal?.aborted)
      return {
        ok: false,
        status: 0,
        bodyText: '',
        error: byUser ? '已取消' : `请求超时（${Math.round(timeoutMs / 1000)} 秒）`,
        errorKind: byUser ? 'cancelled' : 'timeout',
      }
    }
    return {
      ok: false,
      status: 0,
      bodyText: '',
      error: (err as Error)?.message || '未知错误',
      errorKind: 'network',
    }
  } finally {
    clearTimeout(timer)
    if (init.signal) init.signal.removeEventListener('abort', onAbort)
  }
}

/**
 * 一次 HTTP 往返。永不抛异常——失败以 `ok:false` + `errorKind` 返回，
 * 由调用方翻译成 `AiError`（保持既有 6 类错误分类不变）。
 */
export async function aiHttpRequest(init: AiHttpInit): Promise<AiHttpResult> {
  const desktop = desktopAi()
  if (desktop) return nativeRequest(desktop, init)
  const android = androidAi()
  if (android) return androidRequest(android, init)
  return browserRequest(init)
}

/* ── v3.0.0 流式通道 ──────────────────────────────────────────────────
 * 四态的「已连接」必须是真实事件：桌面 net.request 的 response、网页 fetch resolve。
 * 绝不用定时器伪造。安卓端按设计降级为整段返回，并明示原因。
 * 流式结果仍合成 OpenAI 兼容 JSON 返回，explain() 的解析/续写逻辑零改动。
 */
export interface AiStreamEvents {
  /** 连接已建立，还没收到首个 delta */
  onConnected?: () => void
  /** 收到一段增量正文（可能一个字，也可能十几个字） */
  onDelta?: (text: string) => void
  /** 接口不支持 SSE 或通道不具备流式能力，已退回整段返回 */
  onFallback?: (reason: string) => void
}

const streamEvents = new Map<string, AiStreamEvents>()
let unsubscribeStream: (() => void) | null = null

function ensureStreamListener(api: NativeAiApi): void {
  if (unsubscribeStream || !api.onStreamEvent) return
  unsubscribeStream = api.onStreamEvent((p) => {
    const e = streamEvents.get(p.id)
    if (!e) return
    if (p.kind === 'connected') e.onConnected?.()
    else if (p.kind === 'delta' && p.text) e.onDelta?.(p.text)
    else if (p.kind === 'fallback') e.onFallback?.(p.reason || '该接口不支持流式，已改用整段返回')
  })
}

function clampTimeout(v: number | undefined): number {
  return Math.max(1000, Math.min(3600000, v ?? 60000))
}

/** 桌面主进程流：delta 只走 IPC 事件，最终结果仍由 invoke 一次性返回 */
async function desktopStream(
  api: NativeAiApi,
  init: AiHttpInit,
  events: AiStreamEvents,
): Promise<AiHttpResult> {
  const id = nextId()
  const timeoutMs = clampTimeout(init.timeoutMs)
  ensureStreamListener(api)
  streamEvents.set(id, events)
  const onAbort = () => api.cancel?.(id)
  if (init.signal) {
    if (init.signal.aborted) {
      streamEvents.delete(id)
      return { ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' }
    }
    init.signal.addEventListener('abort', onAbort)
  }
  try {
    const raw = await api.stream!({
      id,
      url: init.url,
      method: init.method ?? 'POST',
      headers: init.headers ?? {},
      body: init.body,
      timeoutMs,
    })
    const abortedByUser = Boolean(init.signal?.aborted)
    return {
      ok: Boolean(raw.ok),
      status: Number(raw.status) || 0,
      bodyText: typeof raw.bodyText === 'string' ? raw.bodyText : '',
      error: abortedByUser ? '已取消' : raw.error,
      errorKind: abortedByUser
        ? 'cancelled'
        : raw.errorKind === 'timeout'
          ? 'timeout'
          : raw.error
            ? 'network'
            : undefined,
    }
  } finally {
    streamEvents.delete(id)
    if (init.signal) init.signal.removeEventListener('abort', onAbort)
  }
}

/** 网页流：fetch + ReadableStream + SSE 分帧，非 SSE 响应自动回退 */
async function browserStream(init: AiHttpInit, events: AiStreamEvents): Promise<AiHttpResult> {
  const controller = new AbortController()
  const timeoutMs = clampTimeout(init.timeoutMs)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (init.signal) {
    if (init.signal.aborted) {
      clearTimeout(timer)
      return { ok: false, status: 0, bodyText: '', error: '已取消', errorKind: 'cancelled' }
    }
    init.signal.addEventListener('abort', onAbort)
  }

  try {
    const res = await fetch(init.url, {
      method: init.method ?? 'POST',
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    })
    // fetch resolve = 连接建立（真实信号，不是猜的）
    events.onConnected?.()
    const ctype = String(res.headers?.get?.('content-type') ?? '').toLowerCase()
    // 先判类型再取 reader：getReader() 会锁住 body，之后再调 res.text() 会抛错
    if (!ctype.includes('text/event-stream')) {
      events.onFallback?.('该接口不支持流式，已改用整段返回')
      const bodyText = await res.text().catch(() => '')
      return { ok: res.ok, status: res.status, bodyText }
    }
    const reader = res.body?.getReader?.()
    if (!reader) {
      events.onFallback?.('当前环境不支持流式读取，已改用整段返回')
      const bodyText = await res.text().catch(() => '')
      return { ok: res.ok, status: res.status, bodyText }
    }

    const decoder = new TextDecoder()
    const sse = new SseDecoder()
    let content = ''
    let finishReason: string | null = null
    const consume = (frames: SseFrame[]) => {
      for (const f of frames) {
        const d = parseSseDelta(f.data)
        if (d.text) {
          content += d.text
          events.onDelta?.(d.text)
        }
        if (d.finishReason) finishReason = d.finishReason
      }
    }
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) consume(sse.push(decoder.decode(value, { stream: true })))
    }
    consume(sse.finish())
    if (!res.ok) return { ok: false, status: res.status, bodyText: content }
    return { ok: true, status: res.status, bodyText: synthChatResponse(content, finishReason) }
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError'
    if (aborted) {
      const byUser = Boolean(init.signal?.aborted)
      return {
        ok: false,
        status: 0,
        bodyText: '',
        error: byUser ? '已取消' : `请求超时（${Math.round(timeoutMs / 1000)} 秒）`,
        errorKind: byUser ? 'cancelled' : 'timeout',
      }
    }
    return {
      ok: false,
      status: 0,
      bodyText: '',
      error: (err as Error)?.message || '未知错误',
      errorKind: 'network',
    }
  } finally {
    clearTimeout(timer)
    if (init.signal) init.signal.removeEventListener('abort', onAbort)
  }
}

/**
 * 流式优先的一次 HTTP 往返。调用方不传 events 时请直接用 `aiHttpRequest()`——
 * 默认路径保持 v2.5.0 的逐字行为，避免波及既有契约测试。
 */
export async function aiHttpStream(
  init: AiHttpInit,
  events: AiStreamEvents = {},
): Promise<AiHttpResult> {
  const desktop = desktopAi()
  if (desktop?.stream && desktop.onStreamEvent) return desktopStream(desktop, init, events)
  const android = androidAi()
  if (android) {
    events.onFallback?.('安卓端使用整段返回，进度按请求阶段显示')
    return aiHttpRequest(init)
  }
  return browserStream(init, events)
}
