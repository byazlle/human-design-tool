/**
 * 人体图推导：激活闸门 → 通道 → 中心 → 类型 / 权威 / 人生角色 / 定义型。
 * 规则来源：Jovian Archive 标准（与 rave-engine 一致），纯函数、无副作用。
 */
import {
  CENTER_IDS,
  type Authority,
  type BodyGraph,
  type CenterId,
  type CenterState,
  type ChannelActivation,
  type DefinitionKind,
  type GateActivation,
  type HDType,
  type Planet,
  type StarPosition,
} from '../types/hd'
import { CHANNELS, GATE_CENTER, channelKey } from './gateData'
import { mapLongitude } from './mandala'
import {
  eclipticLongitude,
  findPreviousSunLongitude,
  sunLongitude,
} from './ephemeris'
import { zonedToUtc } from './time'
import type { BirthInput } from '../types/hd'

/** 人类图参与计算的 13 个天体（地球=太阳+180，南交点=北交点+180） */
const BODY_LIST: Array<{ planet: Planet; source: 'Sun' | 'NorthNode' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto'; mirror?: 180 }> = [
  { planet: 'Sun', source: 'Sun' },
  { planet: 'Earth', source: 'Sun', mirror: 180 },
  { planet: 'Moon', source: 'Moon' },
  { planet: 'NorthNode', source: 'NorthNode' },
  { planet: 'SouthNode', source: 'NorthNode', mirror: 180 },
  { planet: 'Mercury', source: 'Mercury' },
  { planet: 'Venus', source: 'Venus' },
  { planet: 'Mars', source: 'Mars' },
  { planet: 'Jupiter', source: 'Jupiter' },
  { planet: 'Saturn', source: 'Saturn' },
  { planet: 'Uranus', source: 'Uranus' },
  { planet: 'Neptune', source: 'Neptune' },
  { planet: 'Pluto', source: 'Pluto' },
]

const MOTOR_CENTERS: CenterId[] = ['sacral', 'heart', 'solar', 'root']

function normalize(deg: number): number {
  const out = deg % 360
  return out < 0 ? out + 360 : out
}

/** 计算某一时刻 13 个天体的落点 */
export function computeStream(date: Date): StarPosition[] {
  const positions: StarPosition[] = []
  for (const body of BODY_LIST) {
    const raw = eclipticLongitude(body.source, date)
    const longitude = normalize(body.mirror ? raw + body.mirror : raw)
    const pos = mapLongitude(longitude)
    positions.push({
      planet: body.planet,
      longitude,
      gate: pos.gate,
      line: pos.line,
      color: pos.color,
      tone: pos.tone,
      base: pos.base,
    })
  }
  return positions
}

function buildAdjacency(
  definedCenters: Set<CenterId>,
  channels: ChannelActivation[],
): Map<CenterId, Set<CenterId>> {
  const adj = new Map<CenterId, Set<CenterId>>()
  for (const c of definedCenters) adj.set(c, new Set())
  for (const ch of channels) {
    const [a, b] = ch.gates
    const ca = GATE_CENTER[a]
    const cb = GATE_CENTER[b]
    if (adj.has(ca) && adj.has(cb)) {
      adj.get(ca)!.add(cb)
      adj.get(cb)!.add(ca)
    }
  }
  return adj
}

/** BFS：从某组起点能否到达喉咙中心 */
function reachesThroat(
  starts: CenterId[],
  definedCenters: Set<CenterId>,
  channels: ChannelActivation[],
): boolean {
  if (!definedCenters.has('throat')) return false
  const adj = buildAdjacency(definedCenters, channels)
  const seen = new Set<CenterId>(starts)
  const queue = [...starts]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === 'throat') return true
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return false
}

export function decideType(
  definedCenters: Set<CenterId>,
  channels: ChannelActivation[],
): HDType {
  if (definedCenters.size === 0) return 'Reflector'
  const motors = MOTOR_CENTERS.filter((m) => definedCenters.has(m))
  const motorToThroat = reachesThroat(motors, definedCenters, channels)
  const sacralDefined = definedCenters.has('sacral')

  // 骶骨连到喉咙（含经其他中心中转）= 显化生产者；骶骨定义但无动力连喉 = 生产者
  if (sacralDefined) {
    const sacralToThroat = reachesThroat(['sacral'], definedCenters, channels)
    if (sacralToThroat) return 'ManifestingGenerator'
    return motorToThroat ? 'ManifestingGenerator' : 'Generator'
  }
  return motorToThroat ? 'Manifestor' : 'Projector'
}

export function decideAuthority(
  definedCenters: Set<CenterId>,
  channels: ChannelActivation[],
): Authority {
  if (definedCenters.size === 0) return 'Lunar'
  if (definedCenters.has('solar')) return 'Emotional'
  if (definedCenters.has('sacral')) return 'Sacral'
  if (definedCenters.has('spleen')) return 'Splenic'
  if (definedCenters.has('heart')) return 'Ego'
  if (definedCenters.has('g') && reachesThroat(['g'], definedCenters, channels)) {
    return 'SelfProjected'
  }
  return 'Mental'
}

/** 定义型：已定义中心被通道分成几个互不连通的集团 */
export function decideDefinition(
  definedCenters: Set<CenterId>,
  channels: ChannelActivation[],
): DefinitionKind {
  const count = definedCenters.size
  if (count === 0) return 'NoDefinition'
  const adj = buildAdjacency(definedCenters, channels)
  const seen = new Set<CenterId>()
  let groups = 0
  for (const start of definedCenters) {
    if (seen.has(start)) continue
    groups += 1
    const queue = [start]
    seen.add(start)
    while (queue.length) {
      const cur = queue.shift()!
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
  }
  if (groups <= 1) return 'Single'
  if (groups === 2) return 'Split'
  if (groups === 3) return 'TripleSplit'
  return 'QuadrupleSplit'
}

const STRATEGY: Record<HDType, string> = {
  Manifestor: '行动前告知（Inform）',
  Generator: '等待回应（Wait to Respond）',
  ManifestingGenerator: '先回应，再告知（Respond then Inform）',
  Projector: '等待邀请（Wait for the Invitation）',
  Reflector: '等待一个完整的月亮周期（约 28 天）',
}

/**
 * 轮回交叉：由人格太阳/地球 + 设计太阳/地球四闸门构成。
 * 角度由人格太阳爻位决定：1–3 右角度，4/1 并列，5–6 左角度。
 * 注：192 个交叉的专有名称属于注册资料，本项目仅给出结构（四闸门 + 角度），不臆造名称。
 */
export function decideCross(
  personality: StarPosition[],
  design: StarPosition[],
  profile: string,
): string {
  const pSun = personality.find((p) => p.planet === 'Sun')!
  const pEarth = personality.find((p) => p.planet === 'Earth')!
  const dSun = design.find((p) => p.planet === 'Sun')!
  const dEarth = design.find((p) => p.planet === 'Earth')!
  const [pl] = profile.split('/').map(Number)

  let angle = '右角度'
  if (profile === '4/1') angle = '并列'
  else if (pl >= 5) angle = '左角度'

  return `${angle}交叉 · ${pSun.gate}/${dSun.gate} | ${pEarth.gate}/${dEarth.gate}`
}

export interface GateDetailEntry {
  gate: number
  personality: Planet[]
  design: Planet[]
}

function computeGraph(
  personality: StarPosition[],
  design: StarPosition[],
): Omit<BodyGraph, 'meta'> {
  const activated = new Set<number>()
  const gateDetail = new Map<number, GateDetailEntry>()

  for (const p of personality) {
    activated.add(p.gate)
    const entry = gateDetail.get(p.gate) ?? { gate: p.gate, personality: [], design: [] }
    entry.personality.push(p.planet)
    gateDetail.set(p.gate, entry)
  }
  for (const p of design) {
    activated.add(p.gate)
    const entry = gateDetail.get(p.gate) ?? { gate: p.gate, personality: [], design: [] }
    entry.design.push(p.planet)
    gateDetail.set(p.gate, entry)
  }

  const definedChannels: ChannelActivation[] = []
  for (const ch of CHANNELS) {
    if (activated.has(ch.gates[0]) && activated.has(ch.gates[1])) {
      definedChannels.push({ key: ch.key, gates: ch.gates })
    }
  }

  const definedCenters = new Set<CenterId>()
  for (const ch of definedChannels) {
    definedCenters.add(GATE_CENTER[ch.gates[0]])
    definedCenters.add(GATE_CENTER[ch.gates[1]])
  }

  const centers: CenterState[] = CENTER_IDS.map((id) => ({
    id,
    defined: definedCenters.has(id),
  }))

  const gates: GateActivation[] = [...activated]
    .sort((a, b) => a - b)
    .map((gate) => ({
      gate,
      stars: [...(gateDetail.get(gate)?.personality ?? []), ...(gateDetail.get(gate)?.design ?? [])],
    }))

  const inChannel = new Set<number>()
  for (const ch of definedChannels) {
    inChannel.add(ch.gates[0])
    inChannel.add(ch.gates[1])
  }
  const hangingGates = [...activated].filter((g) => !inChannel.has(g)).sort((a, b) => a - b)

  const pSun = personality.find((p) => p.planet === 'Sun')!
  const dSun = design.find((p) => p.planet === 'Sun')!
  const profile = `${pSun.line}/${dSun.line}`

  return {
    type: decideType(definedCenters, definedChannels),
    strategy: STRATEGY[decideType(definedCenters, definedChannels)],
    authority: decideAuthority(definedCenters, definedChannels),
    profile,
    incarnationCross: decideCross(personality, design, profile),
    definition: decideDefinition(definedCenters, definedChannels),
    centers,
    gates,
    channels: definedChannels,
    hangingGates,
    personality,
    design,
  }
}

/** 通过闸门反查通道 key（UI 用） */
export function channelsOfGate(gate: number): string[] {
  return CHANNELS.filter((c) => c.gates.includes(gate)).map((c) => c.key)
}

export interface ComputeOptions {
  /** 允许外部直接给 UTC 时刻（测试/高级用） */
  skipTimezone?: false
}

/**
 * 主入口：出生信息 → 完整人体图。
 * Design 时刻 = 太阳视黄经比出生时刻少 88° 的时刻（出生前约 88 天）。
 */
export function computeChart(input: BirthInput): BodyGraph {
  const { date: birthUtc } = zonedToUtc(
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
    input.timezone,
  )

  const designUtc = findPreviousSunLongitude(birthUtc, 88)

  const personality = computeStream(birthUtc)
  const design = computeStream(designUtc)
  const graph = computeGraph(personality, design)

  return {
    ...graph,
    meta: {
      personalityTime: birthUtc.toISOString(),
      designTime: designUtc.toISOString(),
      personalitySun: sunLongitude(birthUtc),
      designSun: sunLongitude(designUtc),
    },
  }
}

/** 直接用 UTC 时刻计算（供测试与高级用法） */
export function computeChartFromUtc(utc: Date): BodyGraph {
  const designUtc = findPreviousSunLongitude(utc, 88)
  const personality = computeStream(utc)
  const design = computeStream(designUtc)
  const graph = computeGraph(personality, design)
  return {
    ...graph,
    meta: {
      personalityTime: utc.toISOString(),
      designTime: designUtc.toISOString(),
      personalitySun: sunLongitude(utc),
      designSun: sunLongitude(designUtc),
    },
  }
}

export { channelKey, GATE_CENTER }
