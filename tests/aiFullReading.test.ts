/**
 * 需求 #9 回归：完整版任务清单、融合输入裁剪、融合拆分，以及多轮编排策略。
 *
 * 编排测试用 vi.mock 替换 explain()（只替换网络调用，其余 aiClient 导出保持真实），
 * 因此不发真实请求、不产生任何伪造解读内容；断言的是「调用次数 / 顺序 / 失败策略」。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import { AiError } from '../src/services/aiClient'
import {
  FUSION_EXCERPT_CHARS,
  buildFullTasks,
  buildFusionInput,
  runFullReading,
  splitFusion,
  type FullReadingUpdate,
} from '../src/services/aiFullReading'
import { READING_ANGLES } from '../src/services/readingAngles'
import { GATE_NAMES } from '../src/engine/gateData'
import type { AiConfig, BodyGraph, CenterId } from '../src/types/hd'
import type { AiExplainArgs } from '../src/services/aiClient'
import type { FullReportSection } from '../src/types/report'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key-1234',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

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

/** 手工构造的小盘：3 个激活闸门 + 1 条通道，任务数固定为 8+3+1=12 */
const CHART: BodyGraph = {
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
    { gate: 13, stars: ['Moon'], state: 'hanging' },
  ],
  channels: [{ key: '20-34', gates: [20, 34] }],
  hangingGates: [13],
  personality: [
    { planet: 'Sun', longitude: 0, gate: 34, line: 1, color: 1, tone: 1, base: 1 },
  ],
  design: [{ planet: 'Moon', longitude: 0, gate: 13, line: 2, color: 1, tone: 1, base: 1 }],
  meta: {
    personalityTime: '1990-05-21T05:30:00.000Z',
    designTime: '1990-02-21T05:30:00.000Z',
    personalitySun: 34,
    designSun: 13,
  },
}

const FUSION_TEXT =
  '## 1. 全盘整合分析\n\n整合正文\n\n## 5. 最终总结论\n\n总结正文'

function sections(...items: Array<Partial<FullReportSection>>): FullReportSection[] {
  return items.map((s, i) => ({
    kind: 'dimension' as const,
    key: `k${i}`,
    title: `分项 ${i}`,
    content: `正文 ${i}`,
    ...s,
  }))
}

beforeEach(() => {
  explainMock.mockReset()
})

/* ── 任务清单 ─────────────────────────────────────────── */

describe('buildFullTasks', () => {
  it('8 维度 + 逐闸门 + 逐通道，顺序固定、key 唯一', () => {
    const tasks = buildFullTasks(CHART)
    expect(tasks).toHaveLength(8 + 3 + 1)
    expect(tasks.slice(0, 8).map((t) => t.title)).toEqual(READING_ANGLES.map((a) => a.label))
    expect(tasks.slice(0, 8).every((t) => t.kind === 'dimension' && t.scope === 'full-dimension')).toBe(true)
    expect(tasks.slice(8, 11).every((t) => t.kind === 'gate' && t.scope === 'full-gate')).toBe(true)
    expect(tasks[11]).toMatchObject({ key: 'channel:20-34', kind: 'channel', scope: 'full-channel' })
    expect(new Set(tasks.map((t) => t.key)).size).toBe(tasks.length)
  })

  it('离线事实只用项目既有释义：含分项标题、中心状态、闸门与通道，不新增术语', () => {
    const tasks = buildFullTasks(CHART)
    const gate = tasks.find((t) => t.key === 'gate:13')!
    expect(gate.title).toBe(`闸门 13 · ${GATE_NAMES[13].zh}`)
    expect(gate.offline).toContain('【本次分项】闸门 13')
    expect(gate.offline).toContain('【九大中心离线释义】')
    // 13 只在 design(Moon) 里 → 设计侧；34 在 personality(Sun) 里 → 人格侧
    expect(gate.offline).toContain('设计侧（潜意识）')
    expect(tasks.find((t) => t.key === 'gate:34')!.offline).toContain('人格侧（显意识）')

    const channel = tasks[11]
    expect(channel.offline).toContain('【本次分项】通道 20-34')
    expect(channel.offline).toContain('【两端中心】')
    expect(tasks.every((t) => t.offline.includes('【轮回交叉】'))).toBe(true)
  })
})

/* ── 融合输入与拆分 ───────────────────────────────────── */

describe('buildFusionInput / splitFusion', () => {
  it('每项只注入前 300 字要点 + 标题，并注明完整分项已在报告中', () => {
    const long = '甲'.repeat(1000)
    const input = buildFusionInput(sections({ title: '综合解读', content: long }), [])
    expect(input).toContain('完整分项已在报告中')
    expect(input).toContain('### 1. 综合解读（维度）')
    const excerpt = input.split('### 1. 综合解读（维度）')[1].trim()
    expect(excerpt.length).toBeLessThanOrEqual(FUSION_EXCERPT_CHARS + 2)
    expect(input).not.toContain('甲'.repeat(301))
  })

  it('跳过的分项明确列出，并要求模型不要据此推断', () => {
    const input = buildFusionInput(sections({ content: '正文' }), ['闸门 62'])
    expect(input).toContain('【未完成分项】闸门 62')
    expect(input).toContain('请勿据此推断')
  })

  it('splitFusion 把「最终总结论」拆出来，不新增内容', () => {
    const r = splitFusion(FUSION_TEXT)
    expect(r.fusion).toContain('整合正文')
    expect(r.fusion).not.toContain('最终总结论')
    expect(r.summary).toContain('最终总结论')
    expect(r.summary).toContain('总结正文')
    // 只做拆分与首尾 trim，重新拼接后内容逐字不变
    expect(`${r.fusion}\n\n${r.summary}`).toBe(FUSION_TEXT)
  })

  it('融合输出没有该标题时，summary 为空且全文归 fusion', () => {
    expect(splitFusion('## 全盘整合分析\n\n正文')).toEqual({
      fusion: '## 全盘整合分析\n\n正文',
      summary: '',
    })
  })
})

/* ── 编排策略（Q3.4）────────────────────────────────── */

describe('runFullReading 编排', () => {
  it('串行全部成功：12 分项 + 1 融合，顺序不变、进度到 13/13', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) =>
      args.scope === 'full-fusion' ? FUSION_TEXT : `【${args.ref}】分项正文`,
    )
    const updates: FullReadingUpdate[] = []
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      stepMode: 'serial',
      onUpdate: (u) => updates.push(u),
    })
    expect(explainMock).toHaveBeenCalledTimes(13)
    expect(report.sections).toHaveLength(12)
    expect(report.sections[0].kind).toBe('dimension')
    expect(report.sections[8].kind).toBe('gate')
    expect(report.sections[11].kind).toBe('channel')
    expect(report.fusion).toContain('整合正文')
    expect(report.summary).toContain('总结正文')
    expect(report.totalChars).toBeGreaterThan(0)
    expect(report.skipped).toEqual([])

    const fusionCall = explainMock.mock.calls.find((c) => c[0].scope === 'full-fusion')!
    expect(fusionCall[0].offline).toContain('完整分项已在报告中')
    expect(fusionCall[0].chartSummary).toContain('九中心')
    expect(updates[0].progress.total).toBe(13)
    expect(updates[0].progress.etaMs).toBeNull()
    const last = updates[updates.length - 1]
    expect(last.progress.done).toBe(13)
    expect(last.progress.phase).toBe('已完成')
  })

  it('单项失败：重试 1 次后跳过继续，其余分项与融合仍产出', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (args.ref === 'gate:13') throw new Error('网络错误')
      return args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'
    })
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      stepMode: 'serial',
    })
    expect(explainMock.mock.calls.filter((c) => c[0].ref === 'gate:13')).toHaveLength(2)
    expect(report.sections).toHaveLength(11)
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]).toContain('闸门 13')
    expect(report.fusion).toContain('整合正文')
  })

  it('并发失败自动切串行，失败项重新排队并最终成功', async () => {
    let growthCalls = 0
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (args.ref === 'dimension:growth') {
        growthCalls += 1
        if (growthCalls <= 2) throw new Error('并发失败')
      }
      return args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'
    })
    const updates: FullReadingUpdate[] = []
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      stepMode: 'parallel',
      onUpdate: (u) => updates.push(u),
    })
    expect(updates.some((u) => u.progress.phase.includes('并发失败'))).toBe(true)
    expect(updates.some((u) => u.progress.phase === '分项解读（串行）')).toBe(true)
    expect(growthCalls).toBe(3) // 并发 2 次（含重试） + 串行重跑 1 次
    expect(report.sections).toHaveLength(12)
    expect(report.skipped).toEqual([])
  })

  it('融合失败不伪造：跳过该项，报告仍由 12 个分项构成', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (args.scope === 'full-fusion') throw new Error('融合失败')
      return '分项正文'
    })
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      stepMode: 'serial',
    })
    expect(explainMock.mock.calls.filter((c) => c[0].scope === 'full-fusion')).toHaveLength(2)
    expect(report.sections).toHaveLength(12)
    expect(report.fusion).toBe('')
    expect(report.summary).toBe('')
    expect(report.skipped).toContain('全盘整合与最终总结论')
  })

  it('全程可取消：abort 后抛 cancelled，且不写任何伪造内容', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(async () => {
      controller.abort()
      return '不应被采用的内容'
    })
    await expect(
      runFullReading({
        cfg: CFG,
        chart: CHART,
        title: '测试盘',
        stepMode: 'serial',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(explainMock).toHaveBeenCalledTimes(1)
  })

  it('取消错误由 AiError 暴露，kind=cancelled', () => {
    expect(new AiError('已取消', 'cancelled')).toMatchObject({ kind: 'cancelled' })
  })
})
