/**
 * 回路（Circuitry）参考数据：36 条通道按能量目的归组。
 *
 * 口径来源：Jovian Archive / Ra Uru Hu 的回路分类，与主流教材一致：
 * - 三大回路组：个体 Individual（赋能 / 突变）、集体 Collective（分享，俗称社会回路）、
 *   部落 Tribal（支持 / 资源 / 盟约）；
 * - 六个基础子回路：知晓 Knowing、居中 Centering、理解（逻辑）Understanding、
 *   感知（抽象）Sensing、意志（自我）Ego、防御 Defense；
 * - 整合通道 Integration（10-20 / 10-57 / 20-34 / 34-57）**不是一个回路**，
 *   而是个体组内的一个通道群（四条通道在 G / 喉咙 / 骶骨 / 脾之间围成小回路），
 *   本应用单列展示，不计入「六个基础子回路」。
 *
 * 合计：个体 15 条（知晓 9 + 居中 2 + 整合 4）、集体 14 条（逻辑 7 + 抽象 7）、
 * 部落 7 条（意志 5 + 防御 2）= 36 条，每条通道恰好归属一处。
 *
 * ★ 已知体系分歧（不由本模块裁决，只在 UI 里如实标注）：
 *   部分软件 / 教材把 10-34、20-57 也算进「整合」，或把整合四条并入「居中」，
 *   于是出现「居中 7 条 / 知晓 8 条」的算法。本应用按 Jovian 标准：
 *   10-34 属居中、20-57 属知晓。
 *
 * 回路只是「能量目的」的补充视角，不参与类型 / 策略 / 权威 / 定义 / 通道判定，
 * 也不能用来「判定人格」。统计只按已定义通道计数。
 */

export type CircuitGroupId = 'individual' | 'collective' | 'tribal'

export type CircuitId =
  | 'knowing'
  | 'centering'
  | 'integration'
  | 'understanding'
  | 'sensing'
  | 'ego'
  | 'defense'

export interface CircuitGroupDef {
  id: CircuitGroupId
  label: string
  en: string
  /** 俗称 / 别名（集体常被叫作社会回路） */
  alias?: string
  theme: string
  /** 这一组通道「为谁服务」 */
  summary: string
  /** 能量形态 */
  energy: string
  gift: string
  /** 常见卡点 / 非自我表现 */
  shadow: string
  /** 落地建议 */
  live: string
}

export interface CircuitDef {
  id: CircuitId
  group: CircuitGroupId
  label: string
  en: string
  theme: string
  /** 是否属于「六个基础子回路」；整合通道为 false */
  base: boolean
  /** 该子回路的全部通道（无序，升序书写） */
  channels: string[]
  /** 机制说明 */
  essence: string
  gift: string
  shadow: string
  live: string
}

export const CIRCUIT_GROUPS: CircuitGroupDef[] = [
  {
    id: 'individual',
    label: '个体回路组',
    en: 'Individual',
    theme: '赋能 · 突变',
    summary:
      '不服务群体、也不服务部落：个体能量先让自己成为自己，再以示范（而不是说服）影响别人。它的任务是带来「不一样」。',
    energy: '脉冲式——来的时候很猛，停的时候彻底；低潮期不是故障。',
    gift: '原创性、突变式洞见、不解释也能传递的频率。',
    shadow: '把忧郁和情绪起伏当成坏掉；急着让别人理解，洞见反而弹回去。',
    live: '按自己的节律工作，低潮期休息而不是硬撑；东西做完再分享，不必直播过程。',
  },
  {
    id: 'collective',
    label: '集体回路组',
    en: 'Collective',
    alias: '社会回路',
    theme: '分享',
    summary:
      '面向「全人类」，不限亲疏：把经验与模式整理成可传递的知识，交给可能永远不会见面的人使用。',
    energy: '周期性——逻辑侧反复验证、抽象侧反复回味，都需要时间。',
    gift: '归纳、抽象、把体验压成可复用的模式。',
    shadow: '用道理代替体验；为了「正确」反复验证到无法行动。',
    live: '逻辑侧负责推演未来、抽象侧负责消化过去；别人用不用你的结论，是别人的事。',
  },
  {
    id: 'tribal',
    label: '部落回路组',
    en: 'Tribal',
    theme: '支持 · 资源 · 盟约',
    summary:
      '只管「我们这几个」：家人、伙伴、小圈子。它按亲疏与互惠运作，不讲普世道理，讲的是谁给了什么、什么时候还。',
    energy: '实做型——力气用在具体的人与具体的资源上。',
    gift: '具体的照顾、可执行的交换、忠诚。',
    shadow: '用付出换归属；以「为你好」越界；把交易说成感情。',
    live: '把约定说出口：谁给什么、什么时候给。亲密的账与资源的账分开算。',
  },
]

export const CIRCUITS: CircuitDef[] = [
  {
    id: 'knowing',
    group: 'individual',
    label: '知晓回路',
    en: 'Knowing',
    theme: '内在洞见 · 原创认知',
    base: true,
    channels: ['1-8', '2-14', '3-60', '12-22', '20-57', '23-43', '24-61', '28-38', '39-55'],
    essence:
      '从根部的突变脉动一路打到喉咙的表达：先有一种说不清的「知道」，再慢慢找到语言。副产品是忧郁——知道得比说得出早，所以常常不被理解。',
    gift: '突变式洞见、原创表达、把新东西带进人类基因库。',
    shadow: '急着被认可；低谷时自我否定；把「别人听不懂」当成自己的失败。',
    live: '等洞见成形再开口；接受「现在没人需要它」这件事，它值不值得不靠当下反馈决定。',
  },
  {
    id: 'centering',
    group: 'individual',
    label: '居中回路',
    en: 'Centering',
    theme: '自我认同 · 自我对齐',
    base: true,
    channels: ['10-34', '25-51'],
    essence:
      '两条通道都经过 G 中心：一条把意志接上身份（25-51），一条把骶骨力量接上身份（10-34）。主题是「先确认我是谁，再用力」，不解释、不征求同意。',
    gift: '自我对齐后的行动力；敢第一个跳进未知。',
    shadow: '为证明自己而行动；把固执当坚定。',
    live: '先问「这是不是我要的」，再决定要不要用力；用力本身不是答案。',
  },
  {
    id: 'integration',
    group: 'individual',
    label: '整合通道',
    en: 'Integration',
    theme: '当下直觉 · 独立生存 · 自我赋能',
    base: false,
    channels: ['10-20', '10-57', '20-34', '34-57'],
    essence:
      '四条通道在 G、喉咙、骶骨、脾之间围成一个小回路，主题是「靠自己活下去」：当下的直觉（脾）、当下的行动（喉咙）、当下的力量（骶骨）与身份（G）连成一体。',
    gift: '临场反应、自我修复、独立生存的能力。',
    shadow: '过度自足、拒绝求助；用忙碌掩盖不安。',
    live: '相信身体在当下的第一反应；同时允许别人参与，自足不等于封闭。',
  },
  {
    id: 'understanding',
    group: 'collective',
    label: '理解回路（逻辑）',
    en: 'Understanding / Logic',
    theme: '可验证的模式 · 面向未来',
    base: true,
    channels: ['4-63', '5-15', '7-31', '9-52', '16-48', '17-62', '18-58'],
    essence:
      '用怀疑与验证把经验压成公式：找到能重复成立的规律，再用它改进下一步。它要的是「对不对」，不是「好不好听」。',
    gift: '逻辑推演、纠错、可复用的方法。',
    shadow: '怀疑到瘫痪；用「还没验证完」逃避行动。',
    live: '允许答案分版本：先落地再修正，比等到完美更接近正确。',
  },
  {
    id: 'sensing',
    group: 'collective',
    label: '感知回路（抽象）',
    en: 'Sensing / Abstract',
    theme: '经验沉淀 · 面向过去',
    base: true,
    channels: ['11-56', '13-33', '29-46', '30-41', '35-36', '42-53', '47-64'],
    essence:
      '通过体验、故事与情绪记忆，把发生过的事反刍成意义。它要的是「这段经历到底在说什么」，而答案总在事后才到。',
    gift: '叙事、共情、从经历里提炼意义。',
    shadow: '困在回忆里反复重播；把感受当成事实。',
    live: '讲出来、写下来，让一个周期走完；还在体验中就急着解释，往往解释错。',
  },
  {
    id: 'ego',
    group: 'tribal',
    label: '意志（自我）回路',
    en: 'Ego / Will',
    theme: '资源交易 · 约定 · 物质保障',
    base: true,
    channels: ['19-49', '21-45', '26-44', '32-54', '37-40'],
    essence:
      '部落的物质骨架：谁掌握资源、谁值得信任、承诺能不能兑现。它的语言是「值不值」与「说好了没有」，意志力是真的，但是潮汐式的——给完必须休息。',
    gift: '谈条件、守约定、把价值变现。',
    shadow: '用价值衡量一切关系；答应太多来证明自己。',
    live: '承诺前先算清楚自己的力气；用对方付出过的「货币」去道谢。',
  },
  {
    id: 'defense',
    group: 'tribal',
    label: '防御回路',
    en: 'Defense',
    theme: '养育 · 亲密 · 血脉延续',
    base: true,
    channels: ['6-59', '27-50'],
    essence:
      '最小的回路，只两条通道，却管着最原始的事：让部落活下去——通过亲密（6-59）与照顾（27-50）。它关乎边界、滋养与守护。',
    gift: '具体的照顾；亲密里的创造力。',
    shadow: '过度付出换归属；界限不清导致耗竭。',
    live: '先确认对方要不要，再决定给多少；照顾别人之前先看自己的余量。',
  },
]

/** 通道 → 子回路（由 CIRCUITS 反推，避免两处手写漂移） */
export const CHANNEL_CIRCUIT: Record<string, CircuitId> = (() => {
  const map: Record<string, CircuitId> = {}
  for (const c of CIRCUITS) for (const key of c.channels) map[key] = c.id
  return map
})()

export const CIRCUIT_BY_ID: Record<CircuitId, CircuitDef> = Object.fromEntries(
  CIRCUITS.map((c) => [c.id, c]),
) as Record<CircuitId, CircuitDef>

export const GROUP_BY_ID: Record<CircuitGroupId, CircuitGroupDef> = Object.fromEntries(
  CIRCUIT_GROUPS.map((g) => [g.id, g]),
) as Record<CircuitGroupId, CircuitGroupDef>

export function circuitOfChannel(key: string): CircuitId | null {
  return CHANNEL_CIRCUIT[key] ?? null
}

export function groupOfChannel(key: string): CircuitGroupId | null {
  const id = circuitOfChannel(key)
  return id ? CIRCUIT_BY_ID[id].group : null
}

export function groupChannels(group: CircuitGroupId): string[] {
  return CIRCUITS.filter((c) => c.group === group).flatMap((c) => c.channels)
}

export interface CircuitStat {
  id: CircuitId
  group: CircuitGroupId
  label: string
  theme: string
  base: boolean
  /** 机制说明（本盘命中该子回路时才展示） */
  essence: string
  gift: string
  shadow: string
  /** 该子回路通道总数 */
  total: number
  /** 本盘已定义的通道（保持 CIRCUITS 内的书写顺序） */
  active: string[]
  /** 本盘未定义的通道 */
  idle: string[]
  /** 子回路覆盖率 = active / total */
  coverage: number
}

export interface CircuitGroupStat {
  id: CircuitGroupId
  label: string
  alias?: string
  theme: string
  /** 该组通道总数（个体 15 / 集体 14 / 部落 7） */
  total: number
  /** 本盘已定义通道数 */
  count: number
  /** 在本盘已定义通道里的占比 = count / 本盘通道总数 */
  share: number
  /** 组覆盖率 = count / total */
  coverage: number
  circuits: CircuitStat[]
  /** 本盘实际激活的通道（跨子回路，按子回路顺序） */
  active: string[]
}

export interface CircuitryAnalysis {
  /** 本盘已定义通道总数 */
  total: number
  groups: CircuitGroupStat[]
  /** 本盘通道条数最多的组；并列或为空时为 null */
  dominantGroup: CircuitGroupId | null
  /** 本盘通道条数最多的子回路；并列或为空时为 null */
  dominantCircuit: CircuitId | null
  /** 是否存在并列第一（此时不给「主导」结论） */
  tied: boolean
  /** 不在回路表中的通道（数据异常时暴露，而不是静默归零） */
  unknown: string[]
}

function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0
}

function pickDominant<T extends string>(entries: Array<{ id: T; count: number }>): {
  id: T | null
  tied: boolean
} {
  const positive = entries.filter((e) => e.count > 0)
  if (!positive.length) return { id: null, tied: false }
  const max = Math.max(...positive.map((e) => e.count))
  const top = positive.filter((e) => e.count === max)
  return top.length === 1 ? { id: top[0].id, tied: false } : { id: null, tied: true }
}

/**
 * 统计一张盘的回路分布。
 *
 * @param channelKeys 已定义通道的 key（如 `['1-8','20-57']`），顺序无关。
 * 只做计数，不做任何「你是某某人」的判定。
 */
export function analyzeCircuitry(channelKeys: readonly string[]): CircuitryAnalysis {
  const defined = new Set(channelKeys)
  const total = defined.size

  const unknown = [...defined].filter((k) => !CHANNEL_CIRCUIT[k])

  const circuits: CircuitStat[] = CIRCUITS.map((c) => {
    const active = c.channels.filter((k) => defined.has(k))
    return {
      id: c.id,
      group: c.group,
      label: c.label,
      theme: c.theme,
      base: c.base,
      essence: c.essence,
      gift: c.gift,
      shadow: c.shadow,
      total: c.channels.length,
      active,
      idle: c.channels.filter((k) => !defined.has(k)),
      coverage: pct(active.length, c.channels.length),
    }
  })

  const groups: CircuitGroupStat[] = CIRCUIT_GROUPS.map((g) => {
    const list = circuits.filter((c) => c.group === g.id)
    const count = list.reduce((n, c) => n + c.active.length, 0)
    const groupTotal = list.reduce((n, c) => n + c.total, 0)
    return {
      id: g.id,
      label: g.label,
      alias: g.alias,
      theme: g.theme,
      total: groupTotal,
      count,
      share: pct(count, total),
      coverage: pct(count, groupTotal),
      circuits: list,
      active: list.flatMap((c) => c.active),
    }
  })

  const groupTop = pickDominant(groups.map((g) => ({ id: g.id, count: g.count })))
  const circuitTop = pickDominant(circuits.map((c) => ({ id: c.id, count: c.active.length })))

  return {
    total,
    groups,
    dominantGroup: groupTop.id,
    dominantCircuit: circuitTop.id,
    tied: groupTop.tied,
    unknown,
  }
}

/** 回路分布的单行摘要（供 AI 事实块 / 面板副标题复用，口径只写一遍） */
export function circuitryBrief(a: CircuitryAnalysis): string {
  if (!a.total) return '回路分布：本盘没有形成完整通道，回路暂时无法统计'
  const parts = a.groups
    .filter((g) => g.count > 0)
    .map((g) => {
      const subs = g.circuits
        .filter((c) => c.active.length)
        .map((c) => `${c.label.replace(/回路|通道/g, '')} ${c.active.length}`)
        .join('、')
      return `${g.label.replace('回路组', '')} ${g.count} 条（${subs}）`
    })
  const head = parts.length ? parts.join('；') : '无'
  const lead = a.tied
    ? '各组并列'
    : a.dominantGroup
      ? `主导=${GROUP_BY_ID[a.dominantGroup].label.replace('回路组', '')}`
      : '无'
  const cover = a.groups
    .map((g) => `${g.label.replace('回路组', '')} ${g.count}/${g.total}`)
    .join('、')
  return `回路分布：${head}｜${lead}｜覆盖度 ${cover}`
}

/** 口径说明（UI 与文档共用同一句，避免两处说法不一致） */
export const CIRCUIT_NOTE =
  '回路是「能量目的」的分组视角，只按已定义通道计数，不参与类型 / 策略 / 权威 / 定义 / 通道的判定，也不代表人格局限；一张图可以同时拥有多组回路能量。整合通道严格口径下不是一个回路，而是个体回路组内的通道群；部分软件 / 教材把 10-34、20-57 也算进整合，或把整合并入居中回路（于是写成「居中 7 条」），本应用统一按 Jovian 标准：10-34 属居中、20-57 属知晓。'
