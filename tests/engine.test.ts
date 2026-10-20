/**
 * 引擎校验测试。
 * 金标准来自 free-human-design（rave-engine 血统，其 26 个激活点已对齐 Swiss Ephemeris）。
 * 这些样本覆盖：东亚时区、北美时区、欧洲时区、跨年/闰年边界。
 */
import { describe, expect, it } from 'vitest'
import { gateStartLongitude, mapLongitude } from '../src/engine/mandala'
import { computeChart } from '../src/engine/bodygraph'
import { composite } from '../src/engine/composite'
import type { Authority, BirthInput, HDType } from '../src/types/hd'
import { zonedToUtc } from '../src/engine/time'

interface Golden {
  input: BirthInput
  utc: string
  personality: string[]
  design: string[]
  type: HDType
  authority: Authority
  profile: string
  gates: number[]
  channels: string[]
  centers: string[]
}

const GOLDEN: Golden[] = [
  {
    input: {
      year: 1990, month: 5, day: 21, hour: 14, minute: 30, second: 0,
      timezone: 'Asia/Shanghai', lat: 31.23, lng: 121.47,
    },
    utc: '1990-05-21T05:30:00.000Z',
    personality: ['Sun:8.6', 'Earth:14.6', 'Moon:21.5', 'NorthNode:19.3', 'SouthNode:33.3', 'Mercury:24.1', 'Venus:51.5', 'Mars:22.6', 'Jupiter:39.2', 'Saturn:61.5', 'Uranus:58.6', 'Neptune:38.6', 'Pluto:1.3'],
    design: ['Sun:55.2', 'Earth:59.2', 'Moon:58.3', 'NorthNode:13.4', 'SouthNode:7.4', 'Mercury:19.6', 'Venus:61.4', 'Mars:54.2', 'Jupiter:15.3', 'Saturn:61.1', 'Uranus:58.5', 'Neptune:38.5', 'Pluto:1.5'],
    type: 'Projector',
    authority: 'Emotional',
    profile: '6/2',
    gates: [1, 7, 8, 13, 14, 15, 19, 21, 22, 24, 33, 38, 39, 51, 54, 55, 58, 59, 61],
    channels: ['1-8', '13-33', '24-61', '39-55'],
    centers: ['head', 'ajna', 'throat', 'g', 'solar', 'root'],
  },
  {
    input: {
      year: 1972, month: 8, day: 2, hour: 10, minute: 20, second: 0,
      timezone: 'America/New_York', lat: 40.71, lng: -74.0,
    },
    utc: '1972-08-02T14:20:00.000Z',
    personality: ['Sun:33.3', 'Earth:19.3', 'Moon:2.1', 'NorthNode:61.6', 'SouthNode:62.6', 'Mercury:4.1', 'Venus:12.6', 'Mars:4.4', 'Jupiter:10.2', 'Saturn:45.1', 'Uranus:48.6', 'Neptune:34.3', 'Pluto:46.2'],
    design: ['Sun:24.6', 'Earth:44.6', 'Moon:11.6', 'NorthNode:60.4', 'SouthNode:56.4', 'Mercury:51.1', 'Venus:12.3', 'Mars:12.2', 'Jupiter:58.5', 'Saturn:16.1', 'Uranus:57.1', 'Neptune:34.5', 'Pluto:46.2'],
    type: 'ManifestingGenerator',
    authority: 'Sacral',
    profile: '3/6',
    gates: [2, 4, 10, 11, 12, 16, 19, 24, 33, 34, 44, 45, 46, 48, 51, 56, 57, 58, 60, 61, 62],
    channels: ['10-34', '10-57', '11-56', '16-48', '24-61', '34-57'],
    centers: ['head', 'ajna', 'throat', 'g', 'sacral', 'spleen'],
  },
  {
    input: {
      year: 2001, month: 2, day: 3, hour: 23, minute: 45, second: 0,
      timezone: 'Asia/Shanghai', lat: 39.9, lng: 116.4,
    },
    utc: '2001-02-03T15:45:00.000Z',
    personality: ['Sun:13.2', 'Earth:7.2', 'Moon:16.6', 'NorthNode:53.1', 'SouthNode:54.1', 'Mercury:55.1', 'Venus:25.3', 'Mars:43.6', 'Jupiter:20.2', 'Saturn:23.6', 'Uranus:49.2', 'Neptune:41.5', 'Pluto:5.4'],
    design: ['Sun:1.4', 'Earth:2.4', 'Moon:21.1', 'NorthNode:53.3', 'SouthNode:54.3', 'Mercury:50.4', 'Venus:11.3', 'Mars:46.6', 'Jupiter:16.4', 'Saturn:8.5', 'Uranus:13.4', 'Neptune:41.3', 'Pluto:5.1'],
    type: 'Projector',
    authority: 'SelfProjected',
    profile: '2/4',
    gates: [1, 2, 5, 7, 8, 11, 13, 16, 20, 21, 23, 25, 41, 43, 46, 49, 50, 53, 54, 55],
    channels: ['1-8', '23-43'],
    centers: ['ajna', 'throat', 'g'],
  },
  {
    input: {
      year: 1964, month: 12, day: 31, hour: 4, minute: 5, second: 0,
      timezone: 'Europe/Berlin', lat: 52.52, lng: 13.4,
    },
    utc: '1964-12-31T03:05:00.000Z',
    personality: ['Sun:58.6', 'Earth:52.6', 'Moon:9.5', 'NorthNode:12.1', 'SouthNode:11.1', 'Mercury:26.2', 'Venus:5.4', 'Mars:6.1', 'Jupiter:2.4', 'Saturn:55.2', 'Uranus:64.4', 'Neptune:43.1', 'Pluto:64.6'],
    design: ['Sun:48.3', 'Earth:21.3', 'Moon:46.2', 'NorthNode:12.4', 'SouthNode:11.4', 'Mercury:46.6', 'Venus:29.5', 'Mars:33.5', 'Jupiter:8.1', 'Saturn:30.5', 'Uranus:64.2', 'Neptune:1.4', 'Pluto:64.4'],
    type: 'ManifestingGenerator',
    authority: 'Sacral',
    profile: '6/3',
    gates: [1, 2, 5, 6, 8, 9, 11, 12, 21, 26, 29, 30, 33, 43, 46, 48, 52, 55, 58, 64],
    channels: ['1-8', '9-52', '29-46'],
    centers: ['throat', 'g', 'sacral', 'root'],
  },
]

const fmt = (list: Array<{ planet: string; gate: number; line: number }>) =>
  list.map((p) => `${p.planet}:${p.gate}.${p.line}`)

describe('曼陀罗盘序', () => {
  it('闸门起点与权威实现一致（含 29.8333° 偏移）', () => {
    expect(gateStartLongitude(17)).toBeCloseTo(3.9167, 3)
    expect(gateStartLongitude(41)).toBeCloseTo(302.0417, 3)
    expect(gateStartLongitude(1)).toBeCloseTo(223.2917, 3)
    expect(gateStartLongitude(8)).toBeCloseTo(54.5417, 3)
    expect(gateStartLongitude(55)).toBeCloseTo(330.1667, 3)
    expect(gateStartLongitude(36)).toBeCloseTo(352.6667, 3)
  })

  it('闸门内可细分到 6 爻 / 6 颜色 / 6 音调 / 5 基底', () => {
    const pos = mapLongitude(gateStartLongitude(17) + 0.0001)
    expect(pos.gate).toBe(17)
    expect(pos.line).toBe(1)
    expect(pos.color).toBe(1)
    expect(pos.tone).toBe(1)
    expect(pos.base).toBe(1)

    const last = mapLongitude(gateStartLongitude(17) + 5.6249)
    expect(last.gate).toBe(17)
    expect(last.line).toBe(6)
    expect(last.color).toBe(6)
    expect(last.tone).toBe(6)
    expect(last.base).toBe(5)
  })

  it('64 个闸门在 360° 内均匀分布', () => {
    const seen = new Set<number>()
    for (let d = 0; d < 360; d += 0.05) seen.add(mapLongitude(d).gate)
    expect(seen.size).toBe(64)
  })
})

describe('时区归一化', () => {
  it('中国 / 北美 / 欧洲本地时转 UTC 正确', () => {
    // 1990-05 中国仍实行夏令时（1986–1991），当地为 UTC+9：14:30 → 05:30Z
    expect(zonedToUtc(1990, 5, 21, 14, 30, 0, 'Asia/Shanghai').date.toISOString()).toBe(
      '1990-05-21T05:30:00.000Z',
    )
    // 冬令时（1990-01）：UTC+8
    expect(zonedToUtc(1990, 1, 21, 14, 30, 0, 'Asia/Shanghai').date.toISOString()).toBe(
      '1990-01-21T06:30:00.000Z',
    )
    expect(zonedToUtc(1972, 8, 2, 10, 20, 0, 'America/New_York').date.toISOString()).toBe(
      '1972-08-02T14:20:00.000Z',
    )
    expect(zonedToUtc(1964, 12, 31, 4, 5, 0, 'Europe/Berlin').date.toISOString()).toBe(
      '1964-12-31T03:05:00.000Z',
    )
  })
})

describe('排盘结果对齐金标准', () => {
  for (const g of GOLDEN) {
    it(`${g.input.year}-${g.input.month}-${g.input.day} ${g.input.timezone}`, () => {
      const chart = computeChart(g.input)
      expect(chart.meta.personalityTime).toBe(g.utc)
      expect(fmt(chart.personality)).toEqual(g.personality)
      expect(fmt(chart.design)).toEqual(g.design)
      expect(chart.profile).toBe(g.profile)
      expect(chart.type).toBe(g.type)
      expect(chart.authority).toBe(g.authority)
      expect(chart.gates.map((x) => x.gate)).toEqual(g.gates)
      expect(chart.channels.map((c) => c.key)).toEqual(g.channels)
      expect(chart.centers.filter((c) => c.defined).map((c) => c.id).sort()).toEqual(
        [...g.centers].sort(),
      )
    })
  }
})

describe('合盘', () => {
  it('归属划分正确且不改动原始数据', () => {
    const a = computeChart(GOLDEN[0].input)
    const b = computeChart(GOLDEN[1].input)
    const before = JSON.stringify(a)
    const result = composite(a, b)

    for (const g of result.merged.gates) {
      const inA = a.gates.some((x) => x.gate === g.gate)
      const inB = b.gates.some((x) => x.gate === g.gate)
      expect(g.owners).toEqual(
        inA && inB ? ['a', 'b'] : inA ? ['a'] : ['b'],
      )
    }
    expect(result.sharedChannels.every((c) => c.key in result.channelOwners)).toBe(true)
    expect(result.sharedGates.length).toBe(
      a.gates.filter((g) => b.gates.some((x) => x.gate === g.gate)).length,
    )
    // 合盘是纯函数，不得修改入参
    expect(JSON.stringify(a)).toBe(before)
  })
})
