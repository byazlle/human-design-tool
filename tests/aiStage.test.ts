/**
 * T-8 纯逻辑回归：explain() 可选阶段回调（environment:node）。
 * 只 vi.stubGlobal('fetch' / 'localStorage')，不发真实请求、不挂载组件。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

import {
  AiError,
  cacheKey,
  explain,
  PROMPT_VERSION,
  type AiExplainArgs,
  type AiStageEvent,
} from '../src/services/aiClient'
import type { AiConfig } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://stage.example.test/v1',
  apiKey: 'stage-key-1234',
  model: 'stage-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

function args(overrides: Partial<AiExplainArgs> = {}): AiExplainArgs {
  return {
    cfg: { ...CFG },
    scope: 'gate',
    ref: '1',
    offline: '离线事实',
    ...overrides,
  }
}

function okResponse(content = '解读正文', finishReason = 'stop'): unknown {
  // 统一传输层读的是 Response.text()（主进程 / 原生桥回传的也是纯文本），
  // 所以 mock 的 text() 必须给出与 json() 一致的真实响应体。
  const body = JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason }],
  })
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(body),
    text: async () => body,
  }
}

function stubLocalStorage(initial: Record<string, string> = {}): Map<string, string> {
  const mem = new Map<string, string>(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  })
  return mem
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  stubLocalStorage()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('explain() 可选 onStage · 向后兼容', () => {
  it('不传 onStage 时行为等价，返回正文且 PROMPT_VERSION 不变', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const result = await explain(args())
    expect(result).toBe('解读正文')
    expect(PROMPT_VERSION).toBe('3.3')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('onStage 不进入缓存键，提示词版本不漂移', () => {
    const a = args()
    const b = args({ onStage: () => {} })
    expect(cacheKey(a.cfg, b)).toBe(cacheKey(a.cfg, a))
  })

  it('6 个客户端观测点按序触发，字段齐全', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const stages: AiStageEvent[] = []
    await explain(args({ onStage: (e) => stages.push(e) }))
    expect(stages.map((e) => e.stage)).toEqual([
      'config-validated',
      'request-sent',
      'response-received',
      'completed',
    ])
    for (const e of stages) {
      expect(typeof e.at).toBe('number')
      expect(typeof e.elapsedMs).toBe('number')
      expect(e.timeoutMs).toBe(60000)
    }
    expect(stages.find((e) => e.stage === 'response-received')!.round).toBe(0)
  })

  it('续写轮只发一次 request-sent，response-received 带 round', async () => {
    let round = 0
    fetchMock.mockImplementation(async () => {
      const r = round++
      return okResponse(r === 0 ? '第一段' : '第二段')
    })
    // 让第一轮 finish_reason='length' 触发续写
    fetchMock.mockResolvedValueOnce(okResponse('第一段', 'length'))
    fetchMock.mockResolvedValueOnce(okResponse('第二段'))
    const stages: AiStageEvent[] = []
    const result = await explain(args({ onStage: (e) => stages.push(e) }))
    expect(result).toContain('第一段')
    expect(stages.filter((e) => e.stage === 'request-sent')).toHaveLength(1)
    expect(stages.filter((e) => e.stage === 'response-received').map((e) => e.round)).toEqual([0, 1])
  })

  it('缓存命中直接 completed，不发 request-sent', async () => {
    const cached = args({ cfg: { ...CFG, cacheEnabled: true } })
    const key = cacheKey(cached.cfg, cached)
    stubLocalStorage({ [key]: '缓存正文' })
    const stages: AiStageEvent[] = []
    const result = await explain({ ...cached, onStage: (e) => stages.push(e) })
    expect(result).toBe('缓存正文')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stages.map((e) => e.stage)).toEqual(['config-validated', 'completed'])
  })

  it('回调抛错不影响请求结果', async () => {
    fetchMock.mockResolvedValue(okResponse())
    const result = await explain(
      args({
        onStage: () => {
          throw new Error('UI 回调异常')
        },
      }),
    )
    expect(result).toBe('解读正文')
  })
})

describe('explain() 终态分类', () => {
  it('配置非法 → failed/config，且不发请求', async () => {
    const stages: AiStageEvent[] = []
    await expect(
      explain(args({ cfg: { ...CFG, apiKey: '' }, onStage: (e) => stages.push(e) })),
    ).rejects.toMatchObject({ kind: 'config' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stages[stages.length - 1]!.stage).toBe('failed')
    expect(stages[stages.length - 1]!.errorKind).toBe('config')
  })

  it('已取消 signal → cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const stages: AiStageEvent[] = []
    await expect(
      explain(args({ signal: controller.signal, onStage: (e) => stages.push(e) })),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(stages[stages.length - 1]!.stage).toBe('cancelled')
    expect(stages[stages.length - 1]!.errorKind).toBe('cancelled')
  })

  it('内部超时 → timeout（signal 未 aborted）', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    fetchMock.mockRejectedValue(abortErr)
    const stages: AiStageEvent[] = []
    await expect(explain(args({ onStage: (e) => stages.push(e) }))).rejects.toMatchObject({
      kind: 'timeout',
    })
    expect(stages[stages.length - 1]!.stage).toBe('timeout')
    expect(stages[stages.length - 1]!.errorKind).toBe('timeout')
  })

  it('HTTP 错误 → failed/http，异常类型仍是 AiError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
      json: async () => ({}),
    })
    const stages: AiStageEvent[] = []
    await expect(explain(args({ onStage: (e) => stages.push(e) }))).rejects.toBeInstanceOf(AiError)
    expect(stages[stages.length - 1]!.errorKind).toBe('http')
  })

  it('网络错误 → failed/network', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const stages: AiStageEvent[] = []
    await expect(explain(args({ onStage: (e) => stages.push(e) }))).rejects.toMatchObject({
      kind: 'network',
    })
    expect(stages[stages.length - 1]!.stage).toBe('failed')
  })
})
