/**
 * v3.0.0 · P1 回归：手动「保存」必须带上生成时的元数据。
 *
 * 缺陷现场（v2.5.0）：`saveAiResult()` 的档位无条件缺省成 detailed、
 * 受众与截断标记整个丢掉，5 个视图里只有 SingleChartView 传了 mode。
 * 后果不是「标签写错」这么简单——简明版手动解读会以 4 段键落库，
 * 恰好命中专业版批量的 `readings.find(id, scope, ref, mode, 'pro')`，
 * 于是用户看到「跳过 N 份」却永远拿不到专业版解读。
 *
 * 这里把「同一张盘存过简明版后，专业版批量不应跳过它」钉死。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { saveAiResult } from '../src/composables/useAiResultActions'
import { useUiStore } from '../src/stores/ui'
import { useReadingsStore } from '../src/stores/readings'

function stubBrowser(): void {
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
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined })
}

beforeEach(() => {
  stubBrowser()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saveAiResult：生成元数据落库', () => {
  it('★ 存过简明版后，专业版批量不会被它挡住', () => {
    const ui = useUiStore()
    const readings = useReadingsStore()
    ui.openAi('unified', 'gates+profile:comprehensive:-', '综合解读')
    ui.setAiResultMeta({ audience: 'plain', mode: 'concise', truncated: false })
    ui.setAiContent('简明版正文')

    saveAiResult({
      title: '综合解读',
      content: '简明版正文',
      archiveId: 'a1',
      scope: 'unified',
      ref: 'gates+profile:comprehensive:-',
      audience: ui.aiReading.resultAudience,
      mode: ui.aiReading.resultMode,
      truncated: ui.aiReading.resultTruncated,
    })

    const saved = readings.list.find((r) => r.archiveId === 'a1')
    expect(saved?.audience).toBe('plain')
    expect(saved?.mode).toBe('concise')
    // 简明版落的是 5 段键，专业版的 4 段键必须查不到
    expect(readings.find('a1', 'unified', 'gates+profile:comprehensive:-', 'concise', 'plain')).not.toBeNull()
    expect(readings.find('a1', 'unified', 'gates+profile:comprehensive:-', 'concise', 'pro')).toBeNull()
  })

  it('不显式传时回落到生成时锁定的元数据，而不是设置页当前值', () => {
    const ui = useUiStore()
    const readings = useReadingsStore()
    ui.openAi('single', '34', '闸门解读')
    // 故意让「当前设置」与「生成时」不同：这里没有 settings 依赖，锁定的就是权威值
    ui.setAiResultMeta({ audience: 'plain', mode: 'full', truncated: true })

    saveAiResult({ title: '闸门解读', content: '正文', archiveId: 'a2' })

    const saved = readings.list.find((r) => r.archiveId === 'a2')
    expect(saved?.audience).toBe('plain')
    expect(saved?.mode).toBe('full')
    expect(saved?.truncated).toBe(true)
    expect(saved?.scope).toBe('single')
    expect(saved?.ref).toBe('34')
  })

  it('显式传参优先于生成元数据（调用方知道得更清楚时以调用方为准）', () => {
    const ui = useUiStore()
    const readings = useReadingsStore()
    ui.openAi('single', '34', '闸门解读')
    ui.setAiResultMeta({ audience: 'pro', mode: 'detailed', truncated: true })

    saveAiResult({
      title: '闸门解读',
      content: '正文',
      archiveId: 'a3',
      audience: 'plain',
      mode: 'concise',
      truncated: false,
    })

    const saved = readings.list.find((r) => r.archiveId === 'a3')
    expect(saved?.audience).toBe('plain')
    expect(saved?.mode).toBe('concise')
    expect(saved?.truncated).toBe(false)
  })

  it('无档案归属时只写全局流水，不污染 readings', () => {
    const readings = useReadingsStore()
    saveAiResult({ title: '临时', content: '正文' })
    expect(readings.list).toHaveLength(0)
  })
})
