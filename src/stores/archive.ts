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
  },
})
