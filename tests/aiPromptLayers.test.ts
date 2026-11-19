/**
 * 五段拼装的结构性回归（ARCH v4.0.0 §2.1 / §11.3 `tests/aiPromptLayers.test.ts`）。
 *
 * 三件事必须钉住：
 * 1. 3 档 × 3 入口 × 2 风格 = 18 种 system 字符串**两两不同**（否则缓存键会撞）；
 * 2. 拼接顺序恒为 CORE → ENTRY → DETAIL → STYLE → SCOPE?（顺序一变，冲突裁决方向就反转）；
 * 3. 风格段能覆盖档位段的默认表述（DETAIL 允许术语，STYLE=零基础要求逐句解释）。
 */
import { describe, expect, it } from 'vitest'
import type { AiDetailMode } from '../src/types/hd'
import type { AiEntry, AiStyle } from '../src/types/aiReading'
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
  PROMPT_SECTION_SEPARATOR,
  PROMPT_STYLE_PLAIN,
  PROMPT_STYLE_PRO,
  detailSegmentOf,
  entrySegmentOf,
  scopeSegmentOf,
  styleSegmentOf,
  systemPromptOf,
} from '../src/services/aiPrompt'

const ENTRIES: AiEntry[] = ['full', 'composite', 'selection']
const DETAILS: AiDetailMode[] = ['concise', 'detailed', 'full']
const STYLES: AiStyle[] = ['plain', 'pro']

/** 18 种组合的 system 字符串（不含范围段，范围段由 scope 决定是否追加） */
function combos(): Array<{ key: string; entry: AiEntry; detail: AiDetailMode; style: AiStyle; prompt: string }> {
  const out: Array<{ key: string; entry: AiEntry; detail: AiDetailMode; style: AiStyle; prompt: string }> = []
  for (const entry of ENTRIES) {
    for (const detail of DETAILS) {
      for (const style of STYLES) {
        out.push({
          key: `${entry}·${detail}·${style}`,
          entry,
          detail,
          style,
          prompt: systemPromptOf({ entry, detail, style }),
        })
      }
    }
  }
  return out
}

describe('18 种组合两两不同', () => {
  it('恰好 18 种，且互不相同（缓存键才不会撞）', () => {
    const all = combos()
    expect(all).toHaveLength(18)
    expect(new Set(all.map((c) => c.prompt)).size).toBe(18)
  })

  it('只差一个维度也必须不同', () => {
    const all = combos()
    for (const a of all) {
      for (const b of all) {
        if (a.key === b.key) continue
        expect(a.prompt, `${a.key} vs ${b.key}`).not.toBe(b.prompt)
      }
    }
  })

  it('每段在一次拼装里都只出现一次（不重复叠加）', () => {
    for (const combo of combos()) {
      expect(combo.prompt.split(PROMPT_CORE)).toHaveLength(2)
      expect(combo.prompt.split(entrySegmentOf(combo.entry))).toHaveLength(2)
      expect(combo.prompt.split(detailSegmentOf(combo.detail))).toHaveLength(2)
      expect(combo.prompt.split(styleSegmentOf(combo.style))).toHaveLength(2)
    }
  })
})

describe('拼接顺序：CORE → ENTRY → DETAIL → STYLE → SCOPE', () => {
  it('四段恒拼的顺序固定', () => {
    const prompt = systemPromptOf({ entry: 'selection', detail: 'detailed', style: 'plain' })
    const iCore = prompt.indexOf(PROMPT_CORE)
    const iEntry = prompt.indexOf(PROMPT_ENTRY_SELECTION)
    const iDetail = prompt.indexOf(PROMPT_DETAIL_DETAILED)
    const iStyle = prompt.indexOf(PROMPT_STYLE_PLAIN)
    expect(iCore).toBe(0)
    expect(iEntry).toBeGreaterThan(iCore)
    expect(iDetail).toBeGreaterThan(iEntry)
    expect(iStyle).toBeGreaterThan(iDetail)
  })

  it('范围段永远排在最后一位', () => {
    const prompt = systemPromptOf({
      entry: 'full',
      detail: 'full',
      style: 'pro',
      scope: 'full-all-channels',
    })
    expect(prompt.indexOf(PROMPT_STYLE_PRO)).toBeLessThan(prompt.indexOf(PROMPT_SCOPE_OVERVIEW))
    expect(prompt.endsWith(PROMPT_SCOPE_OVERVIEW)).toBe(true)
  })

  it('段间分隔符固定为两个换行（文档与代码同一口径）', () => {
    const prompt = systemPromptOf({ entry: 'composite', detail: 'concise', style: 'pro' })
    expect(PROMPT_SECTION_SEPARATOR).toBe('\n\n')
    expect(prompt).toContain(PROMPT_CORE + '\n\n' + entrySegmentOf('composite'))
  })

  it('段落首行的段名标记可用于人工比对（顺序自证）', () => {
    const prompt = systemPromptOf({ entry: 'full', detail: 'concise', style: 'plain', scope: 'full-gate' })
    const marks = ['【基础契约', '【入口契约', '【档位契约', '【表达风格', '【分项范围契约】']
    const positions = marks.map((m) => prompt.indexOf(m))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})

describe('风格段覆盖档位段的冲突裁决', () => {
  it('DETAIL 允许术语、STYLE=零基础要求解释：两者同时存在且风格在后', () => {
    const prompt = systemPromptOf({ entry: 'full', detail: 'detailed', style: 'plain' })
    expect(prompt).toContain('允许引用具体闸门编号与通道名')
    expect(prompt).toContain(PROMPT_STYLE_PLAIN)
    expect(prompt.indexOf('允许引用具体闸门编号与通道名')).toBeLessThan(
      prompt.indexOf(PROMPT_STYLE_PLAIN),
    )
  })

  it('同一档位换风格只改风格段（其余段落逐字相同）', () => {
    const plain = systemPromptOf({ entry: 'full', detail: 'detailed', style: 'plain' })
    const pro = systemPromptOf({ entry: 'full', detail: 'detailed', style: 'pro' })
    expect(plain.replace(PROMPT_STYLE_PLAIN, '')).toBe(pro.replace(PROMPT_STYLE_PRO, ''))
  })

  it('旧的「读者已熟悉术语」文案在任何组合里都不出现', () => {
    for (const combo of combos()) {
      expect(combo.prompt).not.toContain('读者已熟悉人类图术语')
      expect(combo.prompt).not.toContain('不必逐个展开解释')
    }
  })
})

describe('范围段映射', () => {
  it('融合 / 通解 / 分项三类各自命中的 scope', () => {
    const fusion = ['full-fusion', 'selection-fusion']
    const overview = ['full-all-channels', 'full-all-gates']
    const item = ['full-module', 'full-trajectory', 'full-dimension', 'full-gate', 'full-channel']
    for (const scope of fusion) expect(scopeSegmentOf(scope), scope).toBe(PROMPT_SCOPE_FUSION)
    for (const scope of overview) expect(scopeSegmentOf(scope), scope).toBe(PROMPT_SCOPE_OVERVIEW)
    for (const scope of item) expect(scopeSegmentOf(scope), scope).toBe(PROMPT_SCOPE_ITEM)
  })

  it('单次整篇 / 既有单点 / 缺失 scope 不追加范围段', () => {
    const none = ['unified', 'selection-one', 'single', 'gate', 'channel', 'center', 'chiron', 'composite-love', '']
    for (const scope of none) expect(scopeSegmentOf(scope), scope).toBe('')
    expect(scopeSegmentOf(undefined)).toBe('')
  })
})

describe('提示词内容红线', () => {
  it('全部段落不含「前世」', () => {
    const all = [
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
    ].join('\n')
    expect(all).not.toContain('前世')
    // 姻缘方向统一表述
    expect(PROMPT_ENTRY_FULL).toContain('人生轨迹、发展轨迹、未来形势、扎根力、成长方向')
  })

  it('入口契约不写编排细节（编排是 planReading 的职责）', () => {
    for (const entry of [PROMPT_ENTRY_FULL, PROMPT_ENTRY_COMPOSITE, PROMPT_ENTRY_SELECTION]) {
      expect(entry).not.toContain('多轮')
      expect(entry).not.toContain('并发')
    }
  })

  it('入口 A 的六模块顺序写死在提示词里，不可调换', () => {
    const order = [
      '① 类型、策略、内在权威',
      '② 全部通道通解',
      '③ 全部闸门通解',
      '④ 中心状态、定义型、回路分布、轮回交叉',
      '⑤ 人生轨迹、发展轨迹、未来形势、扎根力、成长方向',
      '⑥ 最终综合解读',
    ]
    const positions = order.map((line) => PROMPT_ENTRY_FULL.indexOf(line))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('入口 B 的白名单段与入口 C 的两阶段段都带硬约束措辞', () => {
    expect(PROMPT_ENTRY_COMPOSITE).toContain('输出白名单')
    expect(PROMPT_ENTRY_COMPOSITE).toContain('未勾选的维度不得成为二级或三级标题')
    expect(PROMPT_ENTRY_SELECTION).toContain('第一阶段')
    expect(PROMPT_ENTRY_SELECTION).toContain('关联汇总')
    expect(PROMPT_ENTRY_SELECTION).toContain('至少点名 3 组跨条目联动')
  })
})
