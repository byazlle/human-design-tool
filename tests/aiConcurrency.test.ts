/**
 * v2.3.0 AI 并发增量回归（T-C1 / T-C7，AC-C1～AC-C15）。
 *
 * 全部为纯逻辑 / 服务层测试：`environment: 'node'`，无 jsdom、无组件挂载、无新增依赖。
 * 编排集成用 `vi.mock` 只替换 `explain()`（其余 aiClient 导出保持真实），
 * 因此不发真实请求、不产生任何伪造解读内容；断言的是「调用次数 / 批次 / 顺序 / 失败与取消策略」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_AI_CONCURRENCY,
  DEFAULT_AI_CONCURRENCY_LIMIT,
  MAX,
  MIN,
  clampConcurrency,
  normalizeConcurrency,
  normalizeConcurrencyPair,
  resolveSchedule,
  validateConcurrencyPair,
} from '../src/services/aiConcurrency'
import {
  PARALLEL_CONCURRENCY,
  runFullReading,
  type FullReadingOptions,
  type FullReadingUpdate,
  type FullTask,
} from '../src/services/aiFullReading'
import { takeConcurrencyMigrationNotice, useSettingsStore } from '../src/stores/settings'
import type { AiExplainArgs } from '../src/services/aiClient'
import type { AiConfig, BodyGraph } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key-1234',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

/** 传 tasks + summary 时不会调用 buildFullTasks() / chartSummaryOf()，故只需占位 */
const CHART = {} as BodyGraph
const FUSION_TEXT = '## 1. 全盘整合分析\n\n整合正文\n\n## 5. 最终总结论\n\n总结正文'

function makeTasks(n: number): FullTask[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `task:${i}`,
    title: `分项 ${i}`,
    kind: 'dimension' as const,
    scope: 'full-dimension' as const,
    offline: `离线事实 ${i}`,
  }))
}

function baseOptions(overrides: Partial<FullReadingOptions> = {}): FullReadingOptions {
  return {
    cfg: CFG,
    chart: CHART,
    title: '并发测试',
    summary: '测试盘面摘要',
    stepMode: 'serial',
    ...overrides,
  }
}

/** 冲掉所有挂起的 microtask，让「同一 Promise.all 批次」的同步发起全部完成 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function stubStorage(): Map<string, string> {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  })
  return mem
}

beforeEach(() => {
  explainMock.mockReset()
  stubStorage()
  setActivePinia(createPinia())
  // 模块级「一次性可见提示」消费即清，避免跨用例串台
  takeConcurrencyMigrationNotice()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ── 纯函数：常量 / 归一 / 严格校验 / 调度 ───────────────── */

describe('AI 并发调度 · 常量与纯函数', () => {
  it('常量取值固定：1–128、默认 3 / 64，PARALLEL_CONCURRENCY 只作默认值来源', () => {
    expect(CONCURRENCY_MIN).toBe(1)
    expect(CONCURRENCY_MAX).toBe(128)
    expect(MIN).toBe(1)
    expect(MAX).toBe(128)
    expect(DEFAULT_AI_CONCURRENCY).toBe(3)
    expect(DEFAULT_AI_CONCURRENCY_LIMIT).toBe(64)
    expect(PARALLEL_CONCURRENCY).toBe(DEFAULT_AI_CONCURRENCY)
    expect(PARALLEL_CONCURRENCY).toBe(3)
  })

  it('clampConcurrency：合法整数原样，0 / 129 / 小数 / 非数字 / 字符串一律回落 fallback', () => {
    expect(clampConcurrency(1, 3)).toBe(1)
    expect(clampConcurrency(128, 3)).toBe(128)
    expect(clampConcurrency(7, 3)).toBe(7)
    expect(clampConcurrency(0, 3)).toBe(3)
    expect(clampConcurrency(129, 3)).toBe(3)
    expect(clampConcurrency(2.5, 3)).toBe(3)
    expect(clampConcurrency(Number.NaN, 3)).toBe(3)
    expect(clampConcurrency('8', 3)).toBe(3)
    expect(clampConcurrency(null, 3)).toBe(3)
    expect(clampConcurrency(undefined, 3)).toBe(3)
    // raw 合法时原样返回，与 fallback 无关；fallback 越界时只在 raw 非法时兜底为默认值
    expect(clampConcurrency(5, 999)).toBe(5)
    expect(clampConcurrency(Number.NaN, 999)).toBe(DEFAULT_AI_CONCURRENCY)
    expect(normalizeConcurrency(9, 3)).toBe(clampConcurrency(9, 3))
  })

  it('normalizeConcurrencyPair：缺失回落 3 / 64 且不报 adjusted，合法对原样保留', () => {
    expect(normalizeConcurrencyPair(undefined, undefined)).toEqual({
      concurrency: 3,
      limit: 64,
      adjusted: false,
    })
    expect(normalizeConcurrencyPair(null, '')).toEqual({
      concurrency: 3,
      limit: 64,
      adjusted: false,
    })
    expect(normalizeConcurrencyPair(5, 10)).toEqual({
      concurrency: 5,
      limit: 10,
      adjusted: false,
    })
  })

  it('normalizeConcurrencyPair：违反 1 ≤ c ≤ l ≤ 128 时收敛 c 并置 adjusted=true', () => {
    expect(normalizeConcurrencyPair(100, 50)).toEqual({
      concurrency: 50,
      limit: 50,
      adjusted: true,
    })
    expect(normalizeConcurrencyPair(200, 10)).toEqual({
      concurrency: 3,
      limit: 10,
      adjusted: true,
    })
    expect(normalizeConcurrencyPair(5, 200)).toEqual({
      concurrency: 5,
      limit: 64,
      adjusted: true,
    })
    expect(normalizeConcurrencyPair(2.5, 10).adjusted).toBe(true)
    expect(normalizeConcurrencyPair('3', 10).adjusted).toBe(true)
  })

  it('validateConcurrencyPair：合法返回 null；c > l 返回带当前上限 Y 的行内错误', () => {
    expect(validateConcurrencyPair(3, 64)).toBeNull()
    expect(validateConcurrencyPair(1, 1)).toBeNull()
    expect(validateConcurrencyPair(128, 128)).toBeNull()
    expect(validateConcurrencyPair(65, 64)).toBe(
      'AI 并发数不能超过并发上限（当前上限 64），请调小并发数或调大上限',
    )
    expect(validateConcurrencyPair(0, 64)).toContain('1–128 的整数')
    expect(validateConcurrencyPair(129, 64)).toContain('1–128 的整数')
    expect(validateConcurrencyPair(3.5, 64)).toContain('1–128 的整数')
    expect(validateConcurrencyPair(Number.NaN, 64)).toContain('1–128 的整数')
    expect(validateConcurrencyPair(3, 0)).toContain('1–128 的整数')
  })

  it('resolveSchedule：serial → width 1 / count N；N ≤ Y → 一批全发；N > Y → K 批降级', () => {
    expect(resolveSchedule(5, 64, 'serial')).toEqual({
      required: 5,
      limit: 64,
      batchWidth: 1,
      batchCount: 5,
      K: 5,
      degraded: false,
    })
    expect(resolveSchedule(10, 64, 'parallel')).toEqual({
      required: 10,
      limit: 64,
      batchWidth: 10,
      batchCount: 1,
      K: 1,
      degraded: false,
    })
    expect(resolveSchedule(10, 3, 'parallel')).toEqual({
      required: 10,
      limit: 3,
      batchWidth: 3,
      batchCount: 4,
      K: 4,
      degraded: true,
    })
  })

  it('resolveSchedule：N 等于上限仍不超限；N=0 兜底；limit 非法回落 64', () => {
    expect(resolveSchedule(64, 64, 'parallel').degraded).toBe(false)
    expect(resolveSchedule(65, 64, 'parallel')).toMatchObject({
      batchWidth: 64,
      batchCount: 2,
      K: 2,
      degraded: true,
    })
    expect(resolveSchedule(0, 64, 'parallel')).toMatchObject({
      batchWidth: 1,
      batchCount: 1,
      degraded: false,
    })
    expect(resolveSchedule(10, 0, 'parallel')).toMatchObject({
      limit: 64,
      batchWidth: 10,
      batchCount: 1,
      degraded: false,
    })
  })
})

/* ── settings store：两个顶层字段 / 三分支加载 / 条件 ① 严格拒绝 ── */

describe('AI 并发调度 · 设置项持久化', () => {
  it('全新加载回落 3 / 64；persist 写入两个顶层 number 且可原样读回', () => {
    const settings = useSettingsStore()
    expect(settings.aiConcurrency).toBe(3)
    expect(settings.aiConcurrencyLimit).toBe(64)
    expect(settings.persist()).toBe(true)
    const saved = JSON.parse(localStorage.getItem('hdt.settings.v1') as string) as Record<
      string,
      unknown
    >
    expect(saved.aiConcurrency).toBe(3)
    expect(saved.aiConcurrencyLimit).toBe(64)
    // 不进 AiConfig / AiProfile，不新增第 3 个并发字段
    expect(Object.keys(saved).filter((k) => /concurrency/i.test(k)).sort()).toEqual([
      'aiConcurrency',
      'aiConcurrencyLimit',
    ])
    expect((saved.ai as Record<string, unknown>).aiConcurrency).toBeUndefined()
  })

  it('state() 三个 return 分支都补齐两字段：有 profiles / 旧单配置迁移 / 全新', () => {
    // 分支 1：有 profiles
    localStorage.setItem(
      'hdt.settings.v1',
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
        aiConcurrency: 8,
        aiConcurrencyLimit: 32,
      }),
    )
    setActivePinia(createPinia())
    const withProfiles = useSettingsStore()
    expect(withProfiles.aiConcurrency).toBe(8)
    expect(withProfiles.aiConcurrencyLimit).toBe(32)

    // 分支 2：旧单配置迁移
    localStorage.setItem(
      'hdt.settings.v1',
      JSON.stringify({
        ai: {
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-12345678',
          model: 'legacy-model',
          timeoutMs: 30000,
          cacheEnabled: true,
        },
        aiConcurrency: 6,
        aiConcurrencyLimit: 24,
      }),
    )
    setActivePinia(createPinia())
    const migrated = useSettingsStore()
    expect(migrated.aiProfiles).toHaveLength(1)
    expect(migrated.aiConcurrency).toBe(6)
    expect(migrated.aiConcurrencyLimit).toBe(24)

    // 分支 3：无配置（默认）
    localStorage.removeItem('hdt.settings.v1')
    setActivePinia(createPinia())
    const fresh = useSettingsStore()
    expect(fresh.aiConcurrency).toBe(3)
    expect(fresh.aiConcurrencyLimit).toBe(64)
  })

  it('存量非法对归一为合法值，并通过模块级标记给一次可见提示（消费即清）', () => {
    localStorage.setItem(
      'hdt.settings.v1',
      JSON.stringify({ aiConcurrency: 100, aiConcurrencyLimit: 20 }),
    )
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    expect(settings.aiConcurrency).toBe(20)
    expect(settings.aiConcurrencyLimit).toBe(20)
    expect(takeConcurrencyMigrationNotice()).toContain('已调整为合法值')
    expect(takeConcurrencyMigrationNotice()).toBeNull()
    // 标记不进 SettingsState，也不写入 localStorage
    expect('migrationNotice' in settings.$state).toBe(false)
    const saved = JSON.parse(localStorage.getItem('hdt.settings.v1') as string) as Record<
      string,
      unknown
    >
    expect('migrationNotice' in saved).toBe(false)
  })

  it('条件 ①：c > l 时两个 setter 都严格拒绝，store 与 localStorage 原值不变', () => {
    const settings = useSettingsStore()
    settings.persist()
    const before = localStorage.getItem('hdt.settings.v1') as string

    expect(settings.setAiConcurrency(65)).toBe(false)
    expect(settings.aiConcurrency).toBe(3)
    expect(localStorage.getItem('hdt.settings.v1')).toBe(before)

    expect(settings.setAiConcurrencyLimit(2)).toBe(false)
    expect(settings.aiConcurrencyLimit).toBe(64)
    expect(localStorage.getItem('hdt.settings.v1')).toBe(before)
  })

  it('合法值可保存并立即生效；两个 setter 都做严格校验', () => {
    const settings = useSettingsStore()
    expect(settings.setAiConcurrency(8)).toBe(true)
    expect(settings.setAiConcurrencyLimit(96)).toBe(true)
    expect(settings.aiConcurrency).toBe(8)
    expect(settings.aiConcurrencyLimit).toBe(96)
    const saved = JSON.parse(localStorage.getItem('hdt.settings.v1') as string) as Record<
      string,
      unknown
    >
    expect(saved.aiConcurrency).toBe(8)
    expect(saved.aiConcurrencyLimit).toBe(96)
    expect(settings.setAiConcurrency(97)).toBe(false)
    expect(settings.aiConcurrency).toBe(8)
  })
})

/* ── 编排集成：一次性并发 / 降级 / 融合例外 / 失败 / 取消 ─── */

describe('AI 并发调度 · runFullReading 编排', () => {
  it('N ≤ 上限时批次数=1 且 N 个 explain 同属一个 Promise.all（N=10 不是 3+3+3+1）', async () => {
    let hold = true
    const held: Array<() => void> = []
    explainMock.mockImplementation((args: AiExplainArgs) => {
      if (hold) {
        return new Promise<string>((resolve) => {
          held.push(() => resolve(args.scope === 'full-fusion' ? FUSION_TEXT : `分项 ${args.ref}`))
        })
      }
      return Promise.resolve(args.scope === 'full-fusion' ? FUSION_TEXT : `分项 ${args.ref}`)
    })

    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      baseOptions({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrency: 3,
        aiConcurrencyLimit: 64,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await flush()

    // 任何一个分项完成之前，10 个分项已一次性全部发起；融合尚未发起
    expect(explainMock).toHaveBeenCalledTimes(10)
    expect(explainMock.mock.calls.every((c) => c[0].scope !== 'full-fusion')).toBe(true)
    expect(updates[0].progress.phase).toBe('分项解读（一次性并发 10 项）')
    expect(updates[0].progress.current).toContain('设定并发数 3 / 上限 64')
    expect(updates[0].progress.total).toBe(11)
    expect(updates[0].progress.etaMs).toBeNull()
    expect(updates.some((u) => u.progress.phase.includes('按上限'))).toBe(false)

    hold = false
    held.forEach((r) => r())
    const report = await promise

    expect(explainMock).toHaveBeenCalledTimes(11)
    expect(explainMock.mock.calls[10][0].scope).toBe('full-fusion')
    expect(report.sections).toHaveLength(10)
    expect(report.skipped).toEqual([])
  })

  it('N > X 但 N ≤ Y 仍一次性全发（aiConcurrency 不切片分批）', async () => {
    let hold = true
    const held: Array<() => void> = []
    explainMock.mockImplementation((args: AiExplainArgs) => {
      if (hold) {
        return new Promise<string>((resolve) => {
          held.push(() => resolve(args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'))
        })
      }
      return Promise.resolve(args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文')
    })
    const promise = runFullReading(
      baseOptions({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrency: 2,
        aiConcurrencyLimit: 10,
      }),
    )
    await flush()
    expect(explainMock).toHaveBeenCalledTimes(10)
    hold = false
    held.forEach((r) => r())
    const report = await promise
    expect(report.sections).toHaveLength(10)
  })

  it('融合最后单独执行：请求数恒 1、晚于全部分项，phase 含「最后一步，单独执行」', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) =>
      args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文',
    )
    const updates: FullReadingUpdate[] = []
    const report = await runFullReading(
      baseOptions({
        tasks: makeTasks(6),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        onUpdate: (u) => updates.push(u),
      }),
    )
    const fusionCalls = explainMock.mock.calls.filter((c) => c[0].scope === 'full-fusion')
    expect(fusionCalls).toHaveLength(1)
    expect(explainMock.mock.calls[6][0].scope).toBe('full-fusion')
    expect(updates.every((u) => u.progress.total === 7)).toBe(true)
    const fusionUpdate = updates.find((u) => u.progress.phase.includes('最后一步，单独执行'))
    expect(fusionUpdate).toBeDefined()
    expect(fusionUpdate!.progress.phase).toBe('全盘整合分析（最后一步，单独执行）')
    expect(fusionUpdate!.progress.done).toBe(6)
    expect(updates[updates.length - 1].progress.done).toBe(7)
    expect(updates[updates.length - 1].progress.phase).toBe('已完成')
    expect(report.sections).toHaveLength(6)
  })

  it('关系场融合同样最后单独执行，且用关系场 phase 文案', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) =>
      args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文',
    )
    const updates: FullReadingUpdate[] = []
    await runFullReading(
      baseOptions({
        tasks: makeTasks(4),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        fusionAngle: '关系场整合分析与最终总结论',
        onUpdate: (u) => updates.push(u),
      }),
    )
    expect(
      updates.some(
        (u) => u.progress.phase === '关系场整合分析与最终总结论（最后一步，单独执行）',
      ),
    ).toBe(true)
    expect(explainMock.mock.calls.filter((c) => c[0].scope === 'full-fusion')).toHaveLength(1)
  })

  it('条件 ②：N > Y 时按上限 Y 分 K 批、首批批宽=Y、全部 N 项一个不少不伪造', async () => {
    let hold = true
    const held: Array<() => void> = []
    explainMock.mockImplementation((args: AiExplainArgs) => {
      if (hold) {
        return new Promise<string>((resolve) => {
          held.push(() => resolve(args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'))
        })
      }
      return Promise.resolve(args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文')
    })
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      baseOptions({
        tasks: makeTasks(10),
        stepMode: 'parallel',
        aiConcurrencyLimit: 4,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await flush()
    // 第一批宽 = Y = 4，而不是旧口径的固定 3
    expect(explainMock).toHaveBeenCalledTimes(4)
    expect(updates[0].progress.phase).toBe('分项解读（按上限 4 分 3 批）')
    expect(updates[0].progress.current).toContain('全部 10 项都会执行，不会减少')
    expect(updates[0].progress.current).toContain('可在设置页提高并发上限以启用一次性并发')
    expect(updates[0].progress.total).toBe(11)

    hold = false
    held.forEach((r) => r())
    const report = await promise

    const taskCalls = explainMock.mock.calls.filter((c) => c[0].scope !== 'full-fusion')
    expect(taskCalls).toHaveLength(10)
    expect(new Set(taskCalls.map((c) => c[0].ref)).size).toBe(10)
    expect(report.sections).toHaveLength(10)
    expect(report.skipped).toEqual([])
    expect(explainMock.mock.calls.filter((c) => c[0].scope === 'full-fusion')).toHaveLength(1)
    expect(explainMock.mock.calls[10][0].scope).toBe('full-fusion')
    // 常驻提示在每次 publish 都带，且完成态仍保留同义提示
    expect(updates.filter((u) => u.progress.current.includes('全部 10 项都会执行')).length).toBeGreaterThan(1)
    expect(updates[updates.length - 1].progress.phase).toBe('已完成')
  })

  it('串行档不受影响：逐项串行、phase 逐字不变、无一次性并发字样', async () => {
    let hold = true
    const held: Array<() => void> = []
    explainMock.mockImplementation((args: AiExplainArgs) => {
      if (hold) {
        return new Promise<string>((resolve) => {
          held.push(() => resolve(args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'))
        })
      }
      return Promise.resolve(args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文')
    })
    const updates: FullReadingUpdate[] = []
    const promise = runFullReading(
      baseOptions({
        tasks: makeTasks(5),
        stepMode: 'serial',
        aiConcurrency: 2,
        aiConcurrencyLimit: 2,
        onUpdate: (u) => updates.push(u),
      }),
    )
    await flush()
    expect(explainMock).toHaveBeenCalledTimes(1) // 每批 1 项
    hold = false
    held.forEach((r) => r())
    const report = await promise

    expect(explainMock).toHaveBeenCalledTimes(6)
    expect(explainMock.mock.calls.slice(0, 5).map((c) => c[0].ref)).toEqual([
      'task:0',
      'task:1',
      'task:2',
      'task:3',
      'task:4',
    ])
    expect(updates.some((u) => u.progress.phase === '分项解读（串行）')).toBe(true)
    expect(updates.some((u) => u.progress.phase.includes('一次性并发'))).toBe(false)
    expect(updates[updates.length - 1].progress.phase).toBe('已完成')
    expect(report.sections).toHaveLength(5)
  })

  it('并发失败：仅 M 个失败项串行重跑 1 次，成功项不重跑、无「剩余未启动任务改串行」', async () => {
    const callsByRef = new Map<string, number>()
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      const ref = String(args.ref)
      callsByRef.set(ref, (callsByRef.get(ref) ?? 0) + 1)
      if (ref === 'task:2') throw new Error('永久失败')
      return args.scope === 'full-fusion' ? FUSION_TEXT : '分项正文'
    })
    const updates: FullReadingUpdate[] = []
    const report = await runFullReading(
      baseOptions({
        tasks: makeTasks(4),
        stepMode: 'parallel',
        aiConcurrencyLimit: 64,
        onUpdate: (u) => updates.push(u),
      }),
    )
    // 成功项各只发 1 次；失败项 = 首次批次 2 次（含 withRetry） + 串行重跑 2 次
    expect(callsByRef.get('task:0')).toBe(1)
    expect(callsByRef.get('task:1')).toBe(1)
    expect(callsByRef.get('task:3')).toBe(1)
    expect(callsByRef.get('task:2')).toBe(4)
    expect(updates.some((u) => u.progress.phase.includes('并发失败'))).toBe(true)
    expect(updates.some((u) => u.progress.phase.includes('失败项改串行重跑'))).toBe(true)
    expect(
      updates.some(
        (u) =>
          u.progress.phase.includes('剩余') ||
          u.progress.current.includes('剩余未启动') ||
          u.progress.current.includes('剩余分项改串行'),
      ),
    ).toBe(false)
    expect(report.sections).toHaveLength(3)
    expect(report.skipped).toHaveLength(1)
    expect(report.fusion).toContain('整合正文') // 失败不阻断融合
  })

  it('取消不伪造：分项阶段取消即上抛 cancelled，不进入融合、不做失败项串行重跑', async () => {
    const controller = new AbortController()
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      controller.abort()
      return args.scope === 'full-fusion' ? FUSION_TEXT : '不应被采用的内容'
    })
    await expect(
      runFullReading(
        baseOptions({
          tasks: makeTasks(6),
          stepMode: 'parallel',
          aiConcurrencyLimit: 64,
          signal: controller.signal,
        }),
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(explainMock.mock.calls.some((c) => c[0].scope === 'full-fusion')).toBe(false)
  })

  it('融合失败不伪造：报告仍由全部分项构成，fusion / summary 为空', async () => {
    explainMock.mockImplementation(async (args: AiExplainArgs) => {
      if (args.scope === 'full-fusion') throw new Error('融合失败')
      return '分项正文'
    })
    const report = await runFullReading(
      baseOptions({ tasks: makeTasks(5), stepMode: 'parallel', aiConcurrencyLimit: 64 }),
    )
    expect(explainMock.mock.calls.filter((c) => c[0].scope === 'full-fusion')).toHaveLength(2)
    expect(report.sections).toHaveLength(5)
    expect(report.fusion).toBe('')
    expect(report.summary).toBe('')
    expect(report.skipped).toContain('全盘整合与最终总结论')
  })
})
