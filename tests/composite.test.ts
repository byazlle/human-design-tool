/**
 * 专业合图引擎与凯龙回归的回归测试。
 */
import { describe, expect, it } from 'vitest'
import { composite, mergedAsChart } from '../src/engine/composite'
import type { BodyGraph, CenterId } from '../src/types/hd'
import { CENTER_IDS } from '../src/types/hd'
import { GATE_CENTER } from '../src/engine/gateData'
import { chironLongitude, findChironReturn } from '../src/engine/chiron'
import { chartSummaryOf } from '../src/services/aiClient'
import { relationshipTheme } from '../src/services/relationshipTheme'

let seq = 0

function makeChart(gates: number[], channels: Array<[number, number]>): BodyGraph {
  const gset = new Set(gates)
  for (const [a, b] of channels) {
    gset.add(a)
    gset.add(b)
  }
  const definedCenters = new Set<CenterId>()
  for (const g of gset) definedCenters.add(GATE_CENTER[g])
  // 三态：落在给定通道内的闸门为 in-channel，其余为 hanging（规范 §3.5）
  const channelGates = new Set<number>(channels.flat())
  seq += 1
  return {
    type: 'Generator',
    strategy: '',
    authority: 'Sacral',
    profile: '1/3',
    incarnationCross: '',
    definition: 'Single',
    centers: CENTER_IDS.map((id) => ({ id, defined: definedCenters.has(id) })),
    gates: [...gset]
      .sort((a, b) => a - b)
      .map((gate) => ({
        gate,
        stars: [],
        state: channelGates.has(gate) ? ('in-channel' as const) : ('hanging' as const),
      })),
    channels: channels.map(([a, b]) => ({
      key: `${Math.min(a, b)}-${Math.max(a, b)}`,
      gates: [Math.min(a, b), Math.max(a, b)] as [number, number],
    })),
    hangingGates: [],
    personality: [
      { planet: 'Sun', longitude: 0, gate: 1, line: 3, color: 1, tone: 1, base: 1 },
      { planet: 'Earth', longitude: 180, gate: 2, line: 3, color: 1, tone: 1, base: 1 },
    ],
    design: [
      { planet: 'Sun', longitude: 90, gate: 41, line: 3, color: 1, tone: 1, base: 1 },
      { planet: 'Earth', longitude: 270, gate: 42, line: 3, color: 1, tone: 1, base: 1 },
    ],
    meta: {
      personalityTime: '2000-01-01T00:00:00.000Z',
      designTime: '2000-01-01T00:00:00.000Z',
      personalitySun: 0,
      designSun: 90,
    },
  }
}

describe('专业合图引擎', () => {
  it('电磁通道：两人各持一端互补成通道', () => {
    const r = composite(makeChart([43], []), makeChart([23], []))
    const rel = r.relationshipChannels.find((c) => c.key === '23-43')
    expect(rel).toBeTruthy()
    expect(rel!.type).toBe('electromagnetic')
    // 并集确实生成完整通道
    expect(r.merged.channels.some((c) => c.key === '23-43')).toBe(true)
  })

  it('同伴通道：两人各自自带同一条完整通道', () => {
    const r = composite(makeChart([], [[1, 8]]), makeChart([], [[1, 8]]))
    const rel = r.relationshipChannels.find((c) => c.key === '1-8')
    expect(rel?.type).toBe('companionship')
    expect(r.sharedChannels.map((c) => c.key)).toContain('1-8')
  })

  it('主导通道：单方完整、对方无相关闸门', () => {
    const r = composite(makeChart([], [[1, 8]]), makeChart([64], []))
    const rel = r.relationshipChannels.find((c) => c.key === '1-8')
    expect(rel?.type).toBe('dominance')
    expect(rel?.holder).toBe('a')
  })

  it('妥协通道：一方完整、一方单闸门悬挂', () => {
    const r = composite(makeChart([], [[1, 8]]), makeChart([8], []))
    const rel = r.relationshipChannels.find((c) => c.key === '1-8')
    expect(rel?.type).toBe('compromise')
    expect(rel?.holder).toBe('a')
  })

  it('合盘不输出类型 / 权威 / 定义型 / 轮回交叉（规范 §3.8 / GAP-01）', () => {
    const r = composite(makeChart([43], []), makeChart([23], []))
    // 结果对象不再有 composite 字段（a / b 是个体盘，允许保留个体字段）
    expect('composite' in r).toBe(false)
    expect(Object.keys(r).sort()).toEqual(
      [
        'a',
        'b',
        'centerQuadrant',
        'channelOwners',
        'gateOwners',
        'merged',
        'relationshipChannels',
        'sharedChannels',
        'sharedGates',
      ].sort(),
    )
    // merged 子树只含结构，不含任何个体气场结论
    const mergedJson = JSON.stringify(r.merged)
    for (const key of ['"type"', '"authority"', '"definition"', 'incarnationCross']) {
      expect(mergedJson).not.toContain(key)
    }
    // 并集结构仍然可用
    expect(r.merged.centers.find((c) => c.id === 'throat')?.defined).toBe(true)
    expect(r.merged.centers.find((c) => c.id === 'ajna')?.defined).toBe(true)
    // 渲染占位盘：交叉恒空、无个体星位（仅渲染占位，不得展示）
    const chart = mergedAsChart(r)
    expect(chart.incarnationCross).toBe('')
    expect(chart.personality).toHaveLength(0)
    expect(chart.design).toHaveLength(0)
    expect(chart.channels.some((c) => c.key === '23-43')).toBe(true)
  })

  it('合盘 AI 摘要与关系文案不含个体气场结论', () => {
    const r = composite(makeChart([], [[1, 8]]), makeChart([], [[2, 14]]))
    const summary = chartSummaryOf(mergedAsChart(r))
    for (const token of ['类型：', '内在权威', '定义：', '轮回交叉']) {
      expect(summary).not.toContain(token)
    }
    // 允许：双方人生角色（个体属性，规范明确允许）
    expect(summary).toContain('人生角色')

    const text = relationshipTheme(r)
      .map((b) => `${b.h}\n${b.p}`)
      .join('\n')
    for (const word of ['投射者', '权威', '交叉']) expect(text).not.toContain(word)
  })

  it('中心四象限：四类状态互斥且合计为 9', () => {
    // A: 定义 23-43（喉咙+眉心）；B: 定义 1-8（喉咙+G）
    const r = composite(makeChart([], [[23, 43]]), makeChart([], [[1, 8]]))
    const byState = (s: string) => r.centerQuadrant.filter((c) => c.state === s)
    expect(byState('both').map((c) => c.id)).toContain('throat') // 双方都定义了喉咙
    expect(byState('onlyA').map((c) => c.id)).toContain('ajna')
    expect(byState('onlyB').map((c) => c.id)).toContain('g')
    expect(byState('open').length).toBeGreaterThan(0)
    expect(r.centerQuadrant).toHaveLength(9)
  })

  it('拒绝同一张盘与自己合盘', () => {
    const self = makeChart([43], [])
    expect(() => composite(self, self)).toThrow(/两位不同的人/)
  })

  it('同一 Archive.id 视为同一人（对象不同也不允许）', () => {
    const a = makeChart([], [[1, 8]])
    const b = makeChart([], [[1, 8]])
    expect(a).not.toBe(b)
    expect(() => composite(a, b, { aId: 'x', bId: 'x' })).toThrow(/两位不同的人/)
    expect(() => composite(a, b, { aId: 'x', bId: 'y' })).not.toThrow()
    // 向后兼容：不传 opts 时行为与之前一致
    expect(() => composite(a, b)).not.toThrow()
  })

  it('合图闸门三态：并集通道内 in-channel，其余 hanging', () => {
    const r = composite(makeChart([43], []), makeChart([23], []))
    const byGate = new Map(r.merged.gates.map((g) => [g.gate, g.state]))
    expect(byGate.get(23)).toBe('in-channel')
    expect(byGate.get(43)).toBe('in-channel')

    const r2 = composite(makeChart([43, 5], []), makeChart([23], []))
    expect(r2.merged.gates.find((g) => g.gate === 5)?.state).toBe('hanging')
    // 渲染占位盘透传 state，且 hangingGates 与 state 一致
    const merged = mergedAsChart(r2)
    expect(merged.gates.find((g) => g.gate === 5)?.state).toBe('hanging')
    expect(merged.hangingGates).toContain(5)
  })
})

describe('凯龙星历与回归', () => {
  it('凯龙黄经在 0–360 之间且随时间推进', () => {
    const a = chironLongitude(new Date('2000-01-01T00:00:00Z'))
    const b = chironLongitude(new Date('2001-01-01T00:00:00Z'))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(360)
    expect(Math.abs(b - a)).toBeGreaterThan(0)
    expect(Math.abs(b - a)).toBeLessThan(30) // 每年约 7.1°
  })

  it('凯龙回归时刻约在出生后 49–52 年', () => {
    const birth = new Date('1976-06-15T12:00:00Z')
    const ret = findChironReturn(birth)
    expect(ret).toBeTruthy()
    const years = (ret!.getTime() - birth.getTime()) / (365.25 * 86400000)
    expect(years).toBeGreaterThan(49)
    expect(years).toBeLessThan(52)
  })
})
