/**
 * QA 独立验收测试（严过关 / Yan）—— v4.0.0 AI 并发能力（滑动窗口单旋钮）。
 *
 * 与工程师 `tests/aiConcurrency.test.ts` / `tests/aiScheduler.test.ts` 完全独立：
 * 不复用其辅助函数、不复用其断言角度。核心手段仍是「受控 Promise + 全局单调 seq」——
 * 每次 explain() 调用记录 start(seq)，每次响应记录 end(seq)，由测试分阶段 release，
 * 从而直接证明「起速每秒 1 个」「满载即补」「融合严格晚于全部分项」「取消不伪造」，
 * 而不是只数调用次数。
 *
 * ★ v2.3.0 的双旋钮验收（`resolveSchedule` / 批宽 batchWidth / N-Y-K 降级文案 /
 *   「一次性并发」/ 失败项串行重跑）所断言的对象已被 v4.0.0 整体删除，本文件按新口径重写；
 *   但 QA-B4（`AiReadingPanel.vue` 五区静态契约）、QA-B3b（`useAiStatus.terminalHint` 常驻）、
 *   QA-F2（`AiProgress` 8 字段 + 提示词版本 + 两个计算锚点 + 现行文档 29.875 静态锁定）、QA-E2/E3/E4（取消语义）
 *   全部**原样保留、一条不放宽**。
 *
 * 约束：environment = node；vi.mock / vi.stubGlobal / fake 定时器；
 *       无 jsdom、无 @vue/test-utils、无组件挂载、无新增任何第三方依赖。
 *       本文件不修改任何源码。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import {
  runFullReading,
  type FullReadingOptions,
  type FullReadingUpdate,
  type FullTask,
} from '../src/services/aiFullReading'
import * as concurrencyModule from '../src/services/aiConcurrency'
import {
  AI_MAX_CONCURRENCY_MAX,
  AI_MAX_CONCURRENCY_MIN,
  DEFAULT_AI_MAX_CONCURRENCY,
  clampMaxConcurrency,
  normalizeMaxConcurrency,
  validateMaxConcurrency,
} from '../src/services/aiConcurrency'
import { cancelledError } from '../src/services/aiAttempt'
import { takeConcurrencyMigrationNotice, useSettingsStore } from '../src/stores/settings'
import { useUiStore } from '../src/stores/ui'
import { useAiReading } from '../src/composables/useAiReading'
import { useAiStatus } from '../src/composables/useAiStatus'
import type { AiExplainArgs } from '../src/services/aiClient'
import type { AiConfig, BodyGraph } from '../src/types/hd'
import type { AiProgress } from '../src/types/report'

const CFG: AiConfig = {
  baseUrl: 'https://qa.example.test/v1',
  apiKey: 'qa-test-key-1234',
  model: 'qa-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

const FUSION_RAW = '## 1. 全盘整合分析\n\n整合正文\n\n## 5. 最终总结论\n\n总结正文'
const FUSION_TITLE = '全盘整合分析与最终总结论'
const STORAGE_KEY = 'hdt.settings.v1'

/** v4.0.0 已删除的 4 个设置字段（persist 不得再写、state 不得再有） */
const REMOVED_FIELDS = ['aiTokenBudget', 'aiStepMode', 'aiConcurrency', 'aiConcurrencyLimit']

function makeTasks(n: number): FullTask[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `task:${i}`,
    title: `分项 ${i}`,
    kind: 'dimension' as const,
    scope: 'full-dimension' as const,
    offline: `离线事实 ${i}`,
  }))
}

function opts(overrides: Partial<FullReadingOptions> = {}): FullReadingOptions {
  return {
    cfg: { ...CFG },
    chart: {} as BodyGraph,
    title: 'QA 验收盘',
    summary: 'QA 盘面摘要',
    ...overrides,
  }
}

/** 冲净 microtask 链（scheduler 的 pump 走 queueMicrotask，不是定时器） */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

/** 推进假时钟再冲净 microtask */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}

function stubStorage(): void {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  })
}

/* ── 时序追踪器：QA 独立实现 ─────────────────────────────── */

interface TraceEvent {
  seq: number
  kind: 'start' | 'end'
  scope: string
  ref: string
}

interface PendingRequest {
  scope: string
  ref: string
  resolve: (text: string) => void
  reject: (err: unknown) => void
  settled: boolean
}

class Trace {
  seq = 0
  events: TraceEvent[] = []
  readonly failRefs = new Set<string>()
  failFusion = false
  private queue: PendingRequest[] = []

  get pending(): number {
    return this.queue.filter((p) => !p.settled).length
  }

  reset(): void {
    this.seq = 0
    this.events = []
    this.queue = []
    this.failRefs.clear()
    this.failFusion = false
  }

  starts(): TraceEvent[] {
    return this.events.filter((e) => e.kind === 'start')
  }

  ends(): TraceEvent[] {
    return this.events.filter((e) => e.kind === 'end')
  }

  refsStarted(): string[] {
    return this.starts().map((e) => e.ref)
  }

  /** 每个请求都挂起，直到测试显式 release；失败项按 failRefs 注入；abort 时以 cancelled 拒绝 */
  stub = (args: AiExplainArgs): Promise<string> => {
    const scope = String(args.scope)
    const ref = String(args.ref ?? '')
    this.events.push({ seq: ++this.seq, kind: 'start', scope, ref })
    return new Promise<string>((resolve, reject) => {
      const entry: PendingRequest = { scope, ref, resolve, reject, settled: false }
      this.queue.push(entry)
      // 真实 explain() 在 signal abort 时以 AiError('已取消','cancelled') 拒绝；
      // 不模拟这条，取消语义的断言就变成「测试自己说了算」。
      args.signal?.addEventListener(
        'abort',
        () => {
          if (entry.settled) return
          entry.settled = true
          this.events.push({ seq: ++this.seq, kind: 'end', scope, ref })
          reject(cancelledError(args.signal))
        },
        { once: true },
      )
    })
  }

  private settle(entry: PendingRequest): void {
    entry.settled = true
    this.events.push({ seq: ++this.seq, kind: 'end', scope: entry.scope, ref: entry.ref })
    const shouldFail =
      this.failRefs.has(entry.ref) || (entry.scope === 'full-fusion' && this.failFusion)
    if (shouldFail) entry.reject(new Error('QA 注入失败'))
    else entry.resolve(entry.scope === 'full-fusion' ? FUSION_RAW : `正文-${entry.ref}`)
  }

  /** 释放当前所有在途请求，返回释放个数 */
  release(): number {
    const batch = this.queue.filter((p) => !p.settled)
    batch.forEach((p) => this.settle(p))
    this.queue = this.queue.filter((p) => !p.settled)
    return batch.length
  }

  /** 只释放最早的一个（用于证明「一个落定 → 立刻补一个」） */
  releaseOne(): number {
    const next = this.queue.find((p) => !p.settled)
    if (!next) return 0
    this.settle(next)
    this.queue = this.queue.filter((p) => !p.settled)
    return 1
  }
}

const trace = new Trace()

/** 反复「冲净 → 释放 → 必要时推进 1 秒」直到 promise 落定（起速期需要时钟） */
async function drive(promise: Promise<unknown>, maxRounds = 80): Promise<void> {
  let settled = false
  void promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  for (let i = 0; i < maxRounds && !settled; i += 1) {
    await flush()
    if (settled) break
    if (trace.pending > 0) {
      trace.release()
      await flush()
      continue
    }
    await advance(1000)
  }
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: 0 })
  explainMock.mockReset()
  trace.reset()
  stubStorage()
  setActivePinia(createPinia())
  takeConcurrencyMigrationNotice() // 清掉模块级一次性提示，避免跨用例串台
})

afterEach(() => {
  useAiStatus().reset()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/* ══════════════════════════════════════════════════════════
 * QA-A｜起速每秒 1 个 · 满载即补 · 融合最后（替代 v2.3 的「一次性并发」）
 * ══════════════════════════════════════════════════════════ */

describe('QA-A｜滑动窗口：起速每秒 1 个直到在跑 N，落定即补', () => {
  /**
   * 原 QA-A1「N=10/上限≥10：任何响应之前 10 项已一次性发起（批次数=1）」
   * → 新 QA-A1「N=3：t=0/1s/2s 各发起 1 个，之后不再超发」。
   * 断言对象从「批次宽度」换成「启动时刻 + 在跑上限」，强度不降。
   */
  it('QA-A1 N=3：第 1/2/3 个分别在 t=0 / 1000 / 2000ms 启动，之后再等也不会超过 3 个在跑', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({ tasks: makeTasks(10), maxConcurrency: 3, onUpdate: (u) => updates.push(u) }),
    )

    await flush()
    expect(trace.refsStarted()).toEqual(['task:0'])
    expect(trace.pending).toBe(1)

    await advance(1000)
    expect(trace.refsStarted()).toEqual(['task:0', 'task:1'])

    await advance(1000)
    expect(trace.refsStarted()).toEqual(['task:0', 'task:1', 'task:2'])

    // 满载后即使再等 5 秒也不超发（I2：inFlight ≤ N）
    await advance(5000)
    expect(trace.starts()).toHaveLength(3)
    expect(trace.pending).toBe(3)

    // 状态区如实反映起速过程（UI 必须能看见「为什么只跑了 1 个」）
    const phases = updates.map((u) => u.progress.phase)
    expect(phases).toContain('起速中（每秒 1 个）· 已启动 1 / 3')
    expect(phases).toContain('起速中（每秒 1 个）· 已启动 2 / 3')
    // 文案里的「总」与 progress.total 同源：含末位融合，不能只数分项
    expect(phases).toContain('最高并发数 3 · 在跑 3 / 总 11')
    // 总请求数含末位融合（N 个分项 + 1）
    expect(updates[0].progress.total).toBe(11)
    expect(updates[0].progress.done).toBe(0)

    // 满载即补：释放 1 个，**不推进任何时间**也必须立刻补发第 4 个
    expect(trace.releaseOne()).toBe(1)
    await flush()
    expect(trace.refsStarted()).toEqual(['task:0', 'task:1', 'task:2', 'task:3'])
    expect(trace.pending).toBe(3)

    await drive(promise)
    const report = await promise
    expect(report.sections).toHaveLength(10)
    expect(report.skipped).toEqual([])
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
  })

  /**
   * 原 QA-A2「aiConcurrency=2 < N=10 ≤ 上限 10：仍一次性全发（设定值不切片分批）」
   * → 新 QA-A2「N 是硬上限而不是批数：N=2 时恒 2 个在跑，且 10 项一个不少」。
   */
  it('QA-A2 N=2：恒 2 个在跑，10 项全部执行、无跳过无截断', async () => {
    explainMock.mockImplementation(trace.stub)
    const promise = runFullReading(opts({ tasks: makeTasks(10), maxConcurrency: 2 }))

    await flush()
    await advance(1000)
    expect(trace.starts()).toHaveLength(2)
    // 稳态：每释放 1 个只补 1 个，在途数恒 ≤ 2（I2：inFlight ≤ N）
    const startedTaskCount = (): number =>
      trace.starts().filter((e) => e.scope !== 'full-fusion').length
    for (let i = 0; i < 15; i += 1) {
      const released = trace.release()
      if (released === 0) break
      await flush()
      expect(trace.pending).toBeLessThanOrEqual(2)
      expect(startedTaskCount()).toBeLessThanOrEqual(10)
    }
    await drive(promise)
    const report = await promise
    const taskStarts = trace.starts().filter((e) => e.scope !== 'full-fusion')
    expect(taskStarts).toHaveLength(10)
    expect(new Set(taskStarts.map((e) => e.ref)).size).toBe(10)
    expect(report.sections).toHaveLength(10)
    expect(report.skipped).toEqual([])
  })

  /**
   * 原 QA-A4「resolveSchedule：唯一闸门 N≤Y，K=ceil(N/Y)」→ 断言对象已删除。
   * 新 QA-A4：单旋钮的归一 / 校验 / 迁移三条语义（1–99）+ `resolveSchedule` 不再导出。
   */
  it('QA-A4 单旋钮 1–99：clamp / validate / normalize 三条语义；resolveSchedule 与双参数 API 已删除', () => {
    // ① 上限从 128 收敛到 99（N=99 起速本身就要 98 秒，再大只是扩大误设的爆炸半径）
    expect([AI_MAX_CONCURRENCY_MIN, AI_MAX_CONCURRENCY_MAX]).toEqual([1, 99])
    expect(DEFAULT_AI_MAX_CONCURRENCY).toBe(3)

    // ② 加载期宽松归一：非法回落 fallback，fallback 自身也收敛
    expect(clampMaxConcurrency(3)).toBe(3)
    expect(clampMaxConcurrency(1)).toBe(1)
    expect(clampMaxConcurrency(99)).toBe(99)
    expect(clampMaxConcurrency(0)).toBe(3)
    expect(clampMaxConcurrency(100)).toBe(3)
    expect(clampMaxConcurrency(3.5)).toBe(3)
    expect(clampMaxConcurrency('abc')).toBe(3)
    expect(clampMaxConcurrency(undefined)).toBe(3)
    expect(clampMaxConcurrency(0, 5)).toBe(5)
    expect(clampMaxConcurrency(100, 999)).toBe(3) // 坏 fallback 也要收敛

    // ③ 保存期严格拒绝：非法返回文案，合法返回 null
    expect(validateMaxConcurrency(3)).toBeNull()
    expect(validateMaxConcurrency(1)).toBeNull()
    expect(validateMaxConcurrency(99)).toBeNull()
    for (const bad of [0, 100, 3.5, -1, Number.NaN]) {
      expect(validateMaxConcurrency(bad)).toContain('1–99 的整数')
    }

    // ④ 迁移优先级：aiMaxConcurrency > 旧 aiConcurrency > 默认 3；aiConcurrencyLimit 绝不作来源
    expect(normalizeMaxConcurrency({ aiConcurrency: 8, aiConcurrencyLimit: 64 })).toEqual({
      value: 8,
      adjusted: false,
      legacy: { concurrency: 8, limit: 64 },
    })
    expect(normalizeMaxConcurrency({ aiConcurrencyLimit: 64 })).toEqual({
      value: 3,
      adjusted: false,
      legacy: { limit: 64 },
    })
    expect(normalizeMaxConcurrency({ aiConcurrency: 128 }).value).toBe(99)
    expect(normalizeMaxConcurrency({ aiConcurrency: 128 }).adjusted).toBe(true)
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 7, aiConcurrency: 8 }).value).toBe(7)
    expect(normalizeMaxConcurrency({})).toEqual({ value: 3, adjusted: false, legacy: {} })

    // ⑤ 双参数 / 分批 API 整体删除（旧断言对象不存在了，改为断言它确实不在）
    for (const gone of [
      'resolveSchedule',
      'normalizeConcurrencyPair',
      'validateConcurrencyPair',
      'DEFAULT_AI_CONCURRENCY',
      'DEFAULT_AI_CONCURRENCY_LIMIT',
    ]) {
      expect(concurrencyModule).not.toHaveProperty(gone)
    }
  })

  /**
   * 原 QA-C1「serial：每轮仅 1 个在途、phase「分项解读（串行）」逐字不变」
   * → 新 QA-A3「N=1 即串行：每轮恰 1 个在途，且**不套用起速间隔**（不推进任何时间也能跑完 5 项）」。
   */
  it('QA-A3 N=1 等价串行：恰 1 个在途、顺序 0..4、不产生每任务 1 秒空档', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({ tasks: makeTasks(5), maxConcurrency: 1, onUpdate: (u) => updates.push(u) }),
    )

    const order: string[] = []
    for (let i = 0; i < 5; i += 1) {
      await flush()
      expect(trace.pending).toBe(1) // 任何时刻恰 1 个在途
      expect(trace.release()).toBe(1)
      order.push(trace.refsStarted()[i])
    }
    expect(order).toEqual(['task:0', 'task:1', 'task:2', 'task:3', 'task:4'])

    // 全程未推进 1 秒 → 证明串行档不再有每任务 1 秒空档（I8）
    await flush()
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
    expect(trace.release()).toBe(1)
    await flush()
    const report = await promise

    expect(report.sections).toHaveLength(5)
    // 串行档的 phase 恒为稳态文案，绝不出现「起速中」
    const phases = updates.map((u) => u.progress.phase)
    expect(phases.some((p) => p.includes('起速中'))).toBe(false)
    expect(phases.every((p) => p.includes('最高并发数 1') || p.includes('融合') || p === '已完成')).toBe(
      true,
    )
    expect(updates[0].progress.total).toBe(6)
  })

  /**
   * 原 QA-A3「关系场融合角度：phase 用关系场文案且「最后一步，单独执行」，scope 恒 1 次」
   * → 保留同一契约（融合文案 + 单独执行 + 恒 1 次），只把并发换成单旋钮。
   */
  it('QA-A5 融合恒最后单独执行：晚于全部分项落定、恒 1 次、与分项无时间重叠', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(4),
        maxConcurrency: 2,
        fusionAngle: '关系场整合分析与最终总结论',
        onUpdate: (u) => updates.push(u),
      }),
    )
    await drive(promise)
    const report = await promise

    const fusionStarts = trace.starts().filter((e) => e.scope === 'full-fusion')
    expect(fusionStarts).toHaveLength(1)
    expect(fusionStarts[0].ref).toBe('fusion')
    const lastTaskEnd = Math.max(
      ...trace.ends().filter((e) => e.scope !== 'full-fusion').map((e) => e.seq),
    )
    expect(fusionStarts[0].seq).toBeGreaterThan(lastTaskEnd)

    expect(
      updates.some((u) => u.progress.phase === '融合（最后一步，单独执行）· 已完成 0 / 1'),
    ).toBe(true)
    expect(report.fusion).toContain('整合正文')
    expect(report.summary).toContain('总结正文')
    expect(updates[updates.length - 1].progress.phase).toBe('已完成')
    expect(updates[updates.length - 1].progress.done).toBe(5)
  })
})

/* ══════════════════════════════════════════════════════════
 * QA-B｜进度文案（替代 v2.3 的 N/Y/K 降级文案）
 * ══════════════════════════════════════════════════════════ */

describe('QA-B｜进度文案与终态常驻提示', () => {
  /**
   * 原 QA-B1「N=10/上限 4：批宽序列严格为 4/4/2」+ QA-B2「首帧含 N/Y/K 与「全部 10 项都会执行」」
   * + QA-B3a「分项阶段所有 current 均含 N/Y/K」三条合并为一条等价强度的新断言：
   *   → 分项阶段每一帧的 phase 必须命中滑动窗口的两套文案之一，
   *     且旧的「一次性并发 / 按上限分 K 批 / 全部 N 项都会执行」一个字都不许再出现。
   */
  it('QA-B1 分项阶段每帧 phase 命中「起速中」或「最高并发数」，旧 N/Y/K 文案全部消失', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({ tasks: makeTasks(10), maxConcurrency: 3, onUpdate: (u) => updates.push(u) }),
    )
    await drive(promise)
    await promise

    const during = updates.filter((u) => !u.progress.phase.includes('融合') && u.progress.phase !== '已完成')
    expect(during.length).toBeGreaterThan(3)
    expect(during.every((u) => /最高并发数 \d+ · 在跑 \d+ \/ 总 \d+|起速中（每秒 1 个）· 已启动 \d+ \/ \d+/.test(u.progress.phase))).toBe(true)
    // total 恒为「分项 + 融合」；done 单调不减且最终等于 total
    expect(during.every((u) => u.progress.total === 11)).toBe(true)
    const dones = during.map((u) => u.progress.done)
    expect(dones.every((d, i) => i === 0 || d >= dones[i - 1])).toBe(true)

    const joined = updates.map((u) => `${u.progress.phase}\n${u.progress.current}`).join('\n')
    for (const gone of [
      '一次性并发',
      '按上限',
      '分 3 批',
      '本次需并发',
      '设定并发数',
      '超过并发上限',
      '全部 10 项都会执行',
      '剩余分项改串行',
      '剩余未启动任务改串行',
    ]) {
      expect(joined).not.toContain(gone)
    }

    const last = updates[updates.length - 1]
    expect(last.progress.phase).toBe('已完成')
    expect(last.progress.done).toBe(11)
    expect(last.progress.current).toBe('已完成')
  })

  /**
   * ★ QA-B3b 原样保留（仅把 v2.3 的 N/Y/K 长文案换成 v4.0 的两套滑动窗口文案）：
   *   融合 / 完成态覆盖 `current` 之后，`terminalHint` 仍能显示
   *   「最高并发数 N · 在跑 X / 总 T」或「起速中（每秒 1 个）· 已启动 M / N」；
   *   且 B 区终态提示节点不依赖 props.progress（progress 置 null 后仍渲染）。
   */
  it('QA-B3b [行为] 分项/融合/完成态均读到并发同义提示，progress 置 null 后仍可见', () => {
    const status = useAiStatus()
    const mk = (current: string, phase: string, done: number): AiProgress => ({
      done,
      total: 11,
      current,
      phase,
      elapsedMs: 0,
      etaMs: null,
      skipped: [],
      failed: [],
    })

    // ① 起速阶段：hint 记住「起速中（每秒 1 个）· 已启动 M / N」
    status.reset()
    status.begin('full', 60000)
    status.applyProgress(mk('', '起速中（每秒 1 个）· 已启动 1 / 3', 0))
    expect(status.snapshot.value.terminalHint).toContain('起速中（每秒 1 个）')
    expect(status.snapshot.value.terminalHint).toContain('已启动 1 / 3')
    expect(status.snapshot.value.terminal).toBe(false)

    // ② 稳态：hint 升级为「最高并发数 N · 在跑 X / 总 T」
    status.applyProgress(mk('分项 2', '最高并发数 3 · 在跑 3 / 总 10', 3))
    expect(status.snapshot.value.terminalHint).toContain('最高并发数 3')
    expect(status.snapshot.value.terminalHint).toContain('在跑 3 / 总 10')

    // ③ 融合阶段：current 被覆盖为融合任务名，同义提示不丢失
    status.applyProgress(mk(FUSION_TITLE, '融合（最后一步，单独执行）· 已完成 0 / 1', 10))
    expect(status.snapshot.value.terminalHint).toContain('最高并发数 3')
    expect(status.snapshot.value.terminal).toBe(false)

    // ④ 完成态：finish 不覆盖，终态静态常驻
    status.finish('completed')
    expect(status.snapshot.value.terminal).toBe(true)
    expect(status.snapshot.value.terminalHint).toContain('最高并发数 3')

    // ⑤ 组件承载：B 区终态提示节点不依赖 props.progress（progress=null 仍渲染）。
    //    用通用契约断言，不硬编码组件内部 ref 名，也不限定 B 区标签（section / div 均可）。
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/panel/AiReadingPanel.vue'),
      'utf8',
    )
    const zoneB = panel.match(/<[a-z]+[^>]*data-zone="B"[^>]*>/)
    expect(zoneB).not.toBeNull()
    expect(zoneB![0]).not.toContain('v-if="progress"')
    expect(panel).toContain('role="status" aria-live="polite"')
    // 自引用 v-if 的常驻提示节点：v-if 只依赖提示 ref，不依赖 progress
    const hintNode = panel.match(/<p v-if="(\w+)"[^>]*>\{\{ \1 \}\}<\/p>/)
    expect(hintNode).not.toBeNull()
    expect(hintNode![0]).not.toContain('progress')
    // 节点位于 v-if="progress" 容器之外（progress 置 null 后仍渲染）
    const hintIdx = panel.indexOf(hintNode![0])
    const wrapIdx = panel.indexOf('v-if="progress"')
    expect(hintIdx).toBeGreaterThan(wrapIdx)
    expect(panel.slice(wrapIdx, hintIdx)).toContain('</div>')
    // 常驻链路：组件 watch props.progress?.current 或状态单例 terminalHint 至少其一
    const hasCurrentWatch = /watch\(\s*\(\)\s*=>\s*props\.progress\?\.current/.test(panel)
    const hasStatusHint = panel.includes('status.snapshot.value.terminalHint')
    expect(hasCurrentWatch || hasStatusHint).toBe(true)

    status.reset() // 清理单例计时器，避免跨用例串台
  })

  /**
   * ★ QA-B4 原样保留并加严：五区 A~E（A 出现两次，HEAD 基线即为 6 处）/
   *   B 区 role=status / A·B·C·E flex:none / D 唯一滚动 + min-height:0 /
   *   遮罩无事件 / 放大态 inset 定位与无横向溢出 / 唯一取消入口（恰 3 处 emit('cancel')）/
   *   状态唯一源 / D 区破坏性·业务控件数 0 / 禁止词只扫运行时 label 与模板文案。
   *   ★ 新增守卫：相对 HEAD 的 diff 只允许 `module: false` 一行（桌面冒烟契约不得漂移）。
   */
  it('QA-B4 [五区契约] A~E 六处 / 唯一滚动 / 放大态 / 恰 3 处取消 / 状态唯一源 / diff 仅一行', () => {
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/panel/AiReadingPanel.vue'),
      'utf8',
    )
    const statusSrc = readFileSync(
      resolve(process.cwd(), 'src/composables/useAiStatus.ts'),
      'utf8',
    )

    // ① 五区结构：data-zone 共 6 处（A 出现两次：head 区 + export-bar 区）
    for (const z of ['A', 'B', 'C', 'D', 'E']) {
      expect(panel).toContain(`data-zone="${z}"`)
    }
    expect((panel.match(/data-zone="/g) ?? []).length).toBe(6)
    expect((panel.match(/data-zone="A"/g) ?? []).length).toBe(2)
    expect(panel).toContain('role="status" aria-live="polite"')

    // ② 关闭按钮的可访问名恒为「关闭」（IconButton 的 label 落到 aria-label）
    expect(panel).toContain('label="关闭"')
    expect(panel).toContain('icon="close"')

    // ③ A/B/C/E 固定 flex:none
    const flexIdx = panel.indexOf('flex: none')
    expect(flexIdx).toBeGreaterThan(-1)
    const flexHead = panel.slice(Math.max(0, flexIdx - 240), flexIdx)
    for (const z of ['.zone-a', '.zone-b', '.zone-c', '.zone-e']) {
      expect(flexHead).toContain(z)
    }
    // ④ D 唯一独立滚动：min-height:0 + overflow-y:auto + 禁止横向溢出
    expect(panel).toContain('min-height: 0')
    expect(panel).toContain('overflow-y: auto')
    expect(panel).toContain('overflow-x: hidden')
    // ⑤ 遮罩无任何事件监听（点击不关闭、不中断）
    const mask = panel.match(/<div[^>]*class="ai-mask"[^>]*>/)
    expect(mask).not.toBeNull()
    expect(mask![0]).not.toContain('@click')
    expect(mask![0]).toContain('aria-hidden="true"')
    // ⑥ 放大态：inset 定位、容器 overflow:hidden、无 translate 变换、手机端适配
    for (const x of [
      '.ai-panel.is-expanded',
      "'is-expanded': expanded",
      'overflow: hidden',
      'max-width: none',
      'transform: none',
      '@media (max-width: 768px)',
    ]) {
      expect(panel).toContain(x)
    }

    // ⑦ 唯一「取消请求」入口：3 处 emit 位于互斥分支，统一经 ConfirmDialog 确认
    expect((panel.match(/emit\('cancel'\)/g) ?? []).length).toBe(3)
    expect(panel).toContain('v-else-if="loading && !hasContent"')
    expect(panel).toContain('v-else-if="loading"')
    expect(panel).toContain('ConfirmDialog')
    // ⑧ 状态唯一源：无第二套「进行中」状态容器
    expect(panel).not.toContain('进行中')
    expect((panel.match(/role="status"/g) ?? []).length).toBe(1)
    expect((panel.match(/class="progress-wrap"/g) ?? []).length).toBe(1)
    // ⑨ D 区业务 / 破坏性控件数 = 0
    const dStart = panel.indexOf('data-zone="D"')
    const dEnd = panel.indexOf('<ConfirmDialog', dStart)
    expect(dStart).toBeGreaterThan(-1)
    expect(dEnd).toBeGreaterThan(dStart)
    const dBlock = panel.slice(dStart, dEnd)
    for (const banned of [
      "emit('close')",
      "emit('regenerate')",
      "emit('save')",
      "emit('copy')",
      "emit('settings')",
      'doExport(',
      'setAll(',
      'requestRegenerate(',
      'requestClose(',
    ]) {
      expect(dBlock).not.toContain(banned)
    }

    // ⑩ 禁止词：只扫运行时 label 赋值 / 模板文案，排除注释行
    const runtimeOnly = (src: string): string =>
      src
        .split('\n')
        .filter((l) => {
          const t = l.trim()
          return (
            t &&
            !t.startsWith('*') &&
            !t.startsWith('//') &&
            !t.startsWith('/*') &&
            !t.startsWith('<!--')
          )
        })
        .join('\n')
    const runtimeText = `${runtimeOnly(statusSrc)}\n${runtimeOnly(panel)}`
    for (const banned of [
      'AI 正在思考',
      '服务端已连接',
      '服务端已并发处理',
      '模型正在生成第',
      '模型正在同时生成',
      '剩余未启动任务改串行',
      '剩余分项改串行',
      'translate(-50%',
    ]) {
      expect(runtimeText).not.toContain(banned)
    }

    // ⑪ ★ 守卫：该文件除 `DEFAULT_OPEN` 的 module 键外，其余契约一字未动。
    // 本地未提交时再收紧为「工作区 diff 仅 1 行」；CI 检出的是干净提交，
    // `git diff` 必然为空，因此改用文件内容直接校验同一份契约（两种环境都成立）。
    const panelSrc = readFileSync(
      resolve(process.cwd(), 'src/components/panel/AiReadingPanel.vue'),
      'utf8',
    )
    const openBlock = panelSrc.match(
      /const DEFAULT_OPEN:\s*Record<FullSectionKind,\s*boolean>\s*=\s*\{([^}]*)\}/,
    )?.[1]
    expect(openBlock).toBeDefined()
    expect((openBlock ?? '').replace(/\s+/g, '')).toBe(
      'module:false,dimension:true,gate:false,channel:false,',
    )
    const numstat = execFileSync(
      'git',
      ['diff', '--numstat', '--', 'src/components/panel/AiReadingPanel.vue'],
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim()
    if (numstat) {
      expect(numstat).toBe('1\t0\tsrc/components/panel/AiReadingPanel.vue')
      const diff = execFileSync(
        'git',
        ['diff', '--', 'src/components/panel/AiReadingPanel.vue'],
        { cwd: process.cwd(), encoding: 'utf8' },
      )
      const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'))
      expect(added).toEqual(['+  module: false,'])
      expect(removed).toEqual([])
    }
  })
})

/* ══════════════════════════════════════════════════════════
 * QA-C｜单次解读不受影响 + 触顶提示只发一次
 * ══════════════════════════════════════════════════════════ */

describe('QA-C｜单次解读与配置拦截不受并发改动影响', () => {
  it('QA-C1 单次解读（非 full）：只发 1 次 explain、无融合、progress 为 null；并发配置非法也不受影响', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    // 故意把最高并发数写成非法值：单次档根本不读它，应当完全无感
    settings.aiMaxConcurrency = 999
    explainMock.mockResolvedValue('单次解读正文')

    const scope = effectScope()
    const reading = scope.run(() => useAiReading())!
    await reading.run({
      scope: 'gate',
      ref: '1',
      title: '闸门 1 深度解读',
      offline: '离线事实',
    })
    scope.stop()

    expect(explainMock).toHaveBeenCalledTimes(1)
    expect(explainMock.mock.calls[0][0].scope).toBe('gate')
    expect(explainMock.mock.calls[0][0].detailMode).not.toBe('full')
    expect(explainMock.mock.calls.some((c) => c[0].scope === 'full-fusion')).toBe(false)
    const ui = useUiStore()
    expect(ui.aiReading.progress).toBeNull()
    expect(ui.aiReading.content).toBe('单次解读正文')
  })

  it('QA-C2 未配置 AI：validateAiConfig 拦截、0 次 explain、正文节点为空', async () => {
    explainMock.mockResolvedValue('不应出现')
    const scope = effectScope()
    const reading = scope.run(() => useAiReading())!
    await reading.run({ scope: 'gate', ref: '1', title: '闸门 1', offline: '离线事实' })
    scope.stop()

    expect(explainMock).not.toHaveBeenCalled()
    const ui = useUiStore()
    expect(ui.aiReading.content).toBe('')
    expect(ui.aiReading.error).toBeTruthy()
    expect(ui.aiReading.report).toBeNull()
  })

  /**
   * 原 QA-C4「并发降级只发一次 info toast（composable 层，闭包去重）」
   * → 并发降级这条产品路径已被删除（N 就是上限，不存在「超限降级」），
   *   等价强度的替代口径是：**同一次解读里唯一的一次性 info 提示 —— 触顶提示 —— 只发一次**。
   */
  it('QA-C3 触顶只发一次 info toast（composable 层）', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    const ui = useUiStore()
    const notifySpy = vi.spyOn(ui, 'notify').mockImplementation(() => {})
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      args.onStage?.({
        stage: 'completed',
        at: Date.now(),
        elapsedMs: 1,
        timeoutMs: 60000,
        truncated: true,
      })
      return '触顶正文'
    })

    const scope = effectScope()
    const reading = scope.run(() => useAiReading())!
    await reading.run({ scope: 'gate', ref: '1', title: '闸门 1', offline: '离线事实' })
    scope.stop()

    const infoCalls = notifySpy.mock.calls.filter((c) => c[1] === 'info')
    expect(infoCalls).toHaveLength(1)
    expect(String(infoCalls[0][0])).toContain('模型上限')
    expect(ui.aiReading.resultTruncated).toBe(true)
    notifySpy.mockRestore()
  })
})

/* ══════════════════════════════════════════════════════════
 * QA-D｜单旋钮的设置层：拒绝保存 / 三条迁移路径 / persist 字段
 * ══════════════════════════════════════════════════════════ */

describe('QA-D｜最高并发数的保存期校验与迁移', () => {
  /**
   * 原 QA-D1「两个 setter：c>l 一律拒绝」+ QA-D2「0/129/小数/非数字…全部拒绝」
   * → 合并为新 QA-D1「单 setter：0 / 100 / 3.5 / 非数字一律拒绝，store 与 localStorage 原值不变」。
   */
  it('QA-D1 setAiMaxConcurrency(0|100|3.5|…)：被拒且不写 store、不改 localStorage', () => {
    const settings = useSettingsStore()
    expect(settings.persist()).toBe(true)
    const before = localStorage.getItem(STORAGE_KEY)
    expect(settings.aiMaxConcurrency).toBe(DEFAULT_AI_MAX_CONCURRENCY)

    for (const bad of [0, 100, 3.5, -1, Number.NaN, 99.5]) {
      expect(settings.setAiMaxConcurrency(bad)).toBe(false)
      expect(settings.aiMaxConcurrency).toBe(DEFAULT_AI_MAX_CONCURRENCY)
      expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    }

    // 边界值合法
    expect(settings.setAiMaxConcurrency(1)).toBe(true)
    expect(settings.aiMaxConcurrency).toBe(1)
    expect(settings.setAiMaxConcurrency(99)).toBe(true)
    expect(settings.aiMaxConcurrency).toBe(99)
  })

  /**
   * 原 QA-D3「state() 三个 return 分支均返回合法默认值 3 / 64」
   * → 新 QA-D2「三个分支均产出 aiMaxConcurrency = 3 与 aiStyle = pro，且 4 个旧字段不在 state」。
   */
  it('QA-D2 state() 三个 return 分支均给出默认 3 / pro，旧字段不出现在 state', () => {
    // 分支 1：有 profiles
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        aiProfiles: [
          {
            id: 'p1',
            name: 'A',
            baseUrl: 'https://a.example.com/v1',
            apiKey: 'sk-aaaaaaaa',
            model: 'm',
            timeoutMs: 60000,
            cacheEnabled: true,
          },
        ],
        activeAiId: 'p1',
      }),
    )
    setActivePinia(createPinia())
    const s1 = useSettingsStore()
    expect(s1.aiProfiles).toHaveLength(1)
    expect([s1.aiMaxConcurrency, s1.aiStyle]).toEqual([3, 'pro'])

    // 分支 2：旧单配置迁移
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ai: {
          baseUrl: 'https://b.example.com/v1',
          apiKey: 'sk-bbbbbbbb',
          model: 'legacy',
          timeoutMs: 30000,
          cacheEnabled: true,
        },
      }),
    )
    setActivePinia(createPinia())
    const s2 = useSettingsStore()
    expect(s2.aiProfiles).toHaveLength(1)
    expect([s2.aiMaxConcurrency, s2.aiStyle]).toEqual([3, 'pro'])

    // 分支 3：全新
    localStorage.removeItem(STORAGE_KEY)
    setActivePinia(createPinia())
    const s3 = useSettingsStore()
    expect(s3.aiProfiles).toHaveLength(0)
    expect([s3.aiMaxConcurrency, s3.aiStyle]).toEqual([3, 'pro'])

    for (const s of [s1, s2, s3]) {
      for (const gone of REMOVED_FIELDS) {
        expect(s.$state).not.toHaveProperty(gone)
      }
    }
  })

  /**
   * 原 QA-D4「存量非法配置归一 + 一次可见提示（消费即清、不写回、不进 SettingsState）」
   * → 保留同一契约，字段换成单旋钮（旧 100/20 → 99，并投递一次合并提示）。
   */
  it('QA-D3 存量非法配置归一 + 一次可见提示（消费即清、不进 SettingsState）', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ aiConcurrency: 100, aiConcurrencyLimit: 20 }))
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    expect(settings.aiMaxConcurrency).toBe(99)
    const notice = takeConcurrencyMigrationNotice()
    expect(notice).toContain('已调整为合法值')
    // 旧「并发上限 20」也要被明确告知不再单独生效（不静默丢意图）
    expect(notice).toContain('原「并发上限 20」不再单独生效')
    expect(takeConcurrencyMigrationNotice()).toBeNull()
    expect('migrationNotice' in settings.$state).toBe(false)
  })

  /** 原 QA-D5「persist 仅新增两个顶层 number 字段」→ 单旋钮下只剩一个 */
  it('QA-D4 persist 只含 aiMaxConcurrency 一个并发字段 + aiStyle，4 个已删字段不再写盘', () => {
    const settings = useSettingsStore()
    expect(settings.persist()).toBe(true)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as Record<string, unknown>

    expect(Object.keys(saved).filter((k) => /concurrency/i.test(k)).sort()).toEqual([
      'aiMaxConcurrency',
    ])
    expect(typeof saved.aiMaxConcurrency).toBe('number')
    expect(saved.aiStyle === 'pro' || saved.aiStyle === 'plain').toBe(true)
    for (const gone of REMOVED_FIELDS) {
      expect(saved).not.toHaveProperty(gone)
    }
    // 旧字段也不得被塞进 AiConfig 镜像里
    expect((saved.ai as Record<string, unknown>).aiConcurrency).toBeUndefined()
    expect((saved.ai as Record<string, unknown>).aiConcurrencyLimit).toBeUndefined()
  })

  it('QA-D5 旧存档 {aiConcurrency:8, aiConcurrencyLimit:64} → aiMaxConcurrency === 8（绝不迁 64）', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ aiConcurrency: 8, aiConcurrencyLimit: 64 }),
    )
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    expect(settings.aiMaxConcurrency).toBe(8)
    // 恰好 64 是旧「技术闸门」的默认值，不构成提示条件
    expect(takeConcurrencyMigrationNotice()).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════
 * QA-E｜失败补救与取消不伪造（QA-E2/E3/E4 原样保留）
 * ══════════════════════════════════════════════════════════ */

describe('QA-E｜失败补救与取消不伪造', () => {
  /**
   * 原 QA-E1「M=2 项失败：一次性批次后串行重跑，成功项不重跑（task:2 被调用 4 次）」
   * → 新 QA-E1：重试由调度器在**原并发槽**内完成（attempts ≤ 2，风险 R13 明令禁止
   *   与 withRetry 叠加成 4 次），成功项仍绝不重跑，失败项进 skipped 且不阻断融合。
   */
  it('QA-E1 失败项只在原槽重试一次（attempts ≤ 2），成功项不重跑，失败不阻断融合', async () => {
    trace.failRefs.add('task:1')
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({ tasks: makeTasks(3), maxConcurrency: 1, onUpdate: (u) => updates.push(u) }),
    )
    await drive(promise)
    const report = await promise

    const countOf = (ref: string) => trace.starts().filter((e) => e.ref === ref).length
    expect(countOf('task:0')).toBe(1) // 成功项绝不重跑
    expect(countOf('task:2')).toBe(1)
    expect(countOf('task:1')).toBe(2) // 首次 + 重试 1 次；不能是 4 次
    expect(countOf('task:1')).toBeLessThanOrEqual(2)

    expect(report.sections).toHaveLength(3)
    expect(report.sections.map((s) => s.key)).toEqual(['task:0', 'task:1', 'task:2'])
    expect(report.sections[1].content).toBe('') // 失败项不伪造
    expect(report.skipped).toEqual(['分项 1'])
    expect(report.fusion).toContain('整合正文') // 失败不阻断融合
    // 不再有「剩余分项改串行」这类第二遍重跑阶段
    const joined = updates.map((u) => `${u.progress.phase}${u.progress.current}`).join('\n')
    expect(joined).not.toContain('重跑')
    expect(joined).not.toContain('剩余')
  })

  it('QA-E2 分项阶段取消：不进入融合、不产出 fusion/summary、不写占位文本（原样保留）', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(6),
        maxConcurrency: 3,
        signal: controller.signal,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await flush()
    // 起速只启动了第 1 个（N=3）
    expect(trace.pending).toBe(1)
    const startedBefore = trace.starts().length
    controller.abort()
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' })

    // 取消后不再启动新任务
    await flush()
    expect(trace.starts()).toHaveLength(startedBefore)
    expect(trace.starts().some((e) => e.scope === 'full-fusion')).toBe(false)
    expect(updates.every((u) => u.fusion === '' && u.summary === '')).toBe(true)
    expect(updates.every((u) => u.sections.every((s) => !s.content.includes('占位')))).toBe(true)
  })

  it('QA-E3 融合阶段取消：fusion/summary 为空、已成功分项保留、不做失败项重跑（原样保留）', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(5),
        maxConcurrency: 1,
        signal: controller.signal,
        onUpdate: (u) => updates.push(u),
      }),
    )
    // 5 项逐个落定（N=1，不推进时间也能跑完）
    for (let i = 0; i < 5; i += 1) {
      await flush()
      expect(trace.release()).toBe(1)
    }
    await flush()
    // 融合已发起、挂起中
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
    controller.abort()
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' })

    const last = updates[updates.length - 1]
    expect(last.fusion).toBe('')
    expect(last.summary).toBe('')
    expect(last.sections).toHaveLength(5)
    expect(last.skipped).not.toContain(FUSION_TITLE)
    // 已成功分项全部保留，且不重跑
    expect(last.sections.every((s) => s.content.startsWith('正文-'))).toBe(true)
    expect(trace.starts().filter((e) => e.ref.startsWith('task:'))).toHaveLength(5)
  })

  it('QA-E4 融合失败：报告仍由全部分项构成、skipped 含融合标题（原样保留）', async () => {
    trace.failFusion = true
    explainMock.mockImplementation(trace.stub)
    const promise = runFullReading(opts({ tasks: makeTasks(5), maxConcurrency: 1 }))
    await drive(promise)
    const report = await promise

    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(2) // 重试 1 次
    expect(report.sections).toHaveLength(5)
    expect(report.fusion).toBe('')
    expect(report.summary).toBe('')
    expect(report.skipped).toContain(FUSION_TITLE)
  })

  it('QA-E5 分项跳过时融合输入含「请勿据此推断」', async () => {
    trace.failRefs.add('task:1')
    explainMock.mockImplementation(trace.stub)
    const promise = runFullReading(opts({ tasks: makeTasks(4), maxConcurrency: 1 }))
    await drive(promise)
    await promise
    const fusionCall = explainMock.mock.calls.find((c) => c[0].scope === 'full-fusion')
    expect(fusionCall).toBeDefined()
    expect(String(fusionCall![0].offline)).toContain('请勿据此推断')
    expect(String(fusionCall![0].offline)).toContain('未完成分项')
  })
})

/* ══════════════════════════════════════════════════════════
 * QA-F｜禁止词 / 冻结契约静态检查
 * ══════════════════════════════════════════════════════════ */

describe('QA-F｜禁止词与冻结清单静态契约', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  it('QA-F1 全库禁止词 0 处；B 区不存在两套「进行中」表达', () => {
    const joined = [
      'src/services/aiFullReading.ts',
      'src/services/aiConcurrency.ts',
      'src/services/aiScheduler.ts',
      'src/services/aiReadingRunner.ts',
      'src/services/aiPrompt.ts',
      'src/composables/useAiReading.ts',
      'src/components/panel/AiReadingPanel.vue',
      'src/components/settings/SettingsForm.vue',
      'src/stores/settings.ts',
    ]
      .map(read)
      .join('\n')
    for (const banned of [
      'AI 正在思考',
      '服务端已连接',
      '服务端已并发处理',
      '模型正在生成第',
      '模型正在同时生成',
      '剩余未启动任务改串行',
      '剩余分项改串行',
    ]) {
      expect(joined).not.toContain(banned)
    }
    expect(read('src/components/panel/AiReadingPanel.vue')).not.toContain('进行中')
  })

  it('QA-F2 AiProgress 仍为 8 字段；提示词版本与计算锚点未被改写（原样保留）', () => {
    const reportTypes = read('src/types/report.ts')
    const match = reportTypes.match(/export interface AiProgress \{([\s\S]*?)\n\}/)
    expect(match).not.toBeNull()
    const fields = (match![1] as string).split('\n').filter((l) => /^\s{2}\w+\s*:/.test(l))
    expect(fields).toHaveLength(8)

    // 新增的 inFlight / maxConcurrency 必须留在独立的 ReadingProgress 里，
    // 不得混进 AiProgress（否则面板 8 字段契约就破了）
    const readingTypes = read('src/types/aiReading.ts')
    const readingMatch = readingTypes.match(/export interface ReadingProgress \{([\s\S]*?)\n\}/)
    expect(readingMatch).not.toBeNull()
    const readingBody = readingMatch![1] as string
    expect(readingBody).toContain('inFlight: number')
    expect(readingBody).toContain('maxConcurrency: number')
    expect(match![1]).not.toContain('inFlight')
    expect(match![1]).not.toContain('maxConcurrency')

    expect(read('src/services/aiClient.ts')).toContain("PROMPT_VERSION = '4.2'")
    expect(read('src/engine/mandala.ts')).toContain('29.875')
    expect(read('src/engine/mandala.ts')).toContain('302.000')

    // DEV-103（v3.7.0）口径一致性静态防线：现行文档必须锁 29.875°，
    // 防止旧值 29.8333 通过复制粘贴回流。docs/review/ 的历史值属审计语境，不在检查范围。
    const arch = read('docs/ARCHITECTURE.md')
    const readme = read('README.md')
    expect(arch).toContain('29.875')
    expect(arch).not.toContain('29.8333')
    expect(readme).toContain('29.875')
    // README 的「v1.2.0 修正旧值」与「与沿用旧值的实现比对」说明允许出现 29.8333，
    // 但这些行必须带历史语境关键词；新复制粘贴进来的裸旧值会被拦下。
    const staleLines = readme
      .split('\n')
      .filter(
        (line) =>
          line.includes('29.8333') &&
          !/修正|旧版本|旧值|沿用|free-human-design|v1\.2\.0/.test(line),
      )
    expect(staleLines).toEqual([])
  })
})
