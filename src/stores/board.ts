import { defineStore } from 'pinia'
import type { UiFilter } from '../types/hd'

/** 桌面多盘：已打开的盘、每盘缩放、星体表折叠状态 */
interface BoardState {
  openIds: string[]
  starListCollapsed: Record<string, boolean>
}

export const useBoardStore = defineStore('board', {
  state: (): BoardState => ({
    openIds: [],
    starListCollapsed: {},
  }),

  actions: {
    open(ids: string[]) {
      const merged = new Set([...this.openIds, ...ids.filter(Boolean)])
      this.openIds = [...merged]
    },
    closeOne(id: string) {
      this.openIds = this.openIds.filter((x) => x !== id)
    },
    closeAll() {
      this.openIds = []
    },
    toggleStarList(id: string) {
      this.starListCollapsed = {
        ...this.starListCollapsed,
        [id]: !this.starListCollapsed[id],
      }
    },
  },
})

/** 合盘：选择对象 + 结果 + 视图过滤 */
interface CompositeState {
  aId: string | null
  bId: string | null
  filters: UiFilter
  built: boolean
}

export const useCompositeStore = defineStore('composite', {
  state: (): CompositeState => ({
    aId: null,
    bId: null,
    filters: { showDecimals: true, showColorToneBase: true, sharedOnly: false },
    built: false,
  }),

  actions: {
    setPair(aId: string, bId: string) {
      this.aId = aId
      this.bId = bId
      this.built = false
    },
    setFilter<K extends keyof UiFilter>(key: K, value: UiFilter[K]) {
      this.filters = { ...this.filters, [key]: value }
    },
    markBuilt() {
      this.built = true
    },
    reset() {
      this.aId = null
      this.bId = null
      this.built = false
      this.filters = { showDecimals: true, showColorToneBase: true, sharedOnly: false }
    },
  },
})
