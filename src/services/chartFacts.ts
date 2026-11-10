/**
 * 盘面事实（offline 事实块）的统一构建（v2.4.0）。
 *
 * 为什么单独成模块：这段逻辑原先内联在 `views/SingleChartView.vue` 里，
 * 而 v2.4.0 的「批量生成解读」要对**任意档案**构建同一份事实块。
 * 如果继续留在视图里，批量功能只能复制一份——两份口径必然漂移，
 * 同一张盘的「手动解读」与「批量解读」会喂给模型不同的内容，缓存键也不同。
 * 因此把维度常量与拼装函数上移到 services，视图与批量服务共用同一实现。
 *
 * 口径（规范 §1.3）：事实块只陈述本盘可验证的结构，不含任何推断性结论；
 * 术语解释由【离线释义】段承担，二者不得重复。
 */
import type { BodyGraph, CenterId } from '../types/hd'
import {
  AUTHORITY_LABELS,
  CENTER_LABELS,
  DEFINITION_LABELS,
  TYPE_LABELS,
} from '../types/hd'
import {
  AUTHORITY_TEXT,
  CENTER_TEXT,
  TYPE_TEXT,
  getChannel,
  getGate,
} from './interpretations'
import { gateInsightOf } from './gateInsight'
import { crossReadingOf } from './crossData'
import { GATE_NAMES } from '../engine/gateData'

/** 可勾选的盘面维度（原 AiComposer 的 DimKey，语义不变） */
export type ReadingDimKey =
  | 'channels'
  | 'gates'
  | 'centers'
  | 'strategy'
  | 'definition'
  | 'authority'
  | 'cross'
  | 'profile'

/** 兼容旧引用：AiComposer / SingleChartView 曾用 `DimKey` 这个名字 */
export type DimKey = ReadingDimKey

export interface ReadingDimension {
  key: ReadingDimKey
  label: string
  desc: string
}

/** 八个维度的定义与展示文案（与 v2.3.0 AiComposer 逐字一致） */
export const READING_DIMENSIONS: ReadingDimension[] = [
  { key: 'channels', label: '已激活通道', desc: '全部已定义通道及其作用' },
  { key: 'gates', label: '已激活闸门', desc: '全部激活闸门及主题' },
  { key: 'centers', label: '九大能量中心', desc: '各中心的定义 / 开放状态' },
  { key: 'strategy', label: '人生策略', desc: '能量类型对应的策略' },
  { key: 'definition', label: '整体定义类型', desc: '一分人 / 二分人…' },
  { key: 'authority', label: '内在权威', desc: '骶骨 / 情绪 / 直觉等' },
  { key: 'cross', label: '轮回交叉', desc: '使命与人生主题' },
  { key: 'profile', label: '人生角色类型', desc: '2/4、1/4 等及生产者类型' },
]

export const ALL_READING_DIMS: ReadingDimKey[] = READING_DIMENSIONS.map((d) => d.key)

/** 截取首句，避免事实块被长释义淹没（默认 52 字） */
export function firstSentence(text: string, max = 52): string {
  const clean = text.replace(/\s+/g, '')
  const m = clean.match(/^[^。！？;；]+[。！？]?/)
  const s = m ? m[0] : clean
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 单点（闸门 / 通道 / 中心）的离线释义正文，供【离线释义】段使用 */
export function buildSelectionOffline(
  chart: BodyGraph | null | undefined,
  sel: { kind: string; ref: string | number } | null,
): string {
  if (!chart || !sel) return ''
  if (sel.kind === 'gate') {
    const g = getGate(Number(sel.ref))
    return `${g.title}\n\n${g.text}`
  }
  if (sel.kind === 'channel') {
    const c = getChannel(String(sel.ref))
    return `${c.title}\n\n${c.text}`
  }
  const id = String(sel.ref) as CenterId
  const text = CENTER_TEXT[id]
  const defined = chart.centers.find((c) => c.id === id)?.defined
  return `${CENTER_LABELS[id]}\n\n${defined ? text.defined : text.open}`
}

/** 单点的展示标题（面板标题、报告标题共用） */
export function selectionTitle(sel: { kind: string; ref: string | number } | null): string {
  if (!sel) return ''
  if (sel.kind === 'gate') return getGate(Number(sel.ref)).title
  if (sel.kind === 'channel') return getChannel(String(sel.ref)).title
  return CENTER_LABELS[String(sel.ref) as CenterId]
}

/**
 * 按勾选维度拼装统一解读的事实块。
 *
 * ★ 维度输出顺序固定为 profile → strategy → authority → definition → cross
 *   → channels → gates → centers，与 v2.3.0 逐字一致：顺序一变，事实块字符串
 *   就变，`aiClient.cacheKey()` 随之失效，已缓存的解读全部作废。
 *   tests/chartFacts.test.ts 用「同一维度集合的两种勾选顺序产出同一字符串」
 *   把这条口径钉住。
 */
export function buildUnifiedFacts(chart: BodyGraph, dims: ReadingDimKey[]): string {
  const c = chart
  const parts: string[] = []

  if (dims.includes('profile')) {
    parts.push(
      `【人生角色 / 能量类型】类型：${TYPE_LABELS[c.type]}（${c.type}）；人生角色：${c.profile}；${TYPE_TEXT[c.type].desc}`,
    )
  }
  if (dims.includes('strategy')) {
    parts.push(`【人生策略】${c.strategy || TYPE_TEXT[c.type].strategy}`)
  }
  if (dims.includes('authority')) {
    parts.push(`【内在权威】${AUTHORITY_LABELS[c.authority]}：${AUTHORITY_TEXT[c.authority].desc}`)
  }
  if (dims.includes('definition')) {
    parts.push(
      `【整体定义】${DEFINITION_LABELS[c.definition]}（已定义中心 ${c.centers.filter((x) => x.defined).length} 个）`,
    )
  }
  if (dims.includes('cross')) {
    const cr = crossReadingOf(c.personality, c.design, c.profile)
    parts.push(
      `【轮回交叉】${cr.name}\n核心释义：${cr.summary.replace(/\n/g, ' ')}\n人生使命：${cr.mission.replace(/\n/g, ' ')}\n活出状态：${cr.highState.replace(/\n/g, ' ')}\n未活出状态：${cr.lowState.replace(/\n/g, ' ')}`,
    )
  }
  if (dims.includes('channels')) {
    const lines = c.channels.map((ch) => {
      const t = getChannel(ch.key)
      return `${ch.key} ${t.title.split(' · ').slice(1).join(' · ') || ch.key}：${firstSentence(t.text)}`
    })
    parts.push(`【已激活通道】（共 ${lines.length} 条）\n${lines.join('\n') || '无'}`)
  }
  if (dims.includes('gates')) {
    const lines = c.gates.map((g) => {
      const ins = gateInsightOf(g.gate)
      return `闸门 ${g.gate} ${GATE_NAMES[g.gate]?.zh ?? ''}（${ins.trait}；由 ${g.stars.join('/')} 激活）`
    })
    parts.push(`【已激活闸门】（共 ${lines.length} 个）\n${lines.join('；')}`)
  }
  if (dims.includes('centers')) {
    const lines = c.centers.map((ct) => {
      const t = CENTER_TEXT[ct.id]
      return `${CENTER_LABELS[ct.id]}：${ct.defined ? '已定义' : '开放'}——${firstSentence(ct.defined ? t.defined : t.open)}`
    })
    parts.push(`【九大能量中心状态】\n${lines.join('\n')}`)
  }
  return parts.join('\n\n')
}

/** 联动选中的星体摘要（键形如 `personality:Sun` / `design:Moon`） */
export function buildStarBrief(chart: BodyGraph, keys: Iterable<string>): string {
  const bits: string[] = []
  for (const key of keys) {
    const [side, planet] = key.split(':')
    const list = side === 'design' ? chart.design : chart.personality
    const sp = list.find((x) => x.planet === planet)
    if (sp) {
      bits.push(
        `${side === 'design' ? '潜意识' : '显意识'}${planet} ${sp.gate}.${sp.line}` +
          `（洞察：${gateInsightOf(sp.gate).trait}）`,
      )
    }
  }
  return bits.join('\n')
}

/** 解读角度 = 固定角度文案；自定义方向优先（与 v2.3.0 口径一致） */
export function directionPrompt(label: string, prompt: string, custom: string): string {
  return custom
    ? `【自定义解读方向】用户希望重点从「${custom}」的角度解读，请围绕该方向展开，同时保持术语准确。`
    : `【解读角度】${label}：${prompt}`
}

/**
 * 统一解读的 scope 与 ref。
 *
 * ★ 必须与手动解读完全一致：批量生成与手动生成共用缓存键，
 *   先手动生成过的档案在批量时直接复用缓存，不重复消耗额度。
 */
export function unifiedScopeRef(
  dims: ReadingDimKey[],
  angleKey: string,
  customDirection: string,
): string {
  return `${dims.join('+')}:${angleKey}:${customDirection || '-'}`
}

/** 统一解读的完整 offline 正文（事实块 + 角度 + 收束指令），手动与批量共用 */
export function buildUnifiedOffline(
  chart: BodyGraph,
  dims: ReadingDimKey[],
  label: string,
  prompt: string,
  customDirection: string,
): string {
  return `${buildUnifiedFacts(chart, dims)}\n\n${directionPrompt(label, prompt, customDirection)}\n\n请把以上所有勾选维度作为一个整体来综合解读：先给出整体画像结论，再分别说明各维度如何相互影响，最后给落地建议。`
}
