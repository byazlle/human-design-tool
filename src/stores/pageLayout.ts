/**
 * 自定义页面布局（#4，用户 Q2）：全局一份配置、localStorage 持久化、所有盘面统一生效。
 *
 * 坐标约定：x / w 用 0–100 百分比，y / h 用像素；拖拽与改尺寸按 8px 网格吸附。
 * 「单列」预设是流式布局（不应用坐标），保持 v2.1.0 的现有视觉；
 * 手机端固定退化为单列流，不应用自定义坐标与缩放。
 *
 * 只定义「模块怎么摆」，不涉及任何人类图业务规则。
 */
import { defineStore } from 'pinia'
import { loadJson, saveJson } from '../utils/storage'

export const PAGE_LAYOUT_KEY = 'hdt.page.layout.v1'

export const LAYOUT_MODULE_KEYS = [
  'angles',
  'chart',
  'meta',
  'activation',
  'cross',
  'destiny',
  'detail',
] as const

export type LayoutModuleKey = (typeof LAYOUT_MODULE_KEYS)[number]
export type LayoutPreset = 'single' | 'double' | 'triple' | 'custom'

export const LAYOUT_MODULE_LABELS: Record<LayoutModuleKey, string> = {
  angles: 'AI 综合解读',
  chart: '人体图',
  meta: '盘面信息',
  activation: '激活清单 / 九中心',
  cross: '轮回交叉',
  destiny: '人生轨迹',
  detail: '详情卡',
}

export interface LayoutBox {
  /** 0–100 百分比 */
  x: number
  /** px */
  y: number
  /** 0–100 百分比 */
  w: number
  /** px */
  h: number
  /** 该模块内部内容的缩放（0.6–1.6） */
  scale: number
  locked: boolean
  visible: boolean
}

export const GRID_PX = 8
export const MIN_BOX_W = 18
export const MIN_BOX_H = 64
export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 1.6

export function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** 像素吸附到 8px 网格 */
export function snapPx(n: number): number {
  return Math.round(n / GRID_PX) * GRID_PX
}

/** 百分比吸附：先按容器宽度折算成像素，吸附后再折回百分比 */
export function snapPercent(n: number, containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return Math.round(n * 100) / 100
  const px = (n / 100) * containerWidth
  return Math.round((snapPx(px) / containerWidth) * 10000) / 100
}

const DEFAULT_HEIGHTS: Record<LayoutModuleKey, number> = {
  angles: 72,
  chart: 660,
  meta: 200,
  activation: 420,
  cross: 220,
  destiny: 320,
  detail: 240,
}

export type LayoutBoxes = Record<LayoutModuleKey, LayoutBox>

/** 按列数生成瀑布式排布：每个模块放到当前最矮的一列 */
export function makePresetBoxes(
  preset: Exclude<LayoutPreset, 'custom'>,
): LayoutBoxes {
  const cols = preset === 'triple' ? 3 : preset === 'double' ? 2 : 1
  const gapPct = 2
  const colW = (100 - gapPct * (cols - 1)) / cols
  const colY = new Array<number>(cols).fill(0)
  const boxes = {} as LayoutBoxes
  for (const key of LAYOUT_MODULE_KEYS) {
    let col = 0
    for (let i = 1; i < cols; i += 1) if (colY[i] < colY[col] - 1) col = i
    const h = DEFAULT_HEIGHTS[key]
    boxes[key] = {
      x: col * (colW + gapPct),
      y: colY[col],
      w: colW,
      h,
      scale: 1,
      locked: false,
      visible: true,
    }
    colY[col] = snapPx(colY[col] + h + 16)
  }
  return boxes
}

export function totalHeight(boxes: LayoutBoxes): number {
  const visible = Object.values(boxes).filter((b) => b.visible)
  return visible.length ? Math.max(...visible.map((b) => b.y + b.h)) : 0
}

const PRESET_VALUES: LayoutPreset[] = ['single', 'double', 'triple', 'custom']

function normalizeBox(raw: unknown, fallback: LayoutBox): LayoutBox {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const b = raw as Partial<LayoutBox>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    x: clampNumber(num(b.x, fallback.x), 0, 100 - MIN_BOX_W),
    y: Math.max(0, num(b.y, fallback.y)),
    w: clampNumber(num(b.w, fallback.w), MIN_BOX_W, 100),
    h: Math.max(MIN_BOX_H, num(b.h, fallback.h)),
    scale: clampNumber(num(b.scale, fallback.scale), ZOOM_MIN, ZOOM_MAX),
    locked: b.locked === true,
    visible: b.visible !== false,
  }
}

export interface PageLayoutData {
  preset: LayoutPreset
  zoom: number
  boxes: LayoutBoxes
}

interface SavedLayout {
  preset?: LayoutPreset
  zoom?: number
  boxes?: Partial<LayoutBoxes>
}

function loadState(): PageLayoutData {
  const saved = loadJson<SavedLayout>(PAGE_LAYOUT_KEY, {})
  const preset: LayoutPreset =
    typeof saved.preset === 'string' && PRESET_VALUES.includes(saved.preset)
      ? saved.preset
      : 'single'
  const base = makePresetBoxes(preset === 'custom' ? 'single' : preset)
  const boxes = {} as LayoutBoxes
  for (const key of LAYOUT_MODULE_KEYS) {
    boxes[key] = normalizeBox(saved.boxes?.[key], base[key])
  }
  return {
    preset,
    zoom: clampNumber(typeof saved.zoom === 'number' ? saved.zoom : 1, ZOOM_MIN, ZOOM_MAX),
    boxes,
  }
}

export const usePageLayoutStore = defineStore('pageLayout', {
  state: (): PageLayoutData => loadState(),

  getters: {
    /** 单列预设与手机端走流式布局（不应用坐标） */
    isFlow: (s) => s.preset === 'single',
    visibleKeys: (s): LayoutModuleKey[] => LAYOUT_MODULE_KEYS.filter((k) => s.boxes[k].visible),
    canvasHeight: (s): number => totalHeight(s.boxes) + 40,
  },

  actions: {
    /** @returns 是否写入成功（localStorage 不可用时由调用方提示） */
    persist(): boolean {
      return saveJson(PAGE_LAYOUT_KEY, {
        preset: this.preset,
        zoom: this.zoom,
        boxes: this.boxes,
      })
    },

    setPreset(preset: Exclude<LayoutPreset, 'custom'>): boolean {
      this.preset = preset
      this.boxes = makePresetBoxes(preset)
      return this.persist()
    },

    /**
     * 拖拽 / 改尺寸后更新单个模块。第一次手动调整会把预设切到 custom。
     * @param commit 拖拽过程中传 false，pointerup 时再统一 persist，避免高频写盘
     */
    updateBox(
      key: LayoutModuleKey,
      patch: Partial<LayoutBox>,
      containerWidth = 840,
      commit = true,
    ): boolean {
      const merged = { ...this.boxes[key], ...patch }
      const x = clampNumber(snapPercent(merged.x, containerWidth), 0, 100 - MIN_BOX_W)
      const w = clampNumber(
        snapPercent(merged.w, containerWidth),
        MIN_BOX_W,
        100 - x,
      )
      this.boxes[key] = {
        x,
        w,
        y: Math.max(0, snapPx(merged.y)),
        h: Math.max(MIN_BOX_H, snapPx(merged.h)),
        scale: clampNumber(merged.scale, ZOOM_MIN, ZOOM_MAX),
        locked: merged.locked,
        visible: merged.visible,
      }
      this.preset = 'custom'
      return commit ? this.persist() : true
    },

    setBoxScale(key: LayoutModuleKey, scale: number): boolean {
      this.boxes[key] = {
        ...this.boxes[key],
        scale: Math.round(clampNumber(scale, ZOOM_MIN, ZOOM_MAX) * 100) / 100,
      }
      this.preset = 'custom'
      return this.persist()
    },

    toggleVisible(key: LayoutModuleKey): boolean {
      this.boxes[key] = { ...this.boxes[key], visible: !this.boxes[key].visible }
      return this.persist()
    },

    toggleLock(key: LayoutModuleKey): boolean {
      this.boxes[key] = { ...this.boxes[key], locked: !this.boxes[key].locked }
      return this.persist()
    },

    setZoom(zoom: number): boolean {
      this.zoom = Math.round(clampNumber(zoom, ZOOM_MIN, ZOOM_MAX) * 100) / 100
      return this.persist()
    },

    reset(): boolean {
      this.preset = 'single'
      this.zoom = 1
      this.boxes = makePresetBoxes('single')
      return this.persist()
    },
  },
})
