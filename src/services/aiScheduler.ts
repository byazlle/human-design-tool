/**
 * 滑动窗口调度器（v4.0.0 · ARCH §4）。
 *
 * 一句话语义（用户确认口径，不得再推断）：
 * **「若设为 N，则每秒发起 1 个请求，直到在跑 N 个；之后任一请求完成（结果已展示）
 * 立即补发下一个，始终维持最多 N 个在跑。」**
 *
 * 三条容易写错的边界，本文件用「不变量 + 单测」钉住（§4.2 的 I1–I10）：
 * 1. **起速判据是 `startedCount >= N`**，不是「`inFlight === N` 出现过」——
 *    任务比 `gap` 快时后者永远不成立，会自锁在 1/s。
 * 2. **`N === 1` 时 `gap = 0`**：否则串行档每个任务凭空多等 1 秒。
 * 3. **`pump()` 必须防重入**：同一 microtask 内连续落定 N 个任务时，
 *    `onSettled → pump()` 会被连调多次，不设标志会把 `inFlight` 推过 N。
 *
 * 另有一条架构约束：**`task.run` 是裸调用**，调度器内部不再包 `withRetry`
 * （`aiAttempt.withRetry` 自己就要 2 次尝试，叠一层会变成 4 次，见风险 R13）。
 */
import { cancelledError, errText, isCancelled } from './aiAttempt'
import {
  AI_MAX_CONCURRENCY_MAX,
  DEFAULT_AI_MAX_CONCURRENCY,
  clampMaxConcurrency,
} from './aiConcurrency'

/** 并发上限：唯一权威在 `aiConcurrency.AI_MAX_CONCURRENCY_MAX`，这里只做别名方便调用方 */
export const MAX_SLIDE_CONCURRENCY = AI_MAX_CONCURRENCY_MAX

/** 归一函数同样只做重导出：全库只有一份实现（`aiConcurrency.clampMaxConcurrency`） */
export { clampMaxConcurrency }

/** 默认起速间隔：每秒发起 1 个 */
export const DEFAULT_START_INTERVAL_MS = 1000

/** 单个任务：`run` 必须接受 abort signal，并在取消时尽快 reject */
export interface SlideTask<T> {
  /** 稳定 key（进结果、进报告分节） */
  key: string
  /** 给人看的中文名（进度区「当前」文案） */
  label: string
  run: (signal: AbortSignal) => Promise<T>
}

/** 单任务落定结果（成功或失败都有一条；取消的任务不产出） */
export interface SlideResult<T> {
  key: string
  label: string
  ok: boolean
  value?: T
  error?: string
  /** 实际尝试次数（1 = 一次过，2 = 重试过一次） */
  attempts: number
  startedAt: number
  endedAt: number
}

/** 实时进度（`done + queued + inFlight === total` 恒成立） */
export interface SlideProgress {
  /** 已落定数（含失败项） */
  done: number
  total: number
  inFlight: number
  /** 尚未启动的数量 */
  queued: number
  /** 最近一次落定项的名称 */
  current: string
}

export interface SlideOptions<T> {
  /** 最高并发数 N，1–99 */
  maxConcurrency: number
  /** 起速间隔，默认 1000ms */
  startIntervalMs?: number
  /** 单任务失败重试次数，默认 1（即最多 2 次尝试） */
  retry?: number
  signal?: AbortSignal
  onStart?: (task: SlideTask<T>, inFlight: number) => void
  onSettled?: (result: SlideResult<T>, progress: SlideProgress) => void
  onProgress?: (progress: SlideProgress) => void
}

/** 起速间隔：N === 1 时恒为 0（I8）；显式传 0 表示「不起速、立即满载」；
 * 负数 / 非数字回落到默认 1 秒。
 */
export function startGapOf(maxConcurrency: number, startIntervalMs?: number): number {
  if (clampMaxConcurrency(maxConcurrency, DEFAULT_AI_MAX_CONCURRENCY) === 1) return 0
  if (startIntervalMs === undefined) return DEFAULT_START_INTERVAL_MS
  return Number.isFinite(startIntervalMs) && startIntervalMs >= 0
    ? startIntervalMs
    : DEFAULT_START_INTERVAL_MS
}

/**
 * 状态区 phase 文案（§4.2 I1 的「已知副作用」必须在 UI 明示）。
 *
 * - 起速中：`起速中（每秒 1 个）· 已启动 M / N`
 * - 稳态：`最高并发数 N · 在跑 X / 总 T`
 */
export function slidePhaseText(
  progress: SlideProgress,
  maxConcurrency: number,
  totalOverride?: number,
): string {
  const n = clampMaxConcurrency(maxConcurrency)
  const started = progress.total - progress.queued
  const rampDone = n === 1 || started >= n
  if (!rampDone) return `起速中（每秒 1 个）· 已启动 ${started} / ${n}`
  // 带末位融合的计划：调度器只数分项，报告进度数的是「分项 + 融合」。
  // 文案取同一总数，避免面板出现「第 1/11 项」与「总 10」并存。
  const total = Number.isInteger(totalOverride) && (totalOverride as number) >= progress.total
    ? (totalOverride as number)
    : progress.total
  return `最高并发数 ${n} · 在跑 ${progress.inFlight} / 总 ${total}`
}

/** 单次尝试的归一结果：失败不抛，取消单独一种形态 */
type Outcome<T> = { kind: 'ok'; value: T; attempts: number } | { kind: 'fail'; error: string; attempts: number } | { kind: 'cancelled' }

/**
 * 跑一条滑动窗口。
 *
 * @returns 按**任务原始顺序**排列的结果数组（I4）；实时展示顺序由 `onSettled` 决定。
 * @throws AiError('已取消','cancelled') 当 signal 被 abort（I6，已落定结果不丢，但不可返回）
 */
export async function runSlidingWindow<T>(
  tasks: SlideTask<T>[],
  options: SlideOptions<T>,
): Promise<SlideResult<T>[]> {
  const total = tasks.length
  // I9：空集直接返回，不建任何定时器
  if (total === 0) return []

  const limit = clampMaxConcurrency(options.maxConcurrency)
  const gap = startGapOf(limit, options.startIntervalMs)
  const retry = Math.max(0, Math.floor(options.retry ?? 1))
  // run() 需要一个真实 signal；外部没给时用内部 controller（永不 abort）
  const internalAbort = new AbortController()
  const runSignal = options.signal ?? internalAbort.signal

  const results: Array<SlideResult<T> | undefined> = new Array(total)
  let next = 0
  let startedCount = 0
  let inFlight = 0
  let done = 0
  let lastLaunchAt = Number.NEGATIVE_INFINITY
  let rampDone = gap === 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pumping = false
  let current = ''
  let resolveAll: (() => void) | null = null
  const allSettled = new Promise<void>((resolve) => {
    resolveAll = resolve
  })

  const now = (): number => Date.now()

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const progress = (): SlideProgress => ({
    done,
    total,
    inFlight,
    queued: total - startedCount,
    current,
  })

  const emitProgress = (): void => {
    try {
      options.onProgress?.(progress())
    } catch {
      /* UI 层回调异常不得中断调度 */
    }
  }

  const finish = (): void => {
    clearTimer()
    resolveAll?.()
  }

  const attempt = async (task: SlideTask<T>): Promise<Outcome<T>> => {
    let lastError: unknown
    let attempts = 0
    // I5：重试复用同一并发槽——循环在 launch 内部，不改 inFlight、不动时间戳
    for (let tries = 0; tries <= retry; tries += 1) {
      if (options.signal?.aborted) return { kind: 'cancelled' }
      attempts = tries + 1
      try {
        const value = await task.run(runSignal)
        return { kind: 'ok', value, attempts }
      } catch (err) {
        if (isCancelled(err, options.signal)) return { kind: 'cancelled' }
        lastError = err
      }
    }
    return { kind: 'fail', error: errText(lastError), attempts }
  }

  const launch = async (index: number): Promise<void> => {
    const task = tasks[index]
    startedCount += 1
    // I1：起速结束的唯一判据
    if (startedCount >= limit) rampDone = true
    inFlight += 1
    lastLaunchAt = now()
    try {
      options.onStart?.(task, inFlight)
    } catch {
      /* 同上：回调异常不中断调度 */
    }
    emitProgress()

    const startedAt = now()
    const outcome = await attempt(task)
    inFlight -= 1

    if (outcome.kind === 'cancelled') {
      // I6：取消后不再补发，但已落定结果保留；全部收尾后由外层抛 cancelled
      if (inFlight === 0) finish()
      return
    }

    done += 1
    const result: SlideResult<T> = {
      key: task.key,
      label: task.label,
      ok: outcome.kind === 'ok',
      ...(outcome.kind === 'ok' ? { value: outcome.value } : { error: outcome.error }),
      attempts: outcome.attempts,
      startedAt,
      endedAt: now(),
    }
    results[index] = result
    current = task.label
    try {
      // ★ I3 的顺序要求：先让调用方展示结果，再补发下一个
      options.onSettled?.(result, progress())
    } catch {
      /* 同上 */
    }
    // I7：每次落定都发一次进度（失败项也计入 done）
    emitProgress()
    if (options.signal?.aborted) {
      if (inFlight === 0) finish()
      return
    }
    pump()
  }

  function pump(): void {
    if (options.signal?.aborted) return
    // ★ 防重入：同一 tick 内多次落定只排一次补发
    if (pumping) return
    pumping = true
    queueMicrotask(() => {
      pumping = false
      if (options.signal?.aborted) return
      while (inFlight < limit && next < total) {
        // I6：取消后**不再启动新任务**。这一行必须放在循环体内——
        // 上一轮 launch 是同步启动的，取消可能就发生在它里面（例如首个请求 401 后用户点中断）。
        if (options.signal?.aborted) return
        if (!rampDone) {
          const wait = gap - (now() - lastLaunchAt)
          if (wait > 0) {
            // ★ 只保留一个定时器：先清再挂，避免唤醒叠加造成突发
            clearTimer()
            timer = setTimeout(() => {
              timer = null
              pump()
            }, wait)
            return
          }
        }
        const index = next
        next += 1
        // 不 await：多个任务并发在跑
        void launch(index)
      }
      if (next >= total && inFlight === 0) finish()
    })
  }

  const onAbort = (): void => {
    clearTimer()
    if (inFlight === 0) finish()
  }
  options.signal?.addEventListener('abort', onAbort)

  try {
    pump()
    await allSettled
  } finally {
    // I10：任何返回/抛出路径都不残留定时器
    clearTimer()
    options.signal?.removeEventListener('abort', onAbort)
  }

  if (options.signal?.aborted) throw cancelledError(options.signal)

  // 理论上有洞只可能来自取消路径（已在上面抛出），这里兜一层保证类型安全
  return results.filter((r): r is SlideResult<T> => r !== undefined)
}
