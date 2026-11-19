/**
 * `max_tokens` 越界降级链（v4.0.0 · ARCH §7.3）。
 *
 * 背景：v4.0.0 删除了「token 总预算」这一用户设置，请求体恒传 `max_tokens: 128000`。
 * 但不同中转站 / 模型对上限的接受度差异很大（有的直接 400 拒绝，有的报
 * `maximum context length`），一条请求被拒不该让用户看到「接口返回 400」而无解。
 *
 * 设计口径（三条硬约束）：
 * 1. **只认越界措辞**：必须是 400/422 + 明确的 max_tokens / 上下文长度措辞；
 *    Key 错误、模型不存在、余额不足一律**不降级**——否则一个 401 会被重试 6 次，
 *    把「立刻报错的 Key 问题」变成「等 6 轮的 Key 问题」（R2）。
 * 2. **状态不跨请求**：降级进度只存在于 `explain()` 的栈内局部变量，
 *    不写模块级变量、不缓存、不共享，保证「只降这一条，不污染其他并发任务」。
 * 3. **末位是不带字段**：阶梯最后一级为 `undefined`，表示请求体里**不出现**
 *    `max_tokens`（交给服务端默认值），而不是传 0 或传一个更小的假值。
 */

/** 请求体统一上限（不是「用户预算」，用户已不能修改） */
export const MAX_TOKENS_CEILING = 128000

/** 阶梯：逐级重试一次；末位 `undefined` = 请求体不带该字段 */
export const MAX_TOKENS_LADDER: ReadonlyArray<number | undefined> = [
  128000,
  64000,
  32000,
  16000,
  8192,
  undefined,
]

/** 单级取值：数字或「不带字段」 */
export type MaxTokensStep = number | undefined

/**
 * 越界措辞白名单（命中任一即视为「上限类」拒绝）。
 *
 * 覆盖四种常见措辞族：OpenAI 的 `max_tokens` / `maximum context length`、
 * Anthropic 的 `max_output_tokens`、网关的 `too many tokens` / `token limit`、
 * 以及中文中转站的「上下文长度」「超出上限 / 限制」。
 */
const OVERFLOW_PATTERN =
  /max[_\s-]?tokens?|max_output_tokens|maximum context|context length|too many tokens|token limit|上下文长度|超出.*(上限|限制)/i

/**
 * 排除措辞：这些是鉴权 / 模型名 / 余额问题，重试任何 `max_tokens` 都无用。
 * 只要 body 里出现这几个词，无论是否同时含越界措辞，一律**不降级**。
 */
const NON_OVERFLOW_PATTERN =
  /invalid[_\s-]?api[_\s-]?key|unauthorized|model[_\s-]?not[_\s-]?found|insufficient[_\s-]?quota/i

/**
 * 是否为「max_tokens 越界」类拒绝。
 *
 * `isMaxTokensRejection(status, bodyText) =
 *    (status === 400 || status === 422)
 *    && OVERFLOW_PATTERN.test(bodyText)
 *    && !NON_OVERFLOW_PATTERN.test(bodyText)`
 *
 * body 为空 / 只有空白 → 一律 `false`（无措辞可判，宁可不降级）。
 */
export function isMaxTokensRejection(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 422) return false
  const body = bodyText.trim()
  if (!body) return false
  if (NON_OVERFLOW_PATTERN.test(body)) return false
  return OVERFLOW_PATTERN.test(body)
}

/**
 * 下一档；已是末位返回 `null`（停止降级）。
 *
 * 未知取值（不在阶梯内）也返回 `null`：不做猜测性跳跃，
 * 调用方拿到 `null` 就把原始错误抛给用户。
 */
export function nextMaxTokensStep(current: MaxTokensStep): MaxTokensStep | null {
  const index = MAX_TOKENS_LADDER.indexOf(current)
  if (index < 0) return null
  if (index >= MAX_TOKENS_LADDER.length - 1) return null
  return MAX_TOKENS_LADDER[index + 1]
}

/** 阶梯起点（每次请求都从这里开始，不继承任何上一次的进度） */
export const FIRST_MAX_TOKENS_STEP: MaxTokensStep = MAX_TOKENS_CEILING

/** 统计降级次数，供日志与 UI 提示（不持久化、不跨请求） */
export interface FallbackTrace {
  /** 依次尝试过的档位（含起点） */
  tried: MaxTokensStep[]
  /** 最终成功的档位 */
  finalStep: MaxTokensStep
  /** 是否发生过降级（tried.length > 1） */
  degraded: boolean
}

/** 新建一条降级轨迹：每次都从阶梯起点开始 */
export function startFallbackTrace(): FallbackTrace {
  return { tried: [FIRST_MAX_TOKENS_STEP], finalStep: FIRST_MAX_TOKENS_STEP, degraded: false }
}

/** 记一次降级尝试（更新 finalStep 与 degraded） */
export function pushFallbackStep(trace: FallbackTrace, step: MaxTokensStep): FallbackTrace {
  trace.tried.push(step)
  trace.finalStep = step
  trace.degraded = trace.tried.length > 1
  return trace
}

/** 请求体的 `max_tokens` 字段：末位 `undefined` 表示省略该字段 */
export function maxTokensBodyOf(step: MaxTokensStep): Record<string, number> {
  return step === undefined ? {} : { max_tokens: step }
}
