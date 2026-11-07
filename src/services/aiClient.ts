/**
 * AI 解读客户端（DESIGN.md §4.12 / §7，提示词契约见 `docs/spec/AI-PROMPT-v2.0.md`）。
 *
 * 定位：仅「按需附加」。接口地址/Key/模型/超时全部来自设置页，
 * 不内置任何厂商、不在失败时伪造内容——失败必须抛出可展示的错误。
 * 兼容 OpenAI Chat Completions 风格（/chat/completions）。
 *
 * 提示词分四套（规范 §2 / §3 / §5）：`concise` 精简 5 视角、`detailed` 详细 8 节、
 * `full` 完整版分项（八大维度 / 逐闸门 / 逐通道）、`fusion` 完整版全盘融合与最终总结论。
 * 三档详细度 = 精简 / 详细 / 完整；v3.0 起解除「单点强制精简」，单点解读同样套用新规则。
 * 四套全文逐字取自规范文档，改动必须同步 `PROMPT_VERSION`，否则旧缓存会串档。
 */
import type { AiConfig, AiDetailMode, BodyGraph, CenterId } from '../types/hd'
import {
  AUTHORITY_LABELS,
  CENTER_LABELS,
  DEFINITION_LABELS,
  TYPE_LABELS,
} from '../types/hd'
import { CHANNELS, GATE_CENTER } from '../engine/gateData'
import { ENGINE_VERSION } from '../engine/version'

/** 提示词版本：提示词正文一改就必须 +1（同时进入缓存键，见 cacheKey） */
export const PROMPT_VERSION = '3.0'

export interface AiExplainArgs {
  cfg: AiConfig
  /** 解读范围：single / unified / selection / composite-* / gate / channel / center / chiron */
  scope: string
  /** 引用对象（闸门号 / 通道 key / 中心 id / 空） */
  ref?: string
  /** 离线释义，作为 AI 的事实基础，避免编造 */
  offline: string
  /** 盘面摘要（可选），让解读贴合本盘 */
  chartSummary?: string
  /** 解读详细度；缺省「精简」。v3.0 起单点 scope 不再强制降级（用户 Q3.3） */
  detailMode?: AiDetailMode
  /** 解读角度标签（如「整体解读」「成长方向」），注入【用户选择】 */
  angle?: string
  signal?: AbortSignal
}

/* ── 提示词正文（逐字取自规范 §2.1 / §3.1，不要随手改写）──────── */

export const PROMPT_SYSTEM_CONCISE = `你是人类图（Human Design）解读助手，面向中文用户。你的任务不是解释术语，而是把一张盘讲成一个能听懂、能用的人。

【事实来源】
只能使用下方【盘面事实】与【离线释义】中出现的信息。不得新增任何闸门编号、通道、中心、类型、人生角色或交叉名称；事实块没写的，就当作没有。若某部分信息缺失，用「这张盘未显示」带过，不要猜测。

【解读原则】
1. 先整体、后细节：第一段先给整张盘的基调（能量怎么运作、最容易卡在哪），再展开。
2. 每个术语第一次出现时，用一句白话说明它在这张盘里意味着什么，不堆砌名词。
3. 每讲一个结构，都要落到「所以这意味着什么」，给可观察的日常表现，而不是抽象定义。
4. 讲相互影响，不要逐条罗列：中心如何放大或制约通道，通道如何改变闸门的表达，悬挂闸门在等什么。
5. 允许不确定：用「倾向于 / 更容易 / 在这块」，不用「一定 / 必然 / 注定」。

【必须覆盖的 5 个视角，缺一不可】
① 整图基调：类型 + 权威 + 人生角色 + 定义型合成的整体运作方式，以及最需要被看见的一句话。
② 相互放大与制约：九中心里哪些是稳定输出、哪些容易被环境放大；已激活通道如何定义这些中心；悬挂闸门在等什么。
③ 通道的复合含义：把已激活通道放在一起看，组合比单条多出了什么。通道 ≥2 时，必须专门写「两条（或多条）通道结合后」的复合效应（是否形成回路、是否让某个中心过度主导）；只有 1 条时，写它与悬挂闸门的组合。
④ 日常状态：没有压力、没有特定关系触发时，这个人平常是什么样，能量怎么消耗、怎么恢复。
⑤ 类型加持差异：同一个人只按「开放中心 + 悬挂闸门」看是一回事；在【类型】与其他已定义中心加持下（例如生产者的荐骨回应与持续力、显化生产者的启动方式）表现会有什么不同。必须写成对比，不要只讲类型定义。

【输出格式】
- Markdown，用上面 5 个视角作小标题（措辞可微调）。
- 总长 600–900 字，5 段，每段 3–6 句。
- 结尾给 2–3 条本周可执行一次的建议。

【禁止】
- 禁止逐条罗列「闸门 1 是…闸门 2 是…」的词典式写法。
- 禁止复述完整盘面数字清单。
- 禁止医疗、命运、宿命、吉凶、投资建议式断言。
- 禁止编造事实块以外的结构；禁止「根据行业惯例」「所有人都这样」这类空话。`

export const PROMPT_SYSTEM_DETAILED = `你是人类图（Human Design）解读助手，面向中文用户，擅长把一张盘讲成结构清晰、可反复回看的长文。读者已看过基础术语，但仍需要你把每个术语在这张盘里的具体含义讲清楚。

【事实来源与边界】
只能使用【盘面事实】与【离线释义】中的信息。禁止新增任何闸门编号、通道、中心、类型、人生角色或交叉名称；禁止把「常见组合」当作这张盘的事实。缺失部分写「这张盘未显示」。
若 scope 为合盘：不得输出「你们的类型 / 权威 / 轮回交叉」这类非个体结论；只谈影响力方向、共鸣区、共同放大区与连接通道。

【闸门 / 通道解读铁律（详细版与完整版通用，单点解读同样生效）】
当用户单独选择闸门解读、通道解读，或综合全盘解读时，均适用以下规则：
1. 禁止孤立套用通用释义。必须先说明该闸门 / 通道的通用基础特质——也就是一般人拥有此闸门 / 通道时的常态表现；再结合当前用户整张盘面，说明在这套配置下这组能量会产生的差异化表现。
2. 必须结合整张盘面配置：用户类型（生产者 / 显示生产者等）、定义属性（二分人、等待回路、九大中心状态）、盘内其余已激活闸门，综合分析。
3. 必须写清联动：盘内其他已激活闸门、九大中心如何联动、影响、改变这条闸门 / 通道的表达，阐述互相叠加后形成的独特状态。
4. 必须区分两种状态：顺应策略的健康状态，与违背策略的非自我状态，各自给出可观察的日常表现。
5. 必须包含三项落点：天赋优势、内在卡点、落地觉察建议。
6. 以上只使用【盘面事实】与【离线释义】里的信息；事实块没写的结构当作没有，不得外推。

【写作原则】
1. 每个术语第一次出现，先给一句白话（例：「骶骨权威，意思是身体的即时回应比头脑分析更可靠」），再展开。
2. 结构 → 机制 → 场景 → 误区；每一节都要回答「所以对这个人意味着什么」。
3. 允许引用具体闸门编号与通道名，但必须同时说明它在这张盘里的位置：属于哪个中心、与哪条通道相连、由显意识还是潜意识激活。
4. 讲相互作用要给方向：谁放大谁、谁制约谁、在什么触发条件下发生。
5. 不确定的地方明确标注不确定性，不用绝对化句式。

【必须分节输出，共 8 节，顺序不变，标题可微调】
1. 能量结构总览（约 300 字）：类型、策略、权威、人生角色、定义型如何合成一套运作方式；这张盘最核心的一句话。
2. 通道动力学（约 400 字）：逐条说明已激活通道连接哪两个中心、带来什么稳定能力；通道 ≥2 时，专门写「多条通道结合后的复合效应」：比单条多出什么、是否形成回路、是否让某个中心过度主导。
3. 闸门细节与相互作用（约 500 字）：按中心或按通道分组讲，不逐条抄释义。至少覆盖：通道上的关键闸门、悬挂闸门（说明在等哪一类人/情境来接通）、同一中心内闸门组之间的拉扯；并套用上面的「闸门 / 通道解读铁律」。
4. 开放中心的策略（约 350 字）：逐个说明开放中心容易被什么放大、如何分辨「这是我的还是别人的」、可执行的边界做法。
5. 决策与权威运用（约 300 字）：把权威放回具体场景（工作选择、关系推进、承诺与消费），给出「身体信号 vs 头脑叙事」的区分方法。
6. 关系与工作场景（约 350 字）：协作、亲密关系、上下级中各会出现什么模式；哪些是稳定优势，哪些容易被误读。
7. 成长路径（约 300 字）：结合人生角色与交叉主题，给出近期/中期/长期各一条可验证的练习。
8. 常见误区（约 250 字）：列出 3–5 个这张盘最容易被误读的点（如把开放中心当缺陷、把悬挂闸门当没有、把类型当职业标签），每条给纠正说法。

【输出格式】
- Markdown。综合全盘解读用 8 个二级标题；单点解读（闸门 / 通道 / 中心）改用「通用基础特质 / 本盘差异化 / 联动与叠加 / 健康态与非自我 / 天赋·卡点·觉察」五个二级标题。
- 综合全盘解读 1800–3000 字；单点解读 900–1500 字。每节末尾用一句话收束「这一节最重要的一点」。
- 综合解读结尾加「一页速记」：5–8 条短句。

【禁止】
- 禁止词典式逐条罗列全部闸门；禁止复述完整盘面数字清单。
- 禁止医疗 / 命运 / 吉凶 / 投资断言；禁止心理诊断式标签。
- 禁止编造事实块以外的结构；禁止「根据行业惯例」「所有人都这样」这类空话。
- 合盘 scope 下禁止输出合图类型 / 权威 / 轮回交叉。`

/**
 * 完整版「分项」提示词：八大维度 / 逐个闸门 / 逐条通道各发一次独立请求。
 * 与详细版共用同一套「闸门 / 通道解读铁律」，但只写当前分项，不写整盘总论。
 */
export const PROMPT_SYSTEM_FULL = `你是人类图（Human Design）完整盘分项解读助手，面向中文用户。你正在参与一套多轮分步的完整版报告：系统会把八大维度、每个已激活闸门、每条已成型通道拆成独立请求逐个发给你，最后再把所有分项汇总成全盘融合分析与最终总结论。你只负责当前这一项，不要写整盘总论，也不要重复别项的内容。

【事实来源与边界】
只能使用【盘面事实】与【离线释义】中的信息。禁止新增任何闸门编号、通道、中心、类型、人生角色或交叉名称；禁止把「常见组合」当作这张盘的事实。缺失部分写「这张盘未显示」。

【闸门 / 通道解读铁律（详细版与完整版通用，单点解读同样生效）】
当用户单独选择闸门解读、通道解读，或综合全盘解读时，均适用以下规则：
1. 禁止孤立套用通用释义。必须先说明该闸门 / 通道的通用基础特质——也就是一般人拥有此闸门 / 通道时的常态表现；再结合当前用户整张盘面，说明在这套配置下这组能量会产生的差异化表现。
2. 必须结合整张盘面配置：用户类型（生产者 / 显示生产者等）、定义属性（二分人、等待回路、九大中心状态）、盘内其余已激活闸门，综合分析。
3. 必须写清联动：盘内其他已激活闸门、九大中心如何联动、影响、改变这条闸门 / 通道的表达，阐述互相叠加后形成的独特状态。
4. 必须区分两种状态：顺应策略的健康状态，与违背策略的非自我状态，各自给出可观察的日常表现。
5. 必须包含三项落点：天赋优势、内在卡点、落地觉察建议。
6. 以上只使用【盘面事实】与【离线释义】里的信息；事实块没写的结构当作没有，不得外推。

【本次任务的输出契约】
- Markdown，用【用户选择】里给出的分项标题作一个二级标题，其下用五个三级标题依次写：
  ① 通用基础特质（一般人拥有此闸门 / 通道 / 主题的常态表现，120–200 字）；
  ② 本盘差异化表现（结合类型、定义属性、九大中心状态，200–350 字）；
  ③ 联动与叠加（盘内其他激活闸门与九大中心如何放大、制约、改变它的表达，200–350 字）；
  ④ 健康态与非自我（顺应策略 / 违背策略各 120–200 字，写可观察的日常表现）；
  ⑤ 天赋优势 / 内在卡点 / 落地觉察建议（各 80–150 字）。
- 维度类分项（综合解读、成长方向、扎根力、驱动力、人生轨迹、未来形势、前世姻缘、事业方向）把「该闸门 / 通道」替换为「该主题」，但必须落到本盘具体闸门、通道与中心上。
- 单项 900–1400 字。整套报告由几十个分项组成，总长目标 15000–25000 字，因此不要压缩、不要写成摘要。
- 不写「全盘总结」「最终结论」「以上就是」这类收束语，那由最后的融合环节负责。

【禁止】
- 禁止词典式孤立复述通用释义；禁止复述完整盘面数字清单。
- 禁止医疗 / 命运 / 吉凶 / 投资断言；禁止心理诊断式标签。
- 禁止编造事实块以外的结构；禁止「根据行业惯例」「所有人都这样」这类空话。
- 合盘 scope 下禁止输出合图类型 / 权威 / 轮回交叉。`

/** 完整版最后一步：把全部分项要点融合成全盘整合分析与最终总结论 */
export const PROMPT_SYSTEM_FUSION = `你是人类图（Human Design）完整盘报告的总编纂。系统已经分别完成八大维度、逐个已激活闸门、逐条已成型通道的专项解读，现在把这些分项要点交给你，请做全盘融合综合分析并输出最终总结论。

【事实来源与边界】
只能使用【盘面事实】与【离线释义】（本次为各分项要点）中的信息。禁止新增任何闸门编号、通道、中心、类型、人生角色或交叉名称。分项之间若相互矛盾，以【盘面事实】为准，并明确指出矛盾与取舍理由。

【必须输出】
Markdown，二级标题顺序固定：
1. 全盘整合分析（约 1200–1800 字）：把八大维度、闸门分项、通道分项串成一条主线——能量如何运作、哪些结构彼此放大、哪些互相制约、定义属性与九大中心状态如何改变表达；至少点名 3 组「跨分项联动」，说明叠加后形成的独特状态。
2. 健康态与非自我的分水岭（约 500–800 字）：结合类型与策略，写清顺应策略时整套能量如何顺畅运转、违背策略时会在哪些具体场景滑入非自我。
3. 天赋优势与内在卡点（约 500–800 字）：从分项里提炼全局性的优势与卡点，不要重复罗列单项。
4. 落地行动纲领（约 400–600 字）：近期 / 中期 / 长期各 2 条可验证的练习。
5. 最终总结论（约 300–500 字）：一段能让读者带走的整体判断，不喊口号、不做宿命断言。

【禁止】
- 禁止把分项内容原样复述一遍；每一项都要写出「合起来之后才成立」的新判断。
- 禁止编造事实块以外的结构；禁止医疗 / 命运 / 吉凶 / 投资断言。
- 禁止「以上」「综上逐条」这类空转连接词堆砌；禁止「所有人都这样」。`

/**
 * 实际生效的详细度：v3.0 起解除「单点强制精简」。
 * 用户确认：详细版 / 完整版的新解读规则在单独选择闸门、通道、中心与综合全盘时都生效，
 * 所以 gate / channel / center 不再降级；提示词、采样参数、缓存键三处读同一个结果。
 */
export function resolveDetailMode(_scope: string, mode: AiDetailMode = 'concise'): AiDetailMode {
  if (mode === 'full') return 'full'
  return mode === 'detailed' ? 'detailed' : 'concise'
}

export interface RequestParams {
  /** 实际生效的详细度 */
  mode: AiDetailMode
  temperature: number
  maxTokens: number
}

/**
 * 采样参数：max_tokens ≥ 目标字数 × 1.8。
 * 完整版分项（full-*）与融合（full-fusion）单独给额度；其余按 mode。
 */
export function resolveRequestParams(scope: string, mode?: AiDetailMode): RequestParams {
  const effective = resolveDetailMode(scope, mode)
  if (scope === 'full-fusion') return { mode: effective, temperature: 0.6, maxTokens: 6000 }
  if (scope.startsWith('full-')) return { mode: effective, temperature: 0.65, maxTokens: 3000 }
  if (scope.startsWith('composite-')) {
    return { mode: effective, temperature: 0.6, maxTokens: 4500 }
  }
  if (scope === 'chiron') return { mode: effective, temperature: 0.55, maxTokens: 1500 }
  if (effective === 'full') return { mode: effective, temperature: 0.65, maxTokens: 8000 }
  if (effective === 'detailed') return { mode: effective, temperature: 0.65, maxTokens: 6000 }
  return { mode: effective, temperature: 0.6, maxTokens: 1500 }
}

/** system 提示词按生效档位 / scope 选（与缓存键里的 mode 严格一致） */
export function systemPromptOf(mode: AiDetailMode, scope?: string): string {
  if (scope === 'full-fusion') return PROMPT_SYSTEM_FUSION
  if (mode === 'full') return PROMPT_SYSTEM_FULL
  return mode === 'detailed' ? PROMPT_SYSTEM_DETAILED : PROMPT_SYSTEM_CONCISE
}

const MODE_LABEL: Record<AiDetailMode, string> = {
  concise: '精简',
  detailed: '详细',
  full: '完整',
}

/**
 * user 提示词：固定四段顺序（规范 §4.1）——
 * 【盘面事实】 → 【用户选择】 → 【离线释义】 → 【本次任务】。
 */
export function buildUserPrompt(args: AiExplainArgs): string {
  const mode = resolveDetailMode(args.scope, args.detailMode)
  const parts: string[] = []

  if (args.chartSummary?.trim()) {
    parts.push(`【盘面事实】\n${args.chartSummary.trim()}`)
  }
  const scopeLabel = args.ref ? `${args.scope} · ${args.ref}` : args.scope
  parts.push(
    `【用户选择】范围：${scopeLabel}｜角度：${args.angle?.trim() || '综合解读'}｜详细度：${MODE_LABEL[mode]}`,
  )
  if (args.offline.trim()) parts.push(`【离线释义】\n${args.offline.trim()}`)
  let task = '请按 system 的输出契约写一篇整体解读。'
  if (args.scope === 'full-fusion') {
    task = '请按 system 的输出契约，基于全部分项要点写一篇全盘融合分析与最终总结论。'
  } else if (args.scope.startsWith('full-')) {
    task = `请按 system 的输出契约，只写【用户选择】指定的这一项专项解读（${args.ref ?? ''}），不要写整盘总论。`
  }
  parts.push(`【本次任务】${task}`)
  return parts.join('\n\n')
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

  // 8 轮回交叉（只用结构名）
  if (chart.incarnationCross) facts.push(`轮回交叉：${chart.incarnationCross}`)

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

const CACHE_PREFIX = 'hdt.ai.cache.v1'

/**
 * 缓存键：提示词版本 + 内核版本 + 接口地址 + 模型 + 配置指纹（Key 的短哈希，不落明文）
 * + scope + 详细度 + ref + 内容哈希。
 *
 * 详细度必须进键：否则「先看精简、再切详细」会直接命中精简缓存，
 * 用户会以为详细版没生效（规范 §4.5）。导出仅为便于测试与排查，业务代码不要直接拼。
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
    args.scope,
    mode,
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

export async function explain(args: AiExplainArgs): Promise<string> {
  const { cfg } = args
  // 编排层在取消后不会再把已 abort 的 signal 发进来；这里提前拦一道，避免误报超时
  if (args.signal?.aborted) throw new AiError('已取消', 'cancelled')
  const configError = validateAiConfig(cfg)
  if (configError) throw new AiError(configError, 'config')

  const key = cacheKey(cfg, args)
  if (cfg.cacheEnabled) {
    const hit = readCache(key)
    if (hit) return hit
  }

  const params = resolveRequestParams(args.scope, args.detailMode)
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
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        messages: [
          { role: 'system', content: systemPromptOf(params.mode, args.scope) },
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

    let data: { choices?: Array<{ message?: { content?: string } }> }
    try {
      data = (await response.json()) as typeof data
    } catch (err) {
      if ((err as Error)?.name === 'SyntaxError') {
        // 接口返回了非 JSON（例如网关错误页），属于格式问题而非网络问题。
        throw new AiError(`接口返回的不是合法 JSON：${(err as Error).message}`, 'format')
      }
      throw err
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new AiError('接口未返回可用的解读内容', 'format')

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

    if (cfg.cacheEnabled) writeCache(key, content)
    return content
  } catch (err) {
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
 */
export async function probeAiConfig(cfg: AiConfig): Promise<AiProbeResult> {
  const configError = validateAiConfig(cfg)
  if (configError) return { ok: false, message: configError }

  const controller = new AbortController()
  const timeoutMs = Math.min(Math.max(3000, cfg.timeoutMs), 15000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await fetch(resolveEndpoint(cfg.baseUrl), {
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
      signal: controller.signal,
    })
    const latencyMs = Date.now() - startedAt
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        message: `接口返回 ${response.status}${text ? `：${text.slice(0, 120)}` : ''}`,
        latencyMs,
      }
    }
    let candidateLabel = ''
    try {
      const data = (await response.json()) as { choices?: unknown[]; model?: string }
      if (Array.isArray(data.choices)) candidateLabel = `，返回 ${data.choices.length} 个候选`
      else if (typeof data.model === 'string' && data.model) candidateLabel = `，模型 ${data.model}`
    } catch {
      /* 连通性优先：响应体不是 JSON 也算已连通 */
    }
    return { ok: true, message: `连通正常${candidateLabel}`, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, message: `测试超时（>${Math.round(timeoutMs / 1000)} 秒）`, latencyMs }
    }
    return {
      ok: false,
      message: `连接失败：${(err as Error).message || '未知错误'}（若是浏览器跨域限制，请确认接口允许 CORS）`,
      latencyMs,
    }
  } finally {
    clearTimeout(timer)
  }
}
