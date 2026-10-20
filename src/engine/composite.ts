/**
 * 合盘（Composite）：两盘叠加 → 每项标注 A 独有 / B 独有 / 共享。
 * 注意：sharedOnly 只是「渲染过滤」，不改动本文件产出的数据。
 */
import type {
  BodyGraph,
  CenterId,
  CenterState,
  ChannelActivation,
  CompositeResult,
  GateActivation,
  Ownership,
} from '../types/hd'
import { CENTER_IDS } from '../types/hd'
import { GATE_CENTER } from './gateData'
import { decideAuthority, decideDefinition, decideType } from './bodygraph'

function ownerOf(inA: boolean, inB: boolean): Ownership {
  if (inA && inB) return 'shared'
  return inA ? 'a' : 'b'
}

export function composite(a: BodyGraph, b: BodyGraph): CompositeResult {
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

  const aChannels = new Set(a.channels.map((c) => c.key))
  const bChannels = new Set(b.channels.map((c) => c.key))
  const allChannelKeys = [...new Set([...aChannels, ...bChannels])].sort((x, y) => {
    const [ax, ay] = x.split('-').map(Number)
    const [bx, by] = y.split('-').map(Number)
    return ax - bx || ay - by
  })

  const channels: Array<ChannelActivation & { owners: Ownership[] }> = allChannelKeys.map(
    (key) => {
      const [g1, g2] = key.split('-').map(Number)
      const owners: Ownership[] = []
      if (aChannels.has(key)) owners.push('a')
      if (bChannels.has(key)) owners.push('b')
      return { key, gates: [g1, g2] as [number, number], owners }
    },
  )

  // 合盘的中心定义：两盘通道叠加后的连通性（人类图合盘的通行口径）
  const mergedChannels: ChannelActivation[] = channels.map((c) => ({ key: c.key, gates: c.gates }))
  const definedCenters = new Set<CenterId>()
  for (const ch of mergedChannels) {
    definedCenters.add(GATE_CENTER[ch.gates[0]])
    definedCenters.add(GATE_CENTER[ch.gates[1]])
  }
  const centers: CenterState[] = CENTER_IDS.map((id) => ({ id, defined: definedCenters.has(id) }))

  const gateOwners: Record<number, Ownership> = {}
  for (const g of gates) gateOwners[g.gate] = ownerOf(aGates.has(g.gate), bGates.has(g.gate))

  const channelOwners: Record<string, Ownership> = {}
  for (const c of channels) channelOwners[c.key] = ownerOf(aChannels.has(c.key), bChannels.has(c.key))

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
  }
}

/** 合盘视图：把合并结果包装成可复用的 BodyGraph 形态，供同一套 SVG 组件渲染 */
export function mergedAsChart(result: CompositeResult): BodyGraph {
  const definedCenters = new Set(result.merged.centers.filter((c) => c.defined).map((c) => c.id))
  const mergedChannels: ChannelActivation[] = result.merged.channels.map((c) => ({
    key: c.key,
    gates: c.gates,
  }))
  const type = decideType(definedCenters, mergedChannels)
  return {
    type,
    strategy: '',
    authority: decideAuthority(definedCenters, mergedChannels),
    profile: `${result.a.profile} × ${result.b.profile}`,
    incarnationCross: '合盘',
    definition: decideDefinition(definedCenters, mergedChannels),
    centers: result.merged.centers,
    gates: result.merged.gates.map((g) => ({ gate: g.gate, stars: g.stars })),
    channels: mergedChannels,
    hangingGates: [],
    personality: [],
    design: [],
    meta: result.a.meta,
  }
}
