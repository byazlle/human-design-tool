import { defineStore } from 'pinia'
import type { AiConfig, AiDetailMode, AiProfile, AiStyle, ThemeMode } from '../types/hd'
import { clearAiCache, migrateAiCacheV1, validateAiConfig } from '../services/aiClient'
import {
  DEFAULT_AI_MAX_CONCURRENCY,
  normalizeMaxConcurrency,
  validateMaxConcurrency,
} from '../services/aiConcurrency'
import { createId, loadJson, saveJson, SAVE_FAILURE_HINT } from '../utils/storage'

const KEY = 'hdt.settings.v1'

export interface Appearance {
  theme: ThemeMode
  /** 界面皮肤：nova（默认新视觉）/ classic（可切回升级前旧观感），与明暗轴正交 */
  skin: 'classic' | 'nova'
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
  /**
   * 是否在设置页改过样式：仅 true 时才把上述 5 个变量写成 <html> 内联样式，
   * 否则交给皮肤 CSS 接管。见设计文档 §4.0 阻塞 A（内联样式优先级高于皮肤 CSS）。
   * 无法用「值是否等于 DEFAULTS」推断用户意图，故必须显式标记。
   */
  styleTouched?: boolean
}

/** 由设置页「样式设置」写入 <html> 的 5 个内联变量（设计文档 §4.0 阻塞 A） */
const INLINE_STYLE_VARS = [
  '--center-defined-color',
  '--center-open-color',
  '--center-defined-weight',
  '--center-open-weight',
  '--keyword-color',
] as const

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
   * 表达风格（v4.0.0，替代旧 `aiAudience`：值不变、语义反转）。
   * `pro` = 用术语但每个术语第一次出现必须阐释；`plain` = 全程口语。
   * 进缓存键，切换后不会命中另一档的旧缓存。
   */
  aiStyle: AiStyle
  /**
   * 最高并发数（v4.0.0 单旋钮，1–99，默认 3）：同时是「同时跑几个」与「上限」。
   * 1 等价于旧「串行」；滑动窗口调度器按它起速与补发（ARCH §4）。
   */
  aiMaxConcurrency: number
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
  aiStyle: 'pro',
  aiMaxConcurrency: DEFAULT_AI_MAX_CONCURRENCY,
  appearance: {
    theme: 'light',
    skin: 'nova',
    fontScale: 1,
    bodyGraphPalette: 'default',
    centerDefinedColor: '#1a1d23',
    centerOpenColor: '#8a909c',
    centerDefinedBold: true,
    centerOpenBold: false,
    keywordColor: '#5b616e',
    styleTouched: false,
  },
  precision: { decimals: 2 },
  persistError: null,
}

/** 皮肤轴归一：只认 classic / nova，其余（含存量缺失）一律回落 nova（§5.2 默认） */
function normalizeSkin(raw: unknown): 'classic' | 'nova' {
  return raw === 'classic' ? 'classic' : 'nova'
}

/**
 * 外观归一：既有字段沿用「默认值 + 存档覆盖」，新增的皮肤轴与自定义样式标记
 * 必须显式归一，避免存档里的非法值带进 state（三个 state() 返回分支共用）。
 */
function normalizeAppearance(raw: unknown): Appearance {
  const a = raw && typeof raw === 'object' ? (raw as Partial<Appearance>) : {}
  return {
    ...DEFAULTS.appearance,
    ...a,
    skin: normalizeSkin(a.skin),
    styleTouched: a.styleTouched === true,
  }
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

/** 旧数据没有该字段时回落到专业版（与 v2.4.0 及之前风格一致） */
function normalizeStyle(raw: unknown): AiStyle {
  return raw === 'plain' ? 'plain' : 'pro'
}

/**
 * 「存量配置被归一 / 被合并」的一次性可见提示（v4.0.0：四条规则合并成一条多行文案）。
 *
 * 模块级标记：不进 `SettingsState`、不持久化、不随切换 profile 变化；消费即清。
 * 为什么合并：v4.0.0 一次迁移同时删掉 3 个字段（token 预算 / 串并行 / 并发上限），
 * 四条 toast 会连弹四次把启动画面糊住，用户只会点掉不看。
 */
let concurrencyMigrationNotice: string | null = null

/** @returns 一次性提示文案；不存在或已被消费则返回 null */
export function takeConcurrencyMigrationNotice(): string | null {
  const notice = concurrencyMigrationNotice
  concurrencyMigrationNotice = null
  return notice
}

/** state() 需要读到的「旧存档字段」：这些键已从 state 里删除，但迁移时必须能读到 */
interface SavedSettings extends Partial<SettingsState> {
  aiAudience?: unknown
  aiConcurrency?: unknown
  aiConcurrencyLimit?: unknown
  aiTokenBudget?: unknown
  aiStepMode?: unknown
}

/** 按 §5.3 的四条规则拼出（可能多行的）一次性提示；无命中返回 null */
function buildMigrationNotice(
  saved: SavedSettings,
  mig: { value: number; adjusted: boolean; legacy: { concurrency?: number; limit?: number } },
): string | null {
  const lines: string[] = []
  if (mig.adjusted) {
    lines.push(`检测到旧的并发配置，已调整为合法值：最高并发数 ${mig.value}，请确认后保存`)
  }
  if (typeof mig.legacy.limit === 'number' && mig.legacy.limit !== 64) {
    lines.push(`并发参数已合并为「最高并发数」；原「并发上限 ${mig.legacy.limit}」不再单独生效`)
  }
  if (typeof saved.aiTokenBudget === 'number' && saved.aiTokenBudget > 0) {
    lines.push(`解读 token 上限已取消，不再限制输出长度；旧设置 ${saved.aiTokenBudget} 不再生效`)
  }
  if (saved.aiStepMode === 'serial' && mig.value > 1) {
    lines.push('多步编排方式已合并为「最高并发数」；如需串行请把最高并发数设为 1')
  }
  return lines.length ? lines.join('\n') : null
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
    const saved = loadJson<SavedSettings | null>(KEY, {}) ?? {}
    // 加载 / 迁移用宽松归一（ARCH §5.2）：缺失回落默认值，存量非法 / 旧字段才收敛 + 一次可见提示
    const mig = normalizeMaxConcurrency(saved)
    concurrencyMigrationNotice = buildMigrationNotice(saved, mig)
    const aiMaxConcurrency = mig.value
    const aiStyle = normalizeStyle(saved.aiStyle ?? saved.aiAudience)
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
        aiStyle,
        aiMaxConcurrency,
        appearance: normalizeAppearance(saved.appearance),
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
        aiStyle,
        aiMaxConcurrency,
        appearance: normalizeAppearance(saved.appearance),
        precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
        persistError: null,
      }
    }

    return {
      ai: legacyAi,
      aiProfiles: [],
      activeAiId: '',
      aiDetailMode: normalizeDetailMode(saved.aiDetailMode),
      aiStyle,
      aiMaxConcurrency,
      appearance: normalizeAppearance(saved.appearance),
      precision: { ...DEFAULTS.precision, ...(saved.precision ?? {}) },
      persistError: null,
    }
  },

  getters: {
    aiConfigured: (s) => Boolean(s.ai.baseUrl && s.ai.apiKey && s.ai.model),
    isDark: (s) => s.appearance.theme === 'dark',
    activeAiProfile: (s): AiProfile | null =>
      s.aiProfiles.find((p) => p.id === s.activeAiId) ?? null,
    /**
     * @deprecated v4.0.0 起叫 `aiStyle`（值不变、语义反转）。
     * 保留这个只读别名，是为了让 `views/*` 与批量对话框在 T04 改名前继续工作。
     */
    aiAudience: (s): AiStyle => s.aiStyle,
  },

  actions: {
    /** @returns 是否写入成功；失败时置 persistError，供调用方显示错误而非成功 */
    persist(): boolean {
      const ok = saveJson(KEY, {
        ai: this.ai,
        aiProfiles: this.aiProfiles,
        activeAiId: this.activeAiId,
        aiDetailMode: this.aiDetailMode,
        aiStyle: this.aiStyle,
        aiMaxConcurrency: this.aiMaxConcurrency,
        appearance: this.appearance,
        precision: this.precision,
      })
      this.persistError = ok ? null : SAVE_FAILURE_HINT
      return ok
    },

    /** 主题、皮肤与自定义样式写入 <html>，全局生效 */
    applyToDom() {
      const root = document.documentElement
      root.dataset.theme = this.appearance.theme
      root.dataset.palette = this.appearance.bodyGraphPalette
      root.dataset.skin = this.appearance.skin
      root.style.setProperty('--font-scale', String(this.appearance.fontScale))
      // 仅当用户在设置页确实改过样式时才写这 5 个内联变量；否则交给皮肤 CSS。
      // 内联样式优先级高于 :root[data-skin='nova']，不修会让 nova 的九中心 /
      // 关键字配色永远压不上去（设计文档 §4.0 阻塞 A）。
      if (this.appearance.styleTouched === true) {
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
      } else {
        // 交回皮肤 CSS：清掉可能残留的内联变量（含「恢复默认样式」后的场景）
        INLINE_STYLE_VARS.forEach((name) => root.style.removeProperty(name))
      }
      root.style.colorScheme = this.appearance.theme
    },

    init() {
      this.applyToDom()
      // v1 代解读缓存已永不命中（前缀升到 v2），启动清一次即可，幂等。
      // 不弹 toast：启动阶段刷屏比「少几 KB 垃圾数据」更烦人，只留一条 console.info 供排查。
      const removed = migrateAiCacheV1()
      if (removed > 0) console.info(`[AI] 已清理 v1 缓存 ${removed} 条`)
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

    /**
     * 表达风格（v4.0.0）：专业版 / 零基础版。
     * 与旧 `setAiAudience` 同一个开关，值相同、语义反转（新 pro 必须阐释术语）。
     */
    setAiStyle(style: AiStyle): boolean {
      this.aiStyle = normalizeStyle(style)
      return this.persist()
    },

    /** @deprecated v4.0.0 起叫 `setAiStyle`。T04 改名后删除。 */
    setAiAudience(style: AiStyle): boolean {
      return this.setAiStyle(style)
    },

    /* ── 最高并发数（v4.0.0 单旋钮）────────────────────
     * 保存期严格校验的唯一实现点：非法直接 return false，
     * 不写 store、不 persist、原生效值不变；合法才赋值 + persist。
     * 与加载期的 normalizeMaxConcurrency（宽松归一）语义不同，不得混用（ARCH §5.4）。
     */

    /** @returns 是否写入成功；false = 被校验拒绝或持久化失败 */
    setAiMaxConcurrency(value: number): boolean {
      if (validateMaxConcurrency(value) !== null) return false
      this.aiMaxConcurrency = value
      return this.persist()
    },

    /* ── 兼容旧调用点：写当前镜像并同步到生效 profile ── */
    saveAi(patch: Partial<AiConfig>) {
      this.ai = { ...this.ai, ...patch }
      const active = this.aiProfiles.find((p) => p.id === this.activeAiId)
      if (active) Object.assign(active, aiConfigOf(this.ai))
      this.persist()
    },

    /** 界面皮肤：nova（默认）/ classic（切回旧观感）；与明暗轴正交，互相独立 */
    setSkin(skin: 'classic' | 'nova') {
      this.appearance.skin = normalizeSkin(skin)
      this.persist()
      this.applyToDom()
    },

    /** 恢复默认样式：解除自定义标记，5 个内联变量由 applyToDom 清掉，配色交回皮肤 CSS */
    resetDefaultStyle() {
      this.appearance.styleTouched = false
      this.persist()
      this.applyToDom()
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

    /** 样式自定义：九中心颜色 / 加粗、关键字颜色；一旦改过即标记 styleTouched */
    setStyle(patch: Partial<Appearance>) {
      this.appearance = { ...this.appearance, ...patch, styleTouched: true }
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
