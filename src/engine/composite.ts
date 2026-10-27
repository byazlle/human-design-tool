/**
 * 专业人类图合图引擎（依据 Ra 原版体系 + 开源工程通用逻辑重写）。
 *
 * 核心思想：合图 = 两人相遇后产生的第三个独立能量场。
 *   1. 两人【显意识 + 潜意识】全部激活闸门取并集；
 *   2. 跨两人互补的闸门自动生成完整通道；
 *   3. 以并集重新计算：九大中心定义、能量类型、分段定义、内在权威、轮回交叉；
 *   4. 识别四类关系通道（关系动力学核心）：
 *        - 电磁通道 Electromagnetic：两人各持一端互补成通道 → 强烈吸引
 *        - 同伴通道 Companionship：两人各自自带同一条完整通道 → 高度同频
 *        - 主导通道 Dominance：单方拥有完整通道，另一方无相关闸门 → 单向输出
 *        - 妥协通道 Compromise：一方完整通道，另一方持单端悬挂闸门 → 关系迁就卡点
 *
 * 纯函数、无副作用。
 */
import type {
  Authority,
  BodyGraph,
  CenterId,
  CenterQuadrant,
  CenterState,
  ChannelActivation,
  CompositeResult,
  DefinitionKind,
  GateActivation,
  HDType,
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

export function composite(a: BodyGraph, b: BodyGraph): CompositeResult {
  // 前置条件：合盘必须发生在两个不同的个体之间。
  // 同一张盘叠加会令所有通道退化为"同伴"，产出体系上无意义的伪结论。
  if (a === b) throw new CompositeError('SAME_PERSON')

  const aGates = new Set(a.gates.map((g) => g.gate))
  const bGates = new Set(b.gates.map((g) => g.gate))
  const allGates = [...new Set([...aGates, ...bGates])].sort((x, y) => x - y)

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
    return { gate, stars, owners }
  })

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

  // ── 合图第三个能量场：类型 / 定义 / 权威 ──
  // 注意：不输出轮回交叉（交叉由个体的 人格/设计 太阳-地球 四闸门构成，
  // 关系合图不存在"第三个交叉"）。
  const type = decideType(definedCenters, unionChannels)
  const authority = decideAuthority(definedCenters, unionChannels)
  const definition = decideDefinition(definedCenters, unionChannels)

  // ── 中心四象限：双方都定义 / 仅 A / 仅 B / 双方都开放 ──
  // 这是关系解读的核心：并集只说"合起来定义了哪些"，四象限才说"谁在影响谁"。
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
    composite: {
      type,
      authority,
      definition,
      centers,
      strategy: '',
    },
  }
}

/**
 * 合盘视图：把合并结果包装成可复用的 BodyGraph 形态，供同一套 SVG 组件渲染。
 *
 * 注意：这里只用于「渲染」，不承载任何关系结论。
 * incarnationCross 恒为空（关系没有轮回交叉）；type/authority 仅供兼容旧渲染模型，
 * 合盘页面不得展示（见 docs/review 业务流程审计 PF-003）。
 */
export function mergedAsChart(result: CompositeResult): BodyGraph {
  const definedCenters = new Set(result.merged.centers.filter((c) => c.defined).map((c) => c.id))
  const mergedChannels: ChannelActivation[] = result.merged.channels.map((c) => ({
    key: c.key,
    gates: c.gates,
  }))
  const type = result.composite?.type ?? decideType(definedCenters, mergedChannels)
  return {
    type,
    strategy: '',
    authority: result.composite?.authority ?? decideAuthority(definedCenters, mergedChannels),
    profile: `${result.a.profile} × ${result.b.profile}`,
    incarnationCross: '',
    definition: result.composite?.definition ?? decideDefinition(definedCenters, mergedChannels),
    centers: result.merged.centers,
    gates: result.merged.gates.map((g) => ({ gate: g.gate, stars: g.stars })),
    channels: mergedChannels,
    hangingGates: [],
    personality: [],
    design: [],
    meta: result.a.meta,
  }
}
