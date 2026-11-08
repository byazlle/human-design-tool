/**
 * AI 并发配置的中立工具模块（v2.3.0 · T-C1）。
 *
 * 只提供常量与纯函数，禁止 import 任何 store / 组件，避免循环依赖。
 *
 * 口径（PRD-v2.3.0-AI并发增量 §2 / ARCH §11.2.1、§11.0 Q-C1）：
 * - 两个全局设置项：`aiConcurrency`（AI 并发数，默认 3）、`aiConcurrencyLimit`（并发上限，默认 64）。
 * - 唯一闸门是「任务所需并发数 N ≤ 并发上限 Y」；`aiConcurrency` 只作设定值 / 校验对象 / 展示值，
 *   **不切片分批**（Q-C1 已确认，不得再推断）。
 * - 加载 / 迁移用宽松归一（`normalizeConcurrencyPair`），保存用严格拒绝（`validateConcurrencyPair`），
 *   两套语义不得混用（ARCH §11.2.2）。
 */
import type { AiStepMode } from '../types/hd'

/** 两个配置项的取值范围（含端点） */
export const CONCURRENCY_MIN = 1
export const CONCURRENCY_MAX = 128

/** 任务清单里 `MIN` / `MAX` 的简写别名，语义与上面完全一致 */
export const MIN = CONCURRENCY_MIN
export const MAX = CONCURRENCY_MAX

/** `aiConcurrency` 默认值：沿用历史 `PARALLEL_CONCURRENCY = 3`，仅作设定值来源 */
export const DEFAULT_AI_CONCURRENCY = 3

/** `aiConcurrencyLimit` 默认值：覆盖典型单人整盘任务规模，关系场超限时按条件 ② 降级 */
export const DEFAULT_AI_CONCURRENCY_LIMIT = 64

/**
 * 加载时宽松归一（AC-C3）：非数字 / 非整数 / 小数 / 越界一律回落 `fallback`。
 * `fallback` 本身也用同一套规则收敛，保证返回值恒为 [MIN, MAX] 内的整数。
 */
export function clampConcurrency(raw: unknown, fallback: number): number {
  const safeFallback =
    Number.isInteger(fallback) && fallback >= CONCURRENCY_MIN && fallback <= CONCURRENCY_MAX
      ? fallback
      : DEFAULT_AI_CONCURRENCY
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < CONCURRENCY_MIN ||
    raw > CONCURRENCY_MAX
  ) {
    return safeFallback
  }
  return raw
}

/** 任务清单中 `normalizeConcurrency` 的别名，语义与 `clampConcurrency` 一致 */
export const normalizeConcurrency = clampConcurrency

/** 加载时成对归一的结果（AC-C3） */
export interface ConcurrencyPair {
  concurrency: number
  limit: number
  /** 存量值被回落或收敛过：供「一次可见提示」消费，不静默改值 */
  adjusted: boolean
}

/**
 * 加载时成对归一（AC-C3）。
 *
 * - 字段缺失（undefined / null / 空串）→ 回落默认值，不算异常、不提示；
 * - 存量值非法（非整数 / 越界 / 类型不符）→ 回落并置 `adjusted = true`；
 * - 违反 `1 ≤ c ≤ l ≤ 128` → 把 c 收敛为 `min(c, l)` 并置 `adjusted = true`。
 *
 * 不写回 localStorage（下次加载仍按同一规则归一）；`adjusted` 由调用方转成
 * 模块级「一次性可见提示」，不进 `SettingsState`、不持久化。
 */
export function normalizeConcurrencyPair(rawC: unknown, rawL: unknown): ConcurrencyPair {
  const hasC = rawC !== undefined && rawC !== null && rawC !== ''
  const hasL = rawL !== undefined && rawL !== null && rawL !== ''
  const clampedC = clampConcurrency(
    hasC ? rawC : DEFAULT_AI_CONCURRENCY,
    DEFAULT_AI_CONCURRENCY,
  )
  const clampedL = clampConcurrency(
    hasL ? rawL : DEFAULT_AI_CONCURRENCY_LIMIT,
    DEFAULT_AI_CONCURRENCY_LIMIT,
  )
  const invalidC = hasC && clampedC !== rawC
  const invalidL = hasL && clampedL !== rawL
  let concurrency = clampedC
  if (concurrency > clampedL) concurrency = clampedL
  return {
    concurrency,
    limit: clampedL,
    adjusted: invalidC || invalidL || concurrency !== clampedC,
  }
}

/**
 * 保存时严格校验（AC-C4 条件 ①）。
 *
 * @returns `null` 表示合法；否则返回行内错误文案，调用方据此**拒绝写入**，
 *          store 与 `hdt.settings.v1` 保持原生效值不变、不静默收敛。
 */
export function validateConcurrencyPair(concurrency: number, limit: number): string | null {
  const valid = (v: number): boolean =>
    Number.isInteger(v) && v >= CONCURRENCY_MIN && v <= CONCURRENCY_MAX
  if (!valid(concurrency) || !valid(limit)) {
    return `AI 并发数与并发上限需为 ${CONCURRENCY_MIN}–${CONCURRENCY_MAX} 的整数`
  }
  if (concurrency > limit) {
    return `AI 并发数不能超过并发上限（当前上限 ${limit}），请调小并发数或调大上限`
  }
  return null
}

/** 运行时调度结果：由 `runFullReading()` 入口计算一次，不持久化 */
export interface ConcurrencySchedule {
  /** 任务所需并发数 N = tasks.length，不含融合 */
  required: number
  /** 唯一闸门 Y = aiConcurrencyLimit */
  limit: number
  /** parallel 未超限 = N；降级 = Y；serial = 1 */
  batchWidth: number
  /** parallel 未超限 = 1；降级 = K；serial = N */
  batchCount: number
  /** = ceil(N / Y)，仅降级有意义 */
  K: number
  degraded: boolean
}

/**
 * 调度解析（★ Q-C1：完全不读取 `aiConcurrency`，唯一闸门是 `N ≤ Y`）。
 *
 * - `serial`             → `batchWidth = 1`, `batchCount = N`, `degraded = false`
 * - `parallel` 且 `N ≤ Y` → `batchWidth = N`, `batchCount = 1`, `degraded = false`（一次性并发）
 * - `parallel` 且 `N > Y` → `batchWidth = Y`, `K = ceil(N/Y)`, `degraded = true`（条件 ②）
 *
 * 边界：`N === 0` 时 `batchWidth = Math.max(1, N)` 兜底避免除零；`Y` 由
 * `clampConcurrency` 保证 ≥ 1。`stepMode` 只做两分支，不新增枚举值。
 */
export function resolveSchedule(
  required: number,
  limit: number,
  stepMode: AiStepMode,
): ConcurrencySchedule {
  const n = Number.isFinite(required) ? Math.max(0, Math.floor(required)) : 0
  const y = clampConcurrency(limit, DEFAULT_AI_CONCURRENCY_LIMIT)

  if (stepMode === 'serial') {
    return { required: n, limit: y, batchWidth: 1, batchCount: n, K: n, degraded: false }
  }

  if (n <= y) {
    return {
      required: n,
      limit: y,
      batchWidth: Math.max(1, n),
      batchCount: 1,
      K: 1,
      degraded: false,
    }
  }

  const k = Math.ceil(n / y)
  return { required: n, limit: y, batchWidth: y, batchCount: k, K: k, degraded: true }
}
