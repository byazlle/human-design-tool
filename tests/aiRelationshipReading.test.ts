/**
 * 关系场（合盘 / 双盘对比）「完整」档多轮编排回归。
 *
 * 重点验证规范 §3.8：合盘不输出类型 / 内在权威 / 定义型 / 轮回交叉，
 * 且完整版编排注入的任务清单、事实块、摘要与融合角度真的生效。
 * explain() 用 vi.mock 替换，不发真实请求、不伪造任何 AI 解读内容。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import { composite, mergedAsChart } from '../src/engine/composite'
import { GATE_CENTER } from '../src/engine/gateData'
import { COMPOSITE_DIMENSIONS, customDimension } from '../src/services/compositeDimensions'
import {
  buildRelationshipTasks,
  relationshipFactBlock,
  relationshipFullPlan,
  relationshipSummary,
} from '../src/services/aiRelationshipReading'
import { buildFullTasks, runFullReading } from '../src/services/aiFullReading'
import { CENTER_IDS } from '../src/types/hd'
import type { AiConfig, BodyGraph, CenterId } from '../src/types/hd'
import type { AiExplainArgs } from '../src/services/aiClient'
import type { CompositeResult } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key-1234',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

/** 与 tests/composite.test.ts 同构的最小单人盘 fixture */
function makeChart(gates: number[], channels: Array<[number, number]>): BodyGraph {
  const gset = new Set(gates)
  for (const [a, b] of channels) {
    gset.add(a)
    gset.add(b)
  }
  const definedCenters = new Set<CenterId>()
  for (const g of gset) definedCenters.add(GATE_CENTER[g])
  const channelGates = new Set<number>(channels.flat())
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
    personality: [{ planet: 'Sun', longitude: 0, gate: 1, line: 3, color: 1, tone: 1, base: 1 }],
    design: [{ planet: 'Sun', longitude: 90, gate: 41, line: 3, color: 1, tone: 1, base: 1 }],
    meta: {
      personalityTime: '2000-01-01T00:00:00.000Z',
      designTime: '2000-01-01T00:00:00.000Z',
      personalitySun: 0,
      designSun: 90,
    },
  }
}

const A = makeChart([], [[1, 8], [2, 14]])
const B = makeChart([], [[1, 8], [3, 60]])
const PAIR = { a: '甲', b: '乙' }

function pair(): CompositeResult {
  return composite(A, B)
}

beforeEach(() => {
  explainMock.mockReset()
})

describe('关系场合规事实', () => {
  it('摘要只含关系场信息，不出现个体结论与占位值', () => {
    const r = pair()
    const s = relationshipSummary(r, PAIR)
    expect(s).toContain('合盘双方：甲')
    expect(s).toContain('双方人生角色：A 1/3 × B 1/3')
    expect(s).toContain('中心四象限')
    expect(s).toContain('关系通道：电磁')
    expect(s).not.toMatch(/【类型】|【内在权威】|定义型：|【轮回交叉】|undefined/)
  })

  it('事实块不出现渲染占位值，含口径约束与四类动力学', () => {
    const r = pair()
    const f = relationshipFactBlock(r, PAIR)
    expect(f).toContain('【口径约束】')
    expect(f).toContain('【四类关系通道】')
    expect(f).toContain('【中心四象限（关系影响方向）】')
    expect(f).toContain('【九大中心离线释义（合并盘）】')
    expect(f).toContain('共享闸门：')
    expect(f).not.toMatch(/【类型】|【内在权威】|【轮回交叉】|undefined/)
  })

  it('默认单人编排遇到合图时自动切关系场事实块（守卫生效）', () => {
    const r = pair()
    const tasks = buildFullTasks(mergedAsChart(r))
    const all = tasks.map((t) => t.offline).join('\n')
    expect(all).toContain('【关系场】')
    expect(all).toContain('个体层面的结论不进入关系场')
    expect(all).not.toMatch(/【类型】|【内在权威】|定义型：|undefined/)
  })
})

describe('关系场任务清单', () => {
  it('顺序固定：合盘维度 → 四类动力学 → 逐共享闸门 → 逐合并通道；key 唯一', () => {
    const r = pair()
    const tasks = buildRelationshipTasks(r, PAIR)
    const dimCount = COMPOSITE_DIMENSIONS.length
    const dynCount = 4
    expect(tasks.slice(0, dimCount).map((t) => t.title)).toEqual(
      COMPOSITE_DIMENSIONS.map((d) => d.label),
    )
    expect(tasks.slice(0, dimCount).every((t) => t.kind === 'dimension' && t.scope === 'full-dimension')).toBe(true)
    expect(tasks.slice(dimCount, dimCount + dynCount).every((t) => t.key.startsWith('dynamic:'))).toBe(true)
    const rest = tasks.slice(dimCount + dynCount)
    expect(rest.filter((t) => t.kind === 'gate').map((t) => t.key)).toEqual(
      r.sharedGates.map((g) => `gate:${g}`),
    )
    expect(rest.filter((t) => t.kind === 'channel').map((t) => t.key)).toEqual(
      r.merged.channels.map((c) => `channel:${c.key}`),
    )
    expect(new Set(tasks.map((t) => t.key)).size).toBe(tasks.length)
    expect(tasks.every((t) => t.offline.includes('【口径约束】'))).toBe(true)
    expect(tasks.every((t) => !/【类型】|【内在权威】/.test(t.offline))).toBe(true)
  })

  it('自定义议题作为额外维度接入，且不改变既有维度顺序', () => {
    const r = pair()
    const custom = customDimension('异地协作')
    const tasks = buildRelationshipTasks(r, PAIR, [custom])
    expect(tasks[COMPOSITE_DIMENSIONS.length].key).toBe('dimension:custom')
    expect(tasks[COMPOSITE_DIMENSIONS.length].offline).toContain('异地协作')
    expect(tasks[COMPOSITE_DIMENSIONS.length + 1].key.startsWith('dynamic:')).toBe(true)
  })

  it('关系场完整计划四要素齐全，融合角度标明关系场', () => {
    const r = pair()
    const plan = relationshipFullPlan(r, { pairNames: PAIR })
    expect(plan.tasks?.length).toBeGreaterThan(COMPOSITE_DIMENSIONS.length + 4)
    expect(plan.factBlock).toContain('【口径约束】')
    expect(plan.summary).toContain('合盘双方：甲')
    expect(plan.fusionAngle).toContain('关系场')
  })
})

describe('完整版编排注入', () => {
  it('注入的任务清单 / 摘要 / 融合角度全部生效，报告按任务原序输出', async () => {
    explainMock.mockImplementation((args: AiExplainArgs) =>
      Promise.resolve(`内容：${args.scope} / ${args.ref}`),
    )
    const r = pair()
    const plan = relationshipFullPlan(r, { pairNames: PAIR })
    const report = await runFullReading({
      cfg: CFG,
      chart: mergedAsChart(r),
      title: '合盘解读 · 完整版',
      stepMode: 'serial',
      ...plan,
    })

    expect(explainMock).toHaveBeenCalledTimes(plan.tasks!.length + 1)
    const calls = explainMock.mock.calls.map((c) => c[0] as AiExplainArgs)
    expect(calls.every((c) => c.chartSummary === plan.summary)).toBe(true)
    expect(calls[0].offline).toContain('【口径约束】')
    expect(calls[0].detailMode).toBe('full')
    const fusion = calls.find((c) => c.scope === 'full-fusion')!
    expect(fusion.angle).toBe(plan.fusionAngle)
    expect(report.sections).toHaveLength(plan.tasks!.length)
    expect(report.sections[0].key).toBe(plan.tasks![0].key)
    expect(report.skipped).toEqual([])
  })
})
