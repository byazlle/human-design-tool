/**
 * v2.5.0 三项功能回归：
 * ① 单份解读 token 总预算（含续写）与触顶标记；
 * ② 面向人群（专业版 / 简明版）提示词与缓存键隔离；
 * ③ 通用中转站兼容：统一传输层 + 自动获取模型列表。
 *
 * 不发真实请求：fetch / localStorage 全部 stub。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_CONTINUATIONS,
  MIN_TOKEN_BUDGET,
  PROMPT_SYSTEM_CONCISE,
  PROMPT_SYSTEM_FUSION,
  applyTokenBudget,
  audiencePromptOf,
  cacheKey,
  explain,
  fetchAiModels,
  parseAiModels,
  probeAiConfig,
  resolveAudience,
  resolveModelsEndpoint,
  resolveRequestParams,
  systemPromptOf,
  type AiExplainArgs,
  type AiStageEvent,
} from '../src/services/aiClient'
import { MAX_TOKEN_BUDGET, normalizeTokenBudget } from '../src/stores/settings'
import { makeReading, readingKey } from '../src/stores/readings'
import type { AiConfig } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://relay.example.test/v1',
  apiKey: 'sk-test-12345678',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const fetchMock = vi.hoisted(() => vi.fn())
let storage: Map<string, string>

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() {
      return storage.size
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('① 单份 token 总预算', () => {
  it('0 / 不传 / 非法 = 不限制，仍按档位默认额度', () => {
    expect(applyTokenBudget(1500)).toBe(1500)
    expect(applyTokenBudget(1500, 0)).toBe(1500)
    expect(applyTokenBudget(1500, -10)).toBe(1500)
    expect(applyTokenBudget(1500, Number.NaN)).toBe(1500)
    expect(resolveRequestParams('unified', 'concise').maxTokens).toBe(1500)
  })

  it('预算按「一轮 + 最多两次续写」折成单轮额度，总消耗不超预算', () => {
    const rounds = MAX_CONTINUATIONS + 1
    expect(applyTokenBudget(6000, 3000)).toBe(1000)
    expect(resolveRequestParams('unified', 'concise', 900).maxTokens).toBe(300)
    const perRound = resolveRequestParams('full-fusion', 'full', 6000).maxTokens
    expect(perRound).toBe(Math.floor(6000 / rounds))
    expect(perRound * rounds).toBeLessThanOrEqual(6000)
  })

  it('过小预算夹到下限、过大预算不放大档位额度', () => {
    expect(applyTokenBudget(6000, 10)).toBe(MIN_TOKEN_BUDGET)
    expect(applyTokenBudget(1500, 999999)).toBe(1500)
    expect(normalizeTokenBudget(10)).toBe(MIN_TOKEN_BUDGET)
    expect(normalizeTokenBudget(0)).toBe(0)
    expect(normalizeTokenBudget(99999999)).toBe(MAX_TOKEN_BUDGET)
    expect(normalizeTokenBudget('abc')).toBe(0)
  })

  it('预算不进缓存键：调小预算试一次不会导致重复计费', () => {
    const base: AiExplainArgs = { cfg: CFG, scope: 'unified', offline: '事实', detailMode: 'concise' }
    expect(cacheKey(CFG, { ...base, tokenBudget: 900 })).toBe(cacheKey(CFG, base))
  })

  it('预算与受众进入实际请求；触顶时 completed.truncated=true 且不写缓存', async () => {
    for (let i = 0; i <= MAX_CONTINUATIONS; i += 1) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: `段${i + 1}` }, finish_reason: 'length' }] }),
      )
    }
    const stages: AiStageEvent[] = []
    const out = await explain({
      cfg: { ...CFG, cacheEnabled: true },
      scope: 'unified',
      offline: '事实',
      detailMode: 'concise',
      audience: 'plain',
      tokenBudget: 900,
      onStage: (e) => stages.push(e),
    })
    const bodies = fetchMock.mock.calls.map((c) =>
      JSON.parse(String((c[1] as { body?: string }).body)) as {
        max_tokens: number
        messages: Array<{ role: string; content: string }>
      },
    )
    expect(bodies).toHaveLength(MAX_CONTINUATIONS + 1)
    expect(bodies.every((b) => b.max_tokens === 300)).toBe(true)
    expect(bodies[0].messages[0].content).toContain('零基础')
    expect(out).toContain('段3')
    expect(stages.find((e) => e.stage === 'completed')?.truncated).toBe(true)
    expect(storage.size).toBe(0)
  })

  it('未触顶时正常写缓存且 truncated=false', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '完整正文' }, finish_reason: 'stop' }] }),
    )
    const stages: AiStageEvent[] = []
    await explain({
      cfg: { ...CFG, cacheEnabled: true },
      scope: 'unified',
      offline: '事实',
      audience: 'pro',
      onStage: (e) => stages.push(e),
    })
    expect(stages.find((e) => e.stage === 'completed')?.truncated).toBe(false)
    expect(storage.size).toBe(1)
  })
})

describe('② 面向人群（专业版 / 简明版）', () => {
  it('缺省按专业版；不传第三参时四套正文逐字不变', () => {
    expect(resolveAudience()).toBe('pro')
    expect(resolveAudience('plain')).toBe('plain')
    expect(audiencePromptOf()).toBe('')
    expect(systemPromptOf('concise')).toBe(PROMPT_SYSTEM_CONCISE)
    expect(systemPromptOf('full', 'full-fusion')).toBe(PROMPT_SYSTEM_FUSION)
  })

  it('两版段落要求明确且互不相同：一个允许术语、一个必须大白话', () => {
    const pro = audiencePromptOf('pro')
    const plain = audiencePromptOf('plain')
    expect(pro).toContain('可以直接使用专业词')
    expect(plain).toContain('大白话')
    expect(plain).toContain('不许用另一个术语当垫背')
    expect(pro).not.toBe(plain)
    expect(systemPromptOf('concise', undefined, 'plain')).toBe(PROMPT_SYSTEM_CONCISE + plain)
    expect(systemPromptOf('full', 'full-fusion', 'pro')).toContain('读者背景：有基础')
  })

  it('pro / plain 缓存键隔离，缺省与 pro 同键', () => {
    const base: AiExplainArgs = { cfg: CFG, scope: 'unified', offline: '事实', detailMode: 'concise' }
    const def = cacheKey(CFG, base)
    expect(cacheKey(CFG, { ...base, audience: 'pro' })).toBe(def)
    expect(cacheKey(CFG, { ...base, audience: 'plain' })).not.toBe(def)
  })

  it('专业版与简明版解读记录并存、互不覆盖', () => {
    const base = { archiveId: 'a1', scope: 'unified', ref: 'r', mode: 'detailed' as const }
    expect(readingKey(base.archiveId, base.scope, base.ref, base.mode)).toBe('a1|unified|r|detailed')
    const pro = makeReading({ ...base, title: '专业版', content: 'A' })
    const plain = makeReading({ ...base, title: '简明版', content: 'B', audience: 'plain' })
    expect(readingKey(base.archiveId, base.scope, base.ref, base.mode, plain.audience)).not.toBe(
      readingKey(base.archiveId, base.scope, base.ref, base.mode, pro.audience),
    )
  })
})

describe('③ 中转站兼容与自动获取模型列表', () => {
  it('模型地址兼容基础地址 / /v1 / 完整 chat 路径 / 直接 /models', () => {
    expect(resolveModelsEndpoint('https://x.test')).toBe('https://x.test/v1/models')
    expect(resolveModelsEndpoint('https://x.test/v1/')).toBe('https://x.test/v1/models')
    expect(resolveModelsEndpoint('https://x.test/v1/chat/completions')).toBe('https://x.test/v1/models')
    expect(resolveModelsEndpoint('https://x.test/v1/models')).toBe('https://x.test/v1/models')
  })

  it('解析标准 OpenAI 格式、字符串数组、models 字段，并去重排序', () => {
    expect(parseAiModels('{"data":[{"id":"b"},{"id":"a"},{"id":"b"}]}')).toEqual(['a', 'b'])
    expect(parseAiModels('{"data":["b","a"]}')).toEqual(['a', 'b'])
    expect(parseAiModels('{"models":[{"id":"m1"}]}')).toEqual(['m1'])
    expect(parseAiModels('["m2","m1"]')).toEqual(['m1', 'm2'])
    expect(parseAiModels('<html>404</html>')).toEqual([])
    expect(parseAiModels('{}')).toEqual([])
  })

  it('拉回模型列表时带 Bearer Key，地址取 /v1/models', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: 'gpt-x' }, { id: 'DeepSeek-V4' }], object: 'list' }),
    )
    const result = await fetchAiModels({ baseUrl: 'https://x.test/v1', apiKey: 'sk-abc', timeoutMs: 15000 })
    expect(result.ok).toBe(true)
    expect(result.models).toEqual(['DeepSeek-V4', 'gpt-x'])
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string> }]
    expect(url).toBe('https://x.test/v1/models')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer sk-abc')
  })

  it('Key 过期（401）给出明确原因，且不再换路径重试', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad key' }, 401))
    const result = await fetchAiModels({ baseUrl: 'https://x.test/custom/v1', apiKey: 'sk-old', timeoutMs: 15000 })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('API Key 无效或已过期')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('主路径 404 时自动改试源站 /v1/models', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'm1' }] }))
    const result = await fetchAiModels({
      baseUrl: 'https://x.test/custom/v1',
      apiKey: 'sk-abc',
      timeoutMs: 15000,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://x.test/v1/models')
    expect(result.models).toEqual(['m1'])
  })

  it('未填地址 / Key 时先拦截，不发请求', async () => {
    expect((await fetchAiModels({ baseUrl: '', apiKey: '', timeoutMs: 15000 })).ok).toBe(false)
    expect((await fetchAiModels({ baseUrl: 'https://x.test/v1', apiKey: '', timeoutMs: 15000 })).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('连通性测试也走统一传输层，401 明确提示 Key 过期', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'expired' }, 401))
    const result = await probeAiConfig(CFG)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('API Key 无效或已过期')
    expect(fetchMock.mock.calls[0][0]).toBe('https://relay.example.test/v1/chat/completions')
  })
})
