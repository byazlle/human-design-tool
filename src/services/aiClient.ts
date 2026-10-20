/**
 * AI 解读客户端（DESIGN.md §4.12 / §7）。
 *
 * 定位：仅「按需附加」。接口地址/Key/模型/超时全部来自设置页，
 * 不内置任何厂商、不在失败时伪造内容——失败必须抛出可展示的错误。
 * 兼容 OpenAI Chat Completions 风格（/chat/completions）。
 */
import type { AiConfig, BodyGraph } from '../types/hd'

export interface AiExplainArgs {
  cfg: AiConfig
  /** 解读范围：single / composite / gate / channel / center */
  scope: string
  /** 引用对象（闸门号 / 通道 key / 中心 id / 空） */
  ref?: string
  /** 离线释义，作为 AI 的事实基础，避免编造 */
  offline: string
  /** 盘面摘要（可选），让解读贴合本盘 */
  chartSummary?: string
  signal?: AbortSignal
}

const SYSTEM_PROMPT = `你是一位严谨的人类图（Human Design）解读助手，面向中文用户。
规则：
1. 只基于「系统提供的盘面事实」与「离线释义」解读，不得编造闸门、通道、中心或类型信息。
2. 不使用命运化、医疗化、决定论的表述；把它作为自我观察的参考框架。
3. 结构清晰：先用 2-3 句给结论，再分点说明（可观察的表现 / 可能的盲点 / 实践建议）。
4. 中文输出，术语保留英文对照（如 闸门 Gate、通道 Channel）。
5. 篇幅控制在 350-600 字。`

function buildUserPrompt(args: AiExplainArgs): string {
  const parts: string[] = []
  parts.push(`【解读范围】${args.scope}${args.ref ? ` · ${args.ref}` : ''}`)
  if (args.chartSummary) parts.push(`【盘面事实】\n${args.chartSummary}`)
  parts.push(`【离线释义（事实基础）】\n${args.offline}`)
  parts.push('请据此给出解读。')
  return parts.join('\n\n')
}

export function chartSummaryOf(chart: BodyGraph): string {
  return [
    `类型：${chart.type}`,
    `人生角色：${chart.profile}`,
    `内在权威：${chart.authority}`,
    `定义：${chart.definition}`,
    `轮回交叉：${chart.incarnationCross}`,
    `已定义中心：${chart.centers.filter((c) => c.defined).map((c) => c.id).join('、') || '无'}`,
    `已定义通道：${chart.channels.map((c) => c.key).join('、') || '无'}`,
    `激活闸门：${chart.gates.map((g) => g.gate).join('、')}`,
  ].join('\n')
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'config' | 'network' | 'timeout' | 'http' | 'format' = 'network',
  ) {
    super(message)
    this.name = 'AiError'
  }
}

const CACHE_PREFIX = 'hdt.ai.cache.v1'

function cacheKey(cfg: AiConfig, args: AiExplainArgs): string {
  return `${CACHE_PREFIX}:${cfg.model}:${args.scope}:${args.ref ?? ''}:${hash(args.offline + (args.chartSummary ?? ''))}`
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

export function clearAiCache() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export function validateAiConfig(cfg: AiConfig): string | null {
  if (!cfg.baseUrl.trim()) return '请先在设置页填写 AI 接口地址'
  if (!cfg.apiKey.trim()) return '请先在设置页填写 API Key'
  if (!cfg.model.trim()) return '请先在设置页填写模型名称'
  return null
}

/** 归一化 endpoint：允许填写基础地址、/v1、或完整的 /chat/completions */
export function resolveEndpoint(baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(url)) return url
  if (/\/v\d+$/.test(url)) return `${url}/chat/completions`
  return `${url}/v1/chat/completions`
}

export async function explain(args: AiExplainArgs): Promise<string> {
  const { cfg } = args
  const configError = validateAiConfig(cfg)
  if (configError) throw new AiError(configError, 'config')

  const key = cacheKey(cfg, args)
  if (cfg.cacheEnabled) {
    const hit = readCache(key)
    if (hit) return hit
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(3000, cfg.timeoutMs))
  const onAbort = () => controller.abort()
  args.signal?.addEventListener('abort', onAbort)

  try {
    const response = await fetch(resolveEndpoint(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(args) },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new AiError(
        `接口返回 ${response.status}${text ? `：${text.slice(0, 200)}` : ''}`,
        'http',
      )
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new AiError('接口未返回可用的解读内容', 'format')

    if (cfg.cacheEnabled) writeCache(key, content)
    return content
  } catch (err) {
    if (err instanceof AiError) throw err
    if ((err as Error)?.name === 'AbortError') {
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
