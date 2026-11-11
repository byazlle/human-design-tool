/**
 * v3.0.0 流式链路回归：SSE 分帧、默认路径不变、四态回调、非流式回退、逐路状态隔离。
 * 不发真实请求，fetch 全部 stub。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SseDecoder, parseSseDelta, synthChatResponse } from '../src/services/sse'
import { explain, type AiExplainArgs } from '../src/services/aiClient'
import { useAiStreams } from '../src/composables/useAiStreams'
import type { AiConfig } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://stream.example.test/v1',
  apiKey: 'sk-stream-12345678',
  model: 'stream-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const fetchMock = vi.hoisted(() => vi.fn())

function args(over: Partial<AiExplainArgs> = {}): AiExplainArgs {
  return { cfg: { ...CFG }, scope: 'gate', ref: '1', offline: '离线事实', ...over }
}

function jsonResponse(content = '解读正文') {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function sseResponse(events: string[]) {
  const body = events.map((e) => `data: ${e}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('SseDecoder / parseSseDelta', () => {
  it('跨 chunk 的半个 JSON 能拼回完整事件', () => {
    const d = new SseDecoder()
    const frame = 'data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}\n\n'
    const first = d.push(frame.slice(0, 25))
    expect(first).toHaveLength(0)
    const second = d.push(frame.slice(25))
    expect(second).toHaveLength(1)
    expect(parseSseDelta(second[0].data).text).toBe('你好')
  })

  it('兼容 delta / message 两种载体、[DONE] 与非法 JSON', () => {
    expect(parseSseDelta('{"choices":[{"delta":{"content":"甲"}}]}').text).toBe('甲')
    expect(parseSseDelta('{"choices":[{"message":{"content":"乙"}}]}').text).toBe('乙')
    expect(parseSseDelta('[DONE]').done).toBe(true)
    expect(parseSseDelta('not-json').text).toBe('')
  })

  it('finish_reason 被保留，合成响应可被 explain 的既有解析逻辑消费', () => {
    const parsed = JSON.parse(synthChatResponse('累积正文', 'length'))
    expect(parsed.choices[0].message.content).toBe('累积正文')
    expect(parsed.choices[0].finish_reason).toBe('length')
  })

  it('finish() 收尾不带空行的残留事件', () => {
    const d = new SseDecoder()
    d.push('data: {"choices":[{"delta":{"content":"尾"}}]}')
    expect(d.finish()[0].data).toContain('尾')
  })
})

describe('explain() 的流式开关', () => {
  it('★ 不传 onStream 时请求体不带 stream，行为与 v2.5.0 逐字一致', async () => {
    fetchMock.mockResolvedValue(jsonResponse('旧路径'))
    const content = await explain(args())
    expect(content).toBe('旧路径')
    const init = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(init.body)).not.toHaveProperty('stream')
  })

  it('传 onStream 时带 stream:true，连接与增量事件都真实触发并拼出正文', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        '{"choices":[{"delta":{"content":"第一"}}]}',
        '{"choices":[{"delta":{"content":"第二"}}]}',
        '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
      ]),
    )
    const connected = vi.fn()
    const delta = vi.fn()
    const fallback = vi.fn()
    const content = await explain(args({ onStream: { onConnected: connected, onDelta: delta, onFallback: fallback } }))

    expect(content).toBe('第一第二')
    expect(connected).toHaveBeenCalledTimes(1)
    expect(delta.mock.calls.map((c) => c[0]).join('')).toBe('第一第二')
    expect(fallback).not.toHaveBeenCalled()
    const init = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(init.body).stream).toBe(true)
  })

  it('接口返回普通 JSON 时自动回退，仍能拿到正文', async () => {
    fetchMock.mockResolvedValue(jsonResponse('整段返回'))
    const fallback = vi.fn()
    const content = await explain(args({ onStream: { onFallback: fallback } }))
    expect(content).toBe('整段返回')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('连接失败时按传输通道给出可执行提示（P3 接线）', async () => {
    fetchMock.mockRejectedValue(new Error('failed to fetch'))
    await expect(explain(args())).rejects.toThrow(/网络请求失败/)
  })
})

describe('useAiStreams 逐路隔离', () => {
  it('两路并发各算各的字数与状态，互不串台', () => {
    const s = useAiStreams()
    s.resetAll()
    s.begin('batch:a', '张三')
    s.begin('batch:b', '李四')
    s.connected('batch:a')
    s.delta('batch:a', '甲乙丙')
    s.delta('batch:b', '一')
    s.finish('batch:a', true)
    s.finish('batch:b', false, '超时')

    const a = s.snapshots.value.get('batch:a')!
    const b = s.snapshots.value.get('batch:b')!
    expect(a.chars).toBe(3)
    expect(a.phase).toBe('done')
    expect(b.chars).toBe(1)
    expect(b.phase).toBe('failed')
    expect(a.text).toContain('已完成')
    expect(b.text).toContain('超时')
    expect(a.text).not.toContain('一')
    s.resetAll()
  })

  it('速率来自真实 delta，文案用字/秒且不含百分比', () => {
    const s = useAiStreams()
    s.resetAll()
    s.begin('k', '测试')
    s.connected('k')
    s.delta('k', '一二三四五六七八九十')
    const snap = s.snapshots.value.get('k')!
    expect(snap.chars).toBe(10)
    expect(snap.text).toContain('字/秒')
    expect(snap.text).not.toContain('%')
    s.resetAll()
  })
})
