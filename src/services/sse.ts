/**
 * v3.0.0：OpenAI 兼容 SSE 的分帧与解析（网页端流式用；桌面主进程有等价实现）。
 *
 * 只做纯函数，不碰网络与 DOM，方便单测钉住「跨 chunk 半个 JSON」这类边界。
 */
export interface SseFrame {
  data: string
  event?: string
}

/** 增量分帧器：跨 chunk 的半行 / 半个事件都由内部缓冲兜住 */
export class SseDecoder {
  private buffer = ''
  private lines: string[] = []
  private eventName = ''

  push(chunk: string): SseFrame[] {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '')
      this.buffer = this.buffer.slice(idx + 1)
      const frame = this.consumeLine(line)
      if (frame) this.frames.push(frame)
    }
    return this.take()
  }

  private frames: SseFrame[] = []

  private consumeLine(line: string): SseFrame | null {
    if (line === '') {
      if (!this.lines.length) return null
      const data = this.lines.join('\n')
      const event = this.eventName || undefined
      this.lines = []
      this.eventName = ''
      return { data, event }
    }
    if (line.startsWith(':')) return null // 注释 / keep-alive
    if (line.startsWith('event:')) {
      this.eventName = line.slice(6).trim()
      return null
    }
    if (line.startsWith('data:')) {
      this.lines.push(line.slice(5).trimStart())
      return null
    }
    // 其它字段（id / retry）与协议无关，忽略
    return null
  }

  private take(): SseFrame[] {
    if (!this.frames.length) return []
    const out = this.frames
    this.frames = []
    return out
  }

  /** 流结束时把残留缓冲当最后一个事件收尾 */
  finish(): SseFrame[] {
    if (this.buffer.trim()) {
      this.consumeLine(this.buffer.replace(/\r$/, ''))
      this.buffer = ''
    }
    const tail = this.consumeLine('')
    if (tail) this.frames.push(tail)
    return this.take()
  }
}

export interface SseDelta {
  text: string
  finishReason: string | null
  done: boolean
}

/** 从一个 SSE 事件里取增量文本；非法 JSON 与无关事件返回空文本而不是抛错 */
export function parseSseDelta(data: string): SseDelta {
  const raw = data.trim()
  if (!raw) return { text: '', finishReason: null, done: false }
  if (raw === '[DONE]') return { text: '', finishReason: null, done: true }
  try {
    const obj = JSON.parse(raw) as {
      choices?: Array<{
        delta?: { content?: string }
        message?: { content?: string }
        finish_reason?: string | null
      }>
    }
    const choice = obj.choices?.[0]
    const text = choice?.delta?.content ?? choice?.message?.content ?? ''
    return {
      text: typeof text === 'string' ? text : '',
      finishReason: choice?.finish_reason ?? null,
      done: false,
    }
  } catch {
    return { text: '', finishReason: null, done: false }
  }
}

/**
 * 把流式累积的文本合成 OpenAI 兼容的一次性响应。
 * 这样 `explain()` 里 `JSON.parse(result.bodyText)` 与 finish_reason 续写逻辑一行都不用改。
 */
export function synthChatResponse(content: string, finishReason: string | null): string {
  return JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason ?? 'stop' }],
  })
}
