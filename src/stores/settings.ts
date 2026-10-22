import { defineStore } from 'pinia'
import type { AiConfig, ThemeMode } from '../types/hd'
import { clearAiCache } from '../services/aiClient'
import { loadJson, saveJson } from '../utils/storage'

const KEY = 'hdt.settings.v1'

export type LayoutDensity = 'compact' | 'standard' | 'spacious'
export type GraphSize = 'small' | 'normal' | 'large'

export interface Appearance {
  theme: ThemeMode
  fontScale: number
  bodyGraphPalette: 'default' | 'high-contrast'
  /** 绘图程序版本：v1 底图对齐版 / v2 Free Human Design 版 */
  drawingEngine: 'v1' | 'v2'
  /* ── 样式自定义 ── */
  /** 九中心「已定义」字体颜色 */
  centerDefinedColor: string
  /** 九中心「开放」字体颜色 */
  centerOpenColor: string
  /** 九中心「已定义」加粗 */
  centerDefinedBold: boolean
  /** 九中心「开放」加粗 */
  centerOpenBold: boolean
  /** 全局专业关键字（策略 / 内在权威 等）字体颜色 */
  keywordColor: string
  /** 完整盘布局密度 */
  layoutDensity: LayoutDensity
  /** 人体图幅面档位 */
  graphSize: GraphSize
}

const FONT_SCALE_STEPS = [0.85, 0.92, 1, 1.1, 1.2, 1.35] as const

interface SettingsState {
  ai: AiConfig
  appearance: Appearance
  precision: { decimals: 2 }
}

const DEFAULTS: SettingsState = {
  ai: {
    baseUrl: '',
    apiKey: '',
    model: '',
    timeoutMs: 60000,
    cacheEnabled: true,
  },
  appearance: {
    theme: 'light',
    fontScale: 1,
    bodyGraphPalette: 'default',
    drawingEngine: 'v1',
    centerDefinedColor: '#1a1d23',
    centerOpenColor: '#8a909c',
    centerDefinedBold: true,
    centerOpenBold: false,
    keywordColor: '#5b616e',
    layoutDensity: 'standard',
    graphSize: 'normal',
  },
  precision: { decimals: 2 },
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => {
    const saved = loadJson<Partial<SettingsState>>(KEY, {})
    return {
      ai: { ...DEFAULTS.ai, ...(saved.ai ?? {}) },
      appearance: { ...DEFAULTS.appearance, ...(saved.appearance ?? {}) },
      precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
    }
  },

  getters: {
    aiConfigured: (s) => Boolean(s.ai.baseUrl && s.ai.apiKey && s.ai.model),
    isDark: (s) => s.appearance.theme === 'dark',
  },

  actions: {
    persist() {
      saveJson(KEY, { ai: this.ai, appearance: this.appearance, precision: this.precision })
    },

    /** 主题与自定义样式写入 <html>，全局生效 */
    applyToDom() {
      const root = document.documentElement
      root.dataset.theme = this.appearance.theme
      root.dataset.palette = this.appearance.bodyGraphPalette
      root.dataset.drawingEngine = this.appearance.drawingEngine
      root.dataset.density = this.appearance.layoutDensity
      root.dataset.graphSize = this.appearance.graphSize
      root.style.setProperty('--font-scale', String(this.appearance.fontScale))
      root.style.setProperty('--center-defined-color', this.appearance.centerDefinedColor)
      root.style.setProperty('--center-open-color', this.appearance.centerOpenColor)
      root.style.setProperty(
        '--center-defined-weight',
        this.appearance.centerDefinedBold ? '700' : '400',
      )
      root.style.setProperty(
        '--center-open-weight',
        this.appearance.centerOpenBold ? '700' : '400',
      )
      root.style.setProperty('--keyword-color', this.appearance.keywordColor)
      root.style.colorScheme = this.appearance.theme
    },

    init() {
      this.applyToDom()
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches
      if (prefersDark && !loadJson(KEY, null)) {
        this.appearance.theme = 'dark'
        this.applyToDom()
      }
    },

    saveAi(patch: Partial<AiConfig>) {
      this.ai = { ...this.ai, ...patch }
      this.persist()
    },

    setTheme(theme: ThemeMode) {
      this.appearance.theme = theme
      this.persist()
      this.applyToDom()
    },

    toggleTheme() {
      this.setTheme(this.appearance.theme === 'dark' ? 'light' : 'dark')
    },

    setFontScale(scale: number) {
      this.appearance.fontScale = Math.min(1.3, Math.max(0.9, scale))
      this.persist()
      this.applyToDom()
    },

    setPalette(palette: 'default' | 'high-contrast') {
      this.appearance.bodyGraphPalette = palette
      this.persist()
      this.applyToDom()
    },

    /** 切换绘图程序：写入设置后所有已渲染的图立即按新版本重绘 */
    setDrawingEngine(engine: 'v1' | 'v2') {
      this.appearance.drawingEngine = engine
      this.persist()
      this.applyToDom()
    },

    /** 字号多档（6 档） */
    setFontStep(step: number) {
      const i = Math.min(FONT_SCALE_STEPS.length - 1, Math.max(0, step))
      this.appearance.fontScale = FONT_SCALE_STEPS[i]
      this.persist()
      this.applyToDom()
    },

    fontStepIndex(): number {
      const idx = FONT_SCALE_STEPS.indexOf(this.appearance.fontScale as (typeof FONT_SCALE_STEPS)[number])
      return idx >= 0 ? idx : 2
    },

    /** 样式自定义：九中心颜色 / 加粗、关键字颜色、布局密度、图幅档位 */
    setStyle(patch: Partial<Appearance>) {
      this.appearance = { ...this.appearance, ...patch }
      this.persist()
      this.applyToDom()
    },

    clearCache() {
      clearAiCache()
    },

    resetAi() {
      this.ai = { ...DEFAULTS.ai }
      this.persist()
    },
  },
})
