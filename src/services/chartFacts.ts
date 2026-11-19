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
import type {
  BodyGraph,
  CenterId,
  ChannelActivation,
  GateActivation,
  Planet,
  StarPosition,
} from '../types/hd'
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
import { CHANNELS, GATE_CENTER, GATE_NAMES } from '../engine/gateData'
import { analyzeCircuitry, circuitryBrief } from '../engine/circuitData'

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
    /*
     * 回路分布（v3.2.0）：作为「已激活通道」段的**同一段内**附加行追加，
     * 不单独占一段——`tests/chartFacts.test.ts` 用 `split('\n\n')` 的段首标题
     * 钉住维度顺序，独立成段会让段数从 8 变 9。用单换行即不影响顺序断言。
     */
    const circuit = circuitryBrief(analyzeCircuitry(c.channels.map((ch) => ch.key)))
    parts.push(
      `【已激活通道】（共 ${lines.length} 条）\n${lines.join('\n') || '无'}\n${circuit}`,
    )
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

/* ══════════════════════════════════════════════════════════════════
 * v4.0.0 三入口的事实块（ARCH §3.2 模块 ①–⑤ / §3.3 / §3.4）
 *
 * 与 `buildUnifiedFacts` 的分工：
 * - `buildUnifiedFacts` 是入口 B 单次档的既有实现，**顺序与文案一个字都不改**
 *   （它进缓存键，改一个字全库旧缓存作废）；
 * - 下面的函数服务 v4.0.0 的「模块化 + 逐条」编排，输出更细（每条通道/闸门的
 *   星体与对端状态），供入口 A 的 6 模块与入口 C 的逐条任务使用。
 *
 * 共同口径：所有条目按「通道 key 数值升序 / 闸门号升序」输出。事实块顺序一变，
 * prompt 就变，缓存键随之失效——排序不是审美问题，是缓存稳定性问题。
 * ══════════════════════════════════════════════════════════════════ */

/** 通道 key 的数值升序比较（`9-52` 排在 `20-34` 前面） */
export function channelKeyOrder(a: string, b: string): number {
  const [a1, a2] = a.split('-').map(Number)
  const [b1, b2] = b.split('-').map(Number)
  return a1 - b1 || a2 - b2
}

/** 已激活通道（key 升序） */
export function sortedChannels(chart: BodyGraph): ChannelActivation[] {
  return [...chart.channels].sort((a, b) => channelKeyOrder(a.key, b.key))
}

/** 已激活闸门（编号升序） */
export function sortedGates(chart: BodyGraph): GateActivation[] {
  return [...chart.gates].sort((a, b) => a.gate - b.gate)
}

function gateNameOf(gate: number): string {
  return GATE_NAMES[gate]?.zh ?? ''
}

function centerStateOf(chart: BodyGraph, id: CenterId): '已定义' | '开放' {
  return chart.centers.find((c) => c.id === id)?.defined ? '已定义' : '开放'
}

/** 通道两端中心（`喉咙中心 ↔ G 中心`） */
function channelCentersOf(key: string): string {
  const def = CHANNELS.find((c) => c.key === key)
  return def ? def.centers.map((id) => CENTER_LABELS[id]).join(' ↔ ') : ''
}

/** 闸门的对端闸门（同一条通道上的另一端）；该闸门不属于任何通道时返回 null */
function peerGateOf(gate: number): number | null {
  const ch = CHANNELS.find((c) => c.gates[0] === gate || c.gates[1] === gate)
  if (!ch) return null
  return ch.gates[0] === gate ? ch.gates[1] : ch.gates[0]
}

/** 某闸门由哪些星体、哪一侧激活（`显意识 Sun/Earth；潜意识 Moon`） */
function activationDetailOf(chart: BodyGraph, gate: number): string {
  const sideOf = (list: StarPosition[], label: string): string => {
    const stars = list.filter((s) => s.gate === gate).map((s) => s.planet)
    return stars.length ? `${label} ${stars.join('/')}` : ''
  }
  return [sideOf(chart.personality, '显意识'), sideOf(chart.design, '潜意识')]
    .filter((part) => part.length > 0)
    .join('；')
}

/** 单颗星体的「闸门.爻 + 中文名」（缺失时写「这张盘未显示」） */
function starLineOf(chart: BodyGraph, side: 'p' | 'd', planet: Planet): string {
  const list = side === 'p' ? chart.personality : chart.design
  const sp = list.find((s) => s.planet === planet)
  if (!sp) return '这张盘未显示'
  const name = gateNameOf(sp.gate)
  return `${sp.gate}.${sp.line}${name ? ` ${name}` : ''}`
}

function definedCentersOf(chart: BodyGraph): CenterId[] {
  return chart.centers.filter((c) => c.defined).map((c) => c.id)
}

function openCentersOf(chart: BodyGraph): CenterId[] {
  return chart.centers.filter((c) => !c.defined).map((c) => c.id)
}

function labelListOf(ids: CenterId[]): string {
  return ids.length ? ids.map((id) => CENTER_LABELS[id]).join('、') : '无'
}

/**
 * 模块 ①：类型 / 策略 / 内在权威 / 定义型 / 人生角色 / 中心清单。
 *
 * 这一段是「这个人日常怎么运作」的全部原料，入口 A ① 与所有逐条任务都复用它。
 */
export function buildCoreFacts(chart: BodyGraph): string {
  return [
    `【类型】${TYPE_LABELS[chart.type]}（${chart.type}）｜策略：${chart.strategy || TYPE_TEXT[chart.type].strategy}`,
    `【内在权威】${AUTHORITY_LABELS[chart.authority]}：${AUTHORITY_TEXT[chart.authority].desc}`,
    `【定义型 / 人生角色】${DEFINITION_LABELS[chart.definition]}｜人生角色：${chart.profile}`,
    `【中心清单】已定义 ${definedCentersOf(chart).length} 个：${labelListOf(definedCentersOf(chart))}；开放 ${openCentersOf(chart).length} 个：${labelListOf(openCentersOf(chart))}`,
  ].join('\n')
}

/**
 * 模块 ②：全部已激活通道通解（一次请求内逐条覆盖）。
 *
 * 每条一行 `key 名称（中心A↔中心B）：首句释义`，紧接一行标注两端闸门的激活星体与
 * 显意识 / 潜意识归属——这是「必须结合整张盘」唯一的硬原料，不能省。
 */
export function buildChannelsOverviewFacts(chart: BodyGraph): string {
  const channels = sortedChannels(chart)
  const lines: string[] = []
  for (const ch of channels) {
    const def = CHANNELS.find((c) => c.key === ch.key)
    const name = def?.nameZh ?? getChannel(ch.key).title.split(' · ').slice(1).join(' · ')
    lines.push(
      `${ch.key} ${name}（${channelCentersOf(ch.key) || '中心未显示'}）：${firstSentence(getChannel(ch.key).text)}`,
    )
    const ends = ch.gates.map((g) => {
      const detail = activationDetailOf(chart, g)
      return `闸门 ${g}${detail ? `（${detail}）` : ''}`
    })
    lines.push(`　两端闸门：${ends.join(' ↔ ')}`)
  }
  const circuit = circuitryBrief(analyzeCircuitry(channels.map((c) => c.key)))
  return [
    `【已激活通道通解】（共 ${channels.length} 条；本模块要求逐条覆盖，不得合并）`,
    lines.length ? lines.join('\n') : '这张盘未显示任何完整通道',
    `【回路分布】${circuit}`,
  ].join('\n')
}

/**
 * 模块 ③：全部已激活闸门通解（一次请求内逐项覆盖）。
 *
 * 每个闸门一行给出「所属中心｜定义状态」与四个洞察维度；悬挂闸门显式标注对端是否激活，
 * 否则模型会把悬挂闸门当完整通道讲（v3.x 的高频错误）。
 */
export function buildGatesOverviewFacts(chart: BodyGraph): string {
  const gates = sortedGates(chart)
  const hanging = new Set(chart.hangingGates)
  const active = new Set(gates.map((g) => g.gate))
  const lines = gates.map((g) => {
    const ins = gateInsightOf(g.gate)
    const center = GATE_CENTER[g.gate]
    const state = center ? centerStateOf(chart, center) : '未显示'
    const centerText = center ? `${CENTER_LABELS[center]}｜${state}` : '中心未显示'
    const peer = peerGateOf(g.gate)
    const peerText =
      peer === null
        ? '所属通道未显示'
        : active.has(peer)
          ? `对端 ${peer} 已激活`
          : `对端 ${peer} 未激活`
    const hangText = hanging.has(g.gate) ? `（悬挂闸门，${peerText}）` : `（${peerText}）`
    return `闸门 ${g.gate} ${gateNameOf(g.gate)}（${centerText}）：${ins.trait} / ${ins.growth} / ${ins.grounding} / ${ins.drive}${hangText}`
  })
  const hangingList = [...hanging].sort((a, b) => a - b)
  return [
    `【已激活闸门通解】（共 ${gates.length} 个；本模块要求逐项覆盖，不得合并）`,
    lines.length ? lines.join('\n') : '这张盘未显示任何已激活闸门',
    `【悬挂闸门】${
      hangingList.length
        ? `${hangingList.join('、')}（已激活但未配对成完整通道，不得当作完整通道解读）`
        : '无'
    }`,
  ].join('\n')
}

/** 模块 ④：九中心状态 + 定义型 + 回路分布 + 轮回交叉四闸门 */
export function buildCentersCircuitFacts(chart: BodyGraph): string {
  const centers = chart.centers.map((ct) => {
    const t = CENTER_TEXT[ct.id]
    const body = (ct.defined ? t.defined : t.open).replace(/\s+/g, ' ')
    return `${CENTER_LABELS[ct.id]}：${ct.defined ? '已定义' : '开放'}——${firstSentence(body)}`
  })
  const circuit = circuitryBrief(analyzeCircuitry(sortedChannels(chart).map((c) => c.key)))
  const cross = crossReadingOf(chart.personality, chart.design, chart.profile)
  const defined = definedCentersOf(chart)
  return [
    `【九大能量中心】\n${centers.join('\n')}`,
    `【定义型】${DEFINITION_LABELS[chart.definition]}（已定义 ${defined.length} 个中心，开放 ${9 - defined.length} 个）`,
    `【回路分布】${circuit}`,
    [
      `【轮回交叉】${cross.name || chart.incarnationCross || '这张盘未显示'}`,
      `四闸门：人格太阳 ${starLineOf(chart, 'p', 'Sun')}｜人格地球 ${starLineOf(chart, 'p', 'Earth')}｜设计太阳 ${starLineOf(chart, 'd', 'Sun')}｜设计地球 ${starLineOf(chart, 'd', 'Earth')}`,
    ].join('\n'),
  ].join('\n')
}

/**
 * 模块 ⑤：人生轨迹 / 发展轨迹 / 未来形势 / 扎根力 / 成长方向的共同原料。
 *
 * 只给结构事实，不给方向文案——方向 prompt 由 `readingAngles.MODULE_A5_DIRECTIONS`
 * 统一提供，避免同一句文案在事实层和角度层各写一份。
 */
export function buildTrajectoryFacts(chart: BodyGraph): string {
  const node = (side: 'p' | 'd', planet: 'SouthNode' | 'NorthNode'): string => {
    const label = planet === 'SouthNode' ? '南交' : '北交'
    const which = side === 'p' ? '人格侧' : '设计侧'
    return `${which}${label} ${starLineOf(chart, side, planet)}`
  }
  return [
    `【南北交点】\n${[
      node('p', 'SouthNode'),
      node('p', 'NorthNode'),
      node('d', 'SouthNode'),
      node('d', 'NorthNode'),
    ].join('\n')}`,
    `【四太阳 / 地球】人格太阳 ${starLineOf(chart, 'p', 'Sun')}｜人格地球 ${starLineOf(chart, 'p', 'Earth')}｜设计太阳 ${starLineOf(chart, 'd', 'Sun')}｜设计地球 ${starLineOf(chart, 'd', 'Earth')}`,
    `【人生角色】${chart.profile}｜类型：${TYPE_LABELS[chart.type]}`,
    `【扎根与成长相关中心】已定义：${labelListOf(definedCentersOf(chart))}；开放：${labelListOf(openCentersOf(chart))}`,
    `【已激活通道】${sortedChannels(chart)
      .map((c) => c.key)
      .join('、') || '无'}｜【已激活闸门】${sortedGates(chart)
      .map((g) => g.gate)
      .join('、') || '无'}`,
  ].join('\n')
}

/** 整盘事实块（逐条任务的公共底料：单看一条闸门也要能「结合整张盘」） */
export function buildWholeChartFacts(chart: BodyGraph): string {
  const channelList =
    sortedChannels(chart)
      .map((c) => {
        const def = CHANNELS.find((x) => x.key === c.key)
        return `${c.key}${def?.nameZh ? ` ${def.nameZh}` : ''}`
      })
      .join('、') || '这张盘未显示'
  const gateList =
    sortedGates(chart)
      .map((g) => `${g.gate}${gateNameOf(g.gate) ? ` ${gateNameOf(g.gate)}` : ''}`)
      .join('、') || '这张盘未显示'
  return [
    buildCoreFacts(chart),
    `【已激活通道】${channelList}`,
    `【已激活闸门】${gateList}`,
    `【悬挂闸门】${chart.hangingGates.length ? [...chart.hangingGates].sort((a, b) => a - b).join('、') : '无'}`,
    `【九大能量中心】已定义：${labelListOf(definedCentersOf(chart))}；开放：${labelListOf(openCentersOf(chart))}`,
    `【轮回交叉】${chart.incarnationCross || crossReadingOf(chart.personality, chart.design, chart.profile).name || '这张盘未显示'}`,
  ].join('\n')
}

/**
 * 入口 A 单次档（精简 / 详细）的整份事实块：6 个模块的原料**一次全给**，
 * 由 system 的入口契约要求在同一次输出里按 ①–⑥ 顺序写。
 */
export function buildPanoramaFacts(chart: BodyGraph): string {
  return [
    buildCoreFacts(chart),
    buildChannelsOverviewFacts(chart),
    buildGatesOverviewFacts(chart),
    buildCentersCircuitFacts(chart),
    buildTrajectoryFacts(chart),
  ].join('\n\n')
}

/** 逐闸门任务的 offline 正文（分项标题 + 该闸门全身 + 整盘底料） */
export function buildGateItemFacts(chart: BodyGraph, gate: number): string {
  const ins = gateInsightOf(gate)
  const center = GATE_CENTER[gate]
  const state = center ? centerStateOf(chart, center) : '未显示'
  const info = getGate(gate)
  const hanging = chart.hangingGates.includes(gate)
  const peer = peerGateOf(gate)
  const active = new Set(chart.gates.map((g) => g.gate))
  const peerText =
    peer === null
      ? '所属通道未显示'
      : active.has(peer)
        ? `对端 ${peer} 已激活`
        : `对端 ${peer} 未激活`
  return [
    `【本次分项标题】闸门 ${gate}${gateNameOf(gate) ? ` · ${gateNameOf(gate)}` : ''}`,
    `【闸门】${info.title}｜关键词：${info.keyword}｜所属中心：${center ? CENTER_LABELS[center] : '未显示'}（${state}）`,
    `【激活状态】${hanging ? '悬挂闸门' : '处于完整通道内'}（${peerText}）｜激活星体：${activationDetailOf(chart, gate) || '这张盘未显示'}`,
    `【离线释义】${info.text.replace(/\s+/g, ' ')}`,
    `【补充洞察】特质：${ins.trait}；成长：${ins.growth}；扎根：${ins.grounding}；驱动：${ins.drive}`,
    buildWholeChartFacts(chart),
  ].join('\n\n')
}

/** 逐通道任务的 offline 正文（分项标题 + 该通道全身 + 整盘底料） */
export function buildChannelItemFacts(chart: BodyGraph, key: string): string {
  const def = CHANNELS.find((c) => c.key === key)
  const name = def?.nameZh ?? getChannel(key).title.split(' · ').slice(1).join(' · ')
  const gates = def ? def.gates : key.split('-').map(Number)
  const gateLines = gates.map((g) => {
    const ins = gateInsightOf(g)
    return `闸门 ${g}${gateNameOf(g) ? ` ${gateNameOf(g)}` : ''}（${ins.trait}）`
  })
  return [
    `【本次分项标题】通道 ${key}${name ? ` · ${name}` : ''}`,
    `【两端中心】${channelCentersOf(key) || '中心未显示'}｜【两端闸门】${gates.join(' ↔ ')}`,
    `【两端闸门的激活星体】${gates
      .map((g) => `闸门 ${g}：${activationDetailOf(chart, g) || '未显示'}`)
      .join('；')}`,
    `【离线释义】${getChannel(key).text.replace(/\s+/g, ' ')}`,
    `【两端闸门基础特质】${gateLines.join('；')}`,
    buildWholeChartFacts(chart),
  ].join('\n\n')
}

/** 入口 C 的勾选对象（与 `types/aiReading.SelectionPick` 结构一致，避免 facts 层依赖编排层类型） */
export interface SelectionFactsPick {
  channels: string[]
  gates: number[]
  definition: boolean
  circuit: boolean
  cross: boolean
}

/**
 * 入口 C 的勾选签名（进 `ref` → 进缓存键）。
 *
 * ★ 必须与点击顺序无关：通道 key 升序、闸门号升序、三个布尔标记固定顺序（定义/回路/交叉）、
 *   方向 key 收尾。去重也在签名里做——用户重复点同一条通道不应产生两个缓存条目。
 */
export function selectionScopeRef(pick: SelectionFactsPick, dirKey: string): string {
  const channels = [...new Set(pick.channels)].sort(channelKeyOrder)
  const gates = [...new Set(pick.gates)].sort((a, b) => a - b)
  const flags = `${pick.definition ? 1 : 0}${pick.circuit ? 1 : 0}${pick.cross ? 1 : 0}`
  return `ch:${channels.join('+') || '-'}|g:${gates.join(',') || '-'}|f:${flags}|d:${dirKey || '-'}`
}

/** 入口 C 单次档的整份事实块：勾选项逐条 + 整盘底料 */
export function buildSelectionFacts(chart: BodyGraph, pick: SelectionFactsPick): string {
  const parts: string[] = []
  const channels = [...new Set(pick.channels)].sort(channelKeyOrder)
  const gates = [...new Set(pick.gates)].sort((a, b) => a - b)
  if (channels.length) {
    parts.push(
      `【勾选通道】共 ${channels.length} 条\n${channels
        .map((key) => `通道 ${key}：${getChannel(key).text.replace(/\s+/g, ' ')}`)
        .join('\n')}`,
    )
  }
  if (gates.length) {
    parts.push(
      `【勾选闸门】共 ${gates.length} 个\n${gates
        .map(
          (g) =>
            `闸门 ${g}${gateNameOf(g) ? ` ${gateNameOf(g)}` : ''}：${getGate(g).text.replace(/\s+/g, ' ')}`,
        )
        .join('\n')}`,
    )
  }
  if (pick.definition) {
    parts.push(
      `【勾选：定义状态】${DEFINITION_LABELS[chart.definition]}（已定义 ${definedCentersOf(chart).length} 个中心）｜人生角色：${chart.profile}`,
    )
  }
  if (pick.circuit) {
    parts.push(
      `【勾选：回路分布】${circuitryBrief(analyzeCircuitry(sortedChannels(chart).map((c) => c.key)))}`,
    )
  }
  if (pick.cross) {
    const cross = crossReadingOf(chart.personality, chart.design, chart.profile)
    parts.push(
      `【勾选：轮回交叉】${cross.name || chart.incarnationCross || '这张盘未显示'}\n四闸门：人格太阳 ${starLineOf(chart, 'p', 'Sun')}｜人格地球 ${starLineOf(chart, 'p', 'Earth')}｜设计太阳 ${starLineOf(chart, 'd', 'Sun')}｜设计地球 ${starLineOf(chart, 'd', 'Earth')}`,
    )
  }
  parts.push(buildWholeChartFacts(chart))
  return parts.join('\n\n')
}
