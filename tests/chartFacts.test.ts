/**
 * 盘面事实块构建的一致性回归（v2.4.0）。
 *
 * 这些断言守的是「同一张盘在手动解读与批量解读下喂给模型的内容逐字相同」：
 * 事实块的维度**输出**顺序、scope/ref 拼串、offline 收束句都是缓存键的一部分
 * （`aiClient.cacheKey()` 把 offline + chartSummary 拼进内容哈希），
 * 任何一处漂移都会让两条路径各存一份缓存、互相不命中，用户看到重复计费。
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_READING_DIMS,
  READING_DIMENSIONS,
  buildSelectionOffline,
  buildStarBrief,
  buildUnifiedFacts,
  buildUnifiedOffline,
  directionPrompt,
  firstSentence,
  selectionTitle,
  unifiedScopeRef,
} from '../src/services/chartFacts'
import type { BodyGraph, CenterId } from '../src/types/hd'

const CENTERS: CenterId[] = [
  'head',
  'ajna',
  'throat',
  'g',
  'heart',
  'sacral',
  'spleen',
  'solar',
  'root',
]

/** 轮回交叉解读需要「显意识 / 潜意识各自的太阳与地球」四个落点，缺一会读 undefined */
function makeChart(): BodyGraph {
  return {
    type: 'Generator',
    strategy: '等待回应',
    authority: 'Sacral',
    profile: '2/4',
    definition: 'Single',
    incarnationCross: '右角度交叉之四方之道',
    centers: CENTERS.map((id) => ({ id, defined: id === 'sacral' })),
    gates: [
      { gate: 34, stars: ['Sun'], state: 'in-channel' },
      { gate: 20, stars: ['Earth'], state: 'in-channel' },
    ],
    channels: [{ key: '20-34', gates: [20, 34] }],
    hangingGates: [],
    personality: [
      { planet: 'Sun', longitude: 0, gate: 34, line: 1, color: 1, tone: 1, base: 1 },
      { planet: 'Earth', longitude: 180, gate: 20, line: 4, color: 1, tone: 1, base: 1 },
    ],
    design: [
      { planet: 'Sun', longitude: 0, gate: 20, line: 2, color: 1, tone: 1, base: 1 },
      { planet: 'Earth', longitude: 180, gate: 34, line: 5, color: 1, tone: 1, base: 1 },
    ],
    meta: {
      personalityTime: '1990-05-21T06:30:00.000Z',
      designTime: '1990-05-18T00:00:00.000Z',
      personalitySun: 0,
      designSun: 0,
    },
  }
}

describe('维度常量', () => {
  it('八个维度，key 与顺序固定', () => {
    expect(READING_DIMENSIONS.map((d) => d.key)).toEqual([
      'channels',
      'gates',
      'centers',
      'strategy',
      'definition',
      'authority',
      'cross',
      'profile',
    ])
  })

  it('ALL_READING_DIMS 是 READING_DIMENSIONS 的 key 投影', () => {
    expect(ALL_READING_DIMS).toEqual(READING_DIMENSIONS.map((d) => d.key))
  })

  it('每个维度都有非空 label 与 desc', () => {
    for (const d of READING_DIMENSIONS) {
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.desc.length).toBeGreaterThan(0)
    }
  })
})

describe('firstSentence', () => {
  it('取首个句末标点为止', () => {
    expect(firstSentence('第一句。第二句。')).toBe('第一句。')
  })

  it('压掉所有空白后再截取', () => {
    expect(firstSentence('前 面\n有 空 白。后面。')).toBe('前面有空白。')
  })

  it('超长时按 max 截断并加省略号', () => {
    const long = `${'甲'.repeat(80)}。`
    const out = firstSentence(long, 52)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBe(53)
  })

  it('max 之内不截断也不加省略号', () => {
    expect(firstSentence('短句。', 52)).toBe('短句。')
  })
})

describe('buildUnifiedFacts：维度输出顺序', () => {
  const chart = makeChart()

  it('★ 输出顺序与勾选顺序无关（缓存键稳定）', () => {
    const forward = buildUnifiedFacts(chart, [...ALL_READING_DIMS])
    const reversed = buildUnifiedFacts(chart, [...ALL_READING_DIMS].reverse())
    expect(forward).toBe(reversed)
  })

  it('固定顺序为 profile→strategy→authority→definition→cross→channels→gates→centers', () => {
    const out = buildUnifiedFacts(chart, [...ALL_READING_DIMS])
    // 每个维度恰好产出一个段落（\n\n 分隔），段首即该维度的标题。
    // 不能用全局 【…】 匹配：释义正文里本身也可能带【】小节标题。
    const titles = out.split('\n\n').map((part) => part.match(/^【([^】]+)】/)?.[1])
    expect(titles).toEqual([
      '人生角色 / 能量类型',
      '人生策略',
      '内在权威',
      '整体定义',
      '轮回交叉',
      '已激活通道',
      '已激活闸门',
      '九大能量中心状态',
    ])
  })

  it('只勾选部分维度时只出现对应段落', () => {
    const out = buildUnifiedFacts(chart, ['profile', 'gates'])
    const titles = out.split('\n\n').map((part) => part.match(/^【([^】]+)】/)?.[1])
    expect(titles).toEqual(['人生角色 / 能量类型', '已激活闸门'])
  })

  it('空维度集合产出空串', () => {
    expect(buildUnifiedFacts(chart, [])).toBe('')
  })

  it('多次构建同一输入产出逐字相同的结果', () => {
    expect(buildUnifiedFacts(chart, ['channels', 'profile'])).toBe(
      buildUnifiedFacts(chart, ['channels', 'profile']),
    )
  })
})

describe('unifiedScopeRef 与 buildUnifiedOffline', () => {
  const chart = makeChart()

  it('ref 拼串为「维度+…:角度:自定义」（自定义缺省为 -）', () => {
    expect(unifiedScopeRef(['gates', 'profile'], 'comprehensive', '')).toBe(
      'gates+profile:comprehensive:-',
    )
  })

  it('维度顺序不同的 ref 不同（不同的缓存条目）', () => {
    expect(unifiedScopeRef(['gates', 'profile'], 'a', '')).not.toBe(
      unifiedScopeRef(['profile', 'gates'], 'a', ''),
    )
  })

  it('offline = 事实块 + 空行 + 方向段 + 空行 + 收束指令', () => {
    const out = buildUnifiedOffline(chart, ['profile'], '综合解读', '提示词正文', '')
    const parts = out.split('\n\n')
    expect(parts[0]).toBe(buildUnifiedFacts(chart, ['profile']))
    expect(parts[1]).toBe(directionPrompt('综合解读', '提示词正文', ''))
    expect(parts[2]).toBe(
      '请把以上所有勾选维度作为一个整体来综合解读：先给出整体画像结论，再分别说明各维度如何相互影响，最后给落地建议。',
    )
  })

  it('自定义方向覆盖固定角度文案', () => {
    const out = buildUnifiedOffline(chart, ['profile'], '综合解读', '提示词正文', '亲子关系')
    expect(out).toContain('【自定义解读方向】')
    expect(out).toContain('亲子关系')
    expect(out).not.toContain('【解读角度】')
  })
})

describe('directionPrompt', () => {
  it('无自定义时输出固定角度段', () => {
    expect(directionPrompt('综合解读', '正文', '')).toBe('【解读角度】综合解读：正文')
  })

  it('有自定义时只输出自定义方向段', () => {
    const out = directionPrompt('综合解读', '正文', '事业')
    expect(out).toBe(
      '【自定义解读方向】用户希望重点从「事业」的角度解读，请围绕该方向展开，同时保持术语准确。',
    )
  })
})

describe('单点释义（闸门 / 通道 / 中心）', () => {
  const chart = makeChart()

  it('无盘面或无选点返回空串', () => {
    expect(buildSelectionOffline(null, { kind: 'gate', ref: 34 })).toBe('')
    expect(buildSelectionOffline(chart, null)).toBe('')
  })

  it('闸门与通道的标题在 selectionTitle 里可直接取到', () => {
    expect(selectionTitle({ kind: 'gate', ref: 34 }).length).toBeGreaterThan(0)
    expect(selectionTitle({ kind: 'channel', ref: '20-34' }).length).toBeGreaterThan(0)
  })

  it('中心标题取标签', () => {
    expect(selectionTitle({ kind: 'center', ref: 'sacral' })).toBe('骶骨中心')
  })

  it('无选点时标题为空串', () => {
    expect(selectionTitle(null)).toBe('')
  })

  it('已定义 / 开放中心取不同释义文本', () => {
    const defined = buildSelectionOffline(chart, { kind: 'center', ref: 'sacral' })
    const open = buildSelectionOffline(chart, { kind: 'center', ref: 'head' })
    expect(defined).not.toBe(open)
    expect(defined).toContain('骶骨中心')
    expect(open).toContain('头顶中心')
  })
})

describe('buildStarBrief', () => {
  const chart = makeChart()

  it('按 显意识/潜意识 前缀区分两侧星体', () => {
    const out = buildStarBrief(chart, ['personality:Sun', 'design:Moon'])
    expect(out).toContain('显意识Sun 34.1')
    // design 侧没有 Moon 落点，应被跳过而不是抛错
    expect(out).not.toContain('潜意识Moon')
  })

  it('空集合产出空串', () => {
    expect(buildStarBrief(chart, [])).toBe('')
  })

  it('未知键被静默跳过', () => {
    expect(buildStarBrief(chart, ['nonsense'])).toBe('')
  })
})
