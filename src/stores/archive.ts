import { defineStore } from 'pinia'
import type { Archive, BirthInput } from '../types/hd'
import { computeChart } from '../engine/bodygraph'
import { createId, loadJson, saveJson } from '../utils/storage'

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
  state: (): ArchiveState => ({
    archives: loadJson<Archive[]>(KEY, []),
    selectedIds: [],
    keyword: '',
  }),

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
    persist() {
      saveJson(KEY, this.archives)
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
      if (archive.chart) return
      archive.chart = computeChart(draftToInput(archive))
      this.persist()
    },

    update(id: string, patch: Partial<ArchiveDraft>) {
      const archive = this.archives.find((a) => a.id === id)
      if (!archive) return
      if (patch.name !== undefined) archive.name = patch.name
      if (patch.gender !== undefined) archive.gender = patch.gender
      if (patch.birth) archive.birth = patch.birth
      if (patch.timezone) archive.timezone = patch.timezone
      if (patch.location) archive.location = patch.location
      archive.chart = computeChart(draftToInput(archive))
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

    /** 按当前出生信息重算全部档案（切换绘图程序后用于数据一致性重建） */
    regenerateAll(): number {
      let count = 0
      for (const a of this.archives) {
        a.chart = computeChart(draftToInput(a))
        count += 1
      }
      this.persist()
      return count
    },

    remove(id: string) {
      this.archives = this.archives.filter((a) => a.id !== id)
      this.selectedIds = this.selectedIds.filter((x) => x !== id)
      this.persist()
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
        if (!existing.has(item.id)) this.archives.push(item)
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
