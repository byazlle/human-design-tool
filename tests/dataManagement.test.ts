/**
 * v2.0 数据/配置管理回归测试：
 * - 多 AI 配置：旧版单配置迁移、增删切换与 ai 镜像同步、非法配置拦截
 * - 档案删除：返回被删对象、清理选中、可撤销恢复、批量删除
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../src/stores/settings'
import { useArchiveStore } from '../src/stores/archive'
import type { Archive } from '../src/types/hd'

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

function makeArchive(id: string, name = id): Archive {
  return {
    id,
    name,
    birth: { year: 1990, month: 5, day: 21, hour: 14, minute: 30, second: 0 },
    timezone: 'Asia/Shanghai',
    location: { lat: 31.23, lng: 121.47, place: '上海' },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  stubStorage()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('多 AI 配置', () => {
  it('旧版单配置自动迁移为一条 profile 并同步 ai 镜像', () => {
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
      }),
    )
    const settings = useSettingsStore()
    expect(settings.aiProfiles).toHaveLength(1)
    expect(settings.aiProfiles[0].name).toBe('默认配置')
    expect(settings.activeAiId).toBe(settings.aiProfiles[0].id)
    expect(settings.ai.baseUrl).toBe('https://api.example.com/v1')
    expect(settings.ai.model).toBe('legacy-model')
  })

  it('无旧配置时从空列表开始', () => {
    const settings = useSettingsStore()
    expect(settings.aiProfiles).toHaveLength(0)
    expect(settings.activeAiId).toBe('')
  })

  it('新增 / 切换 / 删除配置会同步 ai 镜像', () => {
    const settings = useSettingsStore()
    const a = settings.addAiProfile({
      name: 'A',
      baseUrl: 'https://a.example.com/v1',
      apiKey: 'sk-aaaaaaaa',
      model: 'ma',
      timeoutMs: 60000,
      cacheEnabled: true,
    })
    expect(a.ok).toBe(true)
    expect(settings.ai.model).toBe('ma')

    const b = settings.addAiProfile({
      name: 'B',
      baseUrl: 'https://b.example.com/v1',
      apiKey: 'sk-bbbbbbbb',
      model: 'mb',
      timeoutMs: 60000,
      cacheEnabled: false,
    })
    expect(b.ok).toBe(true)
    expect(settings.activeAiId).toBe(b.id)
    expect(settings.ai.model).toBe('mb')

    settings.activateAiProfile(a.id as string)
    expect(settings.ai.model).toBe('ma')
    expect(settings.aiProfiles.find((p) => p.id === a.id)?.lastUsedAt).toBeTruthy()

    settings.removeAiProfile(b.id as string)
    expect(settings.aiProfiles.map((p) => p.name)).toEqual(['A'])
    expect(settings.ai.model).toBe('ma')

    // 删除当前配置 → 无剩余时回到未配置
    settings.removeAiProfile(a.id as string)
    expect(settings.aiProfiles).toHaveLength(0)
    expect(settings.activeAiId).toBe('')
    expect(settings.ai.baseUrl).toBe('')
  })

  it('非法配置被拒绝（协议 / Key 长度 / 超时范围 / 名称）', () => {
    const settings = useSettingsStore()
    const base = {
      name: 'x',
      baseUrl: 'https://a.example.com/v1',
      apiKey: 'sk-12345678',
      model: 'm',
      timeoutMs: 60000,
      cacheEnabled: true,
    }
    expect(settings.addAiProfile({ ...base, baseUrl: 'ftp://a.example.com' }).ok).toBe(false)
    expect(settings.addAiProfile({ ...base, apiKey: 'short' }).ok).toBe(false)
    expect(settings.addAiProfile({ ...base, timeoutMs: 1000 }).ok).toBe(false)
    expect(settings.addAiProfile({ ...base, timeoutMs: 3600001 }).ok).toBe(false)
    expect(settings.addAiProfile({ ...base, name: '   ' }).ok).toBe(false)
  })

  it('持久化会同时写入 aiProfiles 与 activeAiId', () => {
    const settings = useSettingsStore()
    const added = settings.addAiProfile({
      name: 'P',
      baseUrl: 'https://p.example.com/v1',
      apiKey: 'sk-pppppppp',
      model: 'mp',
      timeoutMs: 30000,
      cacheEnabled: true,
    })
    const raw = localStorage.getItem('hdt.settings.v1')
    expect(raw).toBeTruthy()
    const saved = JSON.parse(raw as string) as {
      aiProfiles: Array<{ id: string }>
      activeAiId: string
    }
    expect(saved.aiProfiles.some((p) => p.id === added.id)).toBe(true)
    expect(saved.activeAiId).toBe(added.id)
  })
})

describe('档案删除', () => {
  it('remove 返回被删对象并清理选中 / 可撤销恢复', () => {
    const store = useArchiveStore()
    store.archives.push(makeArchive('x'), makeArchive('y'))
    store.selectedIds = ['x']

    const removed = store.remove('x')
    expect(removed?.id).toBe('x')
    expect(store.archives.map((a) => a.id)).toEqual(['y'])
    expect(store.selectedIds).toEqual([])

    store.restore(removed as Archive)
    expect(store.archives.map((a) => a.id)).toEqual(['x', 'y'])

    expect(store.remove('not-exist')).toBeNull()
  })

  it('removeMany 返回被删列表，重复 id 不会重复删除', () => {
    const store = useArchiveStore()
    store.archives.push(makeArchive('a'), makeArchive('b'), makeArchive('c'))
    store.selectedIds = ['a', 'c']

    const removed = store.removeMany(['a', 'c', 'a'])
    expect(removed.map((x) => x.id)).toEqual(['a', 'c'])
    expect(store.archives.map((x) => x.id)).toEqual(['b'])
    expect(store.selectedIds).toEqual([])
  })

  it('删除后同批次重复 id 的导入只保留一份', () => {
    const store = useArchiveStore()
    store.importAll([makeArchive('dup'), makeArchive('dup')])
    expect(store.archives.filter((a) => a.id === 'dup')).toHaveLength(1)
  })
})
