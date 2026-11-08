/**
 * T-8 纯逻辑回归：通用「来源记录」工具（environment:node，无 DOM / 无组件挂载）。
 * 覆盖三类用途、返回文案映射、一次性消费、隐私模式降级与派生页返回双路径。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DERIVED_ROUTE_NAMES,
  SETTINGS_RETURN_KEY,
  SOURCE_KEYS,
  clearSource,
  consumeSource,
  derivedBackLabel,
  goDerivedBack,
  isDerivedRoute,
  peekSource,
  putNotice,
  recordSource,
  sourceReturnLabel,
  takeNotice,
} from '../src/utils/navigationSource'

function stubSession(): Map<string, string> {
  const mem = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
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
  stubSession()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('来源记录 · 常量与路由判定', () => {
  it('key 名与 v2.2.1 完全一致；三类用途互不冲突', () => {
    expect(SETTINGS_RETURN_KEY).toBe('hdt.settings.returnTo')
    expect(SOURCE_KEYS.settings).toBe(SETTINGS_RETURN_KEY)
    expect(SOURCE_KEYS.derived).toBe('hdt.nav.derivedFrom')
    expect(SOURCE_KEYS.notice).toBe('hdt.nav.notice')
  })

  it('isDerivedRoute 只认 4 个派生路由名', () => {
    for (const name of DERIVED_ROUTE_NAMES) expect(isDerivedRoute(name)).toBe(true)
    expect(isDerivedRoute('settings')).toBe(false)
    expect(isDerivedRoute('single-chart')).toBe(false)
    expect(isDerivedRoute(undefined)).toBe(false)
    expect(isDerivedRoute(123)).toBe(false)
  })
})

describe('来源记录 · 写入 / 只读 / 一次性消费', () => {
  it('recordSource → peekSource 不消费 → consumeSource 消费即清 → clearSource', () => {
    recordSource(SOURCE_KEYS.settings, '/archive/abc')
    expect(peekSource(SOURCE_KEYS.settings)).toBe('/archive/abc')
    expect(peekSource(SOURCE_KEYS.settings)).toBe('/archive/abc')
    expect(consumeSource(SOURCE_KEYS.settings)).toBe('/archive/abc')
    expect(consumeSource(SOURCE_KEYS.settings)).toBe('')
    recordSource(SOURCE_KEYS.settings, '/boards')
    clearSource(SOURCE_KEYS.settings)
    expect(peekSource(SOURCE_KEYS.settings)).toBe('')
  })

  it('settings 与 derived 互不串台', () => {
    recordSource(SOURCE_KEYS.settings, '/archive/a')
    recordSource(SOURCE_KEYS.derived, '/archive/b')
    expect(consumeSource(SOURCE_KEYS.derived)).toBe('/archive/b')
    expect(peekSource(SOURCE_KEYS.settings)).toBe('/archive/a')
  })

  it('空 fromFullPath 不写入', () => {
    recordSource(SOURCE_KEYS.derived, '')
    expect(peekSource(SOURCE_KEYS.derived)).toBe('')
  })
})

describe('来源记录 · 返回文案映射', () => {
  it('settings 变体逐字保持 v2.2.1 文案', () => {
    expect(sourceReturnLabel('/archive/a')).toBe('返回完整盘')
    expect(sourceReturnLabel('/chiron/a')).toBe('返回凯龙盘')
    expect(sourceReturnLabel('/composite/a/b')).toBe('返回合盘')
    expect(sourceReturnLabel('/compare/a/b')).toBe('返回双盘对比')
    expect(sourceReturnLabel('/boards')).toBe('返回多盘')
    expect(sourceReturnLabel('')).toBe('返回档案库')
    expect(sourceReturnLabel('/unknown', '自定义回退')).toBe('自定义回退')
  })

  it('derived 变体 /archive/ 用「返回本盘」，其余与 settings 一致', () => {
    expect(sourceReturnLabel('/archive/a', '返回档案库', 'derived')).toBe('返回本盘')
    expect(sourceReturnLabel('/composite/a/b', '返回档案库', 'derived')).toBe('返回合盘')
    expect(sourceReturnLabel('', '返回档案库', 'derived')).toBe('返回档案库')
  })

  it('derivedBackLabel 读取派生来源并给出文案', () => {
    recordSource(SOURCE_KEYS.derived, '/archive/x')
    expect(derivedBackLabel()).toBe('返回本盘')
  })
})

describe('来源记录 · 一次性跨页提示', () => {
  it('putNotice → takeNotice 消费即清，且带 kind/text/createdAt', () => {
    putNotice('mobile-boards-downgrade', '手机端不提供并排，已为你打开第 1 份档案')
    const notice = takeNotice('mobile-boards-downgrade')
    expect(notice).not.toBeNull()
    expect(notice!.text).toContain('手机端不提供并排')
    expect(notice!.kind).toBe('mobile-boards-downgrade')
    expect(typeof notice!.createdAt).toBe('number')
    expect(takeNotice('mobile-boards-downgrade')).toBeNull()
  })

  it('kind 不匹配时返回 null 且不清空，避免不同提示互相吞掉', () => {
    putNotice('mobile-boards-downgrade', '提示 A')
    expect(takeNotice('other-kind')).toBeNull()
    expect(takeNotice('mobile-boards-downgrade')!.text).toBe('提示 A')
  })

  it('损坏 JSON 返回 null，不抛异常', () => {
    sessionStorage.setItem(SOURCE_KEYS.notice, '{not-json')
    expect(takeNotice('mobile-boards-downgrade')).toBeNull()
  })
})

describe('来源记录 · 派生页返回双路径', () => {
  it('无浏览器历史时 push 到发起页，并消费来源', () => {
    recordSource(SOURCE_KEYS.derived, '/archive/z')
    const back = vi.fn()
    const push = vi.fn()
    goDerivedBack({ back, push })
    expect(back).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/archive/z')
    expect(peekSource(SOURCE_KEYS.derived)).toBe('')
  })

  it('有浏览器历史时优先 back（popstate 带 savedPosition）', () => {
    vi.stubGlobal('window', { history: { state: { back: '/archive/z' } } })
    recordSource(SOURCE_KEYS.derived, '/archive/z')
    const back = vi.fn()
    const push = vi.fn()
    goDerivedBack({ back, push })
    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('无来源时兜底到 /', () => {
    const push = vi.fn()
    goDerivedBack({ back: vi.fn(), push })
    expect(push).toHaveBeenCalledWith('/')
  })
})

describe('来源记录 · 隐私模式降级', () => {
  it('sessionStorage 不可读写时静默忽略，不抛异常', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
      clear: () => {
        throw new Error('blocked')
      },
      key: () => null,
      length: 0,
    }
    vi.stubGlobal('sessionStorage', broken)
    expect(() => recordSource(SOURCE_KEYS.settings, '/archive/a')).not.toThrow()
    expect(peekSource(SOURCE_KEYS.settings)).toBe('')
    expect(consumeSource(SOURCE_KEYS.settings)).toBe('')
    expect(() => clearSource(SOURCE_KEYS.settings)).not.toThrow()
    expect(() => putNotice('k', 'v')).not.toThrow()
    expect(takeNotice('k')).toBeNull()
  })
})
