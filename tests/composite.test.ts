/**
 * 专业合图引擎与凯龙回归的回归测试。
 */
import { describe, expect, it } from 'vitest'
import { composite, mergedAsChart } from '../src/engine/composite'
import type { BodyGraph, CenterId } from '../src/types/hd'
import { CENTER_IDS } from '../src/types/hd'
import { GATE_CENTER } from '../src/engine/gateData'
import { chironLongitude, findChironReturn } from '../src/engine/chiron'

let seq = 0

function makeChart(gates: number[], channels: Array<[number, number]>): BodyGraph {
  const gset = new Set(gates)
  for (const [a, b] of channels) {
    gset.add(a)
    gset.add(b)
  }
  const definedCenters = new Set<CenterId>()
  for (const g of gset) definedCenters.add(GATE_CENTER[g])
  seq += 1
  return {
    type: 'Generator',
    strategy: '',
    authority: 'Sacral',
    profile: '1/3',
    incarnationCross: '',
    definition: 'Single',
    centers: CENTER_IDS.map((id) => ({ id, defined: definedCenters.has(id) })),
    gates: [...gset].sort((a, b) => a - b).map((gate) => ({ gate, stars: [] })),
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

  it('合图第三个能量场：重新计算类型 / 定义 / 权威 / 交叉', () => {
    const r = composite(makeChart([43], []), makeChart([23], []))
    expect(r.composite.centers.find((c) => c.id === 'throat')?.defined).toBe(true)
    expect(r.composite.centers.find((c) => c.id === 'ajna')?.defined).toBe(true)
    expect(typeof r.composite.incarnationCross).toBe('string')
    expect(r.composite.incarnationCross.length).toBeGreaterThan(0)
    const chart = mergedAsChart(r)
    expect(chart.channels.some((c) => c.key === '23-43')).toBe(true)
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
