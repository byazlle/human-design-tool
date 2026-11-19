/**
 * 滑动窗口调度器回归（ARCH v4.0.0 §4.2 的 I1–I10）。
 *
 * 每条不变量都有独立用例，且**断言的是时序事实**（启动时刻、全局序号、在跑峰值、
 * 定时器残留数），不是「函数被调用过」。这些断言是唯一能证明
 * 「每秒发起 1 个 → 满载后落定即补」语义没被改坏的东西。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_START_INTERVAL_MS,
  MAX_SLIDE_CONCURRENCY,
  clampMaxConcurrency,
  runSlidingWindow,
  slidePhaseText,
  startGapOf,
  type SlideProgress,
  type SlideTask,
} from '../src/services/aiScheduler'

/** 可手动落定的 promise */
function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 冲一遍微任务 + 指定毫秒的定时器 */
async function tick(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  // 调度器用 queueMicrotask 逐级推进（pump → launch → pump），一次只解一层，
  // 这里多冲几次，保证「落定 → 补发 → 落定」的链条全部走完
  for (let i = 0; i < 12; i += 1) await Promise.resolve()
}

beforeEach(() => {
  // ★ 必须连 Date 一起 fake：调度器的起速节流基准是 `Date.now()`，
  //   只 fake 定时器会让「第 2 个任务在 t=1000 启动」这类断言永远失败
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('并发数归一与间隔', () => {
  it('clampMaxConcurrency：非法回落 fallback（fallback 自身也收敛到 1–99）', () => {
    expect(clampMaxConcurrency(3)).toBe(3)
    expect(clampMaxConcurrency(0)).toBe(3)
    expect(clampMaxConcurrency(-5)).toBe(3)
    expect(clampMaxConcurrency(1000)).toBe(3)
    expect(clampMaxConcurrency(1000, MAX_SLIDE_CONCURRENCY)).toBe(MAX_SLIDE_CONCURRENCY)
    expect(clampMaxConcurrency(3.9)).toBe(3)
    expect(clampMaxConcurrency(Number.NaN)).toBe(3)
    expect(clampMaxConcurrency(Number.NaN, 5)).toBe(5)
  })

  it('N === 1 时 gap 恒为 0（I8 的前提）；N > 1 时用默认 1 秒', () => {
    expect(startGapOf(1, 5000)).toBe(0)
    expect(startGapOf(1)).toBe(0)
    expect(startGapOf(3)).toBe(DEFAULT_START_INTERVAL_MS)
    expect(startGapOf(3, 250)).toBe(250)
    expect(startGapOf(3, -1)).toBe(DEFAULT_START_INTERVAL_MS)
    // 显式 0 = 不起速，立即满载（测试与「不用滑动窗口」的场景都用它）
    expect(startGapOf(3, 0)).toBe(0)
  })

  it('phase 文案：起速中 / 稳态两套', () => {
    const ramp: SlideProgress = { done: 0, total: 10, inFlight: 1, queued: 9, current: '' }
    expect(slidePhaseText(ramp, 3)).toBe('起速中（每秒 1 个）· 已启动 1 / 3')
    const steady: SlideProgress = { done: 4, total: 10, inFlight: 3, queued: 3, current: 'x' }
    expect(slidePhaseText(steady, 3)).toBe('最高并发数 3 · 在跑 3 / 总 10')
    // N=1 时永远不算起速
    expect(slidePhaseText({ done: 0, total: 3, inFlight: 1, queued: 2, current: '' }, 1)).toBe(
      '最高并发数 1 · 在跑 1 / 总 3',
    )
  })
})

describe('I1 起速：前 N 个任务按 startIntervalMs 节流启动', () => {
  it('N=3 时第 1/2/3 个任务分别在 0 / 1000 / 2000ms 启动', async () => {
    const starts: number[] = []
    const gates = [deferred(), deferred(), deferred()]
    const tasks: SlideTask<number>[] = gates.map((gate, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => {
        starts.push(Date.now())
        await gate.promise
        return i
      },
    }))

    const running = runSlidingWindow(tasks, { maxConcurrency: 3 })
    await tick(0)
    expect(starts).toEqual([0])
    await tick(1000)
    expect(starts).toEqual([0, 1000])
    await tick(1000)
    expect(starts).toEqual([0, 1000, 2000])

    gates.forEach((g) => g.resolve())
    await tick(0)
    await expect(running).resolves.toHaveLength(3)
  })

  it('起速判据是 startedCount >= N：任务 50ms 就返回也不会自锁在 1/s', async () => {
    const starts: number[] = []
    const tasks: SlideTask<number>[] = Array.from({ length: 5 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => {
        starts.push(Date.now())
        await new Promise((res) => setTimeout(res, 50))
        return i
      },
    }))

    const running = runSlidingWindow(tasks, { maxConcurrency: 3 })
    // 3 秒足以完成起速（2s）+ 剩余 2 个（落定即补）
    for (let i = 0; i < 30; i += 1) await tick(100)
    const results = await running
    expect(results.every((r) => r.ok)).toBe(true)
    // 第 4 个任务的启动时刻必须早于「第 4 秒」——证明进入稳态后不再 1/s
    expect(starts[3]).toBeLessThan(3000)
  })
})

describe('I2 上限与防重入：同步连续落定仍不超 N', () => {
  it('10 个立即返回的任务，在跑峰值恒 ≤ 3', async () => {
    const peaks: number[] = []
    const tasks: SlideTask<number>[] = Array.from({ length: 10 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => i,
    }))

    const running = runSlidingWindow(tasks, {
      maxConcurrency: 3,
      onProgress: (p) => peaks.push(p.inFlight),
    })
    for (let i = 0; i < 40; i += 1) await tick(100)
    const results = await running
    expect(results).toHaveLength(10)
    expect(Math.max(...peaks)).toBeLessThanOrEqual(3)
    expect(Math.max(...peaks)).toBeGreaterThanOrEqual(1)
  })

  it('同一 tick 内 10 个任务同时落定也不会把 inFlight 推过 N', async () => {
    const gates = Array.from({ length: 10 }, () => deferred<number>())
    let peak = 0
    const tasks: SlideTask<number>[] = gates.map((gate, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: () => gate.promise,
    }))

    const running = runSlidingWindow(tasks, {
      maxConcurrency: 3,
      onProgress: (p) => {
        peak = Math.max(peak, p.inFlight)
      },
    })
    await tick(2000) // 起速完成，3 个在跑
    expect(peak).toBe(3)
    // 第 4 个未启动
    gates.slice(0, 3).forEach((g, i) => g.resolve(i))
    await tick(0)
    expect(peak).toBeLessThanOrEqual(3)
    gates.slice(3).forEach((g, i) => g.resolve(i + 3))
    for (let i = 0; i < 20; i += 1) await tick(100)
    await expect(running).resolves.toHaveLength(10)
    expect(peak).toBeLessThanOrEqual(3)
  })
})

describe('I3 满载即补：onSettled 早于下一个 onStart', () => {
  it('落定的全局序号 < 补发任务的启动序号', async () => {
    let seq = 0
    const events: Array<{ kind: 'start' | 'settled'; key: string; seq: number }> = []
    const gates = Array.from({ length: 6 }, () => deferred<number>())
    const tasks: SlideTask<number>[] = gates.map((gate, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: () => gate.promise,
    }))

    const running = runSlidingWindow(tasks, {
      maxConcurrency: 3,
      onStart: (task) => events.push({ kind: 'start', key: task.key, seq: seq++ }),
      onSettled: (result) => events.push({ kind: 'settled', key: result.key, seq: seq++ }),
    })
    await tick(2000)
    expect(events.filter((e) => e.kind === 'start').map((e) => e.key)).toEqual(['t0', 't1', 't2'])

    gates[0].resolve(0)
    await tick(0)

    const settledT0 = events.find((e) => e.kind === 'settled' && e.key === 't0')
    const startT3 = events.find((e) => e.kind === 'start' && e.key === 't3')
    expect(settledT0).toBeDefined()
    expect(startT3).toBeDefined()
    // ★ 先展示结果，再补发：这是「结果已展示 → 立即补发」的顺序证明
    expect(settledT0!.seq).toBeLessThan(startT3!.seq)
    // 且补发不是等 1 秒后才发生（稳态不节流）
    expect(Date.now()).toBe(2000)

    gates.slice(1).forEach((g, i) => g.resolve(i + 1))
    for (let i = 0; i < 20; i += 1) await tick(100)
    await running
  })
})

describe('I4 顺序：返回按任务原始顺序', () => {
  it('倒序落定，结果数组仍是 t0..t3', async () => {
    const gates = Array.from({ length: 4 }, () => deferred<number>())
    const tasks: SlideTask<number>[] = gates.map((gate, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: () => gate.promise,
    }))
    const settledOrder: string[] = []
    const running = runSlidingWindow(tasks, {
      maxConcurrency: 4,
      startIntervalMs: 0,
      onSettled: (r) => settledOrder.push(r.key),
    })
    await tick(0)
    for (const i of [3, 2, 1, 0]) {
      gates[i].resolve(i)
      await tick(0)
    }
    const results = await running
    expect(results.map((r) => r.key)).toEqual(['t0', 't1', 't2', 't3'])
    expect(results.map((r) => r.value)).toEqual([0, 1, 2, 3])
    // 实时展示顺序 = 落定顺序
    expect(settledOrder).toEqual(['t3', 't2', 't1', 't0'])
  })
})

describe('I5 重试：复用同一并发槽，最多 2 次尝试', () => {
  it('失败一次后成功，attempts=2，且只启动过 1 次', async () => {
    let starts = 0
    const tasks: SlideTask<string>[] = [
      {
        key: 't0',
        label: '会失败一次',
        run: async () => {
          starts += 1
          if (starts === 1) throw new Error('第一次失败')
          return 'ok'
        },
      },
    ]
    const running = runSlidingWindow(tasks, { maxConcurrency: 1 })
    await tick(0)
    const [result] = await running
    expect(result.ok).toBe(true)
    expect(result.value).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(starts).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('一直失败则 attempts=2、ok=false，且不额外占用并发槽', async () => {
    let peak = 0
    const runs: number[] = []
    const tasks: SlideTask<string>[] = Array.from({ length: 2 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => {
        runs.push(i)
        throw new Error(`任务 ${i} 失败`)
      },
    }))
    const running = runSlidingWindow(tasks, {
      maxConcurrency: 1,
      onProgress: (p) => {
        peak = Math.max(peak, p.inFlight)
      },
    })
    for (let i = 0; i < 10; i += 1) await tick(0)
    const results = await running
    expect(results.every((r) => !r.ok)).toBe(true)
    expect(results.map((r) => r.attempts)).toEqual([2, 2])
    expect(results[0].error).toContain('失败')
    expect(peak).toBe(1)
    expect(runs).toEqual([0, 0, 1, 1])
  })

  it('retry: 0 时只尝试一次', async () => {
    let runs = 0
    const running = runSlidingWindow(
      [
        {
          key: 't0',
          label: '任务',
          run: async () => {
            runs += 1
            throw new Error('x')
          },
        },
      ],
      { maxConcurrency: 1, retry: 0 },
    )
    await tick(0)
    const [result] = await running
    expect(runs).toBe(1)
    expect(result.attempts).toBe(1)
  })
})

describe('I6 取消：不再启动新任务、已落定结果保留、最终抛 cancelled', () => {
  it('abort 后未启动的任务不再启动', async () => {
    const controller = new AbortController()
    const started: string[] = []
    const tasks: SlideTask<number>[] = Array.from({ length: 5 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: (signal) => {
        started.push(`t${i}`)
        return new Promise<number>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      },
    }))

    const running = runSlidingWindow(tasks, {
      maxConcurrency: 2,
      signal: controller.signal,
    })
    // ★ 先挂断言再推进时间：否则 promise 在 tick() 期间就 reject，Node 会记一次
    //   「异步才被处理的拒绝」，vitest 把它报成 Unhandled Rejection（exit code 1）。
    const rejected = expect(running).rejects.toMatchObject({ kind: 'cancelled' })
    await tick(0)
    expect(started).toEqual(['t0'])
    controller.abort()
    await tick(0)
    await rejected
    expect(started).toEqual(['t0'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('已落定结果在取消后仍然保留（不重跑、不丢）', async () => {
    const controller = new AbortController()
    const settled: string[] = []
    const first = deferred<number>()
    const tasks: SlideTask<number>[] = [
      { key: 't0', label: '任务0', run: () => first.promise },
      {
        key: 't1',
        label: '任务1',
        run: (signal) =>
          new Promise<number>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      },
    ]
    const running = runSlidingWindow(tasks, {
      maxConcurrency: 2,
      startIntervalMs: 0,
      signal: controller.signal,
      onSettled: (r) => settled.push(r.key),
    })
    const rejected = expect(running).rejects.toMatchObject({ kind: 'cancelled' })
    await tick(0)
    first.resolve(1)
    await tick(0)
    expect(settled).toEqual(['t0'])
    controller.abort()
    await tick(0)
    await rejected
    expect(settled).toEqual(['t0'])
  })
})

describe('I7 进度：done + queued + inFlight === total', () => {
  it('每次进度回调都满足守恒式', async () => {
    const snapshots: SlideProgress[] = []
    const tasks: SlideTask<number>[] = Array.from({ length: 5 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => {
        await new Promise((res) => setTimeout(res, 10))
        if (i === 2) throw new Error('故意失败')
        return i
      },
    }))
    const running = runSlidingWindow(tasks, {
      maxConcurrency: 2,
      onProgress: (p) => snapshots.push({ ...p }),
    })
    for (let i = 0; i < 30; i += 1) await tick(100)
    await running
    expect(snapshots.length).toBeGreaterThan(5)
    for (const p of snapshots) {
      expect(p.done + p.queued + p.inFlight).toBe(p.total)
    }
    const last = snapshots[snapshots.length - 1]
    expect(last.done).toBe(5) // 失败项也计入 done
    expect(last.queued).toBe(0)
    expect(last.inFlight).toBe(0)
  })
})

describe('I8 串行：N === 1 不套用起速间隔', () => {
  it('3 个任务都在 t=0 依次衔接，不产生每任务 1 秒空档', async () => {
    const starts: number[] = []
    const tasks: SlideTask<number>[] = Array.from({ length: 3 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => {
        starts.push(Date.now())
        return i
      },
    }))
    const running = runSlidingWindow(tasks, { maxConcurrency: 1 })
    for (let i = 0; i < 10; i += 1) await tick(0)
    await running
    expect(starts).toEqual([0, 0, 0])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('N=1 且每个任务耗时 100ms 时，总耗时约 300ms（不是 3 秒）', async () => {
    const tasks: SlideTask<number>[] = Array.from({ length: 3 }, (_, i) => ({
      key: `t${i}`,
      label: `任务${i}`,
      run: async () => {
        await new Promise((res) => setTimeout(res, 100))
        return i
      },
    }))
    const running = runSlidingWindow(tasks, { maxConcurrency: 1 })
    for (let i = 0; i < 6; i += 1) await tick(100)
    const results = await running
    // 3 × 100ms ≈ 300ms；若误套 1 秒起速间隔会是 3000ms+
    expect(results[2].endedAt - results[0].startedAt).toBe(300)
  })
})

describe('I9 / I10 空集与定时器清理', () => {
  it('空任务直接返回 []，不建定时器', async () => {
    const results = await runSlidingWindow([], { maxConcurrency: 3 })
    expect(results).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('正常完成、失败、取消三条路径都不残留定时器', async () => {
    // 正常
    const ok = runSlidingWindow(
      [{ key: 'a', label: 'a', run: async () => 1 }],
      { maxConcurrency: 3 },
    )
    for (let i = 0; i < 5; i += 1) await tick(1000)
    await ok
    expect(vi.getTimerCount()).toBe(0)

    // 失败
    const fail = runSlidingWindow(
      [
        {
          key: 'b',
          label: 'b',
          run: async () => {
            throw new Error('x')
          },
        },
      ],
      { maxConcurrency: 3 },
    )
    await tick(0)
    await fail
    expect(vi.getTimerCount()).toBe(0)

    // 取消
    const controller = new AbortController()
    const cancelled = runSlidingWindow(
      [
        {
          key: 'c',
          label: 'c',
          run: (signal) =>
            new Promise<number>((_r, reject) => signal.addEventListener('abort', () => reject(new Error('a')))),
        },
      ],
      { maxConcurrency: 3, signal: controller.signal },
    )
    const cancelledRejected = expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' })
    await tick(0)
    controller.abort()
    await tick(0)
    await cancelledRejected
    expect(vi.getTimerCount()).toBe(0)
  })
})
