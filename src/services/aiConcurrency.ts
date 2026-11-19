/**
 * 最高并发数的唯一权威模块（v4.0.0 · ARCH §5.1–§5.4）。
 *
 * v3.5.0 的两个设置项（`aiConcurrency` 1–128 设定值 + `aiConcurrencyLimit` 1–128 技术闸门）
 * 在 v4.0.0 合并成**一个**旋钮 `aiMaxConcurrency`（1–99）：
 * 它同时是「同时跑几个」与「上限是多少」——因为滑动窗口调度器本身就是
 * 「最多 N 个在跑」（ARCH §4），不需要第二个人再说一次「最多几个」。
 *
 * 为什么上限从 128 降到 99：N=99 的起速本身就要 98 秒（每秒 1 个），
 * 再大只是把误设的爆炸半径做大。99 是「够用且可解释」的天花板。
 *
 * 两种归一语义**不得混用**（沿用既有 ARCH §11.2.2 口径）：
 * - 加载期宽松（`normalizeMaxConcurrency` / `clampMaxConcurrency`）：把存量值收敛到合法区间；
 * - 保存期严格（`validateMaxConcurrency`）：非法就拒绝写入，原值不变。
 */
export const AI_MAX_CONCURRENCY_MIN = 1
export const AI_MAX_CONCURRENCY_MAX = 99
export const DEFAULT_AI_MAX_CONCURRENCY = 3

/**
 * 加载期宽松归一：非整数 / 越界 / 类型不符一律回落 `fallback`。
 *
 * `fallback` 自身也收敛到 [1, 99]，保证返回值恒为合法整数——
 * 否则一个坏的 fallback 会把非法值一路带进调度器。
 */
export function clampMaxConcurrency(
  raw: unknown,
  fallback: number = DEFAULT_AI_MAX_CONCURRENCY,
): number {
  const safeFallback =
    Number.isInteger(fallback) &&
    fallback >= AI_MAX_CONCURRENCY_MIN &&
    fallback <= AI_MAX_CONCURRENCY_MAX
      ? fallback
      : DEFAULT_AI_MAX_CONCURRENCY
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return safeFallback
  if (raw < AI_MAX_CONCURRENCY_MIN || raw > AI_MAX_CONCURRENCY_MAX) return safeFallback
  return raw
}

/**
 * 保存期严格校验：合法返回 `null`，否则返回行内文案。
 *
 * 调用方（`stores/settings.setAiMaxConcurrency`）拿到文案后**拒绝写入**：
 * 不写 store、不 persist、原值不变（与既有条件 ① 的写入闸门语义一致）。
 */
export function validateMaxConcurrency(raw: number): string | null {
  if (!Number.isInteger(raw) || raw < AI_MAX_CONCURRENCY_MIN || raw > AI_MAX_CONCURRENCY_MAX) {
    return `最高并发数需为 ${AI_MAX_CONCURRENCY_MIN}–${AI_MAX_CONCURRENCY_MAX} 的整数`
  }
  return null
}

/** 加载期迁移结果 */
export interface MaxConcurrencyMigration {
  value: number
  /** 存量值被收敛过：供一次性可见提示消费（不静默丢意图） */
  adjusted: boolean
  /** 被忽略的旧字段快照，仅用于生成提示文案 */
  legacy: { concurrency?: number; limit?: number }
}

function present(raw: unknown): boolean {
  return raw !== undefined && raw !== null && raw !== ''
}

/**
 * 把存档里的并发相关字段迁移成 `aiMaxConcurrency`（ARCH §5.2 的 4 条优先级）：
 *
 * 1. `aiMaxConcurrency` 存在且为数字 → 取整并夹到 [1, 99]（越界夹紧而非丢弃：那是用户意图）；
 * 2. 存在但类型不符（字符串 / 布尔 / 对象）→ 回落默认 3，`adjusted = true`；
 * 3. 缺失 → 取旧 `aiConcurrency`：整数则 `min(99, max(1, c))`，`c > 99` 时 `adjusted = true`；
 * 4. 旧字段也缺失 / 非法 → 默认 3，`adjusted = false`（缺失不是异常，不打扰用户）。
 *
 * ★ `aiConcurrencyLimit` **绝不**作为迁移来源：旧语义里它是「技术闸门」（默认 64，几乎
 * 没人改），不是用户意图；把 64 迁成新语义会变成真实的 64 并发打向中转站。
 * 它只被记进 `legacy.limit`，用于生成「原并发上限不再单独生效」的提示。
 */
export function normalizeMaxConcurrency(saved: {
  aiMaxConcurrency?: unknown
  aiConcurrency?: unknown
  aiConcurrencyLimit?: unknown
}): MaxConcurrencyMigration {
  const legacy: { concurrency?: number; limit?: number } = {}
  if (typeof saved.aiConcurrency === 'number' && Number.isFinite(saved.aiConcurrency)) {
    legacy.concurrency = saved.aiConcurrency
  }
  if (typeof saved.aiConcurrencyLimit === 'number' && Number.isFinite(saved.aiConcurrencyLimit)) {
    legacy.limit = saved.aiConcurrencyLimit
  }

  if (present(saved.aiMaxConcurrency)) {
    const raw = saved.aiMaxConcurrency
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const value = Math.min(
        AI_MAX_CONCURRENCY_MAX,
        Math.max(AI_MAX_CONCURRENCY_MIN, Math.round(raw)),
      )
      return { value, adjusted: value !== raw, legacy }
    }
    return { value: DEFAULT_AI_MAX_CONCURRENCY, adjusted: true, legacy }
  }

  if (present(saved.aiConcurrency)) {
    const raw = saved.aiConcurrency
    if (typeof raw === 'number' && Number.isInteger(raw)) {
      const value = Math.min(AI_MAX_CONCURRENCY_MAX, Math.max(AI_MAX_CONCURRENCY_MIN, raw))
      return { value, adjusted: value !== raw, legacy }
    }
    return { value: DEFAULT_AI_MAX_CONCURRENCY, adjusted: true, legacy }
  }

  return { value: DEFAULT_AI_MAX_CONCURRENCY, adjusted: false, legacy }
}
