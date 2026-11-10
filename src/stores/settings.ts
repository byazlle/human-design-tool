import { defineStore } from 'pinia'
import type { AiAudience, AiConfig, AiDetailMode, AiProfile, AiStepMode, ThemeMode } from '../types/hd'
import { clearAiCache, MIN_TOKEN_BUDGET, validateAiConfig } from '../services/aiClient'
import {
  DEFAULT_AI_CONCURRENCY,
  DEFAULT_AI_CONCURRENCY_LIMIT,
  normalizeConcurrencyPair,
  validateConcurrencyPair,
} from '../services/aiConcurrency'
import { createId, loadJson, saveJson, SAVE_FAILURE_HINT } from '../utils/storage'

const KEY = 'hdt.settings.v1'

export interface Appearance {
  theme: ThemeMode
  fontScale: number
  bodyGraphPalette: 'default' | 'high-contrast'
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
}

const FONT_SCALE_STEPS = [0.85, 0.92, 1, 1.1, 1.2, 1.35] as const

interface SettingsState {
  /** 当前生效配置的镜像：保持所有既有 settings.ai 调用点不变 */
  ai: AiConfig
  /** 多套 AI 配置 */
  aiProfiles: AiProfile[]
  /** 当前生效配置 id；'' 表示未配置 */
  activeAiId: string
  /** AI 解读详细度：精简（5 视角）/ 详细（8 节）/ 完整（多轮分步） */
  aiDetailMode: AiDetailMode
  /**
   * v2.5.0 面向人群：专业版（允许术语）/ 简明版（大白话）。
   * 只影响 system 提示词的【读者背景】段落，进缓存键。
   */
  aiAudience: AiAudience
  /**
   * v2.5.0 单份解读的 token 总预算（含自动续写，跨轮累计）。
   * 0 = 不限制（沿用各档位默认额度）；批量生成时每项独立适用。
   */
  aiTokenBudget: number
  /** 完整版多轮编排方式：串行 / 并发 */
  aiStepMode: AiStepMode
  /**
   * v2.3.0「AI 并发数」：整数 1–128，默认 3。
   * 只是用户设定值 / 合法性校验对象 / 展示值，**不切片分批**（Q-C1）。
   */
  aiConcurrency: number
  /**
   * v2.3.0「并发上限」：整数 1–128，默认 64。
   * 判定「是否一次性并发」的唯一闸门，满足 1 ≤ aiConcurrency ≤ aiConcurrencyLimit ≤ 128。
   */
  aiConcurrencyLimit: number
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
  aiDetailMode: 'concise',
  aiAudience: 'pro',
  aiTokenBudget: 0,
  aiStepMode: 'serial',
  aiConcurrency: DEFAULT_AI_CONCURRENCY,
  aiConcurrencyLimit: DEFAULT_AI_CONCURRENCY_LIMIT,
  appearance: {
    theme: 'light',
    fontScale: 1,
    bodyGraphPalette: 'default',
    centerDefinedColor: '#1a1d23',
    centerOpenColor: '#8a909c',
    centerDefinedBold: true,
    centerOpenBold: false,
    keywordColor: '#5b616e',
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
  // 上限 3600 秒（1 小时）：完整版多轮解读单步可能很长
  return Math.min(3600000, Math.max(3000, Math.round(ms)))
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

/** 旧数据没有该字段时回落到「精简」（规范 §2 的默认档） */
function normalizeDetailMode(raw: unknown): AiDetailMode {
  if (raw === 'detailed' || raw === 'full') return raw
  return 'concise'
}

/** 旧数据没有该字段时回落到「串行」 */
function normalizeStepMode(raw: unknown): AiStepMode {
  return raw === 'parallel' ? 'parallel' : 'serial'
}

/** 旧数据没有该字段时回落到专业版（与 v2.4.0 及之前风格一致） */
function normalizeAudience(raw: unknown): AiAudience {
  return raw === 'plain' ? 'plain' : 'pro'
}

/** 单份预算上限：防止误填一个天文数字把额度一次烧光 */
export const MAX_TOKEN_BUDGET = 100000

/**
 * 旧数据 / 手填值归一：0 或非法 = 不限制；正数夹在
 * [MIN_TOKEN_BUDGET, MAX_TOKEN_BUDGET]，避免出现「填 10 得到半句话」。
 */
export function normalizeTokenBudget(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(MAX_TOKEN_BUDGET, Math.max(MIN_TOKEN_BUDGET, Math.round(n)))
}

/**
 * 「存量并发配置被归一」的一次性可见提示（AC-C3）。
 * 模块级标记：不进 `SettingsState`、不持久化、不随切换 profile 变化；消费即清。
 */
let concurrencyMigrationNotice: string | null = null

/** @returns 一次性提示文案；不存在或已被消费则返回 null */
export function takeConcurrencyMigrationNotice(): string | null {
  const notice = concurrencyMigrationNotice
  concurrencyMigrationNotice = null
  return notice
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
    // 加载 / 迁移用宽松归一（AC-C3）：缺失回落默认值，存量非法才收敛 + 一次可见提示
    const pair = normalizeConcurrencyPair(saved.aiConcurrency, saved.aiConcurrencyLimit)
    if (pair.adjusted) {
      concurrencyMigrationNotice = '检测到旧的并发配置不满足约束，已调整为合法值，请确认后保存'
    }
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
        aiDetailMode: normalizeDetailMode(saved.aiDetailMode),
        aiAudience: normalizeAudience(saved.aiAudience),
        aiTokenBudget: normalizeTokenBudget(saved.aiTokenBudget),
        aiStepMode: normalizeStepMode(saved.aiStepMode),
        aiConcurrency: pair.concurrency,
        aiConcurrencyLimit: pair.limit,
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
        aiDetailMode: normalizeDetailMode(saved.aiDetailMode),
        aiAudience: normalizeAudience(saved.aiAudience),
        aiTokenBudget: normalizeTokenBudget(saved.aiTokenBudget),
        aiStepMode: normalizeStepMode(saved.aiStepMode),
        aiConcurrency: pair.concurrency,
        aiConcurrencyLimit: pair.limit,
        appearance: { ...DEFAULTS.appearance, ...(saved.appearance ?? {}) },
        precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
        persistError: null,
      }
    }

    return {
      ai: legacyAi,
      aiProfiles: [],
      activeAiId: '',
      aiDetailMode: normalizeDetailMode(saved.aiDetailMode),
      aiAudience: normalizeAudience(saved.aiAudience),
      aiTokenBudget: normalizeTokenBudget(saved.aiTokenBudget),
      aiStepMode: normalizeStepMode(saved.aiStepMode),
      aiConcurrency: pair.concurrency,
      aiConcurrencyLimit: pair.limit,
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
        aiDetailMode: this.aiDetailMode,
        aiAudience: this.aiAudience,
        aiTokenBudget: this.aiTokenBudget,
        aiStepMode: this.aiStepMode,
        aiConcurrency: this.aiConcurrency,
        aiConcurrencyLimit: this.aiConcurrencyLimit,
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

    /* ── 解读详细度 ──────────────────────────────────── */

    /** @returns 是否写入成功；失败时 persistError 已被置位，由调用方展示 */
    setAiDetailMode(mode: AiDetailMode): boolean {
      this.aiDetailMode = normalizeDetailMode(mode)
      return this.persist()
    },

    /** v2.5.0 面向人群：专业版 / 简明版（进缓存键，切换后不会命中另一档的旧缓存） */
    setAiAudience(audience: AiAudience): boolean {
      this.aiAudience = normalizeAudience(audience)
      return this.persist()
    },

    /** v2.5.0 单份解读 token 总预算；0 = 不限制 */
    setAiTokenBudget(value: number): boolean {
      this.aiTokenBudget = normalizeTokenBudget(value)
      return this.persist()
    },

    /** 完整版多轮编排方式（串行 / 并发） */
    setAiStepMode(mode: AiStepMode): boolean {
      this.aiStepMode = normalizeStepMode(mode)
      return this.persist()
    },

    /* ── AI 并发设置（v2.3.0 · T-C2）────────────────────
     * 条件 ① 的唯一实现点：写入前严格校验「待写入对」，违反则 return false，
     * 不写 store、不 persist、原生效值不变；合法才赋值 + persist。
     * 与加载期的 normalizeConcurrencyPair（宽松归一）语义不同，不得混用。
     */

    /** @returns 是否写入成功；false = 被条件 ① 拒绝或持久化失败 */
    setAiConcurrency(value: number): boolean {
      if (validateConcurrencyPair(value, this.aiConcurrencyLimit) !== null) return false
      this.aiConcurrency = value
      return this.persist()
    },

    /** @returns 是否写入成功；false = 被条件 ① 拒绝或持久化失败 */
    setAiConcurrencyLimit(value: number): boolean {
      if (validateConcurrencyPair(this.aiConcurrency, value) !== null) return false
      this.aiConcurrencyLimit = value
      return this.persist()
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

    /** 样式自定义：九中心颜色 / 加粗、关键字颜色 */
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
