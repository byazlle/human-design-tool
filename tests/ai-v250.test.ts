/**
 * v2.5.0 功能回归（v4.0.0 口径重写）：
 * ① ~~单份解读 token 总预算~~ → **token 上限已整体移除**：请求恒 `max_tokens: 128000`，
 *    越界由 `explain()` 内部阶梯降级（`aiTokenFallback`），触顶标记与续写保留；
 * ② 面向人群 → 表达风格（`audience` 改名 `style`，值不变、语义反转）；
 * ③ 通用中转站兼容：统一传输层 + 自动获取模型列表（逐字保留）。
 *
 * ★ 「必须保留」的 v2.5.0 契约（ARCH §11.2）：续写轮数、触顶 `truncated=true`、
 *   触顶不写缓存、未触顶写缓存 —— 一条不少，只是额度断言从「按档位分配」改为「恒 128000」。
 *
 * 不发真实请求：fetch / localStorage 全部 stub。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import * as aiClientModule from '../src/services/aiClient'
import {
  MAX_CONTINUATIONS,
  PROMPT_VERSION,
  cacheKey,
  explain,
  fetchAiModels,
  parseAiModels,
  probeAiConfig,
  resolveModelsEndpoint,
  resolveRequestParams,
  resolveStyle,
  systemPromptOf,
  type AiExplainArgs,
  type AiStageEvent,
} from '../src/services/aiClient'
import * as settingsModule from '../src/stores/settings'
import { makeReading, readingKey } from '../src/stores/readings'
import { MAX_TOKENS_CEILING } from '../src/services/aiTokenFallback'
import { PROMPT_DETAIL_CONCISE, PROMPT_DETAIL_FULL } from '../src/services/aiPrompt'
import type { AiConfig, AiDetailMode } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://relay.example.test/v1',
  apiKey: 'sk-test-12345678',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const LEGACY_BUDGETS = [1500, 6000, 8000, 4000, 4500]

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
  setActivePinia(createPinia())
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

describe('① token 上限已整体移除（替代旧的「单份 token 总预算」）', () => {
  it('任何 scope × 档位都恒为 128000，不再按档位分配额度', () => {
    const scopes = [
      'unified',
      'selection-one',
      'full-module',
      'full-all-channels',
      'full-all-gates',
      'full-trajectory',
      'full-dimension',
      'full-gate',
      'full-channel',
      'full-fusion',
      'selection-fusion',
      'panorama-one',
      'single',
      'gate',
      'channel',
      'center',
      'chiron',
      'composite-merge',
    ]
    const modes: AiDetailMode[] = ['concise', 'detailed', 'full']
    for (const scope of scopes) {
      for (const mode of modes) {
        const params = resolveRequestParams(scope, mode)
        expect(params.maxTokens).toBe(MAX_TOKENS_CEILING)
        expect(params.maxTokens).toBe(128000)
      }
    }
  })

  it('不传档位时同样恒 128000（旧的 1500 / 6000 / 8000 / 4000 / 4500 分配已删除）', () => {
    expect(resolveRequestParams('unified').maxTokens).toBe(128000)
    expect(resolveRequestParams('full-fusion').maxTokens).toBe(128000)
    // 旧口径的 5 个额度数字一个都不许再出现
    for (const scope of ['unified', 'full-module', 'full-fusion', 'chiron', 'single']) {
      for (const mode of ['concise', 'detailed', 'full'] as AiDetailMode[]) {
        expect(LEGACY_BUDGETS).not.toContain(resolveRequestParams(scope, mode).maxTokens)
      }
    }
  })

  it('temperature 保持 v3.5.0 口径：融合 0.60 / full-* 0.65 / 凯龙 0.55', () => {
    expect(resolveRequestParams('full-fusion', 'full').temperature).toBe(0.6)
    expect(resolveRequestParams('full-module', 'full').temperature).toBe(0.65)
    expect(resolveRequestParams('chiron', 'concise').temperature).toBe(0.55)
    expect(resolveRequestParams('unified', 'concise').temperature).toBe(0.6)
    expect(resolveRequestParams('unified', 'detailed').temperature).toBe(0.65)
  })

  it('预算相关 API 已删除：applyTokenBudget / MIN_TOKEN_BUDGET / normalizeTokenBudget / MAX_TOKEN_BUDGET 不再导出', () => {
    expect(aiClientModule).not.toHaveProperty('applyTokenBudget')
    expect(aiClientModule).not.toHaveProperty('MIN_TOKEN_BUDGET')
    expect(aiClientModule).not.toHaveProperty('MAX_TOKEN_BUDGET')
    expect(settingsModule).not.toHaveProperty('normalizeTokenBudget')
    expect(settingsModule).not.toHaveProperty('MAX_TOKEN_BUDGET')
    // 设置项里的 token 预算字段也一并从 state 删除
    expect(settingsModule.useSettingsStore().$state).not.toHaveProperty('aiTokenBudget')
  })

  it('token 额度不进缓存键：键里不再出现额度数字，旧「调小预算试一次」不再是变量', () => {
    const base: AiExplainArgs = {
      cfg: CFG,
      entry: 'composite',
      scope: 'unified',
      offline: '事实',
      detailMode: 'concise',
    }
    const key = cacheKey(CFG, base)
    expect(key).not.toContain('128000')
    expect(key).not.toContain('token')
    // 同一 args 反复求键恒等（没有任何隐式额度参与）
    expect(cacheKey(CFG, { ...base })).toBe(key)
  })

  it('128000 与风格进入实际请求；触顶时 completed.truncated=true 且不写缓存', async () => {
    for (let i = 0; i <= MAX_CONTINUATIONS; i += 1) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: `段${i + 1}` }, finish_reason: 'length' }] }),
      )
    }
    const stages: AiStageEvent[] = []
    const out = await explain({
      cfg: { ...CFG, cacheEnabled: true },
      entry: 'composite',
      scope: 'unified',
      offline: '事实',
      detailMode: 'concise',
      style: 'plain',
      onStage: (e) => stages.push(e),
    })
    const bodies = fetchMock.mock.calls.map((c) =>
      JSON.parse(String((c[1] as { body?: string }).body)) as {
        max_tokens: number
        messages: Array<{ role: string; content: string }>
      },
    )
    // 续写轮数不变：一轮 + MAX_CONTINUATIONS 次续写，每轮额度都是 128000
    expect(bodies).toHaveLength(MAX_CONTINUATIONS + 1)
    expect(bodies.every((b) => b.max_tokens === 128000)).toBe(true)
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
      entry: 'composite',
      scope: 'unified',
      offline: '事实',
      style: 'pro',
      onStage: (e) => stages.push(e),
    })
    expect(stages.find((e) => e.stage === 'completed')?.truncated).toBe(false)
    expect(storage.size).toBe(1)
  })
})

describe('② 表达风格（专业版 / 零基础版；audience → style）', () => {
  it('缺省按专业版；systemPromptOf 改为对象入参、按五段拼装（不再返回单一整篇常量）', () => {
    expect(resolveStyle()).toBe('pro')
    expect(resolveStyle('plain')).toBe('plain')

    // 原断言 `systemPromptOf('concise') === PROMPT_SYSTEM_CONCISE`（四套整篇已删除）
    // → 新断言：档位段与风格段逐字出现在拼装结果里，且以基础契约段开头
    const concisePro = systemPromptOf({ entry: 'composite', detail: 'concise', style: 'pro' })
    expect(concisePro).toContain(PROMPT_DETAIL_CONCISE)
    expect(concisePro).toContain('【表达风格：专业术语体系】')
    expect(concisePro.startsWith('【基础契约')).toBe(true)

    // 原断言 `systemPromptOf('full', 'full-fusion') === PROMPT_SYSTEM_FUSION`
    // → 新断言：完整档位段 + 融合范围段同时出现，且与精简篇不同
    const fullFusion = systemPromptOf({
      entry: 'full',
      detail: 'full',
      style: 'pro',
      scope: 'full-fusion',
    })
    expect(fullFusion).toContain(PROMPT_DETAIL_FULL)
    expect(fullFusion).toContain('【融合范围契约】')
    expect(fullFusion).not.toBe(concisePro)
  })

  it('两版风格段要求明确且互不相同：专业版必须阐释术语、零基础版必须大白话', () => {
    // ★ v4.0.0 与 v3.5.0 相反：旧 pro「读者已熟悉术语，不必解释」→ 新 pro「必须阐释」
    const pro = systemPromptOf({ entry: 'composite', detail: 'concise', style: 'pro' })
    const plain = systemPromptOf({ entry: 'composite', detail: 'concise', style: 'plain' })
    expect(pro).toContain('第一次出现时必须阐释')
    expect(pro).not.toContain('读者已熟悉人类图术语')
    expect(plain).toContain('零基础大白话')
    expect(plain).toContain('大白话')
    expect(plain).not.toContain('读者已熟悉人类图术语')
    expect(pro).not.toBe(plain)

    // 旧四套正文 / 受众附加段常量不再导出
    for (const gone of [
      'PROMPT_SYSTEM_CONCISE',
      'PROMPT_SYSTEM_DETAILED',
      'PROMPT_SYSTEM_FULL',
      'PROMPT_SYSTEM_FUSION',
      'PROMPT_SYSTEM_AUDIENCE_PRO',
      'PROMPT_SYSTEM_AUDIENCE_PLAIN',
      'audiencePromptOf',
      'resolveAudience',
    ]) {
      expect(aiClientModule).not.toHaveProperty(gone)
    }
  })

  it('pro / plain 缓存键隔离、缺省与 pro 同键；entry 也入键（A/B/C 互不串档）', () => {
    const base: AiExplainArgs = {
      cfg: CFG,
      entry: 'composite',
      scope: 'unified',
      offline: '事实',
      detailMode: 'concise',
    }
    const def = cacheKey(CFG, base)
    expect(cacheKey(CFG, { ...base, style: 'pro' })).toBe(def)
    expect(cacheKey(CFG, { ...base, style: 'plain' })).not.toBe(def)
    // 新增契约（ARCH §6.1）：入口必须入键，否则 B/C 同 scope 同 ref 会串档
    expect(cacheKey(CFG, { ...base, entry: 'full' })).not.toBe(def)
    expect(cacheKey(CFG, { ...base, entry: 'selection' })).not.toBe(def)
    expect(cacheKey(CFG, { ...base, entry: 'full' })).not.toBe(
      cacheKey(CFG, { ...base, entry: 'selection' }),
    )
    expect(def.startsWith('hdt.ai.cache.v2:p')).toBe(true)
    expect(def).toContain(`p${PROMPT_VERSION}`)
  })

  it('专业版与零基础版解读记录并存、互不覆盖', () => {
    const base = { archiveId: 'a1', scope: 'unified', ref: 'r', mode: 'detailed' as const }
    expect(readingKey(base.archiveId, base.scope, base.ref, base.mode)).toBe('a1|unified|r|detailed')
    const pro = makeReading({ ...base, title: '专业版', content: 'A' })
    const plain = makeReading({ ...base, title: '零基础版', content: 'B', style: 'plain' })
    expect(readingKey(base.archiveId, base.scope, base.ref, base.mode, plain.style)).not.toBe(
      readingKey(base.archiveId, base.scope, base.ref, base.mode, pro.style),
    )
    // 记录 meta 新字段：style 生效，entry 缺省归综合解读
    expect(pro.style).toBe('pro')
    expect(plain.style).toBe('plain')
    expect(pro.entry).toBe('composite')
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
