/**
 * 跨档案批量生成解读回归（v2.4.0 主功能）。
 *
 * 与 aiFullReading 测试同法：`vi.mock` 只替换 explain()（网络调用），
 * 其余 aiClient 导出保持真实，因此不发真实请求、不伪造解读内容；
 * 断言的是「任务展开口径 / 调度分批 / 失败与取消语义 / 进度发布」。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import { AiError, cacheKey, chartSummaryOf } from '../src/services/aiClient'
import { buildBatchTasks, runBatchReading } from '../src/services/aiBatchReading'
import { ALL_READING_DIMS, buildUnifiedOffline, unifiedScopeRef } from '../src/services/chartFacts'
import { resolveSchedule } from '../src/services/aiConcurrency'
import type { AiConfig, BodyGraph, CenterId } from '../src/types/hd'
import type { AiExplainArgs } from '../src/services/aiClient'

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

function makeChart(type: BodyGraph['type'] = 'Generator', profile = '2/4'): BodyGraph {
  return {
    type,
    strategy: '等待回应',
    authority: 'Sacral',
    profile,
    definition: 'Single',
    incarnationCross: '右角度交叉之四方之道',
    centers: CENTERS.map((id) => ({ id, defined: id === 'sacral' })),
    gates: [
      { gate: 34, stars: ['Sun'], state: 'in-channel' },
      { gate: 20, stars: ['Earth'], state: 'in-channel' },
    ],
    channels: [{ key: '20-34', gates: [20, 34] }],
    hangingGates: [],
    // 轮回交叉解读需要「显意识/潜意识各自的太阳与地球」四个落点，缺一会读 undefined
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

const BASE_OPTIONS = {
  dimensions: ALL_READING_DIMS,
  angleKey: 'comprehensive',
  angleLabel: '综合解读',
  anglePrompt: '从整体上看这张盘',
  customDirection: '',
  detailMode: 'concise' as const,
}

/**
 * 每份档案给一个可区分的人生角色：任务标题与 angle 现在对所有档案相同
 * （与手动解读同口径），所以测试要用【盘面事实】里的内容来区分任务。
 */
function profileOf(id: string): string {
  const i = id.charCodeAt(0) - 97
  return `${(i % 8) + 1}/${(i % 5) + 3}`
}

function inputs(ids: string[]) {
  return ids.map((id) => ({
    archiveId: id,
    name: `档案${id}`,
    chart: makeChart('Generator', profileOf(id)),
  }))
}

/** 从一次 explain() 调用里认出它属于哪份档案（靠事实块里的人生角色，不靠标题） */
function isTask(args: AiExplainArgs, id: string): boolean {
  return Boolean(args.chartSummary?.includes(`人生角色：${profileOf(id)}`))
}

beforeEach(() => {
  explainMock.mockReset()
  explainMock.mockResolvedValue('解读正文')
})

describe('buildBatchTasks：任务展开口径与手动解读一致', () => {
  it('每份档案一个任务，scope/ref 与手动 unified 解读完全相同', () => {
    const { tasks, skipped } = buildBatchTasks(inputs(['a', 'b']), BASE_OPTIONS)
    expect(tasks).toHaveLength(2)
    expect(skipped).toHaveLength(0)
    for (const t of tasks) {
      expect(t.scope).toBe('unified')
      // ref 必须是「维度:角度:自定义」拼串，否则与手动解读缓存键不同
      expect(t.ref).toBe(`${ALL_READING_DIMS.join('+')}:comprehensive:-`)
      expect(t.mode).toBe('concise')
    }
    expect(tasks[0].title).toContain('档案a')
    expect(tasks[0].offline).toContain('【盘面事实】'.replace('【盘面事实】', '【人生角色 / 能量类型】'))
  })

  it('自定义方向进入 ref 与 offline（与手动解读同口径）', () => {
    const { tasks } = buildBatchTasks(inputs(['a']), {
      ...BASE_OPTIONS,
      customDirection: '事业方向',
    })
    expect(tasks[0].ref).toBe(`${ALL_READING_DIMS.join('+')}:comprehensive:事业方向`)
    expect(tasks[0].offline).toContain('【自定义解读方向】')
    expect(tasks[0].offline).toContain('事业方向')
  })

  it('只勾选部分维度时，事实块只含所选维度', () => {
    const { tasks } = buildBatchTasks(inputs(['a']), {
      ...BASE_OPTIONS,
      dimensions: ['strategy'],
    })
    expect(tasks[0].ref).toContain('strategy:comprehensive:-')
    expect(tasks[0].offline).toContain('【人生策略】')
    expect(tasks[0].offline).not.toContain('【九大能量中心状态】')
  })

  it('缺盘面的档案被跳过而非记为失败，且带上原因', () => {
    const { tasks, skipped } = buildBatchTasks(
      [
        { archiveId: 'a', name: '正常', chart: makeChart() },
        { archiveId: 'b', name: '无快照', chart: null },
        { archiveId: 'c', name: '算错了', chart: null, chartError: '出生信息非法' },
      ],
      BASE_OPTIONS,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].archiveId).toBe('a')
    expect(skipped.map((s) => s.name)).toEqual(['无快照', '算错了'])
    expect(skipped[0].reason).toBe('尚无盘面快照')
    expect(skipped[1].reason).toContain('出生信息非法')
  })

  it('chartSummary 与手动解读同为 chartSummaryOf(chart)（否则缓存键分裂）', () => {
    // cacheKey() 把 chartSummary 拼进内容哈希：留空会让「手动生成过的档案」
    // 在批量时算不出同一个键，缓存各存一份、永远互相不命中。
    const chart = makeChart()
    const { tasks } = buildBatchTasks([{ archiveId: 'a', name: 'A', chart }], BASE_OPTIONS)
    expect(tasks[0].chartSummary).toBe(chartSummaryOf(chart))
    expect(tasks[0].chartSummary?.length).toBeGreaterThan(0)
  })

  it('angle 与手动解读同为「自定义方向 || 角度标签」，不夹带档案名', () => {
    // 曾经把任务标题塞进 angle：同一张盘手动与批量的【用户选择】角度行不同，
    // 模型看到的口径不一致，缓存键也分裂。
    const { tasks } = buildBatchTasks(inputs(['a', 'b']), BASE_OPTIONS)
    for (const t of tasks) {
      expect(t.angle).toBe('综合解读')
      expect(t.angle).not.toContain('档案')
    }
    const { tasks: custom } = buildBatchTasks(inputs(['a']), {
      ...BASE_OPTIONS,
      customDirection: '事业方向',
    })
    expect(custom[0].angle).toBe('事业方向')
  })

  it('批量与手动的缓存键逐字相同（同盘同档同维度）', () => {
    const chart = makeChart()
    const dims = ALL_READING_DIMS
    const { tasks } = buildBatchTasks([{ archiveId: 'a', name: 'A', chart }], {
      ...BASE_OPTIONS,
      dimensions: dims,
    })
    const batchKey = cacheKey(CFG, {
      cfg: CFG,
      scope: tasks[0].scope,
      ref: tasks[0].ref,
      offline: tasks[0].offline,
      chartSummary: tasks[0].chartSummary,
      detailMode: tasks[0].mode,
    })
    // 手动路径（views/SingleChartView.vue 的 requestUnifiedAi）用同一批函数拼装
    const manualKey = cacheKey(CFG, {
      cfg: CFG,
      scope: 'unified',
      ref: unifiedScopeRef(dims, 'comprehensive', ''),
      offline: buildUnifiedOffline(chart, dims, '综合解读', '从整体上看这张盘', ''),
      chartSummary: chartSummaryOf(chart),
      detailMode: 'concise',
    })
    expect(batchKey).toBe(manualKey)
  })
})

describe('runBatchReading：调度沿用 N ≤ Y 唯一闸门', () => {
  it('未超限时一次性并发全部 N 份，degraded=false', async () => {
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'parallel',
      concurrencyLimit: 64,
    })
    expect(report.ok).toBe(3)
    expect(report.scheduleInfo).toMatchObject({ required: 3, limit: 64, batchWidth: 3, batchCount: 1, degraded: false })
    expect(explainMock).toHaveBeenCalledTimes(3)
  })

  it('超过上限时按 Y 分批，degraded=true 且不漏项', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `a${i}`)
    const { tasks } = buildBatchTasks(inputs(ids), BASE_OPTIONS)
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'parallel',
      concurrencyLimit: 2,
    })
    expect(report.ok).toBe(5)
    expect(report.scheduleInfo).toMatchObject({ required: 5, limit: 2, batchWidth: 2, batchCount: 3, degraded: true })
    expect(explainMock).toHaveBeenCalledTimes(5)
    // 每一项都恰好被调用一次（不重复、不遗漏）
    const called = explainMock.mock.calls.map((c) => (c[0] as AiExplainArgs).ref)
    expect(new Set(called).size).toBe(1)
  })

  it('串行模式逐项执行，batchWidth=1', async () => {
    const { tasks } = buildBatchTasks(inputs(['a', 'b']), BASE_OPTIONS)
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'serial',
      concurrencyLimit: 64,
    })
    expect(report.ok).toBe(2)
    expect(report.scheduleInfo).toMatchObject({ batchWidth: 1, batchCount: 2, degraded: false })
  })

  it('空任务清单不调用接口，直接返回空报告', async () => {
    const report = await runBatchReading({
      cfg: CFG,
      tasks: [],
      stepMode: 'parallel',
      concurrencyLimit: 64,
    })
    expect(explainMock).not.toHaveBeenCalled()
    expect(report.ok).toBe(0)
    expect(report.outcomes).toHaveLength(0)
  })

  it('调度与 resolveSchedule 同源：批量不会引入第二套并发概念', () => {
    // 直接对照：批量模块报告的 scheduleInfo 必须等于 resolveSchedule 的输出
    expect(resolveSchedule(5, 2, 'parallel')).toMatchObject({ batchWidth: 2, batchCount: 3, degraded: true })
    expect(resolveSchedule(3, 64, 'parallel')).toMatchObject({ batchWidth: 3, batchCount: 1, degraded: false })
  })
})

describe('runBatchReading：失败与取消语义', () => {
  it('单项失败重试 1 次后仍失败 → 记入 failed，其余项照常完成', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (isTask(args, 'b')) throw new AiError('接口返回 500', 'http')
      return '解读正文'
    })
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'parallel',
      concurrencyLimit: 64,
    })
    expect(report.ok).toBe(2)
    expect(report.failed).toHaveLength(1)
    expect(report.failed[0]).toContain('档案b')
    expect(report.failed[0]).toContain('接口返回 500')
    // 失败项重试 1 次 → b 被调用 2 次，a/c 各 1 次
    expect(explainMock).toHaveBeenCalledTimes(4)
    const failedOutcome = report.outcomes.find((o) => o.archiveId === 'b')
    expect(failedOutcome?.content).toBe('')
    expect(failedOutcome?.error).toContain('接口返回 500')
  })

  it('预检跳过的档案原样带进报告，不混进 failed', async () => {
    const { tasks, skipped } = buildBatchTasks(
      [{ archiveId: 'a', name: '正常', chart: makeChart() }, { archiveId: 'b', name: '无快照', chart: null }],
      BASE_OPTIONS,
    )
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      skipped: skipped.map((s) => `${s.name}（${s.reason}）`),
      stepMode: 'parallel',
      concurrencyLimit: 64,
    })
    expect(report.ok).toBe(1)
    expect(report.failed).toHaveLength(0)
    expect(report.skipped).toEqual(['无快照（尚无盘面快照）'])
  })

  it('取消时上抛 cancelled，且取消前已完成的项已通过 onUpdate 发布（不丢结果）', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (isTask(args, 'b')) {
        controller.abort()
        throw new AiError('已取消', 'cancelled')
      }
      return '解读正文'
    })
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    let published: string[] = []
    await expect(
      runBatchReading({
        cfg: CFG,
        tasks,
        stepMode: 'serial',
        concurrencyLimit: 64,
        signal: controller.signal,
        onUpdate: ({ outcomes }) => {
          published = outcomes.filter((o) => o.content).map((o) => o.archiveId)
        },
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    // 档案a 在取消前已完成，必须已发布给调用方（下游据此增量落库，中断不丢结果）
    expect(published).toEqual(['a'])
    // 取消项之后不再发起：c 从未被调用
    const called = explainMock.mock.calls.map((c) => c[0] as AiExplainArgs)
    expect(called.some((a) => isTask(a, 'c'))).toBe(false)
  })

  it('取消后不再发起后续项（串行）', async () => {
    const controller = new AbortController()
    let calls = 0
    explainMock.mockImplementation(async () => {
      calls += 1
      controller.abort()
      return '解读正文'
    })
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    await expect(
      runBatchReading({
        cfg: CFG,
        tasks,
        stepMode: 'serial',
        concurrencyLimit: 64,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(calls).toBe(1)
  })

  it('并发模式下批与批之间检查取消：已中止时不启动下一批', async () => {
    const controller = new AbortController()
    let calls = 0
    explainMock.mockImplementation(async () => {
      calls += 1
      // 首批（上限 2）的第二项执行期间用户点取消：首批跑完，第二批不得发起
      if (calls === 2) controller.abort()
      return '解读正文'
    })
    const ids = Array.from({ length: 6 }, (_, i) => `a${i}`)
    const { tasks } = buildBatchTasks(inputs(ids), BASE_OPTIONS)
    await expect(
      runBatchReading({
        cfg: CFG,
        tasks,
        stepMode: 'parallel',
        concurrencyLimit: 2,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(explainMock).toHaveBeenCalledTimes(2)
  })

  it('取消时同一批内也不会继续发起新请求（attempt 前置检查）', async () => {
    const controller = new AbortController()
    let calls = 0
    explainMock.mockImplementation(async () => {
      calls += 1
      controller.abort()
      return '解读正文'
    })
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    await expect(
      runBatchReading({
        cfg: CFG,
        tasks,
        stepMode: 'parallel',
        concurrencyLimit: 64,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    // 第一项同步中止后，同批的后续项在进入 explain 前就被拦下
    expect(calls).toBe(1)
  })
})

describe('runBatchReading：进度发布', () => {
  it('done 单调递增到 total，末帧 phase 为「已完成」', async () => {
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    const frames: Array<{ done: number; phase: string; ok: number }> = []
    await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'serial',
      concurrencyLimit: 64,
      onUpdate: ({ progress }) => frames.push({ done: progress.done, phase: progress.phase, ok: progress.ok }),
    })
    expect(frames[0].done).toBe(0)
    expect(frames[frames.length - 1]).toMatchObject({ done: 3, ok: 3, phase: '已完成' })
    // 单调不减
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i].done).toBeGreaterThanOrEqual(frames[i - 1].done)
    }
  })

  it('报告汇总字符数与各产出之和一致', async () => {
    explainMock.mockResolvedValue('一二三四五')
    const { tasks } = buildBatchTasks(inputs(['a', 'b']), BASE_OPTIONS)
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'parallel',
      concurrencyLimit: 64,
    })
    expect(report.totalChars).toBe(10)
  })

  it('outcomes 按任务顺序排列（与调度分批无关）', async () => {
    // 让后面的任务先返回，验证输出仍按输入顺序
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      const delay = isTask(args, 'a') ? 5 : 0
      await new Promise((r) => setTimeout(r, delay))
      return 'x'
    })
    const { tasks } = buildBatchTasks(inputs(['a', 'b', 'c']), BASE_OPTIONS)
    const report = await runBatchReading({
      cfg: CFG,
      tasks,
      stepMode: 'parallel',
      concurrencyLimit: 64,
    })
    expect(report.outcomes.map((o) => o.archiveId)).toEqual(['a', 'b', 'c'])
  })
})
