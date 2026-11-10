/**
 * 并发编排共用的重试 / 取消判定（v2.4.0 抽出）。
 *
 * 原先这三段逻辑内联在 `aiFullReading.ts` 里；v2.4.0 的批量生成需要完全相同的语义
 * （单项失败重试 1 次、取消不重试直接上抛），若各自复制一份，两处的重试次数与
 * 取消判定迟早会漂移。因此上移到独立模块，由两个编排器共用。
 *
 * 只做编排层的错误分类，不碰网络、不碰 store。
 */
import { AiError } from './aiClient'

/** 构造统一的「已取消」异常（kind 复用 AiError 既有分类，不新增） */
export function cancelledError(signal?: AbortSignal): AiError {
  void signal
  return new AiError('已取消', 'cancelled')
}

/**
 * 判定是否为「用户主动取消」。
 * signal 已 aborted 时无论错误形态如何都算取消——AbortError 在超时与取消两条路径上同形，
 * 区分它们必须靠 signal（见 aiClient.explain 的 catch 分支）。
 */
export function isCancelled(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return err instanceof AiError && err.kind === 'cancelled'
}

/** 单项失败先重试 1 次；取消不重试，直接向上抛 */
export async function withRetry(
  call: () => Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw cancelledError(signal)
    try {
      return await call()
    } catch (err) {
      if (isCancelled(err, signal)) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** 取可展示的错误文案（AiError 的 message 已是给人看的） */
export function errText(err: unknown): string {
  return err instanceof AiError ? err.message : (err as Error)?.message || '未知错误'
}
