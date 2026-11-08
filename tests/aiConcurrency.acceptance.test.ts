/**
 * QA 独立验收测试（严过关 / Yan）—— v2.3.0 AI 并发能力 AC-C1～AC-C19。
 *
 * 与工程师 `tests/aiConcurrency.test.ts` 完全独立：不复用其辅助函数、不复用其断言角度。
 * 核心手段是「受控 Promise + 全局单调 seq」：
 *   每次 explain() 调用记录 start(seq)，每次响应记录 end(seq)，由测试分阶段 release，
 *   从而直接证明「同一批次一次性发起」「融合严格晚于全部分项」「批宽序列」
 *   「失败项串行重跑时每轮仅 1 个在途请求」，而不是只数调用次数。
 *
 * 约束：environment = node；vi.mock / vi.stubGlobal / vi.spyOn / fake 宏任务；
 *       无 jsdom、无 @vue/test-utils、无组件挂载、无新增任何第三方依赖。
 *       本文件不修改任何源码，也不修改工程师既有测试。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { readFileSync } from 'node:fs'
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
import {
  DEFAULT_AI_CONCURRENCY,
  DEFAULT_AI_CONCURRENCY_LIMIT,
  normalizeConcurrencyPair,
  resolveSchedule,
  validateConcurrencyPair,
} from '../src/services/aiConcurrency'
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
const STORAGE_KEY = 'hdt.settings.v1'

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
    stepMode: 'parallel',
    ...overrides,
  }
}

/** 冲净挂起的 microtask 链，使同一 Promise.all 批次的同步发起全部完成 */
async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((r) => setTimeout(r, 0))
  }
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

class Trace {
  seq = 0
  events: TraceEvent[] = []
  readonly failRefs = new Set<string>()
  failFusion = false
  private resolvers: Array<() => void> = []

  get pending(): number {
    return this.resolvers.length
  }

  reset(): void {
    this.seq = 0
    this.events = []
    this.resolvers = []
    this.failRefs.clear()
    this.failFusion = false
  }

  starts(): TraceEvent[] {
    return this.events.filter((e) => e.kind === 'start')
  }

  ends(): TraceEvent[] {
    return this.events.filter((e) => e.kind === 'end')
  }

  /** 每个请求都挂起，直到测试显式 release；失败项按 failRefs 注入 */
  stub = (args: AiExplainArgs): Promise<string> => {
    const scope = String(args.scope)
    const ref = String(args.ref ?? '')
    this.events.push({ seq: ++this.seq, kind: 'start', scope, ref })
    return new Promise<string>((done, fail) => {
      this.resolvers.push(() => {
        this.events.push({ seq: ++this.seq, kind: 'end', scope, ref })
        if (this.failRefs.has(ref) || (scope === 'full-fusion' && this.failFusion)) {
          fail(new Error('QA 注入失败'))
        } else {
          done(scope === 'full-fusion' ? FUSION_RAW : `正文-${ref}`)
        }
      })
    })
  }

  /** 释放当前所有在途请求，返回释放个数 */
  release(): number {
    const batch = this.resolvers.splice(0)
    batch.forEach((r) => r())
    return batch.length
  }

  /** 反复 settle→release 直到 promise 落定，记录每一轮新发起的请求 */
  async pump(promise: Promise<unknown>): Promise<string[][]> {
    let settled = false
    void promise.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    const rounds: string[][] = []
    let seen = 0
    for (let i = 0; i < 40 && !settled; i += 1) {
      await settle()
      const all = this.starts()
      const fresh = all.slice(seen).map((e) => `${e.scope}#${e.ref}`)
      if (fresh.length) rounds.push(fresh)
      seen = all.length
      if (this.pending > 0) this.release()
    }
    return rounds
  }
}

const trace = new Trace()

beforeEach(() => {
  explainMock.mockReset()
  trace.reset()
  stubStorage()
  setActivePinia(createPinia())
  takeConcurrencyMigrationNotice() // 清掉模块级一次性提示，避免跨用例串台
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ══════════════════════════════════════════════════════════
 * 1. 一次性并发：批次数 = 1，融合最后单独执行（AC-C7/C8/C9/C10）
 * ══════════════════════════════════════════════════════════ */

describe('QA-A｜一次性并发与融合例外的时序证明', () => {
  it('QA-A1 N=10/上限≥10：任何响应之前 10 项已一次性发起（非 3+3+3+1），批次数=1', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrency: 3,
        aiConcurrencyLimit: 64,
        onUpdate: (u) => updates.push(u),
      }),
    )

    // Arrange/Act：让编排走到「请求已发出、但零响应」的时刻
    await settle()

    // Assert：10 个分项同属一个批次，且没有任何一项完成、没有融合请求
    const starts = trace.starts()
    expect(starts).toHaveLength(10)
    expect(trace.ends()).toHaveLength(0)
    expect(starts.every((e) => e.scope === 'full-dimension')).toBe(true)
    expect(new Set(starts.map((e) => e.ref)).size).toBe(10)
    // 旧口径会在第一批只发 3 项；此处 10 项全部在途即证明批次=1
    expect(updates[0].progress.phase).toBe('分项解读（一次性并发 10 项）')
    expect(updates[0].progress.current).toContain('一次性并发 10 项')
    expect(updates[0].progress.current).toContain('设定并发数 3 / 上限 64')
    expect(updates[0].progress.total).toBe(11) // N + 1（融合）
    expect(updates[0].progress.done).toBe(0)

    // Act：释放 10 项 → 融合才应发起，且严格晚于全部分项完成
    expect(trace.release()).toBe(10)
    await settle()
    const fusionStarts = trace.starts().filter((e) => e.scope === 'full-fusion')
    expect(fusionStarts).toHaveLength(1)
    expect(fusionStarts[0].ref).toBe('fusion')
    const lastTaskEnd = Math.max(
      ...trace.ends().filter((e) => e.scope !== 'full-fusion').map((e) => e.seq),
    )
    expect(fusionStarts[0].seq).toBeGreaterThan(lastTaskEnd)
    expect(trace.pending).toBe(1) // 只有融合在途，与分项请求无时间重叠

    // Act：释放融合 → 收报告
    expect(trace.release()).toBe(1)
    const report = await promise

    // Assert：融合恒 1 次、done 由 N→N+1、报告含全部 10 个分项
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
    expect(report.sections).toHaveLength(10)
    expect(report.sections.map((s) => s.key)).toEqual(makeTasks(10).map((t) => t.key))
    expect(report.skipped).toEqual([])
    expect(report.fusion).toContain('整合正文')
    expect(report.summary).toContain('总结正文')
    const dones = updates.map((u) => u.progress.done)
    expect(dones[0]).toBe(0)
    expect(dones).toContain(10)
    expect(dones[dones.length - 1]).toBe(11)
    expect(updates.some((u) => u.progress.phase === '全盘整合分析（最后一步，单独执行）')).toBe(true)
    expect(updates[updates.length - 1].progress.phase).toBe('已完成')
  })

  it('QA-A2 aiConcurrency=2 < N=10 ≤ 上限 10：仍一次性全发（设定值不切片分批，Q-C1）', async () => {
    explainMock.mockImplementation(trace.stub)
    const promise = runFullReading(
      opts({ tasks: makeTasks(10), stepMode: 'parallel', aiConcurrency: 2, aiConcurrencyLimit: 10 }),
    )
    await settle()
    expect(trace.starts()).toHaveLength(10)
    expect(trace.starts().every((e) => e.scope !== 'full-fusion')).toBe(true)
    expect(trace.release()).toBe(10)
    await settle()
    expect(trace.release()).toBe(1)
    const report = await promise
    expect(report.sections).toHaveLength(10)
  })

  it('QA-A3 关系场融合角度：phase 用关系场文案且「最后一步，单独执行」，scope 恒 1 次', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(4),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        fusionAngle: '关系场整合分析与最终总结论',
        onUpdate: (u) => updates.push(u),
      }),
    )
    await settle()
    expect(trace.release()).toBe(4)
    await settle()
    expect(trace.release()).toBe(1)
    await promise
    expect(
      updates.some(
        (u) => u.progress.phase === '关系场整合分析与最终总结论（最后一步，单独执行）',
      ),
    ).toBe(true)
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
  })

  it('QA-A4 resolveSchedule：唯一闸门 N≤Y，serial 不受影响，K=ceil(N/Y)', () => {
    expect(resolveSchedule(10, 64, 'parallel')).toEqual({
      required: 10,
      limit: 64,
      batchWidth: 10,
      batchCount: 1,
      K: 1,
      degraded: false,
    })
    expect(resolveSchedule(10, 4, 'parallel')).toEqual({
      required: 10,
      limit: 4,
      batchWidth: 4,
      batchCount: 3,
      K: 3,
      degraded: true,
    })
    expect(resolveSchedule(5, 64, 'serial')).toEqual({
      required: 5,
      limit: 64,
      batchWidth: 1,
      batchCount: 5,
      K: 5,
      degraded: false,
    })
    expect(resolveSchedule(64, 64, 'parallel').degraded).toBe(false)
    expect(resolveSchedule(65, 64, 'parallel').K).toBe(2)
  })
})

/* ══════════════════════════════════════════════════════════
 * 2. 条件 ② 超限降级（AC-C5 / AC-C6）
 * ══════════════════════════════════════════════════════════ */

describe('QA-B｜超限降级：K 批、N 项一个不少、状态区 N/Y/K 提示', () => {
  it('QA-B1 N=10/上限 4：批宽序列严格为 4/4/2，全部 10 项执行、无跳过无截断', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrencyLimit: 4,
        onUpdate: (u) => updates.push(u),
      }),
    )

    const widths: number[] = []
    for (let round = 0; round < 3; round += 1) {
      await settle()
      const fresh = trace.starts().filter((e) => e.scope !== 'full-fusion')
      widths.push(fresh.length - (round === 0 ? 0 : widths.reduce((a, b) => a + b, 0)))
      expect(trace.release()).toBeGreaterThan(0)
    }
    await settle()
    // 三批结束后融合才发起
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
    expect(trace.release()).toBe(1)
    const report = await promise

    expect(widths).toEqual([4, 4, 2])
    const taskStarts = trace.starts().filter((e) => e.scope !== 'full-fusion')
    expect(taskStarts).toHaveLength(10)
    expect(new Set(taskStarts.map((e) => e.ref)).size).toBe(10)
    expect(report.sections).toHaveLength(10)
    expect(report.skipped).toEqual([])
    expect(updates[0].progress.total).toBe(11)
    expect(updates[updates.length - 1].progress.done).toBe(11)
    // 融合晚于全部分项请求完成
    const fusionStart = trace.starts().find((e) => e.scope === 'full-fusion')!
    const lastEnd = Math.max(...trace.ends().filter((e) => e.scope !== 'full-fusion').map((e) => e.seq))
    expect(fusionStart.seq).toBeGreaterThan(lastEnd)
  })

  it('QA-B2 降级文案：首帧即含 N/Y/K 与「全部 10 项都会执行」，分项阶段每次 publish 常驻', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrencyLimit: 4,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await settle()

    // 首帧（≤300ms 可见）就带完整 N/Y/K
    expect(updates[0].progress.phase).toBe('分项解读（按上限 4 分 3 批）')
    expect(updates[0].progress.current).toContain('本次需并发 10 项')
    expect(updates[0].progress.current).toContain('超过并发上限 4')
    expect(updates[0].progress.current).toContain('分 3 批执行')
    expect(updates[0].progress.current).toContain('全部 10 项都会执行，不会减少')
    expect(updates[0].progress.current).toContain('可在设置页提高并发上限以启用一次性并发')

    // 分项阶段（融合之前）每次 publish 都携带常驻提示
    for (let i = 0; i < 3; i += 1) {
      expect(trace.release()).toBeGreaterThan(0)
      await settle()
    }
    const duringTasks = updates.filter((u) => !u.progress.phase.includes('最后一步') && u.progress.phase !== '已完成')
    expect(duringTasks.length).toBeGreaterThan(1)
    expect(duringTasks.every((u) => u.progress.current.includes('全部 10 项都会执行'))).toBe(true)
    expect(trace.release()).toBe(1)
    await promise
  })

  /**
   * ★ 主理人确认的 QA-B3 口径（QA 路由，两条等价强度断言，不降低强度、不删断言）：
   *   ARCH §11.5 规定「融合阶段 current 显示融合任务名」，PRD §4.2 的「常驻」是 UI 行为要求，
   *   不应把 UI 常驻责任压到数据层 current。故：
   *     ① 数据层（QA-B3a）：分项阶段所有 update 的 current 必须含 N/Y/K 与「全部 N 项都会执行」；
   *     ② UI 层（QA-B3b）：融合/完成态由组件常驻 DOM 承接，且 progress 为 null 时该节点仍渲染。
   */
  it('QA-B3a [数据层] 分项阶段所有 update 的 current 均含 N/Y/K 与「全部 N 项都会执行，不会减少」', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrencyLimit: 4,
        onUpdate: (u) => updates.push(u),
      }),
    )
    for (let i = 0; i < 3; i += 1) {
      await settle()
      trace.release()
    }
    await settle()
    trace.release()
    await promise

    const duringTasks = updates.filter(
      (u) => !u.progress.phase.includes('最后一步') && u.progress.phase !== '已完成',
    )
    expect(duringTasks.length).toBeGreaterThan(1)
    expect(duringTasks.every((u) => u.progress.current.includes('本次需并发 10 项'))).toBe(true)
    expect(duringTasks.every((u) => u.progress.current.includes('超过并发上限 4'))).toBe(true)
    expect(duringTasks.every((u) => u.progress.current.includes('分 3 批执行'))).toBe(true)
    expect(duringTasks.every((u) => u.progress.current.includes('全部 10 项都会执行，不会减少'))).toBe(true)
  })

  /**
   * ★ T-6 五区重构后的产品行为验收（结构契约迁移，不硬编码旧变量名 lastConcurrencyNote）：
   *   N/Y/K 同义提示由模块级单例 useAiStatus 的 terminalHint 承载 ——
   *   useAiReading.runFull 的 publish 调 status.applyProgress()，分项阶段记住完整长文案；
   *   融合阶段 current 被覆盖后 applyProgress 保留 hint、finish() 显式不覆盖 → 完成态常驻；
   *   B 区独立 <p v-if="terminalHint"> 位于 .zone-b 内、所有 v-if="progress" 分支之外，
   *   因此 progress 置 null 后仍可见。
   */
  it('QA-B3b [行为] 分项/融合/完成态均读到 N/Y/K 同义提示，progress 置 null 后仍可见', () => {
    const status = useAiStatus()
    const hint10 =
      '本次需并发 10 项，超过并发上限 4，已按上限 4 分 3 批执行（全部 10 项都会执行，不会减少）；可在设置页提高并发上限以启用一次性并发'
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

    // ① 条件 ② 降级：分项阶段记住完整 N/Y/K
    status.reset()
    status.begin('full', 60000)
    status.applyProgress(mk(hint10, '分项解读（按上限 4 分 3 批）', 0))
    expect(status.snapshot.value.terminalHint).toContain('本次需并发 10 项')
    expect(status.snapshot.value.terminalHint).toContain('超过并发上限 4')
    expect(status.snapshot.value.terminalHint).toContain('分 3 批执行')
    expect(status.snapshot.value.terminalHint).toContain('全部 10 项都会执行，不会减少')

    // ② 融合阶段：current 被覆盖为融合任务名，同义提示不丢失
    status.applyProgress(mk('全盘整合分析与最终总结论', '全盘整合分析（最后一步，单独执行）', 10))
    expect(status.snapshot.value.terminalHint).toContain('全部 10 项都会执行，不会减少')
    expect(status.snapshot.value.terminal).toBe(false)

    // ③ 完成态：finish 不覆盖，终态静态常驻
    status.finish('completed')
    expect(status.snapshot.value.terminal).toBe(true)
    expect(status.snapshot.value.terminalHint).toContain('全部 10 项都会执行，不会减少')

    // ④ 未超限「一次性并发」文案同样进入同义提示
    status.reset()
    status.begin('full', 60000)
    status.applyProgress(
      mk('一次性并发 10 项（设定并发数 3 / 上限 64）', '分项解读（一次性并发 10 项）', 0),
    )
    expect(status.snapshot.value.terminalHint).toContain('一次性并发 10 项')

    // ⑤ 组件承载：B 区终态提示节点不依赖 props.progress（progress=null 仍渲染）。
    //    用通用契约断言，不硬编码组件内部 ref 名（lastConcurrencyNote / terminalHint 均可）、
    //    也不限定 B 区标签（section / div 均可），仅约束产品行为与结构语义。
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
   * ★ T-6 新五区契约（替换已被合法重构取代的 `:203–215 HEAD 12 行逐字` 断言，等价强度不降）：
   *   五区 A~E / B 区 role=status / A·B·C·E flex:none / D 唯一滚动 + min-height:0 /
   *   遮罩无事件 / 放大态 inset 定位与无横向溢出 / 唯一取消入口 / 状态唯一源 /
   *   D 区破坏性·业务控件数 0 / 禁止词只扫运行时 label 与模板文案（排除注释里的禁止词清单）。
   */
  it('QA-B4 [新五区契约] A~E / flex / 唯一滚动 / 遮罩 / 放大态 / 唯一取消 / 状态唯一源 / 禁止词', () => {
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/panel/AiReadingPanel.vue'),
      'utf8',
    )
    const statusSrc = readFileSync(
      resolve(process.cwd(), 'src/composables/useAiStatus.ts'),
      'utf8',
    )

    // ② 五区结构与 B 区语义
    for (const z of ['A', 'B', 'C', 'D', 'E']) {
      expect(panel).toContain(`data-zone="${z}"`)
    }
    expect(panel).toContain('role="status" aria-live="polite"')
    // A/B/C/E 固定 flex:none：第一个 flex 规则的选择器列表含四区
    //（不硬编码精确选择器顺序，兼容 .zone-a-extra 等合法追加）
    const flexIdx = panel.indexOf('flex: none')
    expect(flexIdx).toBeGreaterThan(-1)
    const flexHead = panel.slice(Math.max(0, flexIdx - 240), flexIdx)
    for (const z of ['.zone-a', '.zone-b', '.zone-c', '.zone-e']) {
      expect(flexHead).toContain(z)
    }
    // D 唯一独立滚动：min-height:0 + overflow-y:auto + 禁止横向溢出
    expect(panel).toContain('min-height: 0')
    expect(panel).toContain('overflow-y: auto')
    expect(panel).toContain('overflow-x: hidden')
    // 遮罩无任何事件监听（点击不关闭、不中断）
    const mask = panel.match(/<div[^>]*class="ai-mask"[^>]*>/)
    expect(mask).not.toBeNull()
    expect(mask![0]).not.toContain('@click')
    expect(mask![0]).toContain('aria-hidden="true"')
    // 放大态：inset 定位、容器 overflow:hidden、无 translate 变换、手机端适配
    for (const x of [
      '.ai-panel.is-expanded',
      'overflow: hidden',
      'max-width: none',
      'transform: none',
      '@media (max-width: 768px)',
    ]) {
      expect(panel).toContain(x)
    }

    // ③ 唯一「取消请求」入口：3 处 emit 位于互斥分支，统一经 ConfirmDialog 确认
    expect((panel.match(/emit\('cancel'\)/g) ?? []).length).toBe(3)
    expect(panel).toContain('v-else-if="loading && !hasContent"')
    expect(panel).toContain('v-else-if="loading"')
    expect(panel).toContain('ConfirmDialog')
    // 状态唯一源：无第二套「进行中」状态容器
    expect(panel).not.toContain('进行中')
    expect((panel.match(/role="status"/g) ?? []).length).toBe(1)
    expect((panel.match(/class="progress-wrap"/g) ?? []).length).toBe(1)
    // D 区业务 / 破坏性控件数 = 0
    //（取消请求属状态控制、展开收起属展示控制，均不计入；不硬编码 D 区标签名）
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

    // ④ 禁止词：只扫运行时 label 赋值 / 模板文案，排除注释行
    //   （useAiStatus.ts:11 是「禁止词：… 一律不得写入 label」的清单注释，不是运行时文案）
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
  })
})

/* ══════════════════════════════════════════════════════════
 * 3. 档位边界（AC-C11 / AC-C12）
 * ══════════════════════════════════════════════════════════ */

describe('QA-C｜串行档与单次解读不受影响', () => {
  it('QA-C1 serial：每轮仅 1 个在途、顺序 0..4、phase「分项解读（串行）」逐字不变', async () => {
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(5),
        stepMode: 'serial',
        aiConcurrency: 8,
        aiConcurrencyLimit: 8,
        onUpdate: (u) => updates.push(u),
      }),
    )
    const rounds: string[][] = []
    let seen = 0
    for (let i = 0; i < 5; i += 1) {
      await settle()
      const all = trace.starts()
      rounds.push(all.slice(seen).map((e) => e.ref))
      seen = all.length
      expect(trace.release()).toBe(1) // 每轮恰好 1 项在途
    }
    await settle()
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
    expect(trace.release()).toBe(1)
    const report = await promise

    expect(rounds).toEqual([
      ['task:0'],
      ['task:1'],
      ['task:2'],
      ['task:3'],
      ['task:4'],
    ])
    expect(updates.some((u) => u.progress.phase === '分项解读（串行）')).toBe(true)
    expect(updates.some((u) => u.progress.phase.includes('一次性并发'))).toBe(false)
    expect(updates[0].progress.total).toBe(6)
    expect(report.sections).toHaveLength(5)
  })

  it('QA-C2 单次解读（非 full）：只发 1 次 explain、无融合、progress 为 null；并发配置被置为非法值仍不受影响', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    // 故意把两个并发配置写成非法值：单次档若读取它们应当暴露异常，实际应完全无感
    settings.aiConcurrency = 999
    settings.aiConcurrencyLimit = -1
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

  it('QA-C3 未配置 AI：validateAiConfig 拦截、0 次 explain、正文节点为空（AC-C15/AC-24）', async () => {
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

  it('QA-C4 降级只发一次 info toast（composable 层，闭包去重）', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    expect(settings.setAiConcurrencyLimit(4)).toBe(true)
    const ui = useUiStore()
    const notifySpy = vi.spyOn(ui, 'notify').mockImplementation(() => {})
    explainMock.mockImplementation(async (args: AiExplainArgs) =>
      args.scope === 'full-fusion' ? FUSION_RAW : '分项正文',
    )

    const scope = effectScope()
    const reading = scope.run(() => useAiReading())!
    await reading.run({
      scope: 'full',
      ref: 'chart',
      title: '整盘解读',
      offline: '离线事实',
      full: true,
      chart: {} as BodyGraph,
      stepMode: 'parallel',
      fullPlan: { tasks: makeTasks(10), summary: 'QA 盘面摘要' },
    })
    scope.stop()

    const infoCalls = notifySpy.mock.calls.filter((c) => c[1] === 'info')
    expect(infoCalls).toHaveLength(1)
    expect(String(infoCalls[0][0])).toContain('全部 10 项都会执行')
    notifySpy.mockRestore()
  })
})

/* ══════════════════════════════════════════════════════════
 * 4. 条件 ① 与迁移（AC-C1 / AC-C2 / AC-C3 / AC-C4）
 * ══════════════════════════════════════════════════════════ */

describe('QA-D｜拒绝保存与迁移三条路径', () => {
  it('QA-D1 两个 setter：c>l 一律拒绝，store 与 localStorage 原值不变', () => {
    const settings = useSettingsStore()
    expect(settings.persist()).toBe(true)
    const before = localStorage.getItem(STORAGE_KEY)
    expect(settings.aiConcurrency).toBe(DEFAULT_AI_CONCURRENCY)
    expect(settings.aiConcurrencyLimit).toBe(DEFAULT_AI_CONCURRENCY_LIMIT)

    expect(settings.setAiConcurrency(65)).toBe(false) // 65 > 64
    expect(settings.setAiConcurrencyLimit(2)).toBe(false) // 3 > 2
    expect(settings.aiConcurrency).toBe(3)
    expect(settings.aiConcurrencyLimit).toBe(64)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('QA-D2 0 / 129 / 小数 / 非数字 / 空串 / 负数：两个 setter 全部拒绝且不写入', () => {
    const settings = useSettingsStore()
    settings.persist()
    const before = localStorage.getItem(STORAGE_KEY)
    const invalids: unknown[] = [0, 129, 3.5, Number.NaN, '', 'abc', -1, null, undefined]
    for (const v of invalids) {
      expect(settings.setAiConcurrency(v as number)).toBe(false)
      expect(settings.setAiConcurrencyLimit(v as number)).toBe(false)
    }
    expect(settings.aiConcurrency).toBe(3)
    expect(settings.aiConcurrencyLimit).toBe(64)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    expect(validateConcurrencyPair(3, 64)).toBeNull()
    expect(validateConcurrencyPair(65, 64)).toContain('不能超过并发上限')
    expect(validateConcurrencyPair(0, 64)).toContain('1–128 的整数')
  })

  it('QA-D3 state() 三个 return 分支均返回合法默认值 3 / 64', () => {
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
    expect([s1.aiConcurrency, s1.aiConcurrencyLimit]).toEqual([3, 64])

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
    expect([s2.aiConcurrency, s2.aiConcurrencyLimit]).toEqual([3, 64])

    // 分支 3：全新
    localStorage.removeItem(STORAGE_KEY)
    setActivePinia(createPinia())
    const s3 = useSettingsStore()
    expect(s3.aiProfiles).toHaveLength(0)
    expect([s3.aiConcurrency, s3.aiConcurrencyLimit]).toEqual([3, 64])
  })

  it('QA-D4 存量非法配置归一 + 一次可见提示（消费即清、不写回、不进 SettingsState）', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ aiConcurrency: 100, aiConcurrencyLimit: 20 }))
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    expect([settings.aiConcurrency, settings.aiConcurrencyLimit]).toEqual([20, 20])
    expect(takeConcurrencyMigrationNotice()).toContain('已调整为合法值')
    expect(takeConcurrencyMigrationNotice()).toBeNull()
    expect('migrationNotice' in settings.$state).toBe(false)
    expect(normalizeConcurrencyPair(undefined, undefined)).toEqual({
      concurrency: 3,
      limit: 64,
      adjusted: false,
    })
  })

  it('QA-D5 persist 仅新增两个顶层 number 字段，不进 AiConfig / AiProfile', () => {
    const settings = useSettingsStore()
    expect(settings.persist()).toBe(true)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) as string) as Record<string, unknown>
    expect(Object.keys(saved).filter((k) => /concurrency/i.test(k)).sort()).toEqual([
      'aiConcurrency',
      'aiConcurrencyLimit',
    ])
    expect(typeof saved.aiConcurrency).toBe('number')
    expect(typeof saved.aiConcurrencyLimit).toBe('number')
    expect((saved.ai as Record<string, unknown>).aiConcurrency).toBeUndefined()
  })
})

/* ══════════════════════════════════════════════════════════
 * 5. 失败与取消（AC-C13 / AC-C14 / AC-C15）
 * ══════════════════════════════════════════════════════════ */

describe('QA-E｜失败补救与取消不伪造', () => {
  it('QA-E1 M=2 项失败：仅这 2 项在一次性批次后串行重跑，成功项不重跑', async () => {
    trace.failRefs.add('task:2')
    trace.failRefs.add('task:7')
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        onUpdate: (u) => updates.push(u),
      }),
    )
    const rounds = await trace.pump(promise)
    const report = await promise

    // 首轮即 10 项一次性发起（不存在「剩余未启动任务改串行」）
    expect(rounds[0]).toHaveLength(10)
    expect(rounds[0].every((s) => s.startsWith('full-dimension#'))).toBe(true)

    const starts = trace.starts()
    const countOf = (ref: string) => starts.filter((e) => e.ref === ref).length
    for (const i of [0, 1, 3, 4, 5, 6, 8, 9]) {
      expect(countOf(`task:${i}`)).toBe(1) // 成功项绝不重跑
    }
    expect(countOf('task:2')).toBe(4) // 批次内 withRetry 2 次 + 串行重跑 2 次
    expect(countOf('task:7')).toBe(4)
    // 串行重跑阶段：每轮只有 1 个失败项请求在途
    const rerunRounds = rounds.slice(1).filter((r) => r.length === 1 && r[0].includes('task:'))
    expect(rerunRounds.length).toBeGreaterThanOrEqual(4)
    expect(rerunRounds.every((r) => r[0].includes('task:2') || r[0].includes('task:7'))).toBe(true)

    expect(updates.some((u) => u.progress.phase.includes('失败项改串行重跑'))).toBe(true)
    expect(
      updates.some(
        (u) =>
          u.progress.phase.includes('剩余') ||
          u.progress.current.includes('剩余未启动') ||
          u.progress.current.includes('剩余分项改串行'),
      ),
    ).toBe(false)
    expect(report.sections).toHaveLength(8)
    expect(report.skipped).toHaveLength(2)
    expect(report.fusion).toContain('整合正文') // 失败不阻断融合
  })

  it('QA-E2 分项阶段取消：不进入融合、不产出 fusion/summary、不写占位文本', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(6),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        signal: controller.signal,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await settle()
    expect(trace.starts()).toHaveLength(6)
    controller.abort()
    trace.release()
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' })

    expect(trace.starts().some((e) => e.scope === 'full-fusion')).toBe(false)
    expect(updates.every((u) => u.fusion === '' && u.summary === '')).toBe(true)
    expect(updates.every((u) => u.sections.every((s) => !s.content.includes('占位')))).toBe(true)
  })

  it('QA-E3 融合阶段取消：fusion/summary 为空、已成功分项保留、不做失败项重跑', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(trace.stub)
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      opts({
        tasks: makeTasks(5),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        signal: controller.signal,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await settle()
    expect(trace.release()).toBe(5)
    await settle()
    // 融合已发起、挂起中
    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(1)
    controller.abort()
    trace.release()
    await expect(promise).rejects.toMatchObject({ kind: 'cancelled' })

    const last = updates[updates.length - 1]
    expect(last.fusion).toBe('')
    expect(last.summary).toBe('')
    expect(last.sections).toHaveLength(5)
    expect(last.skipped).not.toContain('全盘整合与最终总结论')
  })

  it('QA-E4 融合失败：报告仍由全部分项构成、skipped 含「全盘整合与最终总结论」', async () => {
    trace.failFusion = true
    explainMock.mockImplementation(trace.stub)
    const promise = runFullReading(
      opts({ tasks: makeTasks(5), stepMode: 'parallel', aiConcurrencyLimit: 64 }),
    )
    await trace.pump(promise)
    const report = await promise

    expect(trace.starts().filter((e) => e.scope === 'full-fusion')).toHaveLength(2) // 重试 1 次
    expect(report.sections).toHaveLength(5)
    expect(report.fusion).toBe('')
    expect(report.summary).toBe('')
    expect(report.skipped).toContain('全盘整合与最终总结论')
  })

  it('QA-E5 分项跳过时融合输入含「请勿据此推断」', async () => {
    trace.failRefs.add('task:1')
    explainMock.mockImplementation(trace.stub)
    const promise = runFullReading(
      opts({ tasks: makeTasks(4), stepMode: 'parallel', aiConcurrencyLimit: 64 }),
    )
    await trace.pump(promise)
    await promise
    const fusionCall = explainMock.mock.calls.find((c) => c[0].scope === 'full-fusion')
    expect(fusionCall).toBeDefined()
    expect(String(fusionCall![0].offline)).toContain('请勿据此推断')
  })
})

/* ══════════════════════════════════════════════════════════
 * 6. 禁止词 / 冻结契约静态检查（AC-C17 / AC-C18 / AC-C19）
 * ══════════════════════════════════════════════════════════ */

describe('QA-F｜禁止词与冻结清单静态契约', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  it('QA-F1 全库禁止词 0 处；B 区不存在两套「进行中」表达', () => {
    const joined = [
      'src/services/aiFullReading.ts',
      'src/services/aiConcurrency.ts',
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

  it('QA-F2 AiProgress 仍为 8 字段；提示词版本与计算锚点未被改写', () => {
    const reportTypes = read('src/types/report.ts')
    const match = reportTypes.match(/export interface AiProgress \{([\s\S]*?)\n\}/)
    expect(match).not.toBeNull()
    const fields = (match![1] as string).split('\n').filter((l) => /^\s{2}\w+\s*:/.test(l))
    expect(fields).toHaveLength(8)
    expect(read('src/services/aiClient.ts')).toContain("PROMPT_VERSION = '3.1'")
    expect(read('src/engine/mandala.ts')).toContain('29.875')
    expect(read('src/engine/mandala.ts')).toContain('302.000')
  })
})
