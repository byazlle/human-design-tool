/**
 * AI 解读持久化回归（v2.4.0 新增 store）。
 *
 * 守两件事：
 * 1. 键口径 `${archiveId}|${scope}|${ref}|${mode}` 与 `aiClient.cacheKey()` 对齐——
 *    「同一档案 + 同一范围 + 同一档位」只有一条记录，重跑是覆盖而非堆积；
 * 2. 淘汰只发生在写入侧，且**只淘汰同一档案内最旧的那些**，
 *    不因某份档案写得多而挤掉别的档案的解读。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  READINGS_KEY,
  READINGS_PER_ARCHIVE_LIMIT,
  isStale,
  keyOfReading,
  makeReading,
  readingKey,
  useReadingsStore,
  type ReadingRecord,
} from '../src/stores/readings'
import { ENGINE_VERSION } from '../src/engine/version'
import { PROMPT_VERSION } from '../src/services/aiClient'

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

function rec(
  archiveId: string,
  over: Partial<Parameters<typeof makeReading>[0]> = {},
): ReadingRecord {
  return makeReading({
    archiveId,
    scope: 'unified',
    ref: 'gates+profile:comprehensive:-',
    mode: 'detailed',
    title: '综合解读',
    content: '正文',
    ...over,
  })
}

beforeEach(() => {
  stubStorage()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readingKey / keyOfReading', () => {
  it('四段拼串', () => {
    expect(readingKey('a1', 'unified', 'x:y:-', 'detailed')).toBe('a1|unified|x:y:-|detailed')
  })

  it('keyOfReading 与 readingKey 同口径', () => {
    const r = rec('a1', { scope: 'single', ref: '34', mode: 'concise' })
    expect(keyOfReading(r)).toBe(readingKey('a1', 'single', '34', 'concise'))
  })

  it('任一段不同即为不同键', () => {
    const base = readingKey('a1', 'unified', 'r', 'detailed')
    expect(readingKey('a2', 'unified', 'r', 'detailed')).not.toBe(base)
    expect(readingKey('a1', 'single', 'r', 'detailed')).not.toBe(base)
    expect(readingKey('a1', 'unified', 'r2', 'detailed')).not.toBe(base)
    expect(readingKey('a1', 'unified', 'r', 'concise')).not.toBe(base)
  })
})

describe('makeReading / isStale', () => {
  it('写入时打上当前提示词与内核版本戳', () => {
    const r = rec('a1')
    expect(r.promptVersion).toBe(PROMPT_VERSION)
    expect(r.engineVersion).toBe(ENGINE_VERSION)
    expect(Number.isNaN(Date.parse(r.at))).toBe(false)
  })

  it('版本一致时不过期', () => {
    expect(isStale(rec('a1'))).toBe(false)
  })

  it('提示词版本变化即过期（但记录保留）', () => {
    expect(isStale({ ...rec('a1'), promptVersion: '0.0' })).toBe(true)
  })

  it('内核版本变化即过期', () => {
    expect(isStale({ ...rec('a1'), engineVersion: '0.0' })).toBe(true)
  })
})

describe('put / putMany：覆盖与淘汰', () => {
  it('同键重复写入是覆盖，不新增记录', () => {
    const store = useReadingsStore()
    store.put(rec('a1', { content: '第一版' }))
    store.put(rec('a1', { content: '第二版' }))
    expect(store.list).toHaveLength(1)
    expect(store.list[0].content).toBe('第二版')
  })

  it('同档案不同档位各占一条', () => {
    const store = useReadingsStore()
    store.put(rec('a1', { mode: 'concise' }))
    store.put(rec('a1', { mode: 'detailed' }))
    store.put(rec('a1', { mode: 'full' }))
    expect(store.ofArchive('a1')).toHaveLength(3)
  })

  it('空数组是空操作', () => {
    const store = useReadingsStore()
    expect(store.putMany([])).toBe(true)
    expect(store.list).toHaveLength(0)
  })

  it(`单档案超过 ${READINGS_PER_ARCHIVE_LIMIT} 条时只淘汰该档案最旧的`, () => {
    const store = useReadingsStore()
    // 用递增时间保证排序确定
    for (let i = 0; i < READINGS_PER_ARCHIVE_LIMIT + 4; i++) {
      store.put({
        ...rec('a1', { ref: `r${i}` }),
        at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      })
    }
    const kept = store.ofArchive('a1')
    expect(kept).toHaveLength(READINGS_PER_ARCHIVE_LIMIT)
    // 最新的 i 保留，最旧的 4 条被淘汰
    expect(kept[0].ref).toBe(`r${READINGS_PER_ARCHIVE_LIMIT + 3}`)
    expect(kept.map((r) => r.ref)).not.toContain('r0')
    expect(kept.map((r) => r.ref)).not.toContain('r1')
  })

  it('★ 一份档案写满不挤掉另一份档案的解读', () => {
    const store = useReadingsStore()
    store.put(rec('b1'))
    for (let i = 0; i < READINGS_PER_ARCHIVE_LIMIT + 4; i++) {
      store.put({ ...rec('a1', { ref: `r${i}` }), at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() })
    }
    expect(store.ofArchive('b1')).toHaveLength(1)
  })

  it('批量写入一次落盘', () => {
    const mem = stubStorage()
    const store = useReadingsStore()
    store.putMany([rec('a1'), rec('a2'), rec('a3')])
    expect(store.list).toHaveLength(3)
    expect(JSON.parse(mem.get(READINGS_KEY) as string)).toHaveLength(3)
  })
})

describe('getters', () => {
  it('ofArchive 新→旧', () => {
    const store = useReadingsStore()
    store.put({ ...rec('a1', { ref: 'old' }), at: '2026-01-01T00:00:00.000Z' })
    store.put({ ...rec('a1', { ref: 'new' }), at: '2026-06-01T00:00:00.000Z' })
    expect(store.ofArchive('a1').map((r) => r.ref)).toEqual(['new', 'old'])
  })

  it('coveredIds 是「有解读的档案 id」集合，批量页据此标记已有解读', () => {
    const store = useReadingsStore()
    store.put(rec('a1'))
    store.put(rec('a2'))
    expect([...store.coveredIds].sort()).toEqual(['a1', 'a2'])
  })

  it('find 按四段键精确查找，未命中返回 null', () => {
    const store = useReadingsStore()
    store.put(rec('a1', { scope: 'unified', ref: 'r', mode: 'detailed' }))
    expect(store.find('a1', 'unified', 'r', 'detailed')?.archiveId).toBe('a1')
    expect(store.find('a1', 'unified', 'r', 'full')).toBeNull()
    expect(store.find('a9', 'unified', 'r', 'detailed')).toBeNull()
  })
})

describe('remove / removeOfArchives / pruneOrphans', () => {
  it('remove 按四段键删除', () => {
    const store = useReadingsStore()
    store.put(rec('a1', { mode: 'concise' }))
    store.put(rec('a1', { mode: 'detailed' }))
    store.remove('a1', 'unified', 'gates+profile:comprehensive:-', 'concise')
    expect(store.ofArchive('a1').map((r) => r.mode)).toEqual(['detailed'])
  })

  it('remove 未命中时不写盘也不改状态', () => {
    const store = useReadingsStore()
    store.put(rec('a1'))
    store.remove('a1', 'unified', 'nope', 'detailed')
    expect(store.list).toHaveLength(1)
  })

  it('removeOfArchives 按档案批量删除', () => {
    const store = useReadingsStore()
    store.put(rec('a1'))
    store.put(rec('a2'))
    store.put(rec('a3'))
    store.removeOfArchives(['a1', 'a3'])
    expect(store.list.map((r) => r.archiveId)).toEqual(['a2'])
  })

  it('pruneOrphans 只保留尚存档案的解读', () => {
    const store = useReadingsStore()
    store.put(rec('a1'))
    store.put(rec('a2'))
    store.pruneOrphans(['a2'])
    expect(store.list.map((r) => r.archiveId)).toEqual(['a2'])
  })

  it('pruneOrphans 无孤儿时不写盘', () => {
    const mem = stubStorage()
    const store = useReadingsStore()
    store.put(rec('a1'))
    const before = mem.get(READINGS_KEY)
    store.pruneOrphans(['a1'])
    expect(mem.get(READINGS_KEY)).toBe(before)
  })

  it('clearAll 清空并落盘', () => {
    const mem = stubStorage()
    const store = useReadingsStore()
    store.put(rec('a1'))
    store.clearAll()
    expect(store.list).toEqual([])
    expect(mem.get(READINGS_KEY)).toBe('[]')
  })
})

describe('启动读取：坏数据不致命', () => {
  it('非数组内容按空列表处理', () => {
    stubStorage().set(READINGS_KEY, '{"broken":true}')
    setActivePinia(createPinia())
    expect(useReadingsStore().list).toEqual([])
  })

  it('缺字段的条目被补齐而非丢弃（旧记录可继续回看）', () => {
    stubStorage().set(
      READINGS_KEY,
      JSON.stringify([{ archiveId: 'a1', scope: 'unified', ref: 'r', content: '正文', at: '2026-01-01T00:00:00.000Z' }]),
    )
    setActivePinia(createPinia())
    const [r] = useReadingsStore().list
    expect(r.archiveId).toBe('a1')
    // 缺 mode / 版本戳时按保守值回填
    expect(r.mode).toBe('concise')
    expect(r.title).toBe('AI 解读')
    expect(r.promptVersion).toBe('')
    expect(isStale(r)).toBe(true)
  })

  it('结构不符的条目（缺 archiveId / content）被过滤掉', () => {
    stubStorage().set(
      READINGS_KEY,
      JSON.stringify([
        { archiveId: 'a1', scope: 'unified', ref: 'r', content: 'ok', at: '2026-01-01T00:00:00.000Z' },
        { scope: 'unified', ref: 'r', content: 'x', at: '2026-01-01T00:00:00.000Z' },
        { archiveId: 'a2', scope: 'unified', ref: 'r', at: '2026-01-01T00:00:00.000Z' },
      ]),
    )
    setActivePinia(createPinia())
    expect(useReadingsStore().list.map((r) => r.archiveId)).toEqual(['a1'])
  })
})
