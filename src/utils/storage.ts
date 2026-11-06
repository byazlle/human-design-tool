/** 本地持久化封装：localStorage 读写容错（隐私模式下可能不可用） */

export interface LoadResult<T> {
  value: T
  /** 非空表示读取失败（已尽力备份原始内容） */
  error: string | null
}

/**
 * 带错误上报的读取。
 *
 * 为什么不能静默回退：档案是用户资产。JSON 损坏时若直接返回空数组，
 * 用户看到的是"档案全没了"，下一次写入还会把损坏内容彻底覆盖。
 */
export function loadJsonChecked<T>(key: string, fallback: T): LoadResult<T> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
    if (!raw) return { value: fallback, error: null }
    return { value: JSON.parse(raw) as T, error: null }
  } catch (err) {
    let backupKey = ''
    try {
      backupKey = `${key}.corrupt.${Date.now()}`
      localStorage.setItem(backupKey, raw ?? '')
    } catch {
      /* 备份失败（容量满/隐私模式）时仍继续 */
    }
    return {
      value: fallback,
      error:
        `本地数据读取失败${backupKey ? `，原始内容已备份到 ${backupKey}` : ''}：` +
        `${(err as Error).message}。为避免覆盖，请先导出诊断信息再操作。`,
    }
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  return loadJsonChecked(key, fallback).value
}

/**
 * 写入本地存储。
 * @returns true = 写入成功；false = 存储不可用 / 超限（已向控制台上报，调用方需据此避免"假成功"提示）
 */
export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    console.warn(`[storage] 写入 ${key} 失败：${(err as Error).message || '未知错误'}`)
    return false
  }
}

/** persist 失败时统一使用的可见提示文案（业务含义不变，仅技术错误上报） */
export const SAVE_FAILURE_HINT = '保存失败：本地存储不可用或空间已满，请先导出备份后清理浏览器数据。'

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function createId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
