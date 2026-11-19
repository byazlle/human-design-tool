/**
 * 执行器回归（ARCH v4.0.0 §3 / §4 的落地断言）。
 *
 * 三条硬要求：单次档只发 1 次请求；多请求档的融合**在所有分项之后单独执行**；
 * 分项失败只进 `skipped`，不伪造内容，报告顺序仍是计划顺序。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BodyGraph, CenterId, Planet } from '../src/types/hd'
import type { AiConfig } from '../src/types/hd'
import type { ReadingRequest } from '../src/types/aiReading'
import { planReading } from '../src/services/aiReadingPlan'
import {
  buildFusionExcerpts,
  fusionExcerptChars,
  runReadingPlan,
  splitFusionSummary,
} from '../src/services/aiReadingRunner'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'sk-test-1234567890',
  model: 'gpt-test',
  timeoutMs: 60000,
  cacheEnabled: false,
}

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
    definition: 'Single',
    incarnationCross: '右角度交叉之解释',
    centers: CENTERS.map((id) => ({ id, defined: id === 'sacral' })),
    gates: [
      { gate: 34, stars: ['Sun'], state: 'in-channel' },
      { gate: 20, stars: ['Earth'], state: 'in-channel' },
    ],
    channels: [{ key: '20-34', gates: [20, 34] }],
    hangingGates: [],
    personality: [star('Sun', 34), star('Earth', 20, 4)],
    design: [star('Sun', 20, 2), star('Earth', 34, 5)],
    meta: { personalityTime: '', designTime: '', personalitySun: 34, designSun: 20 },
  }
}

function reqOf(over: Partial<ReadingRequest>): ReadingRequest {
  return {
    entry: 'selection',
    detail: 'full',
    style: 'plain',
    chart: makeChart(),
    archiveName: '张三',
    selection: { channels: ['20-34'], gates: [34], definition: false, circuit: false, cross: false },
    ...over,
  }
}

/** 冲微任务 + 毫秒 */
async function tick(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('单次档', () => {
  it('只发 1 次请求，报告只有 1 个分节', async () => {
    const calls: string[] = []
    const req = reqOf({ detail: 'concise' })
    const plan = planReading(req)
    const report = await runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 3,
      explainFn: async (args) => {
        calls.push(`${args.entry}/${args.scope}`)
        return '# 正文'
      },
    })
    expect(calls).toEqual(['selection/selection-one'])
    expect(report.sections).toHaveLength(1)
    expect(report.sections[0].content).toBe('# 正文')
    expect(report.entry).toBe('selection')
    expect(report.fusion).toBe('')
    expect(report.totalChars).toBe('# 正文'.length)
  })
})

describe('多请求档', () => {
  it('融合在全部逐条任务之后单独执行，报告顺序=计划顺序', async () => {
    const order: string[] = []
    const req = reqOf({ detail: 'full' })
    const plan = planReading(req)
    expect(plan.tasks.map((t) => t.key)).toEqual(['C-ch:20-34', 'C-gate:34'])

    const running = runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 3,
      explainFn: async (args) => {
        order.push(String(args.scope))
        if (args.scope === 'selection-fusion') return '## 关联汇总\n汇总正文'
        return `正文 ${args.scope}`
      },
    })
    for (let i = 0; i < 10; i += 1) await tick(1000)
    const report = await running

    // 融合必须是最后一个被调用的（不允许与分项重叠）
    expect(order[order.length - 1]).toBe('selection-fusion')
    expect(order.filter((s) => s === 'selection-fusion')).toHaveLength(1)
    // 报告分节按计划顺序
    expect(report.sections.map((s) => s.key)).toEqual(['C-ch:20-34', 'C-gate:34'])
    expect(report.sections.map((s) => s.content)).toEqual([
      '正文 full-channel',
      '正文 full-gate',
    ])
    expect(report.fusion).toContain('汇总正文')
    expect(report.skipped).toEqual([])
    expect(report.entry).toBe('selection')
  })

  it('分项失败只进 skipped，不伪造内容，其余分项照常出报告', async () => {
    const req = reqOf({
      detail: 'full',
      selection: { channels: ['20-34'], gates: [34, 57], definition: false, circuit: false, cross: false },
    })
    const plan = planReading(req)
    const running = runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 2,
      explainFn: async (args) => {
        if (args.scope === 'full-gate' && args.offline.includes('闸门 57')) throw new Error('接口 500')
        if (args.scope === 'selection-fusion') return '汇总'
        return '正文'
      },
    })
    for (let i = 0; i < 20; i += 1) await tick(1000)
    const report = await running

    const gate57 = report.sections.find((s) => s.key === 'C-gate:57')
    expect(gate57?.content).toBe('')
    expect(report.skipped.length).toBe(1)
    expect(report.skipped[0]).toContain('57')
    // 其他分项仍然在
    expect(report.sections.find((s) => s.key === 'C-ch:20-34')?.content).toBe('正文')
  })

  it('融合失败不伪造：报告只有分项，fusion 为空且进 skipped', async () => {
    const req = reqOf({ detail: 'full' })
    const plan = planReading(req)
    const running = runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 3,
      explainFn: async (args) => {
        if (args.scope === 'selection-fusion') throw new Error('融合挂了')
        return '正文'
      },
    })
    for (let i = 0; i < 10; i += 1) await tick(1000)
    const report = await running
    expect(report.fusion).toBe('')
    expect(report.sections.every((s) => s.content === '正文')).toBe(true)
    expect(report.skipped.some((s) => s.includes('汇总'))).toBe(true)
  })

  it('进度：最后一次更新为完成态，10 字段齐全', async () => {
    const updates: Array<Record<string, unknown>> = []
    const req = reqOf({ detail: 'full' })
    const plan = planReading(req)
    const running = runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 3,
      onUpdate: (p) => updates.push({ ...p }),
      explainFn: async () => '正文',
    })
    for (let i = 0; i < 10; i += 1) await tick(1000)
    await running

    expect(updates.length).toBeGreaterThan(0)
    const last = updates[updates.length - 1]
    expect(Object.keys(last).sort()).toEqual(
      [
        'current',
        'done',
        'elapsedMs',
        'etaMs',
        'failed',
        'inFlight',
        'maxConcurrency',
        'phase',
        'skipped',
        'total',
      ].sort(),
    )
    expect(last.phase).toBe('已完成')
    expect(last.done).toBe(3) // 2 分项 + 1 融合
    expect(last.total).toBe(3)
  })

  it('取消时上抛 cancelled，不产出半份报告', async () => {
    const controller = new AbortController()
    const req = reqOf({ detail: 'full' })
    const plan = planReading(req)
    const running = runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 2,
      signal: controller.signal,
      explainFn: (args) =>
        new Promise<string>((_resolve, reject) => {
          args.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }),
    })
    const rejected = expect(running).rejects.toMatchObject({ kind: 'cancelled' })
    await tick(0)
    controller.abort()
    await tick(0)
    await rejected
  })
})

describe('融合篇的契约不退化', () => {
  it('入口 B 完整档：融合篇拿到全部勾选维度，而不是兜底文案', async () => {
    const req = reqOf({
      entry: 'composite',
      detail: 'full',
      dims: ['channels', 'authority'],
      selection: undefined,
    })
    const plan = planReading(req)
    const calls: Array<{ scope: string; dims?: string[] }> = []
    await runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 1,
      explainFn: async (args) => {
        calls.push({ scope: args.scope, dims: args.dims ? [...args.dims] : undefined })
        return '# 分项正文'
      },
    })
    const fusionCall = calls.find((c) => c.scope === 'full-fusion')
    expect(fusionCall).toBeDefined()
    expect(fusionCall?.dims).toEqual(['channels', 'authority'])
  })

  it('带末位融合的计划：稳态文案里的总数与同一帧 progress.total 一致', async () => {
    const req = reqOf({ entry: 'composite', detail: 'full', dims: ['channels', 'authority'] })
    const plan = planReading(req)
    const frames: Array<{ total: number; phase: string }> = []
    await runReadingPlan({
      req,
      plan,
      cfg: CFG,
      maxConcurrency: 1,
      explainFn: async () => '# 分项正文',
      onUpdate: (progress) => frames.push({ total: progress.total, phase: progress.phase }),
    })
    const steady = frames.filter((f) => f.phase.includes('最高并发数'))
    expect(steady.length).toBeGreaterThan(0)
    for (const frame of steady) {
      expect(frame.phase).toContain(`总 ${frame.total}`)
    }
  })
})

describe('融合输入的压缩口径与拆分', () => {
  it('截断字数 A 800 / B 400 / C 200', () => {
    expect(fusionExcerptChars('full')).toBe(800)
    expect(fusionExcerptChars('composite')).toBe(400)
    expect(fusionExcerptChars('selection')).toBe(200)
  })

  it('buildFusionExcerpts 带未完成分项声明与截断', () => {
    const long = '甲'.repeat(300)
    const input = buildFusionExcerpts(
      'selection',
      [
        { kind: 'gate', key: 'g1', title: '闸门 1', content: long },
        { kind: 'gate', key: 'g2', title: '闸门 2', content: '' },
      ],
      ['闸门 2'],
    )
    expect(input).toContain('前 200 字要点')
    expect(input).toContain('甲'.repeat(200))
    expect(input).not.toContain('甲'.repeat(201))
    expect(input).toContain('【未完成分项】闸门 2')
    expect(input).toContain('请勿据此推断')
  })

  it('splitFusionSummary 拆出「最终总结论」', () => {
    const raw = '## 一、整合\n内容段\n\n## 最终总结论\n总结段'
    const { fusion, summary } = splitFusionSummary(raw)
    expect(fusion).toContain('## 一、整合')
    expect(fusion).not.toContain('最终总结论')
    expect(summary).toContain('## 最终总结论')
  })
})
