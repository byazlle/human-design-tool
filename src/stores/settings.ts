import { defineStore } from 'pinia'
import type { AiConfig, ThemeMode } from '../types/hd'
import { clearAiCache } from '../services/aiClient'
import { loadJson, saveJson } from '../utils/storage'

const KEY = 'hdt.settings.v1'

export interface Appearance {
  theme: ThemeMode
  fontScale: number
  bodyGraphPalette: 'default' | 'high-contrast'
  /** 绘图程序版本：v1 底图对齐版 / v2 Free Human Design 版 */
  drawingEngine: 'v1' | 'v2'
}

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

    /** 主题写入 <html>，全局生效 */
    applyToDom() {
      const root = document.documentElement
      root.dataset.theme = this.appearance.theme
      root.dataset.palette = this.appearance.bodyGraphPalette
      root.dataset.drawingEngine = this.appearance.drawingEngine
      root.style.setProperty('--font-scale', String(this.appearance.fontScale))
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

    clearCache() {
      clearAiCache()
    },

    resetAi() {
      this.ai = { ...DEFAULTS.ai }
      this.persist()
    },
  },
})
