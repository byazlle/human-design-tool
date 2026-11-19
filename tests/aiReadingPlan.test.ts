/**
 * 计划器的结构性回归（ARCH v4.0.0 §3.1–§3.5）。
 *
 * 断言的是**请求清单本身**：任务 key / scope 的顺序快照、singleShot 标志、请求总数、
 * 空勾选的出口、以及「勾选顺序不影响 ref」。这些是编排契约的硬事实——
 * 顺序一变，报告分节顺序与缓存键都会跟着变。
 */
import { describe, expect, it } from 'vitest'
import type { BodyGraph, CenterId, Planet } from '../src/types/hd'
import type { ReadingRequest } from '../src/types/aiReading'
import {
  normalizeDims,
  normalizeSelection,
  planReading,
  requestCountOf,
  selectionSummaryOf,
} from '../src/services/aiReadingPlan'
import { selectionScopeRef, sortedChannels } from '../src/services/chartFacts'
import { MODULE_A5_DIRECTIONS } from '../src/services/readingAngles'

const CENTERS: CenterId[] = ['head', 'ajna', 'throat', 'g', 'heart', 'sacral', 'spleen', 'solar', 'root']

function star(planet: Planet, gate: number, line = 1) {
  return { planet, longitude: 0, gate, line, color: 1, tone: 1, base: 1 } as const
}

function makeChart(): BodyGraph {
  return {
    type: 'Generator',
    strategy: '等待回应',
    authority: 'Sacral',
    profile: '2/4',
    definition: 'Split',
    incarnationCross: '右角度交叉之解释',
    centers: CENTERS.map((id) => ({ id, defined: id === 'sacral' || id === 'throat' || id === 'g' })),
    gates: [
      { gate: 34, stars: ['Sun'], state: 'in-channel' },
      { gate: 20, stars: ['Earth'], state: 'in-channel' },
      { gate: 57, stars: ['Moon'], state: 'in-channel' },
      { gate: 10, stars: ['Venus'], state: 'in-channel' },
      { gate: 41, stars: ['Mars'], state: 'hanging' },
      { gate: 24, stars: ['Mercury'], state: 'hanging' },
      { gate: 44, stars: ['Saturn'], state: 'hanging' },
    ],
    channels: [
      { key: '34-57', gates: [34, 57] },
      { key: '20-34', gates: [20, 34] },
      { key: '10-20', gates: [10, 20] },
    ],
    hangingGates: [41, 24, 44],
    personality: [
      star('Sun', 34, 1),
      star('Earth', 20, 4),
      star('Moon', 57, 2),
      star('NorthNode', 44, 3),
      star('SouthNode', 24, 5),
    ],
    design: [
      star('Sun', 20, 2),
      star('Earth', 34, 5),
      star('NorthNode', 41, 1),
      star('SouthNode', 10, 6),
    ],
    meta: { personalityTime: '', designTime: '', personalitySun: 34, designSun: 20 },
  }
}

const CHART = makeChart()

function req(over: Partial<ReadingRequest>): ReadingRequest {
  return {
    entry: 'full',
    detail: 'detailed',
    style: 'plain',
    chart: CHART,
    archiveName: '张三',
    ...over,
  }
}

/** 断言用的紧凑视图：`[[key, scope], …]` + 融合 */
function shape(over: Partial<ReadingRequest>): {
  singleShot: boolean
  tasks: Array<[string, string]>
  fusion: [string, string] | null
  requests: number
  title: string
} {
  const plan = planReading(req(over))
  return {
    singleShot: plan.singleShot,
    tasks: plan.tasks.map((t) => [t.key, t.scope]),
    fusion: plan.fusion ? [plan.fusion.key, plan.fusion.scope] : null,
    requests: requestCountOf(plan),
    title: plan.title,
  }
}

describe('入口 A｜全盘 AI 解读', () => {
  it('精简 / 详细 => 单次档恒 1 请求，scope=panorama-one', () => {
    for (const detail of ['concise', 'detailed'] as const) {
      const plan = shape({ entry: 'full', detail })
      expect(plan.singleShot).toBe(true)
      expect(plan.tasks).toEqual([['A-oneshot', 'panorama-one']])
      expect(plan.fusion).toBeNull()
      expect(plan.requests).toBe(1)
    }
  })

  it('完整档 => 5 个模块任务 + 1 个融合，顺序固定 ①→⑤', () => {
    const plan = shape({ entry: 'full', detail: 'full' })
    expect(plan.singleShot).toBe(false)
    expect(plan.tasks).toEqual([
      ['A1-core', 'full-module'],
      ['A2-channels', 'full-all-channels'],
      ['A3-gates', 'full-all-gates'],
      ['A4-centers', 'full-module'],
      ['A5-trajectory', 'full-trajectory'],
    ])
    expect(plan.fusion).toEqual(['A6-fusion', 'full-fusion'])
    expect(plan.requests).toBe(6)
  })

  it('模块⑤ 的 offline 里带齐 5 个方向的文案（顺序 = MODULE_A5_DIRECTIONS）', () => {
    const plan = planReading(req({ entry: 'full', detail: 'full' }))
    const a5 = plan.tasks.find((t) => t.key === 'A5-trajectory')!
    const positions = MODULE_A5_DIRECTIONS.map((d) => a5.offline.indexOf(d.label))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(MODULE_A5_DIRECTIONS.map((d) => d.key)).toEqual([
      'trajectory',
      'development',
      'forecast',
      'grounding',
      'growth',
    ])
  })

  it('模块②③ 的 offline 标注「逐条覆盖、不得合并」，且各自只给自己那段事实', () => {
    const plan = planReading(req({ entry: 'full', detail: 'full' }))
    const a2 = plan.tasks.find((t) => t.key === 'A2-channels')!
    const a3 = plan.tasks.find((t) => t.key === 'A3-gates')!
    expect(a2.offline).toContain('【已激活通道通解】')
    expect(a2.offline).toContain('本模块要求逐条覆盖，不得合并')
    expect(a2.offline).not.toContain('【已激活闸门通解】')
    expect(a3.offline).toContain('【已激活闸门通解】')
    expect(a3.offline).toContain('【悬挂闸门】')
    expect(a3.offline).not.toContain('【已激活通道通解】')
  })
})

describe('入口 B｜AI 综合解读', () => {
  it('精简 / 详细 => 单次档 1 请求，scope=unified', () => {
    const plan = shape({ entry: 'composite', detail: 'concise', dims: ['authority', 'cross'] })
    expect(plan.singleShot).toBe(true)
    expect(plan.tasks).toEqual([['B-oneshot', 'unified']])
    expect(plan.fusion).toBeNull()
    expect(plan.requests).toBe(1)
  })

  it('完整档 => 每个维度 1 个分项 + 1 个融合，按 READING_DIMENSIONS 顺序', () => {
    const plan = shape({ entry: 'composite', detail: 'full', dims: ['cross', 'authority'] })
    expect(plan.singleShot).toBe(false)
    // 点击顺序是 cross → authority，输出必须是 authority → cross
    expect(plan.tasks).toEqual([
      ['B-dim:authority', 'full-dimension'],
      ['B-dim:cross', 'full-dimension'],
    ])
    expect(plan.fusion).toEqual(['B-fusion', 'full-fusion'])
    expect(plan.requests).toBe(3)
  })

  it('normalizeDims 按 READING_DIMENSIONS 固定顺序，且去重', () => {
    expect(normalizeDims(['cross', 'channels', 'authority', 'cross'])).toEqual([
      'channels',
      'authority',
      'cross',
    ])
    expect(normalizeDims([])).toEqual([])
    expect(normalizeDims(undefined)).toEqual([])
  })

  it('一个维度都没勾 => 空计划（不抛错，UI 负责禁用按钮）', () => {
    const plan = planReading(req({ entry: 'composite', detail: 'full', dims: [] }))
    expect(plan.tasks).toEqual([])
    expect(plan.fusion).toBeNull()
    expect(requestCountOf(plan)).toBe(0)
  })

  it('ref 与勾选顺序无关，且随维度集合变化', () => {
    const a = planReading(req({ entry: 'composite', detail: 'concise', dims: ['authority', 'cross'] }))
    const b = planReading(req({ entry: 'composite', detail: 'concise', dims: ['cross', 'authority'] }))
    expect(a.tasks[0].ref).toBe(b.tasks[0].ref)
    const c = planReading(req({ entry: 'composite', detail: 'concise', dims: ['authority'] }))
    expect(c.tasks[0].ref).not.toBe(a.tasks[0].ref)
  })
})

describe('入口 C｜勾选解读', () => {
  const PICK = {
    channels: ['34-57', '20-34'],
    gates: [57, 41],
    definition: true,
    circuit: false,
    cross: true,
  }

  it('精简 / 详细 => 单次档 1 请求，scope=selection-one', () => {
    const plan = shape({ entry: 'selection', detail: 'detailed', selection: { ...PICK } })
    expect(plan.singleShot).toBe(true)
    expect(plan.tasks).toEqual([['C-oneshot', 'selection-one']])
    expect(plan.fusion).toBeNull()
    expect(plan.requests).toBe(1)
  })

  it('完整档 => 通道(升序) → 闸门(升序) → 可选模块 → 汇总', () => {
    const plan = shape({ entry: 'selection', detail: 'full', selection: { ...PICK } })
    expect(plan.singleShot).toBe(false)
    expect(plan.tasks).toEqual([
      ['C-ch:20-34', 'full-channel'],
      ['C-ch:34-57', 'full-channel'],
      ['C-gate:41', 'full-gate'],
      ['C-gate:57', 'full-gate'],
      ['C-definition', 'full-module'],
      ['C-cross', 'full-module'],
    ])
    expect(plan.fusion).toEqual(['C-relation', 'selection-fusion'])
    // k=2 通道 + m=2 闸门 + r=2 可选 + 1 汇总
    expect(plan.requests).toBe(7)
  })

  it('只勾通道时只出通道任务 + 汇总', () => {
    const plan = shape({
      entry: 'selection',
      detail: 'full',
      selection: { channels: ['10-20'], gates: [], definition: false, circuit: false, cross: false },
    })
    expect(plan.tasks).toEqual([['C-ch:10-20', 'full-channel']])
    expect(plan.requests).toBe(2)
  })

  it('点击顺序无关：打乱输入得到同一 ref 与同一任务序列', () => {
    const a = planReading(req({ entry: 'selection', detail: 'full', selection: { ...PICK } }))
    const b = planReading(
      req({
        entry: 'selection',
        detail: 'full',
        selection: {
          channels: ['20-34', '34-57', '20-34'],
          gates: [41, 57, 41],
          definition: true,
          circuit: false,
          cross: true,
        },
      }),
    )
    expect(b.tasks.map((t) => t.key)).toEqual(a.tasks.map((t) => t.key))
    expect(b.tasks[0].ref).toBe(a.tasks[0].ref)
    expect(b.fusion?.ref).toBe(a.fusion?.ref)
  })

  it('什么都没勾 => 空计划', () => {
    const plan = planReading(
      req({
        entry: 'selection',
        detail: 'full',
        selection: { channels: [], gates: [], definition: false, circuit: false, cross: false },
      }),
    )
    expect(plan.tasks).toEqual([])
    expect(requestCountOf(plan)).toBe(0)
  })

  it('非法通道 key / 越界闸门号被过滤，不产生任务', () => {
    const normalized = normalizeSelection({
      channels: ['abc', '99-1', '20-34'],
      gates: [0, 65, 34],
      definition: false,
      circuit: false,
      cross: false,
    })
    expect(normalized?.channels).toEqual(['20-34'])
    expect(normalized?.gates).toEqual([34])
  })

  it('selectionScopeRef 与点击顺序无关，方向 key 收尾', () => {
    const refA = selectionScopeRef({ ...PICK }, 'growth')
    const refB = selectionScopeRef({ ...PICK, channels: ['20-34', '34-57'], gates: [41, 57] }, 'growth')
    expect(refA).toBe(refB)
    expect(refA).toBe('ch:20-34+34-57|g:41,57|f:101|d:growth')
    expect(selectionScopeRef({ ...PICK }, 'career')).not.toBe(refA)
  })

  it('selectionSummaryOf 给可读清单', () => {
    expect(selectionSummaryOf({ ...PICK })).toBe('通道 20-34、34-57；闸门 41、57；定义状态；轮回交叉')
  })
})

describe('报告标题与方向', () => {
  it('标题含档案名 + 入口 + 档位', () => {
    expect(shape({ entry: 'full', detail: 'full' }).title).toBe('张三 · 全盘 AI 解读（完整）')
    expect(shape({ entry: 'composite', detail: 'concise', dims: ['cross'] }).title).toBe(
      '张三 · AI 综合解读（精简）',
    )
    expect(
      shape({
        entry: 'selection',
        detail: 'detailed',
        selection: { channels: ['20-34'], gates: [], definition: false, circuit: false, cross: false },
      }).title,
    ).toBe('张三 · 勾选解读（详细）')
  })

  it('自定义方向优先于内置角度（进 offline 文案）', () => {
    const plan = planReading(
      req({
        entry: 'composite',
        detail: 'concise',
        dims: ['authority'],
        direction: { key: 'custom', label: '事业方向', prompt: '', custom: '我想知道换工作的时间点' },
      }),
    )
    expect(plan.tasks[0].offline).toContain('【自定义解读方向】')
    expect(plan.tasks[0].offline).toContain('我想知道换工作的时间点')
  })

  it('入口 C 未选方向时注入「不限方向」而不是编一个角度', () => {
    const plan = planReading(
      req({
        entry: 'selection',
        detail: 'concise',
        selection: { channels: ['20-34'], gates: [], definition: false, circuit: false, cross: false },
      }),
    )
    expect(plan.tasks[0].offline).toContain('不限方向')
  })
})

describe('事实块顺序稳定性（缓存键不会随机漂移）', () => {
  it('通道按 key 数值升序：9-52 < 20-34 < 34-57', () => {
    const chart = makeChart()
    chart.channels = [
      { key: '34-57', gates: [34, 57] },
      { key: '20-34', gates: [20, 34] },
      { key: '9-52', gates: [9, 52] },
    ]
    expect(sortedChannels(chart).map((c) => c.key)).toEqual(['9-52', '20-34', '34-57'])
  })

  it('同一张盘两次 planReading 产出逐字相同的 offline', () => {
    const a = planReading(req({ entry: 'full', detail: 'full' }))
    const b = planReading(req({ entry: 'full', detail: 'full' }))
    expect(a.tasks.map((t) => t.offline)).toEqual(b.tasks.map((t) => t.offline))
  })
})
