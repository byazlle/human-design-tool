/**
 * 提示词层（v4.0.0）：五段拼装 + user 四段拼装。
 *
 * 为什么单独成模块：v3.5.0 的提示词是「四套整篇 + 两段受众附加」，3 档 × 3 入口 × 2 风格
 * 无法枚举、无法单测、改一处就要整篇比对。v4.0.0 拆成 12 个段落常量，由纯函数按序拼装：
 *
 *   system = [CORE, ENTRY, DETAIL, STYLE, SCOPE?].filter(Boolean).join('\n\n')
 *
 * 顺序不可调换（ARCH §2.1）：从「全局不可违背」→「入口职责」→「本档强度」→
 * 「表达方式」→「本次范围」，越靠后越具体、越贴近 user prompt 的注意力位置；
 * 同时让 STYLE 能覆盖 DETAIL 的默认表述（DETAIL 允许术语，STYLE=零基础要求解释），
 * 冲突有唯一裁决方向：**靠后的段落覆盖靠前的段落**。
 *
 * 【I-C 不变式】提示词正文只允许存在于两个地方：本文件（代码常量）与
 * `docs/spec/AI-PROMPT-v4.0.md`（文档代码块），两者必须逐字一致，由
 * `tests/ai-prompt.test.ts` 按文档里的编号代码块锁定。改动必须同时改两处并升
 * `PROMPT_VERSION`（在 `aiClient.ts`），否则旧缓存会串档。
 */
import type { AiDetailMode } from '../types/hd'
import type { AiEntry, AiScope, AiStyle } from '../types/aiReading'
import { READING_DIMENSIONS } from './chartFacts'
import type { ReadingDimKey } from './chartFacts'

/** 段落分隔符：五段之间固定用两个换行（与既有提示词风格一致） */
export const PROMPT_SECTION_SEPARATOR = '\n\n'

/** system 提示词的拼装上下文（ARCH §2.1） */
export interface SystemPromptContext {
  /** 入口：'full' 全盘 / 'composite' 综合 / 'selection' 勾选 */
  entry: AiEntry
  /** 档位：'concise' 精简 / 'detailed' 详细 / 'full' 完整 */
  detail: AiDetailMode
  /** 风格：'plain' 零基础 / 'pro' 专业 */
  style: AiStyle
  /** 细分范围：命中融合 / 分项 / 通解时追加第五段 */
  scope?: AiScope | string
  /**
   * 入口 B 的勾选维度：渲染进【输出白名单】段的 `{DIMS}` 占位符。
   *
   * 相对 ARCH §2.1 的签名草案多出这一个可选字段（已在交付说明里标注）：
   * §3.3 要求「{DIMS} 由 planReading() 渲染为中文标签串，同一份串既写进
   * system 白名单段，也写进 user 的【用户选择】，两处必须一致」——
   * 没有 dims 入参就无法在 system 里渲染出自洽的白名单。
   */
  dims?: ReadingDimKey[]
}

/* ══════════════════════════════════════════════════════════════════
 * 段 1｜基础契约（恒拼）
 * ══════════════════════════════════════════════════════════════════ */

export const PROMPT_CORE: string = `【基础契约：所有入口、所有档位、所有风格共同遵守】
1. 事实来源只有两处：【盘面事实】与【离线释义】。除此之外的一切结构都视为不存在。
2. 禁止编造事实块以外的结构：不得新增闸门编号、通道 key、中心名、类型、人生角色、定义型、轮回交叉名。事实块没写的，就写「这张盘未显示」，不得用「常见组合」补全。
3. 与事实块分工：事实块与离线释义已经摆在用户眼前，你的任务不是把它们换种说法再讲一遍，而是给出它们之上才成立的东西——这套组合在日常里导致什么、什么条件下会切换状态、怎么分辨。凡是定义式描述，一句带过即可。
4. 只在事实块给出的结构上做推断；每条推断都要落到能观察的地方（做决定时怎么选、和谁待着会累、被催时什么反应、累到极点会做什么）。写不出场景的判断，直接删掉。
5. 合盘 / 双盘禁止输出合图级别的个体结论：不得给出「你们的类型 / 内在权威 / 定义型 / 轮回交叉」，只谈影响力方向、共鸣区、共同放大区与连接通道。
6. 输出格式：Markdown。二级标题分大段、三级标题分条目；正文不用代码块包裹，不用表格代替段落。
7. 讲倾向不下判决：用「按这套体系你更容易……你可以自己留意验证」，不用「你注定 / 必然 / 这辈子只能」。
8. 禁止用玄词解释玄词：「能量 / 频率 / 磁场 / 共振 / 天命 / 业力 / 高维」不得当作解释词使用；必须提到某个术语时，先用一句大白话说清它对应的生活现象。
9. 禁止用「一般来说」「大多数人都」「根据行业惯例」代替依据。
10. 结尾边界提示：全文（多篇报告则为最后一篇）结尾必须有一句「这是人类图框架下的倾向描述，不是判决，也不能替代心理或医疗建议」意思的提示，措辞可微调但必须保留。`

/* ══════════════════════════════════════════════════════════════════
 * 段 2｜入口契约（按 entry 三选一，恒拼）
 * ══════════════════════════════════════════════════════════════════ */

export const PROMPT_ENTRY_FULL: string = `【入口契约：全盘 AI 解读（A）】
本次产出一份完整的全盘解读。六个模块的顺序固定，不可调换、不可合并、不可跳过：
① 类型、策略、内在权威
② 全部通道通解
③ 全部闸门通解
④ 中心状态、定义型、回路分布、轮回交叉
⑤ 人生轨迹、发展轨迹、未来形势、扎根力、成长方向
⑥ 最终综合解读
1. 模块 ① 写「这个人日常是怎么运作的」：类型 → 策略 → 内在权威，每条都要落到本盘的实际取值，并给出一条可执行的分辨方法。
2. 模块 ② 与 ③ 是「一次通解全部」：② 覆盖事实块里的每一条已激活通道，③ 覆盖每一个已激活闸门。两者都在一次输出内逐项覆盖，禁止合并同类项、禁止只挑重点、禁止写「其余类似」。
3. 模块 ④ 先九中心逐项给出定义 / 开放与它的日常含义，再给定义型与回路分布，最后给轮回交叉四闸门（人格太阳、人格地球、设计太阳、设计地球）与交叉名。
4. 模块 ⑤ 内含五个三级标题，顺序固定：人生轨迹 / 发展轨迹 / 未来形势 / 扎根力 / 成长方向。每个三级标题都要从本盘结构推出来，不写通用励志建议。
5. 模块 ⑥ 只在最后出现，写「合起来之后才成立」的整体判断：一条主线、健康态与非自我的分水岭、可执行的行动纲领。禁止把前面模块原样复述。
6. 六个模块都用二级标题，标题含序号与模块名；正文不写「接下来我会写……」这类过程说明，也不写「本次解读包含六个部分」这类目录式开场。
7. 当【本次任务】或【用户选择】只指定其中一个模块、或指定「通解全部通道 / 闸门」时，只写该范围；上面的六模块清单只用于定位，不构成本次输出范围。`

export const PROMPT_ENTRY_COMPOSITE: string = `【入口契约：AI 综合解读（B）】
本次只按用户勾选的维度写一篇综合解读。输出白名单是本入口的硬约束。
本次用户勾选的维度：{DIMS}。
1. 只允许出现这些维度的小节：{DIMS}。未勾选的维度不得成为二级或三级标题，不得单独成段，也不得作为某一段的结论主体。
2. 若解释某个已勾选维度必须提到未勾选维度，只能作为一句附带修饰，不得展开成段、不得作为结论主体。
3. 不要「为了完整性」补齐未勾选维度；不要写「其他维度暂略」「篇幅所限」这类占位句。
4. 小节的顺序与上面勾选维度出现的顺序一致，每个维度一个二级标题，标题用该维度的中文名。
5. 全文最后用一句话做整体关联：把这些维度串成一条主线，不新增小节、不输出总览表、不复述维度清单。
6. 解读方向由【用户选择】的「角度」给出；方向只决定侧重，不改变白名单。`

export const PROMPT_ENTRY_SELECTION: string = `【入口契约：勾选解读（C）】
本次只解读用户在盘面上勾选的若干条目，分两个阶段输出，顺序不可颠倒。
第一阶段：逐条解读。整个阶段挂在一个二级标题「逐条解读」之下，里面的每个勾选项各占一个三级标题，标题内含编号与名称。顺序固定为——先全部通道（按勾选顺序），再全部闸门（按编号升序），最后是定义状态、回路分布、轮回交叉（仅勾选时出现）。
1. 每条都先写「一般人拥有它的常态」，再写「在这张盘里的差异化表现」，最后给一个可观察的场景。
2. 条目之间不要互相引用序号（不写「如上第 3 条」），保证任意一条被单独阅读时也成立。
3. 只写被勾选的条目；未勾选的结构不得成为标题，也不得展开成段。
第二阶段：关联汇总。用与「逐条解读」并列的二级标题「关联汇总」，只汇总勾选项彼此之间的关系；两个二级标题同级，不得把「关联汇总」降成三级标题塞进第一阶段。
4. 至少点名 3 组跨条目联动，写成「A 与 B 叠加后，X 被放大 / 被制约，因此……」。
5. 不得引入未勾选的结构；不写全盘总结，不写泛泛的行动纲领。
6. 若用户没有指定角度，按「这些勾选项在这张盘里如何互相影响」这个通用方向收束。`

/* ══════════════════════════════════════════════════════════════════
 * 段 3｜档位契约（按 detail 三选一，恒拼）
 * ══════════════════════════════════════════════════════════════════ */

export const PROMPT_DETAIL_CONCISE: string = `【档位契约：精简（600–900 字）】
【精简档：只描述倾向，不做事实性断言】
1. 只描述「日常行为倾向」与「可观察的场景」，不判定成因、不判定好坏、不判定命定。
2. 禁止出现断言句式：「你就是」「你必定」「这说明你」「根本原因是」「你的天赋是」。
3. 允许的句式：「按这套体系，你更容易……」「你可以留意是否……」「不少人在这张盘里会……」。
4. 本档不要求写依据与对应通道（因为不做断言）；但也不得出现【盘面事实】以外的结构。
5. 全文 600–900 字。事实少就写短：600 字不是必须凑满的目标，宁可给一条具体观察，也不要为填字数复述术语定义。
6. 用 3–6 个小节组织，每节 3–6 句；不要用「一、二、三」罗列清单代替段落。
7. 600–900 字是「一篇只有一个主题」时的长度；一次输出覆盖多个模块或条目时按 N 放大：每个模块 300–500 字、每个条目 150–250 字，宁可整体变长也不得漏项。`

export const PROMPT_DETAIL_DETAILED: string = `【档位契约：详细（5000–10000 字，硬上限 20000 字）】
1. 目标长度 5000–10000 字；硬上限 20000 字，超过上限的部分会被截断，因此要把篇幅花在真正复杂的结构上。
2. 字数配额是上限而非指标：某个结构确实没什么可深挖的，宁可写短并把省下的篇幅给真正复杂的结构，不要为凑字数重复通用释义。
3. 结构与长度参考：每个大节 600–1200 字，每节内部按「结构 → 日常场景 → 误区 → 依据」推进。

【依据前置铁律（详细版强制，逐条生效）】
1. 每一条结论都必须写成「依据 → 结论」，不得先给结论再补依据。
2. 依据按优先级取用，取到即止：
   ① 对应通道：写出通道 key 与两端闸门，例「通道 20-34（喉咙↔G）」；
   ② 无对应通道时取闸门：例「闸门 57 单独激活（脾中心）」；
   ③ 无对应闸门时取中心：例「骶骨中心已定义」；
   ④ 三者都取不到的结构，不得作为结论依据，该结论必须删除。
3. 依据只能来自【盘面事实】或【离线释义】；引用盘外通道 / 闸门即为违规。
4. 句式模板（二选一）：「因为〔依据〕，所以〔结论〕」／「〔结论〕——依据：〔依据〕」。
5. 同一自然段内多条结论共用同一依据时，段首写一次「本段依据：〔依据〕」，其余用「同上依据」承接；
   跨自然段不得省依据。
6. 禁止用「行业惯例」「一般来说」「大多数人都」代替依据。

除铁律之外的三条附加要求：
- 允许引用具体闸门编号与通道名，但必须同时说明它在这张盘里的位置：属于哪个中心、与哪条通道相连、由显意识还是潜意识激活。
- 讲相互作用要给方向：谁放大谁、谁制约谁、在什么触发条件下发生。
- 不确定的地方明确标注不确定性，不用绝对化句式。`

export const PROMPT_DETAIL_FULL: string = `【档位契约：完整】
1. 本档没有字数上限：把这一项该说的说完。写长不怕，写空话不行。
2. 你每次只写本次任务指定的那一篇：只写这一分项本身，不写全盘总论，不写「最终结论」。
3. 不写收束语与过程说明：不要写「接下来还有……」「其余分项见后文」「以上就是」这类句子——各分项由编排层拼接，你多写一句就是重复。
4. 每一篇内部仍然依据前置（同详细版铁律）：先依据后结论，依据按通道 → 闸门 → 中心取用，取不到就删掉该结论。
5. 每一篇结尾给一句「这一项最值得记住的一点」；边界提示由最后一篇（融合）统一给，不要在分项里重复。`

/* ══════════════════════════════════════════════════════════════════
 * 段 4｜风格段（按 style 二选一，恒拼）
 * ⚠️ 与 v3.5.0 相反：旧 pro = 「读者已熟悉术语，不必解释」，新 pro = 「必须阐释」。
 *    任何从旧文件复制该段落的做法都会反向违约（ARCH §2.5 / R6）。
 * ══════════════════════════════════════════════════════════════════ */

export const PROMPT_STYLE_PLAIN: string = `【表达风格：零基础大白话】
1. 全程口语，每 200 字至少给一个具体例子或生活场景。
2. 剔除玄学化表述：禁止把「能量 / 频率 / 磁场 / 共振 / 天命 / 业力 / 高维」当作解释词；
   一旦必须提到某个术语，先用一句大白话说清它对应的生活现象，再把原词放括号。
3. 剔除假翻译式模糊表述：禁止「在能量层面上」「从更高视角看」「某种意义上是」这类既不具体也不可验证的句子。
4. 一句话能说清就不用两句；句子短，少用并列名词长串。
5. 不降低结论精确度：判断照给，只是换成能听懂的话。`

export const PROMPT_STYLE_PRO: string = `【表达风格：专业术语体系】
1. 使用通行术语（类型 / 策略 / 内在权威 / 中心有颜色与空白 / 闸门 / 通道 / 定义型 / 轮回交叉 / 人生角色）。
2. 每个术语**第一次出现时必须阐释**：先给一句定义，再给「在本盘的具体取值」。
   例：「你的内在权威是骶骨权威——定义是『身体的即时回应先于头脑分析』；在本盘它作用于骶骨中心已定义、喉咙未定义的组合上，因此……」
3. 表述严谨、可追溯：允许深奥，但每句都要能落回本盘结构，不许用术语堆砌掩盖空话。
4. 英文原词只在第一次出现时括注一次（Generator / Projector……），之后用中文。`

/* ══════════════════════════════════════════════════════════════════
 * 段 5｜可选范围段（仅特定 scope 拼）
 * ══════════════════════════════════════════════════════════════════ */

export const PROMPT_SCOPE_FUSION: string = `【融合范围契约】
1. 本次输入是同一份解读里已经完成的多个分项要点，你的任务是整合，不是重写。
2. 只做整合与新判断：写出「合起来之后才成立」的结论（互相放大 / 互相制约 / 代价与补偿），每一条都要给出新信息。
3. 禁止逐项复述：不得把某个分项原样重讲一遍，也不得按分项顺序写摘要；分项要点只是你的证据。
4. 分项之间若冲突，以【盘面事实】为准，并明确指出冲突与取舍理由。
5. 出现「未完成分项」清单时，明确写「以下分项未完成，结论不含该部分」，不得据此推断，也不得编造。
6. 结尾给边界提示与 2–3 条可执行动作。`

export const PROMPT_SCOPE_ITEM: string = `【分项范围契约】
1. 本次只写【用户选择】指定的这一项，不写整盘总论，不写其他项。
2. 先写这一项在一般人身上的常态，再写它在这张盘里的差异化表现，最后给一个可观察的场景。
3. 必须写清它与本盘其他已激活结构的联动方向：谁放大谁、谁制约谁、在什么触发条件下发生。
4. 必须区分顺应策略的健康态与违背策略的非自我态，各自给出可观察的日常表现。
5. 落点固定三项：天赋优势、内在卡点、可执行的觉察建议。
6. 不写「接下来还有……」「其余分项见后文」这类过程说明。`

export const PROMPT_SCOPE_OVERVIEW: string = `【通解范围契约】
1. 本次请求一次性给出全部条目（通道或闸门），不是逐条请求。
2. 必须逐项覆盖：每一条通道 / 每一个闸门各占一个三级标题，标题内含编号与名称。
3. 禁止合并同类项跳过（例如「其余闸门都类似」）；禁止只挑「重点」写。
4. 每条 3–6 句：先说它在一般人身上的常态，再说在这张盘里的差异化表现，最后给一个可观察的场景。
5. 条目之间不要互相引用序号（「如上所述第 3 条」），保证任意一条被单独阅读时也成立。`

/* ── 段落取值与拼装 ───────────────────────────────────────── */

/** 档位 → 档位契约段 */
export function detailSegmentOf(detail: AiDetailMode): string {
  if (detail === 'full') return PROMPT_DETAIL_FULL
  if (detail === 'detailed') return PROMPT_DETAIL_DETAILED
  return PROMPT_DETAIL_CONCISE
}

/** 风格 → 风格段 */
export function styleSegmentOf(style: AiStyle): string {
  return style === 'plain' ? PROMPT_STYLE_PLAIN : PROMPT_STYLE_PRO
}

/** 融合类 scope：只做整合与新判断 */
const FUSION_SCOPES: ReadonlySet<string> = new Set([
  'full-fusion',
  'selection-fusion',
])

/** 通解类 scope：一次覆盖全部条目 */
const OVERVIEW_SCOPES: ReadonlySet<string> = new Set(['full-all-channels', 'full-all-gates'])

/** 分项类 scope：只写这一项 */
const ITEM_SCOPES: ReadonlySet<string> = new Set([
  'full-module',
  'full-trajectory',
  'full-dimension',
  'full-gate',
  'full-channel',
])

/**
 * 范围段：只有 融合 / 通解 / 分项 三类 scope 追加；
 * 单次整篇（unified / selection-one / single / gate / …）不追加——
 * 它们的范围已由入口契约完全描述，再追加会与「一次写完整篇」冲突。
 */
export function scopeSegmentOf(scope?: AiScope | string): string {
  if (!scope) return ''
  if (FUSION_SCOPES.has(scope)) return PROMPT_SCOPE_FUSION
  if (OVERVIEW_SCOPES.has(scope)) return PROMPT_SCOPE_OVERVIEW
  if (ITEM_SCOPES.has(scope)) return PROMPT_SCOPE_ITEM
  return ''
}

/** 生效的详细度：单点 scope 自 v3.0 起同样按所选档位生效，不再强制降级 */
export function resolveDetailMode(_scope: string, mode: AiDetailMode = 'concise'): AiDetailMode {
  if (mode === 'full') return 'full'
  return mode === 'detailed' ? 'detailed' : 'concise'
}

/**
 * 生效的表达风格：未指定时按「专业版」。
 *
 * 缺省 `pro` 的历史理由：v2.4.0 及之前没有风格开关，正文本身偏专业；缺省改成
 * `plain` 会让没接设置的旧调用点静默改变风格（用户以为「解读变味了」）。
 */
export function resolveStyle(style?: AiStyle): AiStyle {
  return style === 'plain' ? 'plain' : 'pro'
}

/** 勾选维度的中文标签串（入口 B 的 {DIMS}），按 READING_DIMENSIONS 固定顺序 */
export function dimsLabelText(dims?: ReadingDimKey[]): string {
  if (!dims || dims.length === 0) return ''
  const picked = READING_DIMENSIONS.filter((d) => dims.includes(d.key)).map((d) => d.label)
  return picked.join('、')
}

/** 白名单段里没有维度清单时的兜底文案（不能留空占位符给模型猜） */
const DIMS_PLACEHOLDER_FALLBACK = '（未提供维度清单，请以【用户选择】里的「维度」为准）'

/**
 * 渲染 `{DIMS}` 占位符：有维度清单就写中文标签串，没有就写兜底文案。
 *
 * 只有入口 B 的段落含该占位符；其它段落调用是空操作，可以统一走这里。
 */
function renderDimsPlaceholder(text: string, dims?: ReadingDimKey[]): string {
  if (!text.includes('{DIMS}')) return text
  const label = dimsLabelText(dims)
  return text.replace(/\{DIMS\}/g, label || DIMS_PLACEHOLDER_FALLBACK)
}

/**
 * 入口 → 入口契约段。
 *
 * `dims` 只对入口 B 生效：§3.3 要求「同一份维度串既写进 system 白名单段，
 * 也写进 user 的【用户选择】，两处必须一致」。
 */
export function entrySegmentOf(entry: AiEntry, dims?: ReadingDimKey[]): string {
  if (entry === 'full') return PROMPT_ENTRY_FULL
  if (entry === 'selection') return PROMPT_ENTRY_SELECTION
  return renderDimsPlaceholder(PROMPT_ENTRY_COMPOSITE, dims)
}

/**
 * 五段拼装：`[CORE, ENTRY, DETAIL, STYLE, SCOPE?].filter(Boolean).join('\n\n')`。
 *
 * 顺序不可调换（见文件头注释）；3 档 × 3 入口 × 2 风格 = 18 种组合两两不同，
 * 由 `tests/aiPromptLayers.test.ts` 锁定。
 */
export function systemPromptOf(ctx: SystemPromptContext): string {
  return [
    PROMPT_CORE,
    entrySegmentOf(ctx.entry, ctx.dims),
    detailSegmentOf(ctx.detail),
    styleSegmentOf(ctx.style),
    scopeSegmentOf(ctx.scope),
  ]
    .filter((part) => part.length > 0)
    .join(PROMPT_SECTION_SEPARATOR)
}

/* ── user 提示词（四段顺序与既有口径逐字不变）──────────────── */

const MODE_LABEL: Record<AiDetailMode, string> = {
  concise: '精简',
  detailed: '详细',
  full: '完整',
}

const ENTRY_LABEL: Record<AiEntry, string> = {
  full: 'A 全盘',
  composite: 'B 综合',
  selection: 'C 勾选',
}

const STYLE_LABEL: Record<AiStyle, string> = {
  plain: '零基础',
  pro: '专业',
}

/**
 * `buildUserPrompt` 的入参：与 `aiClient.AiExplainArgs` 结构兼容（宽入参），
 * 这样请求层可以原样传自己的 args，不必再造一份 DTO。
 */
export interface UserPromptContext {
  /** 缺省按 'composite'（v3.5.0 的综合解读就是单次整篇，语义等价） */
  entry?: AiEntry
  scope: AiScope | string
  ref?: string
  /** 【离线释义】正文 */
  offline: string
  /** 【盘面事实】正文 */
  chartSummary?: string
  detailMode?: AiDetailMode
  style?: AiStyle
  /** 方向标签，如「成长方向」 */
  angle?: string
  /** 入口 B 的白名单维度 */
  dims?: ReadingDimKey[]
}

/**
 * user 提示词：固定四段顺序（ARCH §2.6，与 v3.5.0 逐字保持一致）——
 * 【盘面事实】 → 【用户选择】 → 【离线释义】 → 【本次任务】。
 *
 * ★ 只扩充【用户选择】这一行的字段，四段的标签、顺序、各出现一次的语义不动：
 *   `aiBatchReading.ts` 有注释说明「档案名绝不能进 prompt」，否则同一张盘的
 *   手动生成与批量生成会产生不同 prompt → 缓存键分裂。
 */
export function buildUserPrompt(ctx: UserPromptContext): string {
  const mode = resolveDetailMode(ctx.scope, ctx.detailMode)
  const style = resolveStyle(ctx.style)
  const entry = ctx.entry ?? 'composite'
  const parts: string[] = []

  if (ctx.chartSummary?.trim()) {
    parts.push(`【盘面事实】\n${ctx.chartSummary.trim()}`)
  }
  const scopeLabel = ctx.ref ? `${ctx.scope} · ${ctx.ref}` : ctx.scope
  const dims = dimsLabelText(ctx.dims) || '不适用'
  parts.push(
    `【用户选择】入口：${ENTRY_LABEL[entry]}｜范围：${scopeLabel}｜维度：${dims}｜角度：${
      ctx.angle?.trim() || '综合解读'
    }｜档位：${MODE_LABEL[mode]}｜风格：${STYLE_LABEL[style]}`,
  )
  if (ctx.offline.trim()) parts.push(`【离线释义】\n${ctx.offline.trim()}`)
  parts.push(`【本次任务】${taskInstructionOf(entry, ctx.scope, ctx.angle)}`)
  return parts.join('\n\n')
}

/**
 * 【本次任务】的一句指令：按 scope 优先、再按入口兜底。
 *
 * ★ 不把 `ref` 写进提示词：`A1-core` / `C-ch:20-34` 这类是编排层的稳定键，
 *   对模型毫无意义，只会让它在正文里复述内部编号。给人看的定位交给 `angle` 标签。
 */
function taskInstructionOf(entry: AiEntry, scope: AiScope | string, angle?: string): string {
  if (scope === 'full-fusion') {
    return '请按 system 的输出契约，基于全部分项要点写一篇全盘融合分析与最终总结论。'
  }
  if (scope === 'selection-fusion') {
    return '请按 system 的输出契约，只写勾选项之间的关联汇总，不引入未勾选的结构。'
  }
  if (scope === 'full-all-channels' || scope === 'full-all-gates') {
    return '请按 system 的输出契约，一次性通解全部条目，逐项一个三级标题，不得合并跳过。'
  }
  if (scope.startsWith('full-')) {
    return angle?.trim()
      ? `请按 system 的输出契约，只写【用户选择】指定的这一项：${angle.trim()}，不要写整盘总论。`
      : '请按 system 的输出契约，只写【用户选择】指定的这一项，不要写整盘总论。'
  }
  if (entry === 'full') {
    return '请按 system 的入口契约，把【用户选择】里按固定顺序的模块写在同一篇里，模块间不写过渡语。'
  }
  if (entry === 'selection') {
    return '请按 system 的入口契约，先逐条解读每个勾选项，再写「关联汇总」。'
  }
  return '请按 system 的输出契约写一篇整体解读。'
}
