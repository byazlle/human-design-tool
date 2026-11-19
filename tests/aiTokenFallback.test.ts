/**
 * max_tokens 降级链回归（ARCH v4.0.0 §7.3 / §11.3）。
 *
 * 三组断言：
 * 1. 纯函数口径：阶梯顺序、末位 `undefined`、越界识别的四类排除项；
 * 2. `explain()` 集成：400/422 + 越界措辞才降级，401 / invalid_api_key 不降级；
 * 3. 隔离性：降级状态只活在单次调用栈内，不污染并发的第二个请求。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { explain } from '../src/services/aiClient'
import {
  FIRST_MAX_TOKENS_STEP,
  MAX_TOKENS_CEILING,
  MAX_TOKENS_LADDER,
  isMaxTokensRejection,
  maxTokensBodyOf,
  nextMaxTokensStep,
  pushFallbackStep,
  startFallbackTrace,
} from '../src/services/aiTokenFallback'
import type { AiConfig } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'sk-test-1234567890',
  model: 'gpt-test',
  timeoutMs: 60000,
  cacheEnabled: false,
}

describe('阶梯常量', () => {
  it('上限 128000，阶梯顺序固定，末位为 undefined', () => {
    expect(MAX_TOKENS_CEILING).toBe(128000)
    expect(MAX_TOKENS_LADDER).toEqual([128000, 64000, 32000, 16000, 8192, undefined])
    expect(FIRST_MAX_TOKENS_STEP).toBe(MAX_TOKENS_CEILING)
  })

  it('nextMaxTokensStep 逐级下降，末位之后返回 null', () => {
    expect(nextMaxTokensStep(128000)).toBe(64000)
    expect(nextMaxTokensStep(64000)).toBe(32000)
    expect(nextMaxTokensStep(32000)).toBe(16000)
    expect(nextMaxTokensStep(16000)).toBe(8192)
    expect(nextMaxTokensStep(8192)).toBeUndefined()
    expect(nextMaxTokensStep(undefined)).toBeNull()
    // 不在阶梯内的取值不猜测性跳跃
    expect(nextMaxTokensStep(9999)).toBeNull()
  })

  it('末位档的请求体不带 max_tokens 字段', () => {
    expect(maxTokensBodyOf(128000)).toEqual({ max_tokens: 128000 })
    expect(maxTokensBodyOf(undefined)).toEqual({})
  })

  it('FallbackTrace 记录降级路径', () => {
    const trace = startFallbackTrace()
    expect(trace).toEqual({ tried: [128000], finalStep: 128000, degraded: false })
    pushFallbackStep(trace, 64000)
    expect(trace).toEqual({ tried: [128000, 64000], finalStep: 64000, degraded: true })
  })
})

describe('isMaxTokensRejection：识别口径（防误判）', () => {
  it('400 / 422 + 越界措辞 → 判为越界', () => {
    expect(isMaxTokensRejection(400, 'max_tokens is too large')).toBe(true)
    expect(isMaxTokensRejection(422, 'max_tokens exceeds the model limit')).toBe(true)
    expect(isMaxTokensRejection(400, 'This model supports max_output_tokens up to 8192')).toBe(true)
    expect(isMaxTokensRejection(400, 'maximum context length is 8192 tokens')).toBe(true)
    expect(isMaxTokensRejection(400, 'too many tokens in request')).toBe(true)
    expect(isMaxTokensRejection(400, 'request exceeds the token limit')).toBe(true)
    expect(isMaxTokensRejection(400, '上下文长度超出上限')).toBe(true)
    expect(isMaxTokensRejection(422, '请求超出最大限制')).toBe(true)
    expect(isMaxTokensRejection(400, '{"error":{"message":"max_tokens too large"}}')).toBe(true)
  })

  it('状态码不是 400/422 一律不降级（401/403/500 重试无意义）', () => {
    for (const status of [0, 200, 401, 403, 404, 429, 500, 502]) {
      expect(isMaxTokensRejection(status, 'max_tokens is too large'), `status=${status}`).toBe(false)
    }
  })

  it('鉴权 / 模型名 / 余额措辞必须排除，即使同时出现越界措辞', () => {
    expect(isMaxTokensRejection(400, 'invalid_api_key')).toBe(false)
    expect(isMaxTokensRejection(400, 'invalid api key provided')).toBe(false)
    expect(isMaxTokensRejection(401, 'unauthorized: max_tokens too large')).toBe(false)
    expect(isMaxTokensRejection(400, 'model_not_found: max_tokens')).toBe(false)
    expect(isMaxTokensRejection(400, 'model not found')).toBe(false)
    expect(isMaxTokensRejection(400, 'insufficient_quota: max_tokens too large')).toBe(false)
  })

  it('body 为空或只有空白一律不降级（避开「Key 错误被重试 6 次」）', () => {
    expect(isMaxTokensRejection(400, '')).toBe(false)
    expect(isMaxTokensRejection(400, '   \n ')).toBe(false)
  })

  it('没有越界措辞的 400 不降级', () => {
    expect(isMaxTokensRejection(400, 'bad request: messages must not be empty')).toBe(false)
  })
})

/* ── explain() 集成 ───────────────────────────────── */

function reply(content: string, finishReason = 'stop'): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function reject(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

const BASE_ARGS = {
  cfg: CFG,
  entry: 'full' as const,
  scope: 'full-gate',
  ref: '41',
  offline: '闸门 41：收缩',
  detailMode: 'full' as const,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function bodyOf(callIndex: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex][1] as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

describe('explain()：越界时按阶梯降级', () => {
  it('128000 被 400 拒绝 → 64000 成功，正文照常返回', async () => {
    fetchMock
      .mockResolvedValueOnce(reject(400, 'max_tokens is too large for this model'))
      .mockResolvedValueOnce(reply('正文'))

    const out = await explain(BASE_ARGS)
    expect(out).toBe('正文')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(0).max_tokens).toBe(128000)
    expect(bodyOf(1).max_tokens).toBe(64000)
  })

  it('422 + 上下文长度措辞同样触发降级', async () => {
    fetchMock
      .mockResolvedValueOnce(reject(422, '上下文长度超出上限'))
      .mockResolvedValueOnce(reply('正文'))

    await expect(explain(BASE_ARGS)).resolves.toBe('正文')
    expect(bodyOf(1).max_tokens).toBe(64000)
  })

  it('阶梯到底后不再重试，且最后一档请求体不带 max_tokens', async () => {
    for (let i = 0; i < MAX_TOKENS_LADDER.length; i += 1) {
      fetchMock.mockResolvedValueOnce(reject(400, 'max_tokens is too large'))
    }
    await expect(explain(BASE_ARGS)).rejects.toMatchObject({ kind: 'http' })
    expect(fetchMock).toHaveBeenCalledTimes(MAX_TOKENS_LADDER.length)
    const last = bodyOf(MAX_TOKENS_LADDER.length - 1)
    expect('max_tokens' in last).toBe(false)
    // 中间档依次为 64000 / 32000 / 16000 / 8192
    expect(bodyOf(1).max_tokens).toBe(64000)
    expect(bodyOf(2).max_tokens).toBe(32000)
    expect(bodyOf(3).max_tokens).toBe(16000)
    expect(bodyOf(4).max_tokens).toBe(8192)
  })

  it('401 / invalid_api_key 不降级（立即失败，不等 6 轮）', async () => {
    fetchMock.mockResolvedValueOnce(reject(401, 'unauthorized'))
    await expect(explain(BASE_ARGS)).rejects.toMatchObject({ kind: 'http' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockClear()
    fetchMock.mockResolvedValueOnce(reject(400, 'invalid_api_key: max_tokens too large'))
    await expect(explain(BASE_ARGS)).rejects.toMatchObject({ kind: 'http' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('成功那一档仍会执行续写（降级不影响 finish_reason=length 的拼接）', async () => {
    fetchMock
      .mockResolvedValueOnce(reject(400, 'max_tokens too large'))
      .mockResolvedValueOnce(reply('第一段', 'length'))
      .mockResolvedValueOnce(reply('第二段', 'stop'))

    const out = await explain(BASE_ARGS)
    expect(out).toBe('第一段\n\n第二段')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('explain()：降级状态不跨请求共享', () => {
  it('并发两条请求，降级只作用于被拒的那一条', async () => {
    // 只有 offline 含「需要降级」的那条在 128000 时被拒
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as {
        max_tokens?: number
        messages: Array<{ role: string; content: string }>
      }
      const userContent = body.messages[1]?.content ?? ''
      if (userContent.includes('需要降级') && body.max_tokens === 128000) {
        return reject(400, 'max_tokens is too large')
      }
      return reply('ok')
    })

    const [a, b] = await Promise.all([
      explain({ ...BASE_ARGS, offline: '闸门 41：需要降级' }),
      explain({ ...BASE_ARGS, offline: '闸门 41：正常' }),
    ])
    expect(a).toBe('ok')
    expect(b).toBe('ok')

    const bodies = fetchMock.mock.calls.map((_c, i) => bodyOf(i))
    const at128000 = bodies.filter((x) => x.max_tokens === 128000)
    const at64000 = bodies.filter((x) => x.max_tokens === 64000)
    // 正常那条从头到尾都发 128000，没被另一条的降级压下去
    expect(at128000).toHaveLength(2)
    expect(at64000).toHaveLength(1)
    const degraded = at64000[0].messages as Array<{ role: string; content: string }>
    expect(degraded[1].content).toContain('需要降级')
  })

  it('上一次调用降级到底后，下一次仍从 128000 开始', async () => {
    for (let i = 0; i < MAX_TOKENS_LADDER.length; i += 1) {
      fetchMock.mockResolvedValueOnce(reject(400, 'max_tokens too large'))
    }
    await expect(explain(BASE_ARGS)).rejects.toMatchObject({ kind: 'http' })

    fetchMock.mockClear()
    fetchMock.mockResolvedValueOnce(reply('第二次'))
    await expect(explain(BASE_ARGS)).resolves.toBe('第二次')
    expect(bodyOf(0).max_tokens).toBe(128000)
  })
})
