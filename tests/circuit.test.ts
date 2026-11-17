/**
 * 回路数据回归（v3.2.0）。
 *
 * 守的是三件事：
 * 1. 36 条通道**每条恰好归属一个子回路**——漏一条会让「主导回路」算错，
 *    重复归属会让两条通道互相覆盖（`CHANNEL_CIRCUIT` 是反推出来的对象）。
 * 2. 组内合计与主流口径一致（个体 15 / 集体 14 / 部落 7）。
 * 3. 有争议的两条通道按 Jovian 标准落位：10-34 属居中、20-57 属知晓（不在整合里）。
 */
import { describe, expect, it } from 'vitest'
import { CHANNELS } from '../src/engine/gateData'
import {
  CHANNEL_CIRCUIT,
  CIRCUITS,
  CIRCUIT_GROUPS,
  CIRCUIT_NOTE,
  CIRCUIT_BY_ID,
  analyzeCircuitry,
  circuitOfChannel,
  circuitryBrief,
  groupChannels,
  groupOfChannel,
} from '../src/engine/circuitData'

const ALL_KEYS = CHANNELS.map((c) => c.key).sort()

describe('回路归组：结构与总数', () => {
  it('七个回路条目、三大回路组', () => {
    expect(CIRCUITS).toHaveLength(7)
    expect(CIRCUIT_GROUPS.map((g) => g.id)).toEqual(['individual', 'collective', 'tribal'])
  })

  it('每个回路条目只含 36 通道表内的 key，且组内不重复', () => {
    for (const c of CIRCUITS) {
      const uniq = new Set(c.channels)
      expect(uniq.size, `${c.id} 内部有重复`).toBe(c.channels.length)
      for (const key of c.channels) {
        expect(ALL_KEYS, `${c.id} 含未知通道 ${key}`).toContain(key)
      }
    }
  })

  it('★ 36 条通道恰好归属一处（无遗漏、无重叠）', () => {
    const mapped = Object.keys(CHANNEL_CIRCUIT).sort()
    expect(mapped).toEqual(ALL_KEYS)
    expect(mapped).toHaveLength(36)

    const counted = CIRCUITS.flatMap((c) => c.channels)
    expect(counted).toHaveLength(36)
    expect(new Set(counted).size).toBe(36)
  })

  it('组内合计：个体 15 / 集体 14 / 部落 7', () => {
    expect(groupChannels('individual')).toHaveLength(15)
    expect(groupChannels('collective')).toHaveLength(14)
    expect(groupChannels('tribal')).toHaveLength(7)
    expect(groupChannels('individual').length + groupChannels('collective').length + groupChannels('tribal').length).toBe(36)
  })

  it('子回路条数：知晓 9 / 居中 2 / 整合 4 / 逻辑 7 / 抽象 7 / 意志 5 / 防御 2', () => {
    const counts = Object.fromEntries(CIRCUITS.map((c) => [c.id, c.channels.length]))
    expect(counts).toEqual({
      knowing: 9,
      centering: 2,
      integration: 4,
      understanding: 7,
      sensing: 7,
      ego: 5,
      defense: 2,
    })
  })
})

describe('有争议的落位（Jovian 标准口径）', () => {
  it('10-34 属居中回路，不是整合', () => {
    expect(circuitOfChannel('10-34')).toBe('centering')
    expect(CIRCUIT_BY_ID.integration.channels).not.toContain('10-34')
  })

  it('20-57 属知晓回路，不是整合', () => {
    expect(circuitOfChannel('20-57')).toBe('knowing')
    expect(CIRCUIT_BY_ID.integration.channels).not.toContain('20-57')
  })

  it('整合只有四条：10-20 / 10-57 / 20-34 / 34-57', () => {
    expect([...CIRCUIT_BY_ID.integration.channels].sort()).toEqual([
      '10-20',
      '10-57',
      '20-34',
      '34-57',
    ])
    expect(CIRCUIT_BY_ID.integration.base).toBe(false)
  })

  it('25-51 属居中回路', () => {
    expect(circuitOfChannel('25-51')).toBe('centering')
  })

  it('六个基础子回路的标记正确（整合不算基础子回路）', () => {
    const base = CIRCUITS.filter((c) => c.base).map((c) => c.id)
    expect(base.sort()).toEqual(
      ['centering', 'defense', 'ego', 'knowing', 'sensing', 'understanding'].sort(),
    )
    expect(base).toHaveLength(6)
  })

  it('部落实例抽查：19-49 属意志、6-59 属防御', () => {
    expect(circuitOfChannel('19-49')).toBe('ego')
    expect(circuitOfChannel('6-59')).toBe('defense')
    expect(circuitOfChannel('27-50')).toBe('defense')
  })

  it('集合抽查：4-63 属逻辑、47-64 属抽象', () => {
    expect(circuitOfChannel('4-63')).toBe('understanding')
    expect(circuitOfChannel('47-64')).toBe('sensing')
  })

  it('未知通道返回 null，不构造假结果', () => {
    expect(circuitOfChannel('1-2')).toBeNull()
    expect(groupOfChannel('99-100')).toBeNull()
  })
})

describe('analyzeCircuitry：只计数，不判定', () => {
  it('空盘：total 为 0、无主导、覆盖度全 0', () => {
    const a = analyzeCircuitry([])
    expect(a.total).toBe(0)
    expect(a.dominantGroup).toBeNull()
    expect(a.dominantCircuit).toBeNull()
    expect(a.tied).toBe(false)
    expect(a.groups.every((g) => g.count === 0 && g.coverage === 0)).toBe(true)
    expect(a.unknown).toEqual([])
  })

  it('单条通道归位正确', () => {
    const a = analyzeCircuitry(['20-57'])
    expect(a.total).toBe(1)
    expect(a.dominantGroup).toBe('individual')
    expect(a.dominantCircuit).toBe('knowing')
    const knowing = a.groups.find((g) => g.id === 'individual')!.circuits.find((c) => c.id === 'knowing')!
    expect(knowing.active).toEqual(['20-57'])
    expect(knowing.idle).toHaveLength(8)
    expect(knowing.coverage).toBeCloseTo(1 / 9, 5)
  })

  it('主导组按条数取最大，占比按本盘通道总数算', () => {
    const a = analyzeCircuitry(['4-63', '5-15', '16-48', '6-59'])
    expect(a.total).toBe(4)
    expect(a.dominantGroup).toBe('collective')
    expect(a.tied).toBe(false)
    const collective = a.groups.find((g) => g.id === 'collective')!
    expect(collective.count).toBe(3)
    expect(collective.share).toBeCloseTo(0.75, 5)
    expect(collective.coverage).toBeCloseTo(3 / 14, 5)
    // 防御只有 1 条已激活，覆盖 1/2
    const defense = a.groups.find((g) => g.id === 'tribal')!.circuits.find((c) => c.id === 'defense')!
    expect(defense.coverage).toBeCloseTo(0.5, 5)
  })

  it('★ 并列第一不给「主导」结论（tied=true 且 id 为 null）', () => {
    const a = analyzeCircuitry(['4-63', '6-59'])
    expect(a.tied).toBe(true)
    expect(a.dominantGroup).toBeNull()
  })

  it('表外通道被显式暴露，而不是静默丢弃', () => {
    const a = analyzeCircuitry(['4-63', '1-2'])
    expect(a.unknown).toEqual(['1-2'])
    expect(a.total).toBe(2)
  })

  it('重复传入同一通道不会重复计数', () => {
    const a = analyzeCircuitry(['4-63', '4-63'])
    expect(a.total).toBe(1)
    expect(a.groups.find((g) => g.id === 'collective')!.count).toBe(1)
  })

  it('每个组都带齐自己的子回路，且子回路顺序与 CIRCUITS 一致', () => {
    const a = analyzeCircuitry([])
    expect(a.groups[0].circuits.map((c) => c.id)).toEqual(['knowing', 'centering', 'integration'])
    expect(a.groups[1].circuits.map((c) => c.id)).toEqual(['understanding', 'sensing'])
    expect(a.groups[2].circuits.map((c) => c.id)).toEqual(['ego', 'defense'])
  })
})

describe('circuitryBrief 与口径说明', () => {
  it('空盘给出明确说明而不是「无」', () => {
    expect(circuitryBrief(analyzeCircuitry([]))).toContain('没有形成完整通道')
  })

  it('有通道时含主导项与覆盖度', () => {
    const brief = circuitryBrief(analyzeCircuitry(['1-8', '20-57', '4-63']))
    expect(brief).toContain('回路分布：')
    expect(brief).toContain('主导=个体')
    expect(brief).toContain('覆盖度')
    expect(brief).toContain('个体 2/15')
  })

  it('并列时不写主导结论', () => {
    const brief = circuitryBrief(analyzeCircuitry(['1-8', '4-63']))
    expect(brief).toContain('并列')
    expect(brief).not.toContain('主导=')
  })

  it('口径说明写明「不参与类型/权威判定」与整合通道的体系分歧', () => {
    expect(CIRCUIT_NOTE).toContain('不参与')
    expect(CIRCUIT_NOTE).toContain('整合通道')
    expect(CIRCUIT_NOTE).toContain('10-34')
    expect(CIRCUIT_NOTE).toContain('20-57')
  })
})
