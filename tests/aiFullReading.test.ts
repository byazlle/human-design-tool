/**
 * 完整档编排回归（v4.0.0）：`runFullReading` 现在是 `aiReadingRunner` 的薄适配层。
 *
 * 断言三件事：
 * 1. 请求清单由计划器决定（八大维度各 1 篇 + 1 融合），融合**最后单独执行且只 1 次**；
 * 2. 分项失败只进 `skipped`，不伪造内容，报告仍由其他分项构成；
 * 3. `onUpdate` 的 `progress` 恒为旧契约的 **8 字段 AiProgress**（`inFlight` / `maxConcurrency`
 *    属于 `ReadingProgress`，不得漏进 `AiProgress`）。
 *
 * `explain()` 用 `vi.mock` 替换（只换网络调用，其余 aiClient 导出保持真实），不发真实请求。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import {
  FUSION_EXCERPT_CHARS,
  buildFusionInput,
  buildPlanFromOptions,
  resolveMaxConcurrencyOf,
  runFullReading,
  splitFusion,
  toAiProgress,
  type FullReadingUpdate,
  type FullTask,
} from '../src/services/aiFullReading'
import { DEFAULT_AI_MAX_CONCURRENCY } from '../src/services/aiConcurrency'
import type { AiConfig, BodyGraph, CenterId, Planet } from '../src/types/hd'
import type { AiExplainArgs } from '../src/services/aiClient'
import type { FullReportSection } from '../src/types/report'
import type { ReadingProgress } from '../src/types/aiReading'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key-1234',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const CENTERS: CenterId[] = ['head', 'ajna', 'throat', 'g', 'heart', 'sacral', 'spleen', 'solar', 'root']

function star(planet: Planet, gate: number, line = 1) {
  return { planet, longitude: 0, gate, line, color: 1, tone: 1, base: 1 } as const
}

/** 小盘：3 个激活闸门 + 1 条通道；八大维度 → 8 个任务，融合 1 个 → 共 9 次请求 */
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
  personality: [star('Sun', 34), star('Earth', 20, 4)],
  design: [star('Sun', 20, 2), star('Earth', 34, 5), star('Moon', 13, 2)],
  meta: {
    personalityTime: '1990-05-21T05:30:00.000Z',
    designTime: '1990-02-21T05:30:00.000Z',
    personalitySun: 34,
    designSun: 13,
  },
}

const FUSION_TEXT = '## 1. 全盘整合分析\n\n整合正文\n\n## 5. 最终总结论\n\n总结正文'

/** 八大维度 + 1 融合 */
const DIM_TASKS = 8
const TOTAL_REQUESTS = DIM_TASKS + 1

function sections(...items: Array<Partial<FullReportSection>>): FullReportSection[] {
  return items.map((s, i) => ({
    kind: 'dimension' as const,
    key: `k${i}`,
    title: `分项 ${i}`,
    content: `正文 ${i}`,
    ...s,
  }))
}

const AI_PROGRESS_KEYS = [
  'current',
  'done',
  'elapsedMs',
  'etaMs',
  'failed',
  'phase',
  'skipped',
  'total',
]

beforeEach(() => {
  explainMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ── 融合输入与拆分（纯函数，契约不变）────────────────── */

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
    expect(r.summary).toContain('总结正文')
    expect(`${r.fusion}\n\n${r.summary}`).toBe(FUSION_TEXT)
  })

  it('融合输出没有该标题时，summary 为空且全文归 fusion', () => {
    expect(splitFusion('## 全盘整合分析\n\n正文')).toEqual({
      fusion: '## 全盘整合分析\n\n正文',
      summary: '',
    })
  })
})

/* ── 并发数与进度适配 ───────────────────────────────── */

describe('并发数与进度适配', () => {
  it('maxConcurrency 优先；旧 aiConcurrency 回落；serial 等价 1；缺省 3', () => {
    expect(resolveMaxConcurrencyOf({ maxConcurrency: 5, aiConcurrency: 8 })).toBe(5)
    expect(resolveMaxConcurrencyOf({ aiConcurrency: 8 })).toBe(8)
    expect(resolveMaxConcurrencyOf({ stepMode: 'serial', maxConcurrency: 5 })).toBe(1)
    expect(resolveMaxConcurrencyOf({})).toBe(DEFAULT_AI_MAX_CONCURRENCY)
    // 旧的「并发上限」不再参与任何计算（resolveMaxConcurrencyOf 只认 maxConcurrency / aiConcurrency）
    expect(resolveMaxConcurrencyOf({ aiConcurrency: 6 })).toBe(6)
  })

  it('toAiProgress 只输出旧契约的 8 字段（inFlight / maxConcurrency 不外泄）', () => {
    const reading: ReadingProgress = {
      done: 3,
      total: 9,
      current: '模块①',
      phase: '最高并发数 3 · 在跑 3 / 总 9',
      elapsedMs: 1234,
      etaMs: 500,
      skipped: ['a'],
      failed: ['b'],
      inFlight: 3,
      maxConcurrency: 3,
    }
    const progress = toAiProgress(reading)
    expect(Object.keys(progress).sort()).toEqual(AI_PROGRESS_KEYS)
    expect(progress).toMatchObject({ done: 3, total: 9, etaMs: 500 })
  })
})

/* ── 计划装配 ───────────────────────────────────────── */

describe('buildPlanFromOptions', () => {
  it('单人整盘：八大维度各 1 篇 + 融合，title 用调用方给的报告标题', () => {
    const plan = buildPlanFromOptions(
      { cfg: CFG, chart: CHART, title: '张三 · 全盘', fusionAngle: '全盘整合分析与最终总结论' },
      'pro',
    )
    expect(plan.tasks).toHaveLength(DIM_TASKS)
    expect(plan.tasks.every((t) => t.scope === 'full-dimension')).toBe(true)
    expect(plan.fusion).toMatchObject({ scope: 'full-fusion', title: '全盘整合分析与最终总结论' })
    expect(plan.title).toBe('张三 · 全盘')
    expect(plan.singleShot).toBe(false)
  })

  it('注入 tasks（关系场/自定义）：任务与顺序原样保留，只补 1 个融合', () => {
    const tasks: FullTask[] = [
      { key: 'dimension:love', title: '关系主题', kind: 'dimension', scope: 'full-dimension', offline: 'A' },
      { key: 'gate:13', title: '共享闸门 13', kind: 'gate', scope: 'full-gate', offline: 'B' },
    ]
    const plan = buildPlanFromOptions(
      { cfg: CFG, chart: CHART, title: '合盘', tasks, fusionAngle: '关系场整合分析与最终总结论' },
      'plain',
    )
    expect(plan.tasks.map((t) => [t.key, t.scope])).toEqual([
      ['dimension:love', 'full-dimension'],
      ['gate:13', 'full-gate'],
    ])
    expect(plan.fusion).toMatchObject({ key: 'fusion', title: '关系场整合分析与最终总结论' })
  })
})

/* ── 编排 ───────────────────────────────────────────── */

describe('runFullReading 编排（走 runner）', () => {
  it('串行全部成功：分项按计划顺序、融合最后 1 次、进度 8 字段到终态', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) =>
      args.scope === 'full-fusion' ? FUSION_TEXT : `【${args.ref}】分项正文`,
    )
    const updates: FullReadingUpdate[] = []
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      maxConcurrency: 1,
      onUpdate: (u) => updates.push(u),
    })

    expect(explainMock).toHaveBeenCalledTimes(TOTAL_REQUESTS)
    // ★ 融合是最后一次调用，且只调用 1 次
    const scopes = explainMock.mock.calls.map((c) => c[0].scope as string)
    expect(scopes.filter((s) => s === 'full-fusion')).toHaveLength(1)
    expect(scopes[scopes.length - 1]).toBe('full-fusion')

    expect(report.sections).toHaveLength(DIM_TASKS)
    expect(report.sections.every((s) => s.kind === 'dimension')).toBe(true)
    expect(report.fusion).toContain('整合正文')
    expect(report.summary).toContain('总结正文')
    expect(report.skipped).toEqual([])
    expect(report.entry).toBe('composite')
    expect(report.totalChars).toBeGreaterThan(0)

    // 融合离线正文里带「未完成分项」声明与分项要点
    const fusionCall = explainMock.mock.calls.find((c) => c[0].scope === 'full-fusion')!
    expect(fusionCall[0].offline).toContain('完整分项已在报告中')
    expect(fusionCall[0].chartSummary).toContain('九中心')

    // ★ onUpdate.progress 恒为 8 字段（任何一帧都不许多字段）
    expect(updates.length).toBeGreaterThan(1)
    for (const u of updates) expect(Object.keys(u.progress).sort()).toEqual(AI_PROGRESS_KEYS)
    expect(updates[0].progress.total).toBe(TOTAL_REQUESTS)
    const last = updates[updates.length - 1]
    expect(last.progress.done).toBe(TOTAL_REQUESTS)
    expect(last.progress.phase).toBe('已完成')
    // 末帧带完整 fusion / summary
    expect(last.fusion).toContain('整合正文')
    expect(last.summary).toContain('总结正文')
  })

  it('分项失败：重试 1 次后进 skipped，其余分项与融合照常产出', async () => {
    let targetCalls = 0
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (args.scope === 'full-dimension' && args.offline.startsWith('【本次分项标题】内在权威')) {
        targetCalls += 1
        throw new Error('接口 500')
      }
      return args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'
    })
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      maxConcurrency: 1,
    })
    // 调度器 retry: 1 → 同一任务共 2 次尝试
    expect(targetCalls).toBe(2)
    // 失败分项仍占位（types/report.ts：重试后仍失败则 content 为空串），并进 skipped
    expect(report.sections).toHaveLength(DIM_TASKS)
    expect(report.sections.find((s) => s.title === '内在权威')!.content).toBe('')
    expect(report.skipped).toEqual(['内在权威'])
    expect(report.sections.filter((s) => s.content).length).toBe(DIM_TASKS - 1)
    expect(report.fusion).toContain('整合正文')
  })

  it('融合失败不伪造：fusion / summary 为空，分项全部保留', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (args.scope === 'full-fusion') throw new Error('融合失败')
      return '分项正文'
    })
    const report = await runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      maxConcurrency: 1,
    })
    expect(explainMock.mock.calls.filter((c) => c[0].scope === 'full-fusion')).toHaveLength(2)
    expect(report.sections).toHaveLength(DIM_TASKS)
    expect(report.fusion).toBe('')
    expect(report.summary).toBe('')
    expect(report.skipped).toContain('全盘整合分析与最终总结论')
  })

  it('取消：上抛 cancelled，且不产出任何伪造内容', async () => {
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
        maxConcurrency: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('并发 N=3：融合仍在全部分项之后单独执行，且峰值不超 3', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 0 })
    const order: string[] = []
    let inFlight = 0
    let peak = 0
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      order.push(String(args.scope))
      inFlight += 1
      peak = Math.max(peak, inFlight)
      // 用 setTimeout 让任务真正并发重叠
      await new Promise<void>((resolve) => setTimeout(resolve, 500))
      inFlight -= 1
      return args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'
    })

    const running = runFullReading({
      cfg: CFG,
      chart: CHART,
      title: '测试盘',
      maxConcurrency: 3,
    })
    for (let i = 0; i < 40; i += 1) {
      await vi.advanceTimersByTimeAsync(1000)
    }
    const report = await running

    expect(report.sections).toHaveLength(DIM_TASKS)
    // 融合是最后一次调用，且只 1 次
    expect(order[order.length - 1]).toBe('full-fusion')
    expect(order.filter((s) => s === 'full-fusion')).toHaveLength(1)
    // 并发峰值不超过设定值
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
    // 融合输入里含全部分项要点
    const fusionCall = explainMock.mock.calls.find((c) => c[0].scope === 'full-fusion')!
    expect(fusionCall[0].offline).toContain('共 8 项')
  })
})
