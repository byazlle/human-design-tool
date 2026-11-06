/**
 * AI 提示词契约回归（规范 `docs/spec/AI-PROMPT-v2.0.md` §4）。
 *
 * 只校验工程可测的部分：缓存键隔离、四段拼接顺序、防幻觉差集、采样参数选择。
 * 不校验提示词文案好坏（那是人工核对清单的事）。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AiConfig } from '../src/types/hd'
import {
  PROMPT_SYSTEM_CONCISE,
  PROMPT_SYSTEM_DETAILED,
  PROMPT_VERSION,
  buildUserPrompt,
  cacheKey,
  resolveDetailMode,
  resolveRequestParams,
  systemPromptOf,
  validateAiReplyFacts,
} from '../src/services/aiClient'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'sk-test-1234567890',
  model: 'gpt-test',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const ARGS = {
  cfg: CFG,
  scope: 'single',
  // 释义正文（标签由 buildUserPrompt 自己加，这里不要重复带标签）
  offline: '闸门 41：收缩',
  // 事实块正文（标签由 buildUserPrompt 自己加，这里不要重复带标签）
  chartSummary: '类型：生产者（Generator）｜策略：等待回应\n已激活通道（1）：20-34',
}

describe('缓存键：详细度与提示词版本必须隔离', () => {
  it('concise 与 detailed 的缓存键不同（否则切模式会命中旧缓存）', () => {
    const concise = cacheKey(CFG, { ...ARGS, detailMode: 'concise' })
    const detailed = cacheKey(CFG, { ...ARGS, detailMode: 'detailed' })
    expect(concise).not.toBe(detailed)
    expect(concise).toContain(':concise:')
    expect(detailed).toContain(':detailed:')
  })

  it('缓存键携带提示词版本（提示词一改即失效）', () => {
    const key = cacheKey(CFG, { ...ARGS, detailMode: 'concise' })
    expect(key).toContain(`p${PROMPT_VERSION}`)
    // 版本段紧跟在缓存前缀之后，改动版本必然改变整串
    expect(key.split(':')[1]).toBe(`p${PROMPT_VERSION}`)
  })

  it('单点 scope 即使选了 detailed，键也回到 concise（不产生假详细的缓存）', () => {
    const asIs = cacheKey(CFG, { ...ARGS, scope: 'gate', ref: '41', detailMode: 'detailed' })
    const forced = cacheKey(CFG, { ...ARGS, scope: 'gate', ref: '41', detailMode: 'concise' })
    expect(asIs).toBe(forced)
  })

  it('换盘面事实 / 换 ref 都会换键', () => {
    const base = cacheKey(CFG, { ...ARGS, detailMode: 'concise' })
    expect(cacheKey(CFG, { ...ARGS, detailMode: 'concise', ref: 'g41' })).not.toBe(base)
    expect(
      cacheKey(CFG, { ...ARGS, detailMode: 'concise', chartSummary: '类型：投射者' }),
    ).not.toBe(base)
  })
})

describe('user 提示词：四段固定顺序', () => {
  it('【盘面事实】→【用户选择】→【离线释义】→【本次任务】', () => {
    const prompt = buildUserPrompt({
      ...ARGS,
      detailMode: 'detailed',
      angle: '成长方向',
    })
    const iFacts = prompt.indexOf('【盘面事实】')
    const iChoice = prompt.indexOf('【用户选择】')
    const iOffline = prompt.indexOf('【离线释义】')
    const iTask = prompt.indexOf('【本次任务】')

    expect(iFacts).toBeGreaterThanOrEqual(0)
    expect(iChoice).toBeGreaterThan(iFacts)
    expect(iOffline).toBeGreaterThan(iChoice)
    expect(iTask).toBeGreaterThan(iOffline)
    // 四段都只出现一次
    for (const tag of ['【盘面事实】', '【用户选择】', '【离线释义】', '【本次任务】']) {
      expect(prompt.split(tag)).toHaveLength(2)
    }
  })

  it('详细度与角度写进【用户选择】', () => {
    const detailed = buildUserPrompt({ ...ARGS, detailMode: 'detailed', angle: '成长方向' })
    expect(detailed).toContain('详细度：详细')
    expect(detailed).toContain('角度：成长方向')

    const concise = buildUserPrompt({ ...ARGS, detailMode: 'concise' })
    expect(concise).toContain('详细度：精简')
    expect(concise).toContain('角度：综合解读')
  })

  it('单点 scope 的【用户选择】写的是「精简」（口径与 system 一致）', () => {
    const prompt = buildUserPrompt({ ...ARGS, scope: 'channel', ref: '1-8', detailMode: 'detailed' })
    expect(prompt).toContain('详细度：精简')
  })

  it('没有盘面事实时不出现空的【盘面事实】块', () => {
    const prompt = buildUserPrompt({ cfg: CFG, scope: 'single', offline: 'x' })
    expect(prompt).not.toContain('【盘面事实】')
    expect(prompt).toContain('【本次任务】')
  })
})

describe('防幻觉校验：编号差集', () => {
  it('回复里的事实块外闸门被挑出来', () => {
    expect(validateAiReplyFacts('你的闸门 99 很有意思', '闸门 1、2')).toEqual(['99'])
  })

  it('事实块内出现的编号不报', () => {
    expect(validateAiReplyFacts('闸门 1 和闸门 2 都在', '闸门 1、2')).toEqual([])
  })

  it('通道 key 同样校验，且不重复报同一项', () => {
    const facts = '已激活通道：20-34、34-57'
    expect(validateAiReplyFacts('20-34 与 34-57 结合，另外还有 55-99', facts)).toEqual(['55-99'])
    expect(validateAiReplyFacts('55-99 和 55-99', facts)).toEqual(['55-99'])
  })

  it('带空格的通道写法也能规范化后比对', () => {
    expect(validateAiReplyFacts('通道 20 - 34', '已激活通道：20-34')).toEqual([])
  })
})

describe('采样参数：按 mode / scope 取值', () => {
  it('concise 的 max_tokens 小于 detailed', () => {
    const concise = resolveRequestParams('single', 'concise')
    const detailed = resolveRequestParams('single', 'detailed')
    expect(concise.maxTokens).toBe(1500)
    expect(detailed.maxTokens).toBe(6000)
    expect(concise.maxTokens).toBeLessThan(detailed.maxTokens)
    expect(concise.temperature).toBeCloseTo(0.6)
    expect(detailed.temperature).toBeCloseTo(0.65)
  })

  it('单点 scope 强制 concise + 0.50/900', () => {
    for (const scope of ['gate', 'channel', 'center']) {
      const p = resolveRequestParams(scope, 'detailed')
      expect(p.mode).toBe('concise')
      expect(p.temperature).toBeCloseTo(0.5)
      expect(p.maxTokens).toBe(900)
    }
    expect(resolveDetailMode('gate', 'detailed')).toBe('concise')
    expect(resolveDetailMode('single', 'detailed')).toBe('detailed')
  })

  it('合盘按 0.60/4500，凯龙按 0.55/1500', () => {
    const comp = resolveRequestParams('composite-love', 'detailed')
    expect(comp.temperature).toBeCloseTo(0.6)
    expect(comp.maxTokens).toBe(4500)
    const chiron = resolveRequestParams('chiron', 'detailed')
    expect(chiron.temperature).toBeCloseTo(0.55)
    expect(chiron.maxTokens).toBe(1500)
  })

  it('system 提示词与 mode 一对一绑定', () => {
    expect(systemPromptOf('concise')).toBe(PROMPT_SYSTEM_CONCISE)
    expect(systemPromptOf('detailed')).toBe(PROMPT_SYSTEM_DETAILED)
    expect(PROMPT_SYSTEM_CONCISE).not.toBe(PROMPT_SYSTEM_DETAILED)
  })
})

describe('两版提示词的关键契约（字数 / 结构）', () => {
  it('精简版声明 5 个视角与 600–900 字', () => {
    expect(PROMPT_SYSTEM_CONCISE).toContain('必须覆盖的 5 个视角')
    expect(PROMPT_SYSTEM_CONCISE).toContain('600–900 字')
  })

  it('详细版声明 8 节与 1800–3000 字、合盘禁止个体结论', () => {
    expect(PROMPT_SYSTEM_DETAILED).toContain('共 8 节')
    expect(PROMPT_SYSTEM_DETAILED).toContain('1800–3000 字')
    expect(PROMPT_SYSTEM_DETAILED).toContain('合盘 scope 下禁止输出合图类型')
  })

  it('两版都不得允许编造事实块以外的结构', () => {
    for (const prompt of [PROMPT_SYSTEM_CONCISE, PROMPT_SYSTEM_DETAILED]) {
      expect(prompt).toContain('禁止编造事实块以外的结构')
    }
  })

  it('两版全文与规范文档的代码块逐字一致（改提示词必须同时改文档）', () => {
    const md = readFileSync('docs/spec/AI-PROMPT-v2.0.md', 'utf8')
    const codeBlocks: string[] = []
    const re = /```text\n([\s\S]*?)```/g
    let m: RegExpExecArray | null
    while ((m = re.exec(md))) codeBlocks.push(m[1].replace(/\s+$/, ''))
    // 文档里依次是：1.3 事实块模板、2.1 精简全文、3.1 详细全文、4.6 验收夹具
    expect(codeBlocks).toHaveLength(4)
    expect(PROMPT_SYSTEM_CONCISE).toBe(codeBlocks[1])
    expect(PROMPT_SYSTEM_DETAILED).toBe(codeBlocks[2])
  })
})
