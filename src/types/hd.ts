/**
 * 人类图领域类型（与 COMPONENTS.md §3 契约保持一致，向后兼容扩展）
 */

export type Planet =
  | 'Sun'
  | 'Earth'
  | 'Moon'
  | 'NorthNode'
  | 'SouthNode'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'

export const PLANETS: Planet[] = [
  'Sun',
  'Earth',
  'Moon',
  'NorthNode',
  'SouthNode',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
]

export const PLANET_LABELS: Record<Planet, string> = {
  Sun: '太阳',
  Earth: '地球',
  Moon: '月亮',
  NorthNode: '北交点',
  SouthNode: '南交点',
  Mercury: '水星',
  Venus: '金星',
  Mars: '火星',
  Jupiter: '木星',
  Saturn: '土星',
  Uranus: '天王星',
  Neptune: '海王星',
  Pluto: '冥王星',
}

export type CenterId =
  | 'head'
  | 'ajna'
  | 'throat'
  | 'g'
  | 'heart'
  | 'sacral'
  | 'spleen'
  | 'solar'
  | 'root'

/**
 * AI 解读详细度（规范 `docs/spec/AI-PROMPT-v2.0.md` §2 / §3 / §5）：
 * - `concise`：600–900 字、5 个固定视角；
 * - `detailed`：1800–3000 字、8 节 + 一页速记；
 * - `full`：多轮分步完整版（八大维度 + 逐闸门 + 逐通道 + 全盘融合），整套 15000–25000 字。
 *
 * v3.0 起解除「单点强制精简」：单独选闸门 / 通道 / 中心时同样按所选档位生效（用户 Q3.3）。
 */
export type AiDetailMode = 'concise' | 'detailed' | 'full'

/** 完整版多轮编排的执行方式：串行 / 并发（并发失败时自动转串行，用户 Q3.4） */
export type AiStepMode = 'serial' | 'parallel'

export const CENTER_IDS: CenterId[] = [
  'head',
  'ajna',
  'throat',
  'g',
  'heart',
  'spleen',
  'sacral',
  'solar',
  'root',
]

export const CENTER_LABELS: Record<CenterId, string> = {
  head: '头顶中心',
  ajna: '眉心中心',
  throat: '喉咙中心',
  g: 'G 中心',
  heart: '心（意志）中心',
  spleen: '脾中心',
  sacral: '骶骨中心',
  solar: '情绪（太阳神经丛）中心',
  root: '根中心',
}

export type HDType =
  | 'Generator'
  | 'ManifestingGenerator'
  | 'Manifestor'
  | 'Projector'
  | 'Reflector'

export const TYPE_LABELS: Record<HDType, string> = {
  Generator: '生产者',
  ManifestingGenerator: '显化生产者',
  Manifestor: '显示者',
  Projector: '投射者',
  Reflector: '反映者',
}

export type Authority =
  | 'Emotional'
  | 'Sacral'
  | 'Splenic'
  | 'Ego'
  | 'SelfProjected'
  | 'Mental'
  | 'Lunar'

export const AUTHORITY_LABELS: Record<Authority, string> = {
  Emotional: '情绪权威',
  Sacral: '骶骨权威',
  Splenic: '直觉（脾）权威',
  Ego: '自我（心）权威',
  SelfProjected: '自我投射权威',
  Mental: '环境（脑中心）权威',
  Lunar: '月亮权威',
}

export type DefinitionKind =
  | 'NoDefinition'
  | 'Single'
  | 'Split'
  | 'TripleSplit'
  | 'QuadrupleSplit'

export const DEFINITION_LABELS: Record<DefinitionKind, string> = {
  NoDefinition: '无定义',
  Single: '单一定义',
  Split: '二分定义',
  TripleSplit: '三分定义',
  QuadrupleSplit: '四分定义',
}

export type Ownership = 'a' | 'b' | 'shared'

/** 单颗星体的落点（度数保留两位小数，爻/color/tone/base 全量） */
export interface StarPosition {
  planet: Planet
  longitude: number // 0–360, 显示 xx.xx°
  gate: number // 1–64
  line: number // 1–6
  color: number // 1–6
  tone: number // 1–6
  base: number // 1–5
}

export interface CenterState {
  id: CenterId
  defined: boolean
}

/**
 * 闸门三态（规范 §3.5，L4 项目约定）：
 * - `in-channel`：该闸门处于一条已定义的完整通道内；
 * - `hanging`：已激活，但没有配对成完整通道（悬挂闸门）；
 * - `open`：未激活。`gates` 数组只包含已激活闸门（in-channel / hanging），
 *   因此数组里不会出现 `open`；`open` 仅用于表达「未出现在数组中」。
 */
export type GateState = 'in-channel' | 'hanging' | 'open'

export interface GateActivation {
  gate: number
  stars: Planet[]
  /** 三态：gates 数组只含激活闸门（in-channel / hanging），未列出即 open */
  state: GateState
}

export interface ChannelActivation {
  key: string // 例 "1-8"
  gates: [number, number]
}

/** 单人盘计算结果（由 hdEngine 产出，组件只读） */
export interface BodyGraph {
  type: HDType
  strategy: string
  authority: Authority
  profile: string // 人生角色，例 "1/3"
  incarnationCross: string // 轮回交叉
  definition: DefinitionKind
  centers: CenterState[]
  gates: GateActivation[]
  channels: ChannelActivation[]
  /** 仅有单端激活的闸门（悬挂闸门） */
  hangingGates: number[]
  personality: StarPosition[] // 意识（Personality）13 星
  design: StarPosition[] // 无意识（Design）13 星
  /** 计算用的时刻（UTC ISO），用于溯源 */
  meta: {
    personalityTime: string
    designTime: string
    personalitySun: number
    designSun: number
    /** 计算内核版本；缺省表示旧版算法产出的快照，需要重算 */
    engineVersion?: string
    /** 该本地时刻不存在或存在歧义（夏令时切换）时的提示 */
    warning?: string
  }
}

export interface BirthInput {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
  timezone: string // IANA
  lat: number
  lng: number
}

export interface Archive {
  id: string
  name: string
  gender?: 'male' | 'female' | 'other'
  birth: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second?: number
  }
  timezone: string
  location: { lat: number; lng: number; place: string }
  createdAt: string
  chart?: BodyGraph
  /** 重算失败时的原因（例如导入的出生信息非法）；有值时 chart 为空 */
  chartError?: string
}

/** 关系通道类型（专业合图动力学） */
export type RelationshipChannelType =
  | 'electromagnetic' // 电磁通道：两人互补成通道，强烈吸引
  | 'companionship' // 同伴通道：两人自带同一条通道，高度同频
  | 'dominance' // 主导通道：单方拥有完整通道，单向输出
  | 'compromise' // 妥协通道：一方完整 + 一方单闸门悬挂，迁就卡点

export interface RelationshipChannel {
  key: string
  gates: [number, number]
  type: RelationshipChannelType
  /** 两端闸门各自的归属（shared / a / b） */
  gateOwners: [Ownership, Ownership]
  /** 完整通道持有方（dominance / compromise 时有意义） */
  holder?: 'a' | 'b'
}

/**
 * 中心四象限：关系分析的核心视图。
 * both = 双方都定义（各自稳定，互不易影响）
 * onlyA / onlyB = 单方定义（另一方在此中心持续受对方影响）
 * open = 双方都开放（一起放大、一起失焦）
 */
export interface CenterQuadrant {
  id: CenterId
  state: 'both' | 'onlyA' | 'onlyB' | 'open'
}

/**
 * 合盘结果：A / B / 合并 + 共享集合 + 关系动力学。
 *
 * 注意：合盘**不输出** type / authority / definition / incarnationCross（规范 §3.8）。
 * 类型、权威、定义型、轮回交叉都是个体属性；关系场不存在「你们是投射者」这类结论。
 * 渲染所需的占位 BodyGraph 由 `mergedAsChart()` 内部构造，不对外暴露。
 */
export interface CompositeResult {
  a: BodyGraph
  b: BodyGraph
  merged: {
    centers: CenterState[]
    gates: Array<GateActivation & { owners: Ownership[] }>
    channels: Array<ChannelActivation & { owners: Ownership[] }>
  }
  gateOwners: Record<number, Ownership>
  channelOwners: Record<string, Ownership>
  sharedChannels: ChannelActivation[]
  sharedGates: number[]
  /** 四类关系通道 */
  relationshipChannels: RelationshipChannel[]
  /** 中心四象限（关系解读核心） */
  centerQuadrant: CenterQuadrant[]
}

export type UiFilter = {
  showDecimals: boolean
  showColorToneBase: boolean
  sharedOnly: boolean
}

export interface AiConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  cacheEnabled: boolean
}

/** 多套 AI 配置中的一条（v2.0）；字段集合与 AiConfig 完全一致 + 标识信息 */
export interface AiProfile extends AiConfig {
  id: string
  name: string
  createdAt: string
  lastUsedAt?: string
}

export type ThemeMode = 'light' | 'dark'
