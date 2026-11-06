import { defineStore } from 'pinia'
import type { AiConfig, AiProfile, ThemeMode } from '../types/hd'
import { clearAiCache, validateAiConfig } from '../services/aiClient'
import { createId, loadJson, saveJson, SAVE_FAILURE_HINT } from '../utils/storage'

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
  /** 当前生效配置的镜像：保持所有既有 settings.ai 调用点不变 */
  ai: AiConfig
  /** 多套 AI 配置 */
  aiProfiles: AiProfile[]
  /** 当前生效配置 id；'' 表示未配置 */
  activeAiId: string
  appearance: Appearance
  precision: { decimals: 2 }
  /** 最近一次 persist 失败的原因；null 表示最近一次写入成功 */
  persistError: string | null
}

const DEFAULT_AI: AiConfig = {
  baseUrl: '',
  apiKey: '',
  model: '',
  timeoutMs: 60000,
  cacheEnabled: true,
}

const DEFAULTS: SettingsState = {
  ai: DEFAULT_AI,
  aiProfiles: [],
  activeAiId: '',
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
  persistError: null,
}

/** 从配置对象取出 5 个配置字段（剔除 id/name/时间戳等附加信息） */
export function aiConfigOf(profile: AiConfig): AiConfig {
  return {
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    cacheEnabled: profile.cacheEnabled,
  }
}

function clampTimeout(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_AI.timeoutMs
  return Math.min(600000, Math.max(3000, Math.round(ms)))
}

function normalizeProfile(raw: unknown): AiProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<AiProfile>
  if (typeof p.id !== 'string' || !p.id) return null
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '未命名配置',
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
    lastUsedAt: typeof p.lastUsedAt === 'string' ? p.lastUsedAt : undefined,
    baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : '',
    apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    model: typeof p.model === 'string' ? p.model : '',
    timeoutMs: clampTimeout(typeof p.timeoutMs === 'number' ? p.timeoutMs : DEFAULT_AI.timeoutMs),
    cacheEnabled: p.cacheEnabled !== false,
  }
}

export interface AiProfileInput {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  cacheEnabled: boolean
}

function validateProfileInput(input: AiProfileInput): string | null {
  if (!input.name.trim()) return '请填写配置名称'
  return validateAiConfig({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    timeoutMs: input.timeoutMs,
    cacheEnabled: input.cacheEnabled,
  })
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => {
    const saved = loadJson<Partial<SettingsState> | null>(KEY, {}) ?? {}
    const profiles: AiProfile[] = Array.isArray(saved.aiProfiles)
      ? (saved.aiProfiles.map(normalizeProfile).filter(Boolean) as AiProfile[])
      : []
    const legacyAi: AiConfig = { ...DEFAULT_AI, ...(saved.ai ?? {}) }
    let activeAiId = typeof saved.activeAiId === 'string' ? saved.activeAiId : ''

    if (profiles.length) {
      if (!profiles.some((p) => p.id === activeAiId)) activeAiId = profiles[0].id
      const active = profiles.find((p) => p.id === activeAiId) ?? profiles[0]
      return {
        ai: aiConfigOf(active),
        aiProfiles: profiles,
        activeAiId,
        appearance: { ...DEFAULTS.appearance, ...(saved.appearance ?? {}) },
        precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
        persistError: null,
      }
    }

    // 旧版单配置迁移：仅当旧配置三项关键字段齐全时生成一条 profile。
    if (legacyAi.baseUrl && legacyAi.apiKey && legacyAi.model) {
      const migrated: AiProfile = {
        ...legacyAi,
        id: createId(),
        name: '默认配置',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      }
      return {
        ai: aiConfigOf(migrated),
        aiProfiles: [migrated],
        activeAiId: migrated.id,
        appearance: { ...DEFAULTS.appearance, ...(saved.appearance ?? {}) },
        precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
        persistError: null,
      }
    }

    return {
      ai: legacyAi,
      aiProfiles: [],
      activeAiId: '',
      appearance: { ...DEFAULTS.appearance, ...(saved.appearance ?? {}) },
      precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
      persistError: null,
    }
  },

  getters: {
    aiConfigured: (s) => Boolean(s.ai.baseUrl && s.ai.apiKey && s.ai.model),
    isDark: (s) => s.appearance.theme === 'dark',
    activeAiProfile: (s): AiProfile | null =>
      s.aiProfiles.find((p) => p.id === s.activeAiId) ?? null,
  },

  actions: {
    /** @returns 是否写入成功；失败时置 persistError，供调用方显示错误而非成功 */
    persist(): boolean {
      const ok = saveJson(KEY, {
        ai: this.ai,
        aiProfiles: this.aiProfiles,
        activeAiId: this.activeAiId,
        appearance: this.appearance,
        precision: this.precision,
      })
      this.persistError = ok ? null : SAVE_FAILURE_HINT
      return ok
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

    /* ── 多 AI 配置 ──────────────────────────────────── */

    addAiProfile(input: AiProfileInput): { ok: boolean; error?: string; id?: string } {
      const error = validateProfileInput(input)
      if (error) return { ok: false, error }
      const now = new Date().toISOString()
      const profile: AiProfile = {
        id: createId(),
        name: input.name.trim(),
        createdAt: now,
        lastUsedAt: now,
        baseUrl: input.baseUrl.trim(),
        apiKey: input.apiKey.trim(),
        model: input.model.trim(),
        timeoutMs: clampTimeout(input.timeoutMs),
        cacheEnabled: input.cacheEnabled,
      }
      this.aiProfiles.push(profile)
      this.activeAiId = profile.id
      this.ai = aiConfigOf(profile)
      this.persist()
      return { ok: true, id: profile.id }
    },

    updateAiProfile(
      id: string,
      patch: Partial<AiProfileInput>,
    ): { ok: boolean; error?: string } {
      const profile = this.aiProfiles.find((p) => p.id === id)
      if (!profile) return { ok: false, error: '配置不存在，可能已被删除' }
      const merged: AiProfileInput = {
        name: patch.name ?? profile.name,
        baseUrl: patch.baseUrl ?? profile.baseUrl,
        apiKey: patch.apiKey ?? profile.apiKey,
        model: patch.model ?? profile.model,
        timeoutMs: patch.timeoutMs ?? profile.timeoutMs,
        cacheEnabled: patch.cacheEnabled ?? profile.cacheEnabled,
      }
      const error = validateProfileInput(merged)
      if (error) return { ok: false, error }
      profile.name = merged.name.trim()
      profile.baseUrl = merged.baseUrl.trim()
      profile.apiKey = merged.apiKey.trim()
      profile.model = merged.model.trim()
      profile.timeoutMs = clampTimeout(merged.timeoutMs)
      profile.cacheEnabled = merged.cacheEnabled
      if (this.activeAiId === id) this.ai = aiConfigOf(profile)
      this.persist()
      return { ok: true }
    },

    removeAiProfile(id: string): void {
      const index = this.aiProfiles.findIndex((p) => p.id === id)
      if (index < 0) return
      this.aiProfiles.splice(index, 1)
      if (this.activeAiId === id) {
        const next = this.aiProfiles[0]
        this.activeAiId = next ? next.id : ''
        this.ai = next ? aiConfigOf(next) : { ...DEFAULT_AI }
      }
      this.persist()
    },

    activateAiProfile(id: string): void {
      const profile = this.aiProfiles.find((p) => p.id === id)
      if (!profile) return
      this.activeAiId = id
      profile.lastUsedAt = new Date().toISOString()
      this.ai = aiConfigOf(profile)
      this.persist()
    },

    duplicateAiProfile(id: string): string | null {
      const src = this.aiProfiles.find((p) => p.id === id)
      if (!src) return null
      const copy: AiProfile = {
        ...src,
        id: createId(),
        name: `${src.name} 副本`,
        createdAt: new Date().toISOString(),
        lastUsedAt: undefined,
      }
      this.aiProfiles.push(copy)
      this.persist()
      return copy.id
    },

    /* ── 兼容旧调用点：写当前镜像并同步到生效 profile ── */
    saveAi(patch: Partial<AiConfig>) {
      this.ai = { ...this.ai, ...patch }
      const active = this.aiProfiles.find((p) => p.id === this.activeAiId)
      if (active) Object.assign(active, aiConfigOf(this.ai))
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
      const idx = FONT_SCALE_STEPS.indexOf(
        this.appearance.fontScale as (typeof FONT_SCALE_STEPS)[number],
      )
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
      this.ai = { ...DEFAULT_AI }
      const active = this.aiProfiles.find((p) => p.id === this.activeAiId)
      if (active) Object.assign(active, aiConfigOf(this.ai))
      this.persist()
    },
  },
})
