/**
 * 专业人类图合图引擎（依据 Ra 原版体系 + 开源工程通用逻辑重写）。
 *
 * 核心思想：合图 = 两人相遇后产生的第三个独立能量场。
 *   1. 两人【显意识 + 潜意识】全部激活闸门取并集；
 *   2. 跨两人互补的闸门自动生成完整通道；
 *   3. 以并集重新计算九大中心定义，并给出中心四象限（谁在影响谁）；
 *   4. 识别四类关系通道（关系动力学核心）：
 *        - 电磁通道 Electromagnetic：两人各持一端互补成通道 → 强烈吸引
 *        - 同伴通道 Companionship：两人各自自带同一条完整通道 → 高度同频
 *        - 主导通道 Dominance：单方拥有完整通道，另一方无相关闸门 → 单向输出
 *        - 妥协通道 Compromise：一方完整通道，另一方持单端悬挂闸门 → 关系迁就卡点
 *
 * 规范 §3.8：合盘**不输出**类型 / 权威 / 定义型 / 轮回交叉。
 * 这些属个体气场结论，关系场不存在「你们是投射者」这类判断。
 *
 * 纯函数、无副作用。
 */
import type {
  BodyGraph,
  CenterId,
  CenterQuadrant,
  CenterState,
  ChannelActivation,
  CompositeResult,
  GateActivation,
  Ownership,
  RelationshipChannel,
  RelationshipChannelType,
  StarPosition,
} from '../types/hd'
import { CENTER_IDS } from '../types/hd'
import { CHANNELS, GATE_CENTER } from './gateData'
import { decideAuthority, decideDefinition, decideType } from './bodygraph'

/** 合盘前置条件错误码 */
export class CompositeError extends Error {
  constructor(readonly code: 'SAME_PERSON') {
    super(code === 'SAME_PERSON' ? '合盘需要两位不同的人' : code)
    this.name = 'CompositeError'
  }
}

function ownerOf(inA: boolean, inB: boolean): Ownership {
  if (inA && inB) return 'shared'
  return inA ? 'a' : 'b'
}

/** 单条通道的关系动力学分类 */
function classifyChannel(
  gates: [number, number],
  aGates: Set<number>,
  bGates: Set<number>,
): { type: RelationshipChannelType | 'none'; holder?: 'a' | 'b' } {
  const [g1, g2] = gates
  const aFull = aGates.has(g1) && aGates.has(g2)
  const bFull = bGates.has(g1) && bGates.has(g2)

  if (aFull && bFull) return { type: 'companionship' }
  if (aFull || bFull) {
    const holder: 'a' | 'b' = aFull ? 'a' : 'b'
    const otherCount = aFull ? Number(bGates.has(g1)) + Number(bGates.has(g2)) : Number(aGates.has(g1)) + Number(aGates.has(g2))
    if (otherCount === 0) return { type: 'dominance', holder }
    return { type: 'compromise', holder }
  }
  // 两侧都不完整：跨两人互补 → 电磁
  const aSides = Number(aGates.has(g1)) + Number(aGates.has(g2))
  const bSides = Number(bGates.has(g1)) + Number(bGates.has(g2))
  if (aSides > 0 && bSides > 0 && aSides + bSides === 2 && aGates.has(g1) !== bGates.has(g1)) {
    return { type: 'electromagnetic' }
  }
  return { type: 'none' }
}

export interface CompositeOptions {
  /** 双方档案 id：相同时视为同一个人（规范 §3.8） */
  aId?: string
  bId?: string
}

export function composite(a: BodyGraph, b: BodyGraph, opts: CompositeOptions = {}): CompositeResult {
  // 前置条件：合盘必须发生在两个不同的个体之间。
  // 同一张盘叠加会令所有通道退化为"同伴"，产出体系上无意义的伪结论。
  // ① 同一对象引用；② 同一 Archive.id（副本/重算后对象不同但 id 相同）。
  if (a === b) throw new CompositeError('SAME_PERSON')
  if (opts.aId && opts.bId && opts.aId === opts.bId) {
    throw new CompositeError('SAME_PERSON')
  }

  const aGates = new Set(a.gates.map((g) => g.gate))
  const bGates = new Set(b.gates.map((g) => g.gate))
  const allGates = [...new Set([...aGates, ...bGates])].sort((x, y) => x - y)

  // 以「激活闸门并集」重算全部完整通道（跨两人互补闸门自动成通道）
  const unionChannelKeys: string[] = []
  for (const ch of CHANNELS) {
    if (allGates.includes(ch.gates[0]) && allGates.includes(ch.gates[1])) {
      unionChannelKeys.push(ch.key)
    }
  }
  unionChannelKeys.sort((x, y) => {
    const [ax, ay] = x.split('-').map(Number)
    const [bx, by] = y.split('-').map(Number)
    return ax - bx || ay - by
  })

  const aChannels = new Set(a.channels.map((c) => c.key))
  const bChannels = new Set(b.channels.map((c) => c.key))

  const channels: Array<ChannelActivation & { owners: Ownership[] }> = unionChannelKeys.map(
    (key) => {
      const [g1, g2] = key.split('-').map(Number)
      const owners: Ownership[] = []
      if (aChannels.has(key)) owners.push('a')
      if (bChannels.has(key)) owners.push('b')
      return { key, gates: [g1, g2] as [number, number], owners }
    },
  )

  // 合图中心定义：以两人激活并集重算连通性（专业合图口径）
  const unionChannels: ChannelActivation[] = channels.map((c) => ({ key: c.key, gates: c.gates }))
  const definedCenters = new Set<CenterId>()
  for (const ch of unionChannels) {
    definedCenters.add(GATE_CENTER[ch.gates[0]])
    definedCenters.add(GATE_CENTER[ch.gates[1]])
  }
  const centers: CenterState[] = CENTER_IDS.map((id) => ({ id, defined: definedCenters.has(id) }))

  // 合图闸门三态（规范 §3.5）：落在并集定义通道内 → in-channel，其余已激活闸门 → hanging
  const inUnionChannel = new Set<number>()
  for (const key of unionChannelKeys) {
    const [g1, g2] = key.split('-').map(Number)
    inUnionChannel.add(g1)
    inUnionChannel.add(g2)
  }
  const gates: Array<GateActivation & { owners: Ownership[] }> = allGates.map((gate) => {
    const owners: Ownership[] = []
    if (aGates.has(gate)) owners.push('a')
    if (bGates.has(gate)) owners.push('b')
    const stars = [
      ...new Set([
        ...(a.gates.find((g) => g.gate === gate)?.stars ?? []),
        ...(b.gates.find((g) => g.gate === gate)?.stars ?? []),
      ]),
    ]
    return {
      gate,
      stars,
      owners,
      state: inUnionChannel.has(gate) ? 'in-channel' : 'hanging',
    }
  })

  const gateOwners: Record<number, Ownership> = {}
  for (const g of gates) gateOwners[g.gate] = ownerOf(aGates.has(g.gate), bGates.has(g.gate))

  const channelOwners: Record<string, Ownership> = {}
  for (const c of channels) channelOwners[c.key] = ownerOf(aChannels.has(c.key), bChannels.has(c.key))

  // ── 四类关系通道识别 ──
  const relationshipChannels: RelationshipChannel[] = []
  for (const key of unionChannelKeys) {
    const [g1, g2] = key.split('-').map(Number)
    const { type, holder } = classifyChannel([g1, g2], aGates, bGates)
    if (type === 'none') continue
    relationshipChannels.push({
      key,
      gates: [g1, g2],
      type,
      gateOwners: [gateOwners[g1], gateOwners[g2]],
      holder,
    })
  }

  // ── 中心四象限：双方都定义 / 仅 A / 仅 B / 双方都开放 ──
  // 这是关系解读的核心：并集只说"合起来定义了哪些"，四象限才说"谁在影响谁"。
  // 注意：这里刻意不计算类型 / 权威 / 定义型 / 轮回交叉（规范 §3.8 禁止输出）。
  const aDefined = new Set(a.centers.filter((c) => c.defined).map((c) => c.id))
  const bDefined = new Set(b.centers.filter((c) => c.defined).map((c) => c.id))
  const centerQuadrant: CenterQuadrant[] = CENTER_IDS.map((id) => {
    const inA = aDefined.has(id)
    const inB = bDefined.has(id)
    const state: CenterQuadrant['state'] =
      inA && inB ? 'both' : inA ? 'onlyA' : inB ? 'onlyB' : 'open'
    return { id, state }
  })

  return {
    a,
    b,
    merged: { centers, gates, channels },
    gateOwners,
    channelOwners,
    sharedChannels: channels
      .filter((c) => c.owners.length === 2)
      .map((c) => ({ key: c.key, gates: c.gates })),
    sharedGates: gates.filter((g) => g.owners.length === 2).map((g) => g.gate),
    relationshipChannels,
    centerQuadrant,
  }
}

/**
 * 合盘视图：把合并结果包装成可复用的 BodyGraph 形态，供同一套 SVG 组件渲染。
 *
 * ⚠️ 仅渲染占位，不得展示：`type` / `authority` / `definition` 是为了满足
 * BodyGraph 类型契约而内部计算的占位值，**禁止**在合盘页面或 AI 文本中作为结论展示
 * （规范 §3.8）。它们不通过 `CompositeResult` 对外暴露。
 * `incarnationCross` 恒为空（关系没有轮回交叉）。
 */
export function mergedAsChart(result: CompositeResult): BodyGraph {
  const definedCenters = new Set(result.merged.centers.filter((c) => c.defined).map((c) => c.id))
  const mergedChannels: ChannelActivation[] = result.merged.channels.map((c) => ({
    key: c.key,
    gates: c.gates,
  }))
  // 仅渲染占位，不得展示
  const type = decideType(definedCenters, mergedChannels)
  return {
    type,
    strategy: '',
    authority: decideAuthority(definedCenters, mergedChannels),
    profile: `${result.a.profile} × ${result.b.profile}`,
    incarnationCross: '',
    definition: decideDefinition(definedCenters, mergedChannels),
    centers: result.merged.centers,
    gates: result.merged.gates.map((g) => ({ gate: g.gate, stars: g.stars, state: g.state })),
    channels: mergedChannels,
    hangingGates: result.merged.gates.filter((g) => g.state === 'hanging').map((g) => g.gate),
    personality: [],
    design: [],
    meta: result.a.meta,
  }
}
