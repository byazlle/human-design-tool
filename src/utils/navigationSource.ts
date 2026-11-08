/**
 * 通用「来源记录」工具（v2.3.0 · T-1 / Q-3）。
 *
 * 一套工具、三类用途：
 * - `settings`：`hdt.settings.returnTo`，设置页返回来源（key 名与 v2.2.1 完全一致）。
 * - `derived` ：`hdt.nav.derivedFrom`，派生页返回发起页（R-1 / R-8）。
 * - `notice`  ：`hdt.nav.notice`，一次性跨页提示（R-2 手机降级横幅）。
 *
 * 全部落在 `sessionStorage`，隐私模式不可读写时静默忽略（与 v2.2.1 行为一致）。
 * 来源消费一次即清除，避免从别处进入时串到旧来源。
 */

export type SourceKind = 'settings' | 'derived' | 'notice'

/** key 名常量；SETTINGS_RETURN_KEY 保持与 v2.2.1 完全一致 */
export const SETTINGS_RETURN_KEY = 'hdt.settings.returnTo'

export const SOURCE_KEYS: Record<SourceKind, string> = {
  settings: SETTINGS_RETURN_KEY,
  derived: 'hdt.nav.derivedFrom',
  notice: 'hdt.nav.notice',
}

/** 派生路由名（与 router 的 name 一致），供 beforeEach 与单测共用 */
export const DERIVED_ROUTE_NAMES = [
  'chiron-return',
  'multi-board',
  'composite',
  'compare',
] as const

export function isDerivedRoute(name: unknown): boolean {
  return typeof name === 'string' && (DERIVED_ROUTE_NAMES as readonly string[]).includes(name)
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** 写入来源；隐私模式下不可写时静默忽略 */
export function recordSource(key: string, fromFullPath: string): void {
  const store = storage()
  if (!store || !fromFullPath) return
  try {
    store.setItem(key, fromFullPath)
  } catch {
    /* 隐私模式 / 容量不足：静默忽略 */
  }
}

/** 只读，不消费（用于返回按钮文案） */
export function peekSource(key: string): string {
  const store = storage()
  if (!store) return ''
  try {
    return store.getItem(key) ?? ''
  } catch {
    return ''
  }
}

/** 读取并清除，只消费一次 */
export function consumeSource(key: string): string {
  const value = peekSource(key)
  const store = storage()
  if (store) {
    try {
      store.removeItem(key)
    } catch {
      /* 静默忽略 */
    }
  }
  return value
}

export function clearSource(key: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(key)
  } catch {
    /* 静默忽略 */
  }
}

/**
 * 返回按钮文案映射（TB-4 / AC-5）。
 *
 * `variant='settings'` 保持设置页 v2.2.1 文案逐字不变（`/archive/` → 「返回完整盘」）；
 * `variant='derived'` 供 4 个派生页使用（`/archive/` → 「返回本盘」）。
 */
export function sourceReturnLabel(
  path: string,
  fallback = '返回档案库',
  variant: 'settings' | 'derived' = 'settings',
): string {
  const value = path ?? ''
  if (value.startsWith('/archive/')) return variant === 'derived' ? '返回本盘' : '返回完整盘'
  if (value.startsWith('/chiron/')) return '返回凯龙盘'
  if (value.startsWith('/composite/')) return '返回合盘'
  if (value.startsWith('/compare')) return '返回双盘对比'
  if (value === '/boards') return '返回多盘'
  return fallback
}

/** 一次性跨页提示（R-2）；kind 用于避免不同提示互相串台 */
export interface NavNotice {
  kind: string
  text: string
  createdAt: number
}

export function putNotice(kind: string, text: string): void {
  const store = storage()
  if (!store) return
  const payload: NavNotice = { kind, text, createdAt: Date.now() }
  try {
    store.setItem(SOURCE_KEYS.notice, JSON.stringify(payload))
  } catch {
    /* 静默忽略 */
  }
}

/**
 * 派生页统一返回（R-1 / R-8）：`router.back()` 优先（popstate 带 savedPosition，
 * 不改 scrollBehavior 即可恢复滚动）；直接打开 / 无历史时 push 到发起页兜底。
 */
export function goDerivedBack(router: {
  back: () => void
  push: (to: string) => unknown
}): void {
  const target = consumeSource(SOURCE_KEYS.derived) || '/'
  const hasHistory =
    typeof window !== 'undefined' &&
    Boolean((window.history?.state as { back?: unknown } | null | undefined)?.back)
  if (target && hasHistory) router.back()
  else router.push(target)
}

/** 派生页返回按钮文案（derived 变体：`/archive/` → 「返回本盘」） */
export function derivedBackLabel(): string {
  return sourceReturnLabel(peekSource(SOURCE_KEYS.derived), '返回档案库', 'derived')
}

/** 读取并消费；kind 不匹配则不清空（避免不同提示互相吞掉） */
export function takeNotice(kind: string): NavNotice | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(SOURCE_KEYS.notice)
    if (!raw) return null
    const parsed = JSON.parse(raw) as NavNotice
    if (!parsed || parsed.kind !== kind) return null
    store.removeItem(SOURCE_KEYS.notice)
    return parsed
  } catch {
    return null
  }
}
