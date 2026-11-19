/**
 * 三入口端到端调用序列（v4.0.0 · ARCH §3 / §5.2）。
 *
 * 本文件断言的是**真实执行路径**：`planReading()` → `runReadingPlan()` →
 * `runSlidingWindow()` → `aiClient.explain()`（mock，不走网络）。
 * 与 `aiReadingPlan.test.ts`（只测计划）和 `aiScheduler.test.ts`（只测调度）互补：
 * 那两个证明「零件对」，本文件证明「装起来之后发出去的请求正好是这几条、顺序就是这个顺序」。
 *
 * 覆盖口径（主理人确认）：
 * - 入口 A 完整档：6 次，scope 顺序 full-module / full-all-channels / full-all-gates /
 *   full-module / full-trajectory / full-fusion，融合最后且只 1 次；
 * - 入口 B 完整档（勾 2 维度）：3 次，前两次 full-dimension，system 白名单只含这两个维度；
 * - 入口 C 完整档（2 通道 + 2 闸门 + 定义 + 交叉）：7 次，通道 → 闸门 → 定义 → 交叉 → 汇总；
 * - 三入口 × 精简 / 详细档：各恰好 1 次，且没有融合请求；
 * - 专业版文案必须「第一次出现时必须阐释」，旧文案「读者已熟悉人类图术语」不得出现。
 *
 * 约束：environment = node；不挂载组件、不发真实请求。`maxConcurrency: 1` 让调用顺序
 * 等于计划顺序（N=1 时起速间隔为 0，不引入 1 秒空档）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BodyGraph, CenterId, Planet } from '../src/types/hd'
import type { ReadingRequest } from '../src/types/aiReading'
import type { AiExplainArgs } from '../src/services/aiClient'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import { resolveDetailMode, resolveStyle, systemPromptOf } from '../src/services/aiClient'
import { planReading } from '../src/services/aiReadingPlan'
import { runReadingPlan } from '../src/services/aiReadingRunner'
import { entrySegmentOf } from '../src/services/aiPrompt'
import { READING_DIMENSIONS } from '../src/services/chartFacts'
import type { AiConfig } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://entry.example.test/v1',
  apiKey: 'entry-key-1234',
  model: 'entry-model',
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
    centers: CENTERS.map((id) => ({
      id,
      defined: id === 'sacral' || id === 'throat' || id === 'g',
    })),
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
    style: 'pro',
    chart: CHART,
    archiveName: '张三',
    ...over,
  }
}

/** 所有维度标签（用于「未勾选维度不得出现在白名单里」的反向断言） */
const DIM_LABELS = READING_DIMENSIONS.map((d) => d.label)
const LABEL_OF = new Map(READING_DIMENSIONS.map((d) => [d.key, d.label] as const))

const ALL_DIMS = READING_DIMENSIONS.map((d) => d.key)

/**
 * 跑一次计划并返回 explain 收到的全部参数（按**发起顺序**）。
 *
 * 不注入 `explainFn`：走 `aiReadingRunner` → `aiClient.explain` 的真实调用点，
 * 只把 `explain` 本身换成 mock，确保「谁在什么时机发哪条请求」不被测试改写。
 */
async function runFlow(over: Partial<ReadingRequest>): Promise<AiExplainArgs[]> {
  const request = req(over)
  const plan = planReading(request)
  await runReadingPlan({
    req: request,
    plan,
    cfg: { ...CFG },
    maxConcurrency: 1,
  })
  return explainMock.mock.calls.map((c) => c[0] as AiExplainArgs)
}

/** 与 `explain()` 内部同口径地重建 system 提示词（ARCH §2.1 五段拼装） */
function systemOf(args: AiExplainArgs): string {
  return systemPromptOf({
    entry: args.entry,
    detail: resolveDetailMode(args.scope, args.detailMode),
    style: resolveStyle(args.style),
    scope: args.scope,
    dims: args.dims,
  })
}

/** 不带 dims 的同一篇 system 提示词：用来区分「白名单带进来的词」与「契约正文本来就有的词」 */
function baselineSystemOf(entry: AiExplainArgs['entry'], scope: string, detail = 'full'): string {
  return systemPromptOf({ entry, detail: detail as never, style: 'pro', scope })
}

/** 白名单以外的维度标签有没有被带进 system（排除契约正文本来就含的词，以及本分项自己的维度） */
function leakedDimLabels(system: string, baseline: string, own: string): string[] {
  return DIM_LABELS.filter((label) => label !== own && !baseline.includes(label) && system.includes(label))
}

beforeEach(() => {
  explainMock.mockReset()
  explainMock.mockImplementation(async (args: AiExplainArgs) => {
    if (args.scope === 'full-fusion' || args.scope === 'selection-fusion') {
      return '## 最终总结论\n\n融合正文'
    }
    return `正文-${String(args.ref ?? args.scope)}`
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('入口 A｜全盘 AI 解读（完整档 6 请求，融合最后）', () => {
  it('scope 顺序固定为 模块①②③④⑤ + 融合，融合只 1 次且是最后一次', async () => {
    const calls = await runFlow({ entry: 'full', detail: 'full' })

    expect(calls).toHaveLength(6)
    expect(calls.map((c) => c.scope)).toEqual([
      'full-module',
      'full-all-channels',
      'full-all-gates',
      'full-module',
      'full-trajectory',
      'full-fusion',
    ])
    expect(calls.map((c) => c.ref)).toEqual([
      'A1-core',
      'A2-channels',
      'A3-gates',
      'A4-centers',
      'A5-trajectory',
      'A6-fusion',
    ])
    // 融合恒最后、且只出现一次
    expect(calls.filter((c) => c.scope === 'full-fusion')).toHaveLength(1)
    expect(calls[calls.length - 1].scope).toBe('full-fusion')
    // 每条请求都带同一个入口，detail 恒为完整档
    expect(calls.every((c) => c.entry === 'full')).toBe(true)
    expect(calls.every((c) => c.detailMode === 'full')).toBe(true)
    // ②③ 是「一次通解全部」，不是逐条：全文里只各出现一次
    expect(calls.filter((c) => c.scope === 'full-all-channels')).toHaveLength(1)
    expect(calls.filter((c) => c.scope === 'full-all-gates')).toHaveLength(1)
  })

  it('②③ 的 offline 分别承载「全部通道」「全部闸门」事实，且 system 追加通解范围契约', async () => {
    const calls = await runFlow({ entry: 'full', detail: 'full' })
    const channels = calls.find((c) => c.scope === 'full-all-channels')!
    const gates = calls.find((c) => c.scope === 'full-all-gates')!

    expect(channels.offline).toContain('通道')
    expect(gates.offline).toContain('闸门')
    expect(systemOf(channels)).toContain('【通解范围契约】')
    expect(systemOf(gates)).toContain('【通解范围契约】')
    // 通解契约要求「逐项覆盖」，标志句必须逐字在
    expect(systemOf(channels)).toContain('禁止合并同类项跳过')
  })
})

describe('入口 B｜AI 综合解读（完整档 = 维度数 + 融合）', () => {
  const DIMS: ReadingRequest['dims'] = ['channels', 'authority']

  it('勾 2 维度 → 3 次请求：2 个 full-dimension + 1 个 full-fusion', async () => {
    const calls = await runFlow({ entry: 'composite', detail: 'full', dims: DIMS })

    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.scope)).toEqual([
      'full-dimension',
      'full-dimension',
      'full-fusion',
    ])
    expect(calls.map((c) => c.ref)).toEqual(['B-dim:channels', 'B-dim:authority', 'B-fusion'])
    expect(calls.every((c) => c.entry === 'composite')).toBe(true)
  })

  it('每个分项的 system 白名单只含它自己那一个维度；两个分项合起来恰是勾选的两个', async () => {
    const calls = await runFlow({ entry: 'composite', detail: 'full', dims: DIMS })
    const dimCalls = calls.filter((c) => c.scope === 'full-dimension')
    expect(dimCalls).toHaveLength(2)

    const baseline = baselineSystemOf('composite', 'full-dimension')
    const pickedLabels: string[] = []

    for (const call of dimCalls) {
      const own = LABEL_OF.get(call.dims![0] as never)!
      pickedLabels.push(own)
      const system = systemOf(call)
      // ① 自己的维度中文名必须在白名单段里（{DIMS} 已渲染，不留占位符）
      const whitelist = entrySegmentOf('composite', call.dims)
      expect(whitelist).toContain(own)
      expect(system).toContain(own)
      expect(system).not.toContain('{DIMS}')
      // ② 未勾选的维度不得被白名单带进来（排除契约正文本来就含的词，以及本分项自己的维度）
      expect(leakedDimLabels(system, baseline, own)).toEqual([])
      // ③ 白名单段里的「只允许出现这些维度的小节」后面只能跟着它自己
      expect(whitelist).not.toContain(`、${own}`)
    }

    expect(pickedLabels.sort()).toEqual(
      DIMS.map((d) => LABEL_OF.get(d as never)!).sort(),
    )
  })

  it('勾选 0 维度 → 0 次请求（空计划不抛错，由 UI 禁用按钮）', async () => {
    const calls = await runFlow({ entry: 'composite', detail: 'full', dims: [] })
    expect(calls).toHaveLength(0)
  })
})

describe('入口 C｜勾选解读（完整档 = 通道 → 闸门 → 定义 → 交叉 → 汇总）', () => {
  const SELECTION = {
    channels: ['34-57', '20-34'],
    gates: [57, 10],
    definition: true,
    circuit: false,
    cross: true,
  }

  it('2 通道 + 2 闸门 + 定义 + 交叉 → 7 次请求，汇总 selection-fusion 最后且只 1 次', async () => {
    const calls = await runFlow({ entry: 'selection', detail: 'full', selection: SELECTION })

    expect(calls).toHaveLength(7)
    expect(calls.map((c) => c.scope)).toEqual([
      'full-channel',
      'full-channel',
      'full-gate',
      'full-gate',
      'full-module',
      'full-module',
      'selection-fusion',
    ])
    expect(calls.map((c) => c.ref)).toEqual([
      'C-ch:20-34',
      'C-ch:34-57',
      'C-gate:10',
      'C-gate:57',
      'C-definition',
      'C-cross',
      'C-relation',
    ])
    // 汇总恒最后、只 1 次，且必须是 selection-fusion（不是 full-fusion）
    expect(calls[calls.length - 1].scope).toBe('selection-fusion')
    expect(calls.filter((c) => c.scope === 'selection-fusion')).toHaveLength(1)
    expect(calls.some((c) => c.scope === 'full-fusion')).toBe(false)
    expect(calls.every((c) => c.entry === 'selection')).toBe(true)
  })

  it('逐条分项只写这一项：system 追加分项范围契约，offline 带该项标题', async () => {
    const calls = await runFlow({ entry: 'selection', detail: 'full', selection: SELECTION })
    const one = calls[0]
    expect(systemOf(one)).toContain('【分项范围契约】')
    expect(one.offline).toContain('通道 20-34')
    // 汇总任务换成融合范围契约，且要求点名 3 组联动
    const fusion = calls[calls.length - 1]
    expect(systemOf(fusion)).toContain('【融合范围契约】')
    expect(fusion.offline).toContain('至少点名 3 组跨条目联动')
  })
})

describe('三入口 × 精简 / 详细档：恒 1 次请求', () => {
  const CASES: Array<{ entry: ReadingRequest['entry']; detail: 'concise' | 'detailed'; scope: string }> = [
    { entry: 'full', detail: 'concise', scope: 'panorama-one' },
    { entry: 'full', detail: 'detailed', scope: 'panorama-one' },
    { entry: 'composite', detail: 'concise', scope: 'unified' },
    { entry: 'composite', detail: 'detailed', scope: 'unified' },
    { entry: 'selection', detail: 'concise', scope: 'selection-one' },
    { entry: 'selection', detail: 'detailed', scope: 'selection-one' },
  ]

  it.each(CASES)('$entry · $detail → 恰 1 次 explain，无融合、无二次生成', async ({ entry, detail, scope }) => {
    const calls = await runFlow({
      entry,
      detail,
      dims: entry === 'composite' ? ['channels', 'authority'] : undefined,
      selection:
        entry === 'selection'
          ? { channels: ['20-34'], gates: [41], definition: false, circuit: false, cross: false }
          : undefined,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].scope).toBe(scope)
    expect(calls[0].entry).toBe(entry)
    expect(calls[0].detailMode).toBe(detail)
    expect(calls.some((c) => c.scope === 'full-fusion' || c.scope === 'selection-fusion')).toBe(
      false,
    )
  })

  it('三入口各档共 6 条请求，总数恒为 6（不是 6 的倍数、没有隐藏重试）', async () => {
    let total = 0
    for (const c of CASES) {
      explainMock.mockClear()
      const calls = await runFlow({
        entry: c.entry,
        detail: c.detail,
        dims: c.entry === 'composite' ? ['channels'] : undefined,
        selection:
          c.entry === 'selection'
            ? { channels: ['20-34'], gates: [], definition: false, circuit: false, cross: false }
            : undefined,
      })
      total += calls.length
    }
    expect(total).toBe(6)
  })
})

describe('风格段：专业版必须阐释术语，旧「不必解释」文案已消失', () => {
  const ENTRIES: ReadingRequest['entry'][] = ['full', 'composite', 'selection']

  it.each(ENTRIES)('入口 %s：system 含「第一次出现时必须阐释」，不含旧文案', async (entry) => {
    const calls = await runFlow({
      entry,
      detail: 'concise',
      style: 'pro',
      dims: entry === 'composite' ? ['channels'] : undefined,
      selection:
        entry === 'selection'
          ? { channels: ['20-34'], gates: [], definition: false, circuit: false, cross: false }
          : undefined,
    })

    expect(calls).toHaveLength(1)
    const system = systemOf(calls[0])
    expect(system).toContain('第一次出现时必须阐释')
    expect(system).toContain('【表达风格：专业术语体系】')
    expect(system).not.toContain('读者已熟悉人类图术语')
    expect(system).not.toContain('不必逐个展开解释')
  })

  it('零基础版只换风格段：其余四段逐字不变', async () => {
    const plain = await runFlow({ entry: 'full', detail: 'concise', style: 'plain' })
    const system = systemOf(plain[0])
    expect(system).toContain('【表达风格：零基础大白话】')
    expect(system).not.toContain('【表达风格：专业术语体系】')
    // 基础契约 / 入口契约 / 档位契约三段与风格无关，必须仍在
    expect(system).toContain('【基础契约')
    expect(system).toContain('【入口契约：全盘 AI 解读（A）】')
    expect(system).toContain('【档位契约：精简')
  })
})

describe('维度白名单兜底：未提供 dims 时不留占位符给模型猜', () => {
  it('入口 B 的 {DIMS} 在无勾选清单时渲染成显式兜底文案', () => {
    const segment = entrySegmentOf('composite', undefined)
    expect(segment).not.toContain('{DIMS}')
    expect(segment).toContain('未提供维度清单')
  })

  it('ALL_DIMS 全覆盖时白名单串按 READING_DIMENSIONS 固定顺序排列', () => {
    const reversed = [...ALL_DIMS].reverse()
    expect(entrySegmentOf('composite', reversed)).toBe(entrySegmentOf('composite', ALL_DIMS))
    expect(entrySegmentOf('composite', ALL_DIMS)).toContain(DIM_LABELS.join('、'))
  })
})
