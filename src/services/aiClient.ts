/**
 * AI 解读客户端（提示词规范见 `docs/spec/AI-PROMPT-v4.0.md`）。
 *
 * 定位：仅「按需附加」。接口地址/Key/模型/超时全部来自设置页，
 * 不内置任何厂商、不在失败时伪造内容——失败必须抛出可展示的错误。
 * 兼容 OpenAI Chat Completions 风格（/chat/completions）。
 *
 * v4.0.0 起本文件**不再持有任何提示词正文**：四套整篇正文与两段受众附加全部删除，
 * 改为 `aiPrompt.ts` 的「基础 + 入口 + 档位 + 风格 + 范围」五段拼装。
 * 本层只认识 `entry / scope / detail / style / ref`（ARCH §1.1 不变式 I-D），
 * 入口语义全部在 `aiPrompt.ts` 的 ENTRY 段落里，本层不得出现 `if (entry === ...)`。
 *
 * 另一处硬口径：请求体恒传 `max_tokens: 128000`（ARCH §7.3），越界 400/422
 * 由 `aiTokenFallback.ts` 的阶梯在 `explain()` 内逐级降级，降级状态只活在函数栈里。
 */
import type { AiAudience, AiConfig, AiDetailMode, BodyGraph, CenterId } from '../types/hd'
import {
  AUTHORITY_LABELS,
  CENTER_LABELS,
  DEFINITION_LABELS,
  TYPE_LABELS,
} from '../types/hd'
import type { AiEntry, AiScope, AiStyle } from '../types/aiReading'
import type { ReadingDimKey } from './chartFacts'
import { CHANNELS, GATE_CENTER } from '../engine/gateData'
import { crossNameOf } from './crossData'
import { ENGINE_VERSION } from '../engine/version'
import {
  aiHttpRequest,
  aiHttpStream,
  aiTransportKind,
  type AiHttpInit,
  type AiHttpResult,
  type AiStreamEvents,
} from './aiTransport'
import {
  buildUserPrompt,
  resolveDetailMode,
  resolveStyle,
  systemPromptOf,
  type SystemPromptContext,
} from './aiPrompt'
import {
  FIRST_MAX_TOKENS_STEP,
  isMaxTokensRejection,
  maxTokensBodyOf,
  MAX_TOKENS_CEILING,
  nextMaxTokensStep,
  pushFallbackStep,
  startFallbackTrace,
  type FallbackTrace,
  type MaxTokensStep,
} from './aiTokenFallback'

/**
 * 提示词版本：提示词正文一改就必须 +1（同时进入缓存键，见 cacheKey）。
 * v4.0.0：五段拼装整体替换 v3.4.0 的四套整篇，主版本号升级。
 * v4.1.0：仅重写两段表达风格（PLAIN / PRO）——加好/坏对照 few-shot、
 *         抽象落镜头、编号后置、例子从盘面取值；段结构与拼装顺序零改动，
 *         故小版本升级。旧缓存因版本段变化自动失效，用户需重新生成解读。
 * v4.2.0：按可懂性基线（docs/VERIFY-可懂性-基线.md）修订两段风格里 3 处示例 / 措辞——
 *         v4.1 的「正面示例」自身只有体感、没有具体场合（PRO 段还有「中心是亮的」术语隐喻），
 *         模型照着学会继续产出空话。补「什么时候 / 做了什么」的画面要求与收尾自检；
 *         段结构、档位口径、禁用词零命中均零改动，仅小版本升级。
 */
export const PROMPT_VERSION = '4.2'

/**
 * 提示词层重导出：既有 `from './aiClient' import { systemPromptOf }` 的调用点
 * 不必改导入路径，同时保证全库只有一份正文（`aiPrompt.ts`）。
 */
export { buildUserPrompt, resolveDetailMode, resolveStyle, systemPromptOf }
export type { SystemPromptContext }


/**
 * 客户端可观测阶段（v2.3.0 · T-5 新增，仅用于 UI 状态区）。
 * 全部为本地事实，禁止表述服务端内部状态。
 */
export type AiStage =
  | 'config-validated'
  | 'request-sent'
  | 'response-received'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled'

export interface AiStageEvent {
  stage: AiStage
  at: number
  elapsedMs: number
  timeoutMs: number
  /** 仅 response-received：finish_reason='length' 续写轮次 */
  round?: number
  /** 终态；复用既有 6 类分类 */
  errorKind?: AiError['kind']
  /** v2.5.0：仅 completed —— 本次输出因 token 上限被截断（未续写完） */
  truncated?: boolean
}

export interface AiExplainArgs {
  cfg: AiConfig
  /**
   * 软件级入口。★ 新增（ARCH §7.2）：只用于**缓存键隔离**与提示词的入口段选择，
   * 本层不得据此分支任何业务逻辑（不变式 I-D）。
   */
  entry: AiEntry
  /** 解读范围：unified / selection-one / full-* / 既有 single / gate / channel / center / chiron */
  scope: AiScope | string
  /** 引用对象（闸门号 / 通道 key / 中心 id / 空） */
  ref?: string
  /** 离线释义，作为 AI 的事实基础，避免编造 */
  offline: string
  /** 盘面摘要（可选），让解读贴合本盘 */
  chartSummary?: string
  /** 解读详细度；缺省「精简」。v3.0 起单点 scope 不再强制降级（用户 Q3.3） */
  detailMode?: AiDetailMode
  /** 表达风格；缺省按「专业」。★ 新增，替代 audience */
  style?: AiStyle
  /** 入口 B 的白名单维度（渲染进 system 白名单段 + user【用户选择】） */
  dims?: ReadingDimKey[]
  /** 解读角度标签（如「整体解读」「成长方向」），注入【用户选择】 */
  angle?: string
  /**
   * @deprecated v4.0.0 的过渡别名，内部 `resolveStyle(args.style ?? args.audience)`。
   * 保留一个版本让 aiBatchReading.ts 等调用点在 T02 迁移期间不立即爆红，
   * v4.0.0 收尾时删除。新代码只用 `style`。
   */
  audience?: AiAudience
  signal?: AbortSignal
  /** v2.3.0：可选阶段回调，仅用于 UI 状态区。★ 不传时行为与 v2.2.1 逐字一致 */
  onStage?: (event: AiStageEvent) => void
  /**
   * v3.0.0：流式观测回调（连接建立 / 增量正文 / 非流式回退）。
   * ★ 不传时完全走 v2.5.0 的一次性请求路径，请求体也不带 stream 字段——
   *   既有调用点与全部契约测试逐字不受影响。
   */
  onStream?: AiStreamEvents
}

/* ── 采样参数 ───────────────────────────────────────── */

export interface RequestParams {
  /** 实际生效的详细度 */
  mode: AiDetailMode
  temperature: number
  /** 恒为 128000：token 上限已从设置项中整体移除（ARCH §7.3） */
  maxTokens: number
}

/**
 * 输出被 max_tokens 截断（`finish_reason === 'length'`）时，自动续写的最大段数。
 *
 * v4.0.0 由 2 提到 3：详细版上限 2 万字，2 轮续写拿不满（R1 的观察口径）。
 * 续写把已生成内容作为 assistant 消息回传，要求从中断处继续，拼接后返回完整内容；
 * 这样即使模型真实输出上限低于 128000，也不会静默丢结尾。
 */
export const MAX_CONTINUATIONS = 3

const CONTINUE_PROMPT =
  '你的上一段输出因长度上限被截断。请严格从中断处继续写完，不要重复已经写过的内容，' +
  '不要重新开头、不要复述标题、不要加「继续」之类的过渡语。'

/**
 * 采样参数：**max_tokens 恒为 128000**，不再按档位分配额度，也不再接受预算参数。
 *
 * temperature 保持 v3.5.0 的既有口径（合盘 scope 0.60 / 凯龙 0.55 / 其余按档位），
 * 这条与 token 无关，改动会直接改变文风，属于未授权变更。
 */
export function resolveRequestParams(scope: string, mode?: AiDetailMode): RequestParams {
  const effective = resolveDetailMode(scope, mode)
  let temperature: number
  if (scope === 'full-fusion') temperature = 0.6
  else if (scope.startsWith('full-')) temperature = 0.65
  else if (scope.startsWith('composite-')) temperature = 0.6
  else if (scope === 'chiron') temperature = 0.55
  else if (effective === 'full') temperature = 0.65
  else if (effective === 'detailed') temperature = 0.65
  else temperature = 0.6
  return { mode: effective, temperature, maxTokens: MAX_TOKENS_CEILING }
}


/* ── 盘面事实块 ─────────────────────────────────────── */

const CHANNEL_BY_KEY = new Map(CHANNELS.map((c) => [c.key, c]))

/** 短中心名：去掉「中心」后缀，事实块里更紧凑（例：喉咙中心 → 喉咙） */
function shortCenter(id: CenterId): string {
  return CENTER_LABELS[id].replace(/\s*中心$/, '')
}

/** 闸门的对端闸门（同一通道上的另一枚） */
function peerGateOf(gate: number): number | null {
  const ch = CHANNELS.find((c) => c.gates[0] === gate || c.gates[1] === gate)
  if (!ch) return null
  return ch.gates[0] === gate ? ch.gates[1] : ch.gates[0]
}

function channelCentersText(key: string): string {
  const ch = CHANNEL_BY_KEY.get(key)
  if (!ch) return ''
  return `${shortCenter(ch.centers[0])}↔${shortCenter(ch.centers[1])}`
}

function starGateOf(list: BodyGraph['personality'], planet: string): number | null {
  const found = list.find((s) => s.planet === planet)
  return found ? found.gate : null
}

/**
 * 盘面摘要（作为 AI 的事实基础，规范 §1.2 的 12 个字段）。
 *
 * 缺失即省略：没有数据的行整行不出现（四箭头当前无字段，因此不出现）。
 *
 * 合盘渲染用的占位 BodyGraph（`personality` / `design` 均为空）不带个体气场结论：
 * 类型、权威、定义型、轮回交叉一律不输出（规范 §3.8），只给结构统计与个体人生角色。
 */
export function chartSummaryOf(chart: BodyGraph): string {
  const definedCenters = chart.centers.filter((c) => c.defined)
  const openCenters = chart.centers.filter((c) => !c.defined)
  const lines: string[] = []

  // 5 九中心定义状态
  if (definedCenters.length || openCenters.length) {
    lines.push(
      `九中心：已定义=${definedCenters.map((c) => shortCenter(c.id)).join('、') || '无'}；开放=${
        openCenters.map((c) => shortCenter(c.id)).join('、') || '无'
      }`,
    )
  }

  // 6 已激活通道（key + 名称 + 两端中心）
  if (chart.channels.length) {
    lines.push(
      `已激活通道（${chart.channels.length}）：${chart.channels
        .map((c) => `${c.key}（${CHANNEL_BY_KEY.get(c.key)?.nameZh || c.key}）`)
        .join('；')}`,
    )
    lines.push(
      `  通道两端中心：${chart.channels
        .map((c) => `${c.key} = ${channelCentersText(c.key)}`)
        .join('；')}`,
    )
  }

  // 7 悬挂闸门（含所属中心 + 对端闸门是否已激活）
  if (chart.hangingGates.length) {
    lines.push(
      `悬挂闸门（${chart.hangingGates.length}）：${chart.hangingGates
        .map((g) => `${g}（${shortCenter(GATE_CENTER[g])}）`)
        .join('、')}`,
    )
    const activeGates = new Set(chart.gates.map((g) => g.gate))
    lines.push(
      `  悬挂对应另一端：${chart.hangingGates
        .map((g) => {
          const peer = peerGateOf(g)
          if (peer === null) return `${g}↔未找到对端`
          return `${g}↔${peer}（对端${activeGates.has(peer) ? '已激活' : '未激活'}）`
        })
        .join('；')}`,
    )
  }

  const isRelationshipField = chart.personality.length === 0 && chart.design.length === 0

  if (isRelationshipField) {
    // §3.8：合盘字段只到「人生角色 + 结构」，不给任何个体气场结论
    return [`人生角色：${chart.profile}`, ...lines].join('\n')
  }

  // 1 类型 + 策略 / 2 权威 / 3 人生角色 / 4 定义型（按重要度倒序压进 2 行）
  const facts: string[] = [
    `类型：${TYPE_LABELS[chart.type]}（${chart.type}）｜策略：${chart.strategy}`,
    `内在权威：${AUTHORITY_LABELS[chart.authority]}（${chart.authority}）`,
    `人生角色：${chart.profile}｜定义型：${DEFINITION_LABELS[chart.definition]}（${chart.definition}）`,
  ]

  // 开放中心补充：开放 + 该中心内的悬挂闸门 → 「最易被谁带走」的依据
  if (openCenters.length) {
    const details = openCenters.map((c) => {
      const hangingHere = chart.hangingGates.filter((g) => GATE_CENTER[g] === c.id)
      return hangingHere.length
        ? `${shortCenter(c.id)} 开放且含悬挂闸门 ${hangingHere.join('/')}（最易被他人影响）`
        : `${shortCenter(c.id)} 开放无悬挂闸门`
    })
    facts.push(`开放中心补充：${details.join('；')}`)
  }

  facts.push(...lines)

  // 8 轮回交叉（v3.3.0：带通行主题名；主题只由轴 + 角度决定，闸门照实算）
  if (chart.incarnationCross) {
    facts.push(`轮回交叉：${crossNameOf(chart.personality, chart.design, chart.profile)}`)
  }

  // 9/10 关键驱动与南北交点
  const pSun = starGateOf(chart.personality, 'Sun')
  const pEarth = starGateOf(chart.personality, 'Earth')
  const dSun = starGateOf(chart.design, 'Sun')
  const dEarth = starGateOf(chart.design, 'Earth')
  const drive: string[] = []
  if (pSun !== null && pEarth !== null) drive.push(`人格太阳 ${pSun}、人格地球 ${pEarth}`)
  if (dSun !== null && dEarth !== null) drive.push(`设计太阳 ${dSun}、设计地球 ${dEarth}`)
  if (drive.length) facts.push(`关键驱动：${drive.join('；')}`)

  const pNode = chart.personality.find((s) => s.planet === 'NorthNode')
  const dNode = chart.design.find((s) => s.planet === 'NorthNode')
  const nodes: string[] = []
  if (pNode) nodes.push(`人格北交点 ${pNode.gate}（南交点自然对宫）`)
  if (dNode) nodes.push(`设计北交点 ${dNode.gate}（南交点自然对宫）`)
  if (nodes.length) facts.push(`南北交点：${nodes.join('；')}`)

  return facts.join('\n')
}

/* ── 防幻觉校验（规范 §4.3 可测口径）─────────────────── */

/** 抽取文本中的通道 key（形如 20-34）与「闸门 N」编号 */
function factTokens(text: string): { channels: string[]; gates: string[] } {
  const channels = text.match(/\d{1,2}\s*-\s*\d{1,2}/g)?.map((s) => s.replace(/\s+/g, '')) ?? []
  const gates = Array.from(text.matchAll(/闸门\s*(\d{1,2})/g)).map((m) => String(Number(m[1])))
  return { channels: [...new Set(channels)], gates: [...new Set(gates)] }
}

/**
 * 事实块里出现过的编号白名单。
 *
 * 取三类的并集：通道 key（`20-34`）、`闸门 N`、以及事实块里所有 `\d{1,2}` 数字
 * （悬挂闸门列表写作「10（G）、25（G）」、通道两端写作「20↔34」，都不带「闸门」前缀）。
 */
function knownFactTokens(facts: string): Set<string> {
  const { channels, gates } = factTokens(facts)
  const numbers = facts.match(/\d{1,2}/g) ?? []
  return new Set([...channels, ...gates, ...numbers.map((n) => String(Number(n)))])
}

/**
 * 防幻觉：把回复里出现的通道 key / 闸门编号与事实块求差集。
 *
 * @returns 事实块里找不到的编号（通道 key 原样返回，闸门返回数字字符串）。
 *          空数组表示通过；调用方只做 warn，不阻断（规范 §4.3 只要求可测）。
 */
export function validateAiReplyFacts(reply: string, facts: string): string[] {
  const replyTokens = factTokens(reply)
  const known = knownFactTokens(facts)
  const extra: string[] = []
  for (const token of [...replyTokens.channels, ...replyTokens.gates]) {
    if (!known.has(token) && !extra.includes(token)) extra.push(token)
  }
  return extra
}

/* ── 错误与缓存 ─────────────────────────────────────── */

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'config' | 'network' | 'timeout' | 'http' | 'format' | 'cancelled' = 'network',
  ) {
    super(message)
    this.name = 'AiError'
  }
}

/** 当前代缓存前缀（v4.0.0 起升代：提示词整体重写，旧键永不再命中） */
export const CACHE_PREFIX = 'hdt.ai.cache.v2'

/** v3.5.0 及更早的缓存前缀：仅用于清理，不再写入 */
export const LEGACY_CACHE_PREFIX = 'hdt.ai.cache.v1'

/**
 * 缓存键：提示词版本 + 内核版本 + 接口地址 + 模型 + 配置指纹（Key 的短哈希，不落明文）
 * + **入口** + scope + 详细度 + **风格** + ref + 内容哈希（ARCH §6.1）。
 *
 * 为什么 `entry` 必须进键：入口 B 与入口 C 可能产出相同的 `scope / ref / dims`
 * （例如都选了同一条通道），但两者的提示词契约完全不同（白名单 vs 逐条+汇总），
 * 不进键就会串档：用户先做了勾选解读，再做综合解读会拿到勾选版的正文。
 *
 * 为什么 `style` 取代 `audience`：值相同但语义反转（§2.5），正文不同，必须分开缓存。
 * token 上限已从设置项删除，**不**进键（旧口径「预算不进键」自然作废）。
 */
export function cacheKey(cfg: AiConfig, args: AiExplainArgs): string {
  const configTag = hash(cfg.apiKey.trim()).slice(0, 8)
  const mode = resolveDetailMode(args.scope, args.detailMode)
  return [
    CACHE_PREFIX,
    `p${PROMPT_VERSION}`,
    ENGINE_VERSION,
    cfg.baseUrl.trim(),
    cfg.model.trim(),
    configTag,
    args.entry,
    args.scope,
    mode,
    resolveStyle(args.style ?? args.audience),
    args.ref ?? '',
    hash(args.offline + (args.chartSummary ?? '')),
  ].join(':')
}

function hash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function readCache(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeCache(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 存储不可用时静默跳过，不影响主流程 */
  }
}

/** 删除所有 key 以 `prefix` 开头的 localStorage 项，返回删除条数（存储不可用时返回 0） */
function removeCacheByPrefix(prefix: string): number {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
    return keys.length
  } catch {
    return 0
  }
}

/** 清空当前代（v2）与祖传（v1*）的解读缓存；设置页「清空缓存」与升代迁移共用 */
export function clearAiCache(): void {
  removeCacheByPrefix(CACHE_PREFIX)
  removeCacheByPrefix(LEGACY_CACHE_PREFIX)
}

/**
 * 清理 v1 代缓存（幂等，ARCH §6.2-3）。
 *
 * 为什么必须清：v1 键在 v4.0.0 里永远不会命中（前缀已升代），
 * 留着只会白占 localStorage 配额，配额写满后连设置都存不下。
 *
 * 调用点：`stores/settings.init()` 里执行一次（T03 接线）。
 * 幂等性由「按前缀扫描 + 删除」天然保证：第二次调用删到 0 条，不抛错。
 *
 * @returns 被删除的键数量，供日志与调试断言
 */
export function migrateAiCacheV1(): number {
  return removeCacheByPrefix(LEGACY_CACHE_PREFIX)
}

export function validateAiConfig(cfg: AiConfig): string | null {
  const baseUrl = cfg.baseUrl.trim()
  if (!baseUrl) return '请填写 AI 接口地址'
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return '接口地址格式不正确，需以 http:// 或 https:// 开头'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '接口地址仅支持 http:// 或 https://'
  }
  const apiKey = cfg.apiKey.trim()
  if (!apiKey) return '请填写 API Key'
  if (apiKey.length < 8) return 'API Key 至少 8 位字符'
  if (!cfg.model.trim()) return '请填写模型名称'
  if (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs < 3000 || cfg.timeoutMs > 3600000) {
    return '超时需在 3000–3600000 毫秒（3–3600 秒）之间'
  }
  return null
}

/** 归一化 endpoint：允许填写基础地址、/v1、或完整的 /chat/completions */
export function resolveEndpoint(baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(url)) return url
  if (/\/v\d+$/.test(url)) return `${url}/chat/completions`
  return `${url}/v1/chat/completions`
}

/** 内部信号：接口以 400/422 拒绝了 max_tokens（只在本文件内流转，绝不外泄给调用方） */
class MaxTokensOverflowError extends Error {
  constructor(
    readonly status: number,
    readonly bodyText: string,
  ) {
    super(`max_tokens 被拒（HTTP ${status}）`)
    this.name = 'MaxTokensOverflowError'
  }
}

/** 把传输层失败翻译成既有 6 类 AiError（不改任何既有文案与分类） */
function httpErrorOf(result: AiHttpResult, cfg: AiConfig): AiError {
  if (result.errorKind === 'cancelled' || result.errorKind === 'timeout') {
    return new AiError(
      `请求超时（${Math.round(cfg.timeoutMs / 1000)} 秒），请重试或调大超时`,
      'timeout',
    )
  }
  if (result.status) {
    return new AiError(
      `接口返回 ${result.status}${result.bodyText ? `：${result.bodyText.slice(0, 200)}` : ''}`,
      'http',
    )
  }
  // P3（v3.0.0）：按实际传输通道给可执行的提示，而不是一律甩锅给 CORS。
  // 桌面 / 安卓走原生出网，不受同源策略限制，那里失败就是真实网络或配置问题。
  const hint =
    aiTransportKind() === 'web'
      ? '当前是网页端，带鉴权头的请求可能被浏览器跨域策略拦截；请改用桌面版或安卓版，或确认接口允许 CORS。'
      : '已走原生网络通道，不受浏览器跨域限制；请检查网络连通、接口地址与密钥。'
  return new AiError(`网络请求失败：${result.error || '未知错误'}。${hint}`, 'network')
}

export async function explain(args: AiExplainArgs): Promise<string> {
  const { cfg } = args
  /** 风格缺省按专业版；提示词与缓存键必须读同一个值，否则会串档 */
  const style = resolveStyle(args.style ?? args.audience)
  const startedAt = Date.now()
  /** 6 个客户端观测点统一出口；回调抛错不得影响请求结果 */
  const emit = (stage: AiStage, extra?: Partial<AiStageEvent>) => {
    try {
      args.onStage?.({
        stage,
        at: Date.now(),
        elapsedMs: Date.now() - startedAt,
        timeoutMs: cfg.timeoutMs,
        ...extra,
      })
    } catch {
      /* UI 层错误不应破坏业务请求 */
    }
  }
  // 编排层在取消后不会再把已 abort 的 signal 发进来；这里提前拦一道，避免误报超时
  if (args.signal?.aborted) {
    emit('cancelled', { errorKind: 'cancelled' })
    throw new AiError('已取消', 'cancelled')
  }
  const configError = validateAiConfig(cfg)
  if (configError) {
    emit('failed', { errorKind: 'config' })
    throw new AiError(configError, 'config')
  }
  emit('config-validated')

  const key = cacheKey(cfg, { ...args, style })
  if (cfg.cacheEnabled) {
    const hit = readCache(key)
    // ★ 命中缓存时确实没有发请求，不能谎报 request-sent
    if (hit) {
      emit('completed')
      return hit
    }
  }

  const params = resolveRequestParams(args.scope, args.detailMode)
  // system / user 提示词只拼一次：降级只换 max_tokens，不改正文
  const systemPrompt = systemPromptOf({
    entry: args.entry,
    detail: params.mode,
    style,
    scope: args.scope,
    dims: args.dims,
  })
  const userPrompt = buildUserPrompt(args)

  const controller = new AbortController()
  // ★ 整体超时语义与 v2.4.0 一致：`cfg.timeoutMs` 覆盖**整次解读**（含全部续写轮
  //   与全部降级重试），而不是每档各给一份，否则「越界 + 续写」会把等待时间放大数倍。
  const deadline = Date.now() + Math.max(3000, cfg.timeoutMs)
  const timer = setTimeout(() => controller.abort(), Math.max(3000, cfg.timeoutMs))
  const onAbort = () => controller.abort()
  args.signal?.addEventListener('abort', onAbort)

  /**
   * 降级进度：**只活在本函数栈内**（ARCH §7.3）。
   * 绝不写模块级变量——完整档会并发 6 条以上请求，一条被拒就降级会把
   * 「128000 能用」的其他请求也一起压到 64000，属于静默降质。
   */
  let step: MaxTokensStep = FIRST_MAX_TOKENS_STEP
  const trace: FallbackTrace = startFallbackTrace()

  try {
    type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
    let content = ''
    let truncated = false
    let requestSentEmitted = false

    // ── 阶梯循环：每一档都是一次完整请求（含全部续写轮）──
    for (;;) {
      // 每档都从干净的对话前缀开始：上一档失败可能是半句话，不能带进下一次
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]
      content = ''
      truncated = false
      try {
        for (let round = 0; round <= MAX_CONTINUATIONS; round += 1) {
          // 仅全局第一次发 request-sent；续写轮与降级重试都不重复
          if (!requestSentEmitted) {
            emit('request-sent')
            requestSentEmitted = true
          }
          const remaining = Math.max(1000, deadline - Date.now())
          const body: Record<string, unknown> = {
            model: cfg.model,
            temperature: params.temperature,
            // 末位档为 undefined → 请求体不带 max_tokens（交给服务端默认值）
            ...maxTokensBodyOf(step),
            messages,
          }
          if (args.onStream) body.stream = true
          const httpInit: AiHttpInit = {
            url: resolveEndpoint(cfg.baseUrl),
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify(body),
            timeoutMs: remaining,
            signal: controller.signal,
          }
          const result = args.onStream
            ? await aiHttpStream(httpInit, args.onStream)
            : await aiHttpRequest(httpInit)

          if (!result.ok) {
            if (result.errorKind === 'cancelled' && args.signal?.aborted) {
              throw new AiError('已取消', 'cancelled')
            }
            // 越界类拒绝 → 抛内部信号，由外层阶梯决定是否降级；其余原样翻译成 AiError
            if (result.status && isMaxTokensRejection(result.status, result.bodyText ?? '')) {
              throw new MaxTokensOverflowError(result.status, result.bodyText ?? '')
            }
            throw httpErrorOf(result, cfg)
          }

          let data: {
            choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
          }
          try {
            data = JSON.parse(result.bodyText) as typeof data
          } catch (err) {
            // 接口返回了非 JSON（例如网关错误页），属于格式问题而非网络问题。
            throw new AiError(`接口返回的不是合法 JSON：${(err as Error).message}`, 'format')
          }
          const choice = data.choices?.[0]
          const piece = choice?.message?.content?.trim()
          if (!piece) throw new AiError('接口未返回可用的解读内容', 'format')
          content = content ? `${content}\n\n${piece}` : piece
          emit('response-received', { round })

          // finish_reason='length'：输出被 max_tokens 截断，继续向模型要剩余部分，
          // 而不是把半句话当成完整解读返回（完整版融合最容易触发）。
          if (choice?.finish_reason !== 'length') break
          if (round === MAX_CONTINUATIONS) {
            // 续写配额用完仍未收尾：内容照常返回，但必须标记「已触顶」，
            // 否则批量生成会把半截解读当成完整结果存进档案（v2.5.0）。
            truncated = true
            console.warn(
              `[AI] 已续写 ${MAX_CONTINUATIONS} 次仍触顶（scope=${args.scope} / ${params.mode}），输出可能不完整`,
            )
            break
          }
          console.warn(
            `[AI] 输出达到 max_tokens，自动续写第 ${round + 1} 段（scope=${args.scope} / ${params.mode}）`,
          )
          messages.push({ role: 'assistant', content })
          messages.push({ role: 'user', content: CONTINUE_PROMPT })
        }
        // 这一档跑完（无异常）→ 结束降级
        break
      } catch (err) {
        if (err instanceof MaxTokensOverflowError && !args.signal?.aborted) {
          const next = nextMaxTokensStep(step)
          if (next !== null) {
            pushFallbackStep(trace, next)
            console.warn(
              `[AI] max_tokens=${step ?? '（未带该字段）'} 被拒（HTTP ${err.status}），` +
                `降级到 ${next ?? '（不带该字段）'}（scope=${args.scope} / ${params.mode}）`,
            )
            step = next
            continue
          }
          // 阶梯到底：把原始 http 错误抛给用户，不伪造内容
          throw new AiError(
            `接口返回 ${err.status}${err.bodyText ? `：${err.bodyText.slice(0, 200)}` : ''}`,
            'http',
          )
        }
        throw err
      }
    }

    if (trace.degraded) {
      console.warn(
        `[AI] 本条请求发生 max_tokens 降级：${trace.tried
          .map((t) => (t === undefined ? '省略' : String(t)))
          .join(' → ')}（scope=${args.scope} / ${params.mode}）`,
      )
    }

    // 防幻觉：只告警不阻断——内容仍原样展示，便于用户自行核对
    const invented = validateAiReplyFacts(
      content,
      `${args.chartSummary ?? ''}\n${args.offline}`,
    )
    if (invented.length) {
      console.warn(
        `[AI] 回复出现事实块之外的编号：${invented.join('、')}（提示词 v${PROMPT_VERSION} / ${params.mode}）`,
      )
    }

    // ★ 截断的内容不进缓存：否则一次触顶会把半截结果写进缓存，
    //   之后即使模型恢复正常也永远命中这份残缺内容（用户以为接口坏了）。
    if (cfg.cacheEnabled && !truncated) writeCache(key, content)
    // 截断标记走本次请求的 onStage 回调，不用模块级变量：
    // 批量并发时多份解读会同时完成，模块级「上一次」会串台。
    emit('completed', { truncated })
    return content
  } catch (err) {
    // 终态分类只复用既有 AiError.kind，不新增分类、不改异常类型
    const kind: AiError['kind'] =
      err instanceof AiError
        ? err.kind
        : (err as Error)?.name === 'AbortError'
          ? args.signal?.aborted
            ? 'cancelled'
            : 'timeout'
          : 'network'
    emit(kind === 'cancelled' ? 'cancelled' : kind === 'timeout' ? 'timeout' : 'failed', {
      errorKind: kind,
    })
    if (err instanceof AiError) throw err
    if ((err as Error)?.name === 'AbortError') {
      // 主动取消（编排层 AbortSignal）与内部超时都会触发 abort，必须区分：
      // 只有 args.signal 已 aborted 才是用户取消，否则是 cfg.timeoutMs 到点。
      if (args.signal?.aborted) throw new AiError('已取消', 'cancelled')
      throw new AiError(`请求超时（${Math.round(cfg.timeoutMs / 1000)} 秒），请重试或调大超时`, 'timeout')
    }
    throw new AiError(
      `网络请求失败：${(err as Error).message || '未知错误'}。若是浏览器跨域限制，请确认接口允许 CORS。`,
      'network',
    )
  } finally {
    clearTimeout(timer)
    args.signal?.removeEventListener('abort', onAbort)
  }
}

export interface AiProbeResult {
  ok: boolean
  message: string
  latencyMs?: number
}

/**
 * 连通性测试：向 chat/completions 发一次最小请求（max_tokens: 1）。
 * 只验证「地址可达 + Key 可用 + 模型名被接受」，不做内容生成。
 * 不打印、也不返回 apiKey。
 *
 * v2.5.0 改走统一传输层：中转站普遍不返回 CORS 头，若这里仍用渲染进程的
 * fetch，桌面端「测试」按钮会永远失败，而真正生成解读却是通的。
 */
export async function probeAiConfig(cfg: AiConfig): Promise<AiProbeResult> {
  const configError = validateAiConfig(cfg)
  if (configError) return { ok: false, message: configError }

  const controller = new AbortController()
  const timeoutMs = Math.min(Math.max(3000, cfg.timeoutMs), 15000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const result = await aiHttpRequest({
      url: resolveEndpoint(cfg.baseUrl),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model.trim(),
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      timeoutMs,
      signal: controller.signal,
    })
    const latencyMs = Date.now() - startedAt
    if (!result.ok) {
      if (result.errorKind === 'cancelled') {
        return { ok: false, message: `测试超时（>${Math.round(timeoutMs / 1000)} 秒）`, latencyMs }
      }
      if (result.status) {
        const hint = result.status === 401 || result.status === 403 ? '（API Key 无效或已过期）' : ''
        return {
          ok: false,
          message: `接口返回 ${result.status}${hint}${
            result.bodyText ? `：${result.bodyText.slice(0, 120)}` : ''
          }`,
          latencyMs,
        }
      }
      return {
        ok: false,
        message: `连接失败：${result.error || '未知错误'}（网页端可能受跨域限制，请用桌面版）`,
        latencyMs,
      }
    }
    let candidateLabel = ''
    try {
      const data = JSON.parse(result.bodyText) as { choices?: unknown[]; model?: string }
      if (Array.isArray(data.choices)) candidateLabel = `，返回 ${data.choices.length} 个候选`
      else if (typeof data.model === 'string' && data.model) candidateLabel = `，模型 ${data.model}`
    } catch {
      /* 连通性优先：响应体不是 JSON 也算已连通 */
    }
    return { ok: true, message: `连通正常${candidateLabel}`, latencyMs }
  } finally {
    clearTimeout(timer)
  }
}

/* ── 模型列表（v2.5.0）──────────────────────────────── */

export interface AiModelsResult {
  ok: boolean
  /** 去重、按字母排序后的模型 id；失败时为空数组 */
  models: string[]
  message: string
  /** 实际取到列表的接口地址，成功时给出，便于排查中转站路径差异 */
  endpoint?: string
}

/**
 * 模型列表地址：允许填写基础地址、/v1、完整 /chat/completions、或直接的 /models。
 * 中转站的路径并不统一，主地址拿不到时 `fetchAiModels` 会再试源站 /v1/models。
 */
export function resolveModelsEndpoint(baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (/\/models$/.test(url)) return url
  if (/\/chat\/completions$/.test(url)) return url.replace(/\/chat\/completions$/, '/models')
  if (/\/v\d+([a-z-]*)?$/i.test(url)) return `${url}/models`
  return `${url}/v1/models`
}

/** 兼容 OpenAI `{data:[{id}]}`、数组、以及少量中转站的 `{models:[...]}` / `{data:[string]}` */
export function parseAiModels(bodyText: string): string[] {
  let data: unknown
  try {
    data = JSON.parse(bodyText)
  } catch {
    return []
  }
  const raw: unknown = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).data ?? (data as Record<string, unknown>).models)
      : null
  if (!Array.isArray(raw)) return []
  const ids = raw
    .map((item) =>
      typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { id?: unknown }).id : null,
    )
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim())
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

/**
 * 自动获取模型列表（GET /models）。
 *
 * 走统一传输层的理由与 probeAiConfig 相同：带 Authorization 的请求在渲染进程
 * 会被预检拦下，而桌面主进程没有同源策略。key 只经 IPC 传递，不落盘、不写日志。
 * 失败时返回可读原因（Key 过期 / 接口不支持 / 跨域），调用方仍可手填模型名。
 */
export async function fetchAiModels(
  cfg: Pick<AiConfig, 'baseUrl' | 'apiKey' | 'timeoutMs'>,
): Promise<AiModelsResult> {
  const baseUrl = cfg.baseUrl.trim()
  const apiKey = cfg.apiKey.trim()
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { ok: false, models: [], message: '请先填写接口地址（需以 http:// 或 https:// 开头）' }
  }
  if (!apiKey) return { ok: false, models: [], message: '请先填写 API Key' }

  const primary = resolveModelsEndpoint(baseUrl)
  let fallback = ''
  try {
    const u = new URL(primary)
    fallback = `${u.origin}/v1/models`
  } catch {
    /* primary 已校验过协议，URL 解析失败时不做 fallback */
  }
  const candidates = fallback && fallback !== primary ? [primary, fallback] : [primary]
  const timeoutMs = Math.min(Math.max(3000, cfg.timeoutMs || 15000), 20000)
  let lastStatus = 0
  let lastError = ''

  for (const endpoint of candidates) {
    const result = await aiHttpRequest({
      url: endpoint,
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs,
    })
    if (result.ok) {
      const models = parseAiModels(result.bodyText)
      if (models.length) {
        return { ok: true, models, message: `已获取 ${models.length} 个模型`, endpoint }
      }
      return {
        ok: false,
        models: [],
        message: '接口返回了空的模型列表（或格式不兼容），请手动填写模型名称',
        endpoint,
      }
    }
    lastStatus = result.status
    lastError = result.error || ''
    // 只有「路径不对」才值得换地址重试；401/403 是 Key 问题，换路径也没用
    if (result.status !== 404 && result.status !== 405 && result.status !== 0) break
  }

  if (lastStatus === 401 || lastStatus === 403) {
    return { ok: false, models: [], message: `API Key 无效或已过期（HTTP ${lastStatus}）` }
  }
  if (lastStatus === 404 || lastStatus === 405) {
    return {
      ok: false,
      models: [],
      message: `该接口未提供模型列表（HTTP ${lastStatus}），请手动填写模型名称`,
    }
  }
  if (lastStatus) {
    return { ok: false, models: [], message: `接口返回 HTTP ${lastStatus}，请检查接口地址与 Key` }
  }
  return {
    ok: false,
    models: [],
    message: `无法获取模型列表：${lastError || '未知错误'}（网页端可能受跨域限制，请用桌面版）`,
  }
}
