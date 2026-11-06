import { defineStore } from 'pinia'
import type { Archive, BirthInput } from '../types/hd'
import { computeChart } from '../engine/bodygraph'
import { ENGINE_VERSION } from '../engine/version'
import { createId, loadJsonChecked, saveJson, SAVE_FAILURE_HINT } from '../utils/storage'
import { useBoardStore, useCompositeStore } from './board'

const KEY = 'hdt.archives.v1'

export interface ArchiveDraft {
  name: string
  gender?: 'male' | 'female' | 'other'
  birth: { year: number; month: number; day: number; hour: number; minute: number; second?: number }
  timezone: string
  location: { lat: number; lng: number; place: string }
}

interface ArchiveState {
  archives: Archive[]
  selectedIds: string[]
  keyword: string
  /** 启动读取失败时的错误（用于全局提示，避免"档案全没了"的错觉） */
  loadError: string | null
  /** 最近一次 persist 失败的原因；null 表示最近一次写入成功 */
  persistError: string | null
}

function draftToInput(draft: ArchiveDraft): BirthInput {
  return {
    year: draft.birth.year,
    month: draft.birth.month,
    day: draft.birth.day,
    hour: draft.birth.hour,
    minute: draft.birth.minute,
    second: draft.birth.second ?? 0,
    timezone: draft.timezone,
    lat: draft.location.lat,
    lng: draft.location.lng,
  }
}

export const useArchiveStore = defineStore('archive', {
  state: (): ArchiveState => {
    const loaded = loadJsonChecked<Archive[]>(KEY, [])
    return {
      archives: Array.isArray(loaded.value) ? loaded.value : [],
      selectedIds: [],
      keyword: '',
      loadError: loaded.error,
      persistError: null,
    }
  },

  getters: {
    filtered(state): Archive[] {
      const kw = state.keyword.trim().toLowerCase()
      const list = kw
        ? state.archives.filter((a) => a.name.toLowerCase().includes(kw))
        : state.archives
      return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    },
    selectedArchives(state): Archive[] {
      return state.archives.filter((a) => state.selectedIds.includes(a.id))
    },
    byId(state) {
      return (id: string) => state.archives.find((a) => a.id === id)
    },
  },

  actions: {
    /** @returns 是否写入成功；失败时置 persistError，供调用方显示错误而非成功 */
    persist(): boolean {
      const ok = saveJson(KEY, this.archives)
      this.persistError = ok ? null : SAVE_FAILURE_HINT
      return ok
    },

    create(draft: ArchiveDraft): Archive {
      const input = draftToInput(draft)
      const chart = computeChart(input)
      const archive: Archive = {
        id: createId(),
        name: draft.name.trim() || '未命名',
        gender: draft.gender,
        birth: draft.birth,
        timezone: draft.timezone,
        location: draft.location,
        createdAt: new Date().toISOString(),
        chart,
      }
      this.archives.push(archive)
      this.persist()
      return archive
    },

    /** 档案存在但未算盘（例如从备份导入）时补算 */
    ensureChart(id: string) {
      const archive = this.archives.find((a) => a.id === id)
      if (!archive) return
      if (archive.chart && archive.chart.meta?.engineVersion === ENGINE_VERSION) return
      this.recompute(archive)
    },

    /** 单份重算；失败时保留旧快照并打标，不抛错中断批量流程 */
    recompute(archive: Archive): boolean {
      try {
        archive.chart = computeChart(draftToInput(archive))
        archive.chartError = undefined
        return true
      } catch (err) {
        archive.chart = undefined
        archive.chartError = (err as Error).message
        return false
      }
    },

    /**
     * 启动时对齐计算内核版本。
     * 算法变更（如曼陀罗偏移修正）后，存量快照必须重算，否则用户会一直看到旧结果。
     */
    syncEngineVersion(): number {
      let changed = 0
      for (const a of this.archives) {
        if (!a.chart || a.chart.meta?.engineVersion !== ENGINE_VERSION) {
          this.recompute(a)
          changed += 1
        }
      }
      if (changed) this.persist()
      return changed
    },

    update(id: string, patch: Partial<ArchiveDraft>) {
      const archive = this.archives.find((a) => a.id === id)
      if (!archive) return
      if (patch.name !== undefined) archive.name = patch.name
      if (patch.gender !== undefined) archive.gender = patch.gender
      if (patch.birth) archive.birth = { ...patch.birth }
      if (patch.timezone) archive.timezone = patch.timezone
      if (patch.location) archive.location = { ...patch.location }
      this.recompute(archive)
      this.persist()
    },

    /** 一键复制为副本：新 id、名称加「副本」后缀，后续编辑互不影响 */
    duplicate(id: string): Archive | null {
      const src = this.archives.find((a) => a.id === id)
      if (!src) return null
      const copy: Archive = JSON.parse(JSON.stringify(src)) as Archive
      copy.id = createId()
      copy.name = `${src.name} 副本`
      copy.createdAt = new Date().toISOString()
      this.archives.push(copy)
      this.persist()
      return copy
    },

    /**
     * 按当前出生信息重算全部档案（切换绘图程序后用于数据一致性重建）。
     * 逐份 try/catch：单份失败不中断整批，失败原因写入 chartError。
     * @returns { total, failed } —— total 为处理总数，failed 为失败份数
     */
    regenerateAll(): { total: number; failed: number } {
      let total = 0
      let failed = 0
      for (const a of this.archives) {
        total += 1
        if (!this.recompute(a)) failed += 1
      }
      this.persist()
      return { total, failed }
    },

    /**
     * 删除一份档案。
     * @returns 被删除的档案（供撤销/提示用）；不存在时返回 null
     */
    remove(id: string): Archive | null {
      const index = this.archives.findIndex((a) => a.id === id)
      if (index < 0) return null
      const [removed] = this.archives.splice(index, 1)
      this.selectedIds = this.selectedIds.filter((x) => x !== id)
      this.detachReferences([id])
      this.persist()
      return removed
    },

    /** 批量删除；返回被删除列表（供撤销提示） */
    removeMany(ids: string[]): Archive[] {
      const idSet = new Set(ids.filter(Boolean))
      if (!idSet.size) return []
      const removed: Archive[] = []
      this.archives = this.archives.filter((a) => {
        if (!idSet.has(a.id)) return true
        removed.push(a)
        return false
      })
      this.selectedIds = this.selectedIds.filter((x) => !idSet.has(x))
      this.detachReferences(idSet)
      if (removed.length) this.persist()
      return removed
    },

    /** 撤销删除：插回列表头部（重复 id 不重复插入） */
    restore(archive: Archive): void {
      if (this.archives.some((a) => a.id === archive.id)) return
      this.archives.unshift(archive)
      this.persist()
    },

    /** 清理被删档案在多盘页 / 合盘页中的引用，避免页面引用不存在的 id */
    detachReferences(ids: Iterable<string>) {
      const idSet = new Set(ids)
      if (!idSet.size) return
      const board = useBoardStore()
      const composite = useCompositeStore()
      for (const id of idSet) {
        board.closeOne(id)
        if (composite.aId === id) composite.aId = null
        if (composite.bId === id) composite.bId = null
      }
    },

    toggleSelect(id: string) {
      if (this.selectedIds.includes(id)) {
        this.selectedIds = this.selectedIds.filter((x) => x !== id)
      } else {
        this.selectedIds = [...this.selectedIds, id]
      }
    },

    clearSelect() {
      this.selectedIds = []
    },

    setKeyword(kw: string) {
      this.keyword = kw
    },

    importAll(list: Archive[]) {
      const existing = new Set(this.archives.map((a) => a.id))
      for (const item of list) {
        // 边加边登记：同批次内重复 id 只保留第一份，避免全被追加进库。
        if (!existing.has(item.id)) {
          this.archives.push(item)
          existing.add(item.id)
        }
      }
      this.persist()
    },

    clearAll() {
      this.archives = []
      this.selectedIds = []
      this.persist()
    },

    /** 载入示例档案：用于首次体验与功能自检，不覆盖已有数据 */
    seedSamples(): number {
      const samples: ArchiveDraft[] = [
        {
          name: '示例 · 林奕辰',
          gender: 'male',
          birth: { year: 1990, month: 5, day: 21, hour: 14, minute: 30, second: 0 },
          timezone: 'Asia/Shanghai',
          location: { lat: 31.23, lng: 121.47, place: '上海' },
        },
        {
          name: '示例 · 苏晚',
          gender: 'female',
          birth: { year: 1992, month: 11, day: 8, hour: 7, minute: 15, second: 0 },
          timezone: 'Asia/Shanghai',
          location: { lat: 30.57, lng: 104.07, place: '成都' },
        },
        {
          name: '示例 · 陈默',
          gender: 'male',
          birth: { year: 1985, month: 3, day: 17, hour: 22, minute: 40, second: 0 },
          timezone: 'Asia/Shanghai',
          location: { lat: 39.9, lng: 116.41, place: '北京' },
        },
      ]

      const existing = new Set(this.archives.map((a) => a.name))
      let added = 0
      for (const draft of samples) {
        if (existing.has(draft.name)) continue
        const chart = computeChart(draftToInput(draft))
        this.archives.push({
          id: createId(),
          name: draft.name,
          gender: draft.gender,
          birth: draft.birth,
          timezone: draft.timezone,
          location: draft.location,
          createdAt: new Date().toISOString(),
          chart,
        })
        added += 1
      }
      if (added) this.persist()
      return added
    },
  },
})
