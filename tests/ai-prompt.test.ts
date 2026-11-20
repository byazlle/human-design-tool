/**
 * AI 提示词与请求层契约回归（v4.0.0）。
 *
 * 覆盖 ARCH v4.0.0 §11.1 ①–⑦：
 * ① 12 个段落常量与 `docs/spec/AI-PROMPT-v4.0.md` 的编号代码块逐字一致；
 * ② `PROMPT_VERSION === '4.2'`（v4.2 按可懂性基线修订风格段示例）；
 * ③ `systemPromptOf` 已改为对象入参；
 * ④ 采样参数全部 `128000`；
 * ⑤ 合盘 / 凯龙 temperature 保持既有口径（0.60 / 0.55）；
 * ⑥ 旧 pro 文案「读者已熟悉人类图术语」不得出现；
 * ⑦ 缓存键含 `entry` / `style` 段，前缀为 `hdt.ai.cache.v2`。
 *
 * 另外保留 v2.x 的防幻觉差集四用例与 user 四段顺序断言（§11.2「必须保留」）。
 */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConfig } from '../src/types/hd'
import {
  CACHE_PREFIX,
  PROMPT_VERSION,
  buildUserPrompt,
  cacheKey,
  clearAiCache,
  migrateAiCacheV1,
  resolveDetailMode,
  resolveRequestParams,
  systemPromptOf,
  validateAiConfig,
  validateAiReplyFacts,
} from '../src/services/aiClient'
import {
  PROMPT_CORE,
  PROMPT_DETAIL_CONCISE,
  PROMPT_DETAIL_DETAILED,
  PROMPT_DETAIL_FULL,
  PROMPT_ENTRY_COMPOSITE,
  PROMPT_ENTRY_FULL,
  PROMPT_ENTRY_SELECTION,
  PROMPT_SCOPE_FUSION,
  PROMPT_SCOPE_ITEM,
  PROMPT_SCOPE_OVERVIEW,
  PROMPT_STYLE_PLAIN,
  PROMPT_STYLE_PRO,
  dimsLabelText,
  resolveStyle,
} from '../src/services/aiPrompt'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'sk-test-1234567890',
  model: 'gpt-test',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const ARGS = {
  cfg: CFG,
  entry: 'composite' as const,
  scope: 'single',
  // 释义正文（标签由 buildUserPrompt 自己加，这里不要重复带标签）
  offline: '闸门 41：收缩',
  // 事实块正文（标签由 buildUserPrompt 自己加，这里不要重复带标签）
  chartSummary: '类型：生产者（Generator）｜策略：等待回应\n已激活通道（1）：20-34',
}

/**
 * 从规范文档里按 `<!-- id: 常量名 -->` 标记取代码块。
 * ★ 不靠数组下标：以后往文档里插入说明性代码块不会把断言打偏。
 */
function docBlocks(): Map<string, string> {
  const md = readFileSync('docs/spec/AI-PROMPT-v4.0.md', 'utf8')
  const out = new Map<string, string>()
  const re = /<!-- id: (\w+) -->\s*```text\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) out.set(m[1], m[2].replace(/\s+$/, ''))
  return out
}

const CONSTANTS: Record<string, string> = {
  PROMPT_CORE,
  PROMPT_ENTRY_FULL,
  PROMPT_ENTRY_COMPOSITE,
  PROMPT_ENTRY_SELECTION,
  PROMPT_DETAIL_CONCISE,
  PROMPT_DETAIL_DETAILED,
  PROMPT_DETAIL_FULL,
  PROMPT_STYLE_PLAIN,
  PROMPT_STYLE_PRO,
  PROMPT_SCOPE_FUSION,
  PROMPT_SCOPE_ITEM,
  PROMPT_SCOPE_OVERVIEW,
}

describe('① 提示词正文与规范文档逐字一致', () => {
  it('12 个段落常量全部能在文档里按编号找到，且逐字相同', () => {
    const blocks = docBlocks()
    expect([...blocks.keys()].sort()).toEqual(Object.keys(CONSTANTS).sort())
    for (const [id, text] of Object.entries(CONSTANTS)) {
      expect(blocks.get(id), `文档缺少 ${id}`).toBe(text.replace(/\s+$/, ''))
    }
  })

  it('文档里每个代码块都有且只有一个 id 标记（防止复制粘贴漏改标记）', () => {
    const md = readFileSync('docs/spec/AI-PROMPT-v4.0.md', 'utf8')
    const ids = [...md.matchAll(/<!-- id: (\w+) -->/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(12)
  })
})

describe('② 提示词版本已升到 4.1', () => {
  it('PROMPT_VERSION 为 4.2（风格段示例按可懂性基线补画面，旧缓存不得串档）', () => {
    expect(PROMPT_VERSION).toBe('4.2')
  })
})

describe('③ systemPromptOf 改为对象入参（五段拼装）', () => {
  it('基础契约恒拼，且排在第一位', () => {
    const concise = systemPromptOf({ entry: 'full', detail: 'concise', style: 'pro' })
    expect(concise.startsWith(PROMPT_CORE)).toBe(true)
    expect(concise).toContain(PROMPT_ENTRY_FULL)
    expect(concise).toContain(PROMPT_DETAIL_CONCISE)
    expect(concise).toContain(PROMPT_STYLE_PRO)
    // 单次整篇 scope 不追加范围段
    expect(concise).not.toContain(PROMPT_SCOPE_ITEM)
    expect(concise).not.toContain(PROMPT_SCOPE_FUSION)
  })

  it('范围段只在融合 / 分项 / 通解三类 scope 追加', () => {
    const base = { entry: 'full', detail: 'full', style: 'pro' } as const
    expect(systemPromptOf({ ...base, scope: 'full-fusion' })).toContain(PROMPT_SCOPE_FUSION)
    expect(systemPromptOf({ ...base, scope: 'selection-fusion' })).toContain(PROMPT_SCOPE_FUSION)
    expect(systemPromptOf({ ...base, scope: 'full-gate' })).toContain(PROMPT_SCOPE_ITEM)
    expect(systemPromptOf({ ...base, scope: 'full-all-channels' })).toContain(PROMPT_SCOPE_OVERVIEW)
    expect(systemPromptOf({ ...base, scope: 'full-all-gates' })).toContain(PROMPT_SCOPE_OVERVIEW)
    // 单次整篇 / 单点 scope 不追加
    for (const scope of ['single', 'gate', 'channel', 'unified', 'selection-one', 'composite-love']) {
      const prompt = systemPromptOf({ entry: 'composite', detail: 'concise', style: 'pro', scope })
      expect(prompt).not.toContain(PROMPT_SCOPE_ITEM)
      expect(prompt).not.toContain(PROMPT_SCOPE_OVERVIEW)
      expect(prompt).not.toContain(PROMPT_SCOPE_FUSION)
    }
  })

  it('入口 B 的 {DIMS} 被替换成维度中文标签串（且与 user 段一致）', () => {
    const dims = ['authority', 'cross', 'channels'] as const
    const prompt = systemPromptOf({
      entry: 'composite',
      detail: 'concise',
      style: 'pro',
      scope: 'unified',
      dims: [...dims],
    })
    const label = dimsLabelText([...dims])
    expect(label).toBe('已激活通道、内在权威、轮回交叉')
    expect(prompt).not.toContain('{DIMS}')
    expect(prompt).toContain(label)
  })
})

describe('④ 采样参数：max_tokens 恒为 128000', () => {
  it('任何 scope / 档位都是 128000', () => {
    const scopes = ['single', 'gate', 'channel', 'center', 'chiron', 'unified', 'full-fusion', 'full-gate', 'composite-love']
    const modes = ['concise', 'detailed', 'full'] as const
    for (const scope of scopes) {
      for (const mode of modes) {
        expect(resolveRequestParams(scope, mode).maxTokens, `${scope}/${mode}`).toBe(128000)
      }
    }
  })

  it('applyTokenBudget / MIN_TOKEN_BUDGET 已不再导出（token 上限整体移除）', async () => {
    const mod = (await import('../src/services/aiClient')) as Record<string, unknown>
    expect(mod.applyTokenBudget).toBeUndefined()
    expect(mod.MIN_TOKEN_BUDGET).toBeUndefined()
  })
})

describe('⑤ temperature 保持既有口径', () => {
  it('合盘 0.60 / 凯龙 0.55 / 融合 0.60 / 其余按档位', () => {
    expect(resolveRequestParams('composite-love', 'detailed').temperature).toBeCloseTo(0.6)
    expect(resolveRequestParams('chiron', 'detailed').temperature).toBeCloseTo(0.55)
    expect(resolveRequestParams('full-fusion', 'full').temperature).toBeCloseTo(0.6)
    expect(resolveRequestParams('full-gate', 'full').temperature).toBeCloseTo(0.65)
    expect(resolveRequestParams('single', 'concise').temperature).toBeCloseTo(0.6)
    expect(resolveRequestParams('single', 'detailed').temperature).toBeCloseTo(0.65)
  })

  it('resolveDetailMode 口径不变：单点 scope 不降级', () => {
    expect(resolveDetailMode('gate', 'detailed')).toBe('detailed')
    expect(resolveDetailMode('single', 'full')).toBe('full')
    expect(resolveDetailMode('single')).toBe('concise')
  })

  it('resolveStyle 缺省 pro，显式 plain 生效', () => {
    expect(resolveStyle()).toBe('pro')
    expect(resolveStyle('plain')).toBe('plain')
    expect(resolveStyle('pro')).toBe('pro')
  })
})

describe('⑥ 旧专业版文案必须消失（风格语义反转）', () => {
  it('「读者已熟悉人类图术语」不得出现在任何提示词里', () => {
    const all = Object.values(CONSTANTS).join('\n')
    expect(all).not.toContain('读者已熟悉人类图术语')
    expect(all).not.toContain('不必逐个展开解释')
  })

  it('新专业版要求「第一次出现时必须阐释」', () => {
    expect(PROMPT_STYLE_PRO).toContain('第一次出现时必须阐释')
    expect(PROMPT_STYLE_PRO).toContain('先给一句定义')
  })

  it('全部提示词不得出现「前世」', () => {
    for (const [id, text] of Object.entries(CONSTANTS)) {
      expect(text, id).not.toContain('前世')
    }
  })

  it('精简档必须声明「不做事实性断言」，详细档必须含依据前置铁律', () => {
    expect(PROMPT_DETAIL_CONCISE).toContain('【精简档：只描述倾向，不做事实性断言】')
    expect(PROMPT_DETAIL_CONCISE).toContain('「你就是」「你必定」「这说明你」「根本原因是」「你的天赋是」')
    expect(PROMPT_DETAIL_DETAILED).toContain('【依据前置铁律（详细版强制，逐条生效）】')
    expect(PROMPT_DETAIL_DETAILED).toContain('三者都取不到的结构，不得作为结论依据，该结论必须删除')
    expect(PROMPT_DETAIL_DETAILED).toContain('禁止用「行业惯例」「一般来说」「大多数人都」代替依据')
    expect(PROMPT_DETAIL_DETAILED).toContain('5000–10000 字')
    expect(PROMPT_DETAIL_DETAILED).toContain('20000')
    expect(PROMPT_DETAIL_FULL).toContain('本档没有字数上限')
  })

  it('基础契约包含事实来源、分工、合盘禁令、Markdown 与边界提示', () => {
    expect(PROMPT_CORE).toContain('【盘面事实】与【离线释义】')
    expect(PROMPT_CORE).toContain('禁止编造事实块以外的结构')
    expect(PROMPT_CORE).toContain('不是把它们换种说法再讲一遍')
    expect(PROMPT_CORE).toContain('不得给出「你们的类型 / 内在权威 / 定义型 / 轮回交叉」')
    expect(PROMPT_CORE).toContain('Markdown')
    expect(PROMPT_CORE).toContain('不是判决')
  })
})

describe('⑦ 缓存键：入口 / 风格 / 版本 / 前缀', () => {
  it('前缀为 hdt.ai.cache.v2，版本段紧随其后', () => {
    const key = cacheKey(CFG, { ...ARGS, detailMode: 'concise' })
    expect(CACHE_PREFIX).toBe('hdt.ai.cache.v2')
    expect(key.startsWith(`hdt.ai.cache.v2:p${PROMPT_VERSION}:`)).toBe(true)
  })

  it('entry 进键：B 与 C 即使 scope/ref 相同也不串档', () => {
    const base = { ...ARGS, scope: 'full-channel', ref: '20-34', detailMode: 'full' as const }
    const composite = cacheKey(CFG, { ...base, entry: 'composite' })
    const selection = cacheKey(CFG, { ...base, entry: 'selection' })
    expect(composite).not.toBe(selection)
    expect(composite).toContain(':composite:')
    expect(selection).toContain(':selection:')
  })

  it('style 进键：plain 与 pro 分开缓存', () => {
    const base = { ...ARGS, detailMode: 'concise' as const, scope: 'unified' }
    expect(cacheKey(CFG, { ...base, style: 'pro' })).not.toBe(cacheKey(CFG, { ...base, style: 'plain' }))
    expect(cacheKey(CFG, { ...base, style: 'plain' })).toContain(':plain:')
  })

  it('audience 作为过渡别名与 style 等价（不产生第二套缓存）', () => {
    const base = { ...ARGS, detailMode: 'concise' as const, scope: 'unified' }
    expect(cacheKey(CFG, { ...base, audience: 'plain' })).toBe(cacheKey(CFG, { ...base, style: 'plain' }))
    // style 优先于 audience（过渡期两个都传时不产生歧义）
    expect(cacheKey(CFG, { ...base, style: 'pro', audience: 'plain' })).toBe(
      cacheKey(CFG, { ...base, style: 'pro' }),
    )
  })

  it('换详细度 / 换 ref / 换事实块都换键', () => {
    const concise = cacheKey(CFG, { ...ARGS, detailMode: 'concise' })
    const detailed = cacheKey(CFG, { ...ARGS, detailMode: 'detailed' })
    expect(concise).not.toBe(detailed)
    expect(cacheKey(CFG, { ...ARGS, detailMode: 'concise', ref: 'g41' })).not.toBe(concise)
    expect(
      cacheKey(CFG, { ...ARGS, detailMode: 'concise', chartSummary: '类型：投射者' }),
    ).not.toBe(concise)
  })

  it('18 种 entry×detail×style 的缓存键两两互斥', () => {
    const keys = new Set<string>()
    for (const entry of ['full', 'composite', 'selection'] as const) {
      for (const detailMode of ['concise', 'detailed', 'full'] as const) {
        for (const style of ['plain', 'pro'] as const) {
          keys.add(cacheKey(CFG, { ...ARGS, entry, detailMode, style, scope: 'unified' }))
        }
      }
    }
    expect(keys.size).toBe(18)
  })
})

describe('缓存迁移：v1 代键必须被清理', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return store.size
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })

  it('migrateAiCacheV1 幂等，只删 v1* 键', () => {
    localStorage.setItem('hdt.ai.cache.v1:p3.4:abc', 'old')
    localStorage.setItem('hdt.ai.cache.v1-extra:x', 'old')
    localStorage.setItem('hdt.ai.cache.v2:p4.0:keep', 'new')
    localStorage.setItem('hdt.settings.v1', '{}')

    expect(migrateAiCacheV1()).toBe(2)
    expect(localStorage.getItem('hdt.ai.cache.v2:p4.0:keep')).toBe('new')
    expect(localStorage.getItem('hdt.settings.v1')).toBe('{}')
    // 幂等：第二次没有可删的
    expect(migrateAiCacheV1()).toBe(0)
    vi.unstubAllGlobals()
  })

  it('clearAiCache 同时清 v2 与 v1', () => {
    localStorage.setItem('hdt.ai.cache.v1:old', 'a')
    localStorage.setItem('hdt.ai.cache.v2:new', 'b')
    clearAiCache()
    expect(localStorage.getItem('hdt.ai.cache.v1:old')).toBeNull()
    expect(localStorage.getItem('hdt.ai.cache.v2:new')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('user 提示词：四段固定顺序（§11.2 必须保留）', () => {
  it('【盘面事实】→【用户选择】→【离线释义】→【本次任务】', () => {
    const prompt = buildUserPrompt({ ...ARGS, detailMode: 'detailed', angle: '成长方向' })
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

  it('【用户选择】带上入口 / 维度 / 档位 / 风格', () => {
    const prompt = buildUserPrompt({
      ...ARGS,
      scope: 'unified',
      detailMode: 'detailed',
      style: 'plain',
      dims: ['authority', 'cross'],
      angle: '成长方向',
    })
    expect(prompt).toContain('入口：B 综合')
    expect(prompt).toContain('维度：内在权威、轮回交叉')
    expect(prompt).toContain('角度：成长方向')
    expect(prompt).toContain('档位：详细')
    expect(prompt).toContain('风格：零基础')
  })

  it('维度缺省写「不适用」，角度缺省写「综合解读」', () => {
    const prompt = buildUserPrompt({ ...ARGS, detailMode: 'concise' })
    expect(prompt).toContain('维度：不适用')
    expect(prompt).toContain('角度：综合解读')
    expect(prompt).toContain('风格：专业')
  })

  it('档案名不进 prompt（否则手动与批量生成的缓存键会分裂）', () => {
    const prompt = buildUserPrompt({ ...ARGS, detailMode: 'concise' })
    expect(prompt).not.toContain('档案')
  })

  it('完整版分项与融合有专属【本次任务】指令', () => {
    const part = buildUserPrompt({ ...ARGS, entry: 'full', scope: 'full-gate', ref: '41', detailMode: 'full' })
    expect(part).toContain('只写【用户选择】指定的这一项，不要写整盘总论')
    // 内部键（ref）不得进入提示词：A1-core 这类对模型无意义
    expect(part).not.toContain('（41）')
    const withAngle = buildUserPrompt({
      ...ARGS,
      entry: 'full',
      scope: 'full-gate',
      ref: 'C-gate:41',
      angle: '闸门 41 · 收缩',
      detailMode: 'full',
    })
    expect(withAngle).toContain('只写【用户选择】指定的这一项：闸门 41 · 收缩')
    // 内部键只能出现在【用户选择】的「范围」字段里，不得进【本次任务】的那句指令
    const taskLine = withAngle.slice(withAngle.indexOf('【本次任务】'))
    expect(taskLine).not.toContain('C-gate:41')
    const fusion = buildUserPrompt({ ...ARGS, entry: 'full', scope: 'full-fusion', detailMode: 'full' })
    expect(fusion).toContain('全盘融合分析与最终总结论')
    const overview = buildUserPrompt({ ...ARGS, entry: 'full', scope: 'full-all-gates', detailMode: 'full' })
    expect(overview).toContain('一次性通解全部条目')
  })

  it('没有盘面事实时不出现空的【盘面事实】块', () => {
    const prompt = buildUserPrompt({ scope: 'single', offline: 'x' })
    expect(prompt).not.toContain('【盘面事实】')
    expect(prompt).toContain('【本次任务】')
  })
})

describe('防幻觉校验：编号差集（§11.2 必须保留，逻辑零改动）', () => {
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

describe('超时上限（#11：3–3600 秒三处校验一致）', () => {
  it('3600000ms 合法、3600001ms 与 2999ms 被拒', () => {
    expect(validateAiConfig({ ...CFG, timeoutMs: 3600000 })).toBeNull()
    expect(validateAiConfig({ ...CFG, timeoutMs: 3600001 })).toContain('3–3600 秒')
    expect(validateAiConfig({ ...CFG, timeoutMs: 2999 })).toContain('3–3600 秒')
  })
})
