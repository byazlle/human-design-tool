/**
 * 关系场（合盘 / 双盘对比）的「完整版」多轮编排计划。
 *
 * 口径：规范 §3.8 —— 合盘不输出类型、内在权威、定义型、轮回交叉，
 * 只讨论影响力方向、共鸣区、共同放大区与四类连接通道。
 * 这里只消费 CompositeResult 里已有的字段、compositeDimensions 已有的维度定义，
 * 以及 interpretations / gateData 里已有的离线释义；不新增、不推断任何人类图业务规则。
 *
 * 设计：完整版引擎 aiFullReading.ts 允许注入「任务清单 + 事实块 + 摘要」，
 * 关系场据此换掉单人整盘的八大维度，改用六个合盘维度 + 四类连接动力学
 * + 逐共享闸门 + 逐合并通道，最后仍由引擎统一做 full-fusion 融合。
 */
import {
  COMPOSITE_DIMENSIONS,
  type CompositeDimension,
} from './compositeDimensions'
import { CENTER_TEXT, getChannel, getGate } from './interpretations'
import { CHANNEL_BY_KEY, GATE_CENTER, GATE_NAMES } from '../engine/gateData'
import {
  CENTER_LABELS,
  type CompositeResult,
  type Ownership,
  type RelationshipChannelType,
} from '../types/hd'
import type { FullReadingPlan, FullTask } from './aiFullReading'

export interface PairNames {
  a: string
  b: string
}

export interface RelationshipPlanOptions {
  pairNames?: PairNames
  /** 额外维度（例如合盘页用户输入的自定义议题） */
  extraDimensions?: CompositeDimension[]
}

const REL_LABELS: Record<RelationshipChannelType, string> = {
  electromagnetic: '电磁通道（互补吸引）',
  companionship: '同伴通道（同频共鸣）',
  dominance: '主导通道（单向输出）',
  compromise: '妥协通道（迁就卡点）',
}

const REL_ORDER: RelationshipChannelType[] = [
  'electromagnetic',
  'companionship',
  'dominance',
  'compromise',
]

const QUADRANT_LABELS: Record<string, string> = {
  both: '双方都定义',
  onlyA: '仅 A 定义',
  onlyB: '仅 B 定义',
  open: '双方都开放',
}

const OWNER_LABELS: Record<Ownership, string> = {
  a: 'A',
  b: 'B',
  shared: '双方共享',
}

function ownerText(owners: Ownership[] | undefined): string {
  if (!owners?.length) return '归属未标注'
  return owners.map((o) => OWNER_LABELS[o] ?? String(o)).join(' + ')
}

function pairLine(r: CompositeResult, pairNames?: PairNames): string {
  const a = pairNames?.a?.trim() || 'A'
  const b = pairNames?.b?.trim() || 'B'
  return `合盘双方：${a}（人生角色 ${r.a.profile}） × ${b}（人生角色 ${r.b.profile}）`
}

function channelsByOwner(r: CompositeResult, owner: 'a' | 'b'): string[] {
  return r.merged.channels
    .filter((c) => c.owners.length === 1 && c.owners[0] === owner)
    .map((c) => c.key)
}

/**
 * 关系场盘面摘要：与规范 §3.8 一致，只含双方人生角色、四象限计数、
 * 共享/独有通道与闸门、四类关系通道计数。不含任何个体结论。
 */
export function relationshipSummary(r: CompositeResult, pairNames?: PairNames): string {
  const quadCount = (state: string) => r.centerQuadrant.filter((c) => c.state === state).length
  const onlyA = channelsByOwner(r, 'a').length
  const onlyB = channelsByOwner(r, 'b').length
  const relCount = (type: RelationshipChannelType) =>
    r.relationshipChannels.filter((c) => c.type === type).length
  return [
    pairLine(r, pairNames),
    `双方人生角色：A ${r.a.profile} × B ${r.b.profile}`,
    `中心四象限：双方都定义 ${quadCount('both')} · 仅 A 定义 ${quadCount('onlyA')} · 仅 B 定义 ${quadCount('onlyB')} · 双方都开放 ${quadCount('open')}`,
    `通道：共享 ${r.sharedChannels.length} 条 · A 独有 ${onlyA} 条 · B 独有 ${onlyB} 条`,
    `共享闸门：${r.sharedGates.length} 个`,
    `关系通道：电磁 ${relCount('electromagnetic')} · 同伴 ${relCount('companionship')} · 主导 ${relCount('dominance')} · 妥协 ${relCount('compromise')}`,
  ].join('\n')
}

/** 四象限明细（项目既有的关系影响方向分组，不新增判定） */
function quadrantsBlock(r: CompositeResult): string {
  const lines = (['both', 'onlyA', 'onlyB', 'open'] as const).map((state) => {
    const items = r.centerQuadrant
      .filter((c) => c.state === state)
      .map((c) => CENTER_LABELS[c.id])
    return `${QUADRANT_LABELS[state]}（${items.length}）：${items.join('、') || '无'}`
  })
  return [
    '【中心四象限（关系影响方向）】',
    ...lines,
    `合并后共 ${r.merged.centers.filter((c) => c.defined).length} 个中心被定义`,
  ].join('\n')
}

function relationshipBlock(r: CompositeResult): string {
  const lines = REL_ORDER.map((type) => {
    const list = r.relationshipChannels.filter((c) => c.type === type)
    const items = list
      .map((c) => `${c.key} ${CHANNEL_BY_KEY[c.key]?.nameZh ?? ''}（两端归属 ${c.gateOwners.map((o) => OWNER_LABELS[o] ?? String(o)).join(' / ')}）`)
      .join('、')
    return `${REL_LABELS[type]}（${list.length}）：${items || '无'}`
  })
  return ['【四类关系通道】', ...lines].join('\n')
}

function gatesBlock(r: CompositeResult): string {
  const lines = r.merged.gates.map(
    (g) => `闸门 ${g.gate} ${GATE_NAMES[g.gate]?.zh ?? ''}（${CENTER_LABELS[GATE_CENTER[g.gate]] ?? ''}｜归属 ${ownerText(g.owners)}）`,
  )
  return [
    `【合并后已激活闸门（${lines.length}）】`,
    lines.join('\n') || '这张盘未显示',
  ].join('\n')
}

function channelsBlock(r: CompositeResult): string {
  const lines = r.merged.channels.map((c) => {
    const t = getChannel(c.key)
    const def = CHANNEL_BY_KEY[c.key]
    return `${t.title}（${c.gates.join(' ↔ ')}｜${def ? def.nameZh : ''}｜归属 ${ownerText(c.owners)}）`
  })
  return [`【合并后已成型通道（${lines.length}）】`, lines.join('\n') || '这张盘未显示'].join('\n')
}

function centersBlock(r: CompositeResult): string {
  const lines = r.merged.centers.map((ct) => {
    const t = CENTER_TEXT[ct.id]
    return `${CENTER_LABELS[ct.id]}（${ct.defined ? '已定义' : '开放'}）：${(ct.defined ? t.defined : t.open).replace(/\s+/g, ' ')}`
  })
  return ['【九大中心离线释义（合并盘）】', ...lines].join('\n')
}

/**
 * 关系场离线事实块：所有分项共享。
 * 明确写入口径约束，避免模型把渲染用占位值当成合盘结论。
 */
export function relationshipFactBlock(r: CompositeResult, pairNames?: PairNames): string {
  return [
    pairLine(r, pairNames),
    '',
    quadrantsBlock(r),
    '',
    '【口径约束】本盘为两人合图（连接盘），没有独立的类型、内在权威、定义型与轮回交叉；只讨论影响力方向、共鸣区、共同放大区与四类连接通道，个体层面的结论不进入关系场。',
    '',
    relationshipBlock(r),
    '',
    `共享通道（${r.sharedChannels.length}）：${r.sharedChannels.map((c) => c.key).join('、') || '无'}`,
    `A 独有通道：${channelsByOwner(r, 'a').join('、') || '无'}`,
    `B 独有通道：${channelsByOwner(r, 'b').join('、') || '无'}`,
    `共享闸门：${r.sharedGates.join('、') || '无'}`,
    '',
    gatesBlock(r),
    '',
    channelsBlock(r),
    '',
    centersBlock(r),
  ].join('\n')
}

/** 单项闸门事实：只用既有离线释义 + 归属，不推断关系结论 */
function sharedGateFacts(r: CompositeResult, gate: number, facts: string): string {
  const text = getGate(gate)
  const activation = r.merged.gates.find((g) => g.gate === gate)
  return [
    `【本次分项】共享闸门 ${gate} ${GATE_NAMES[gate]?.zh ?? ''}`,
    `【闸门】${text.title}｜关键词：${text.keyword}｜所属中心：${CENTER_LABELS[GATE_CENTER[gate]] ?? ''}`,
    `【归属】${ownerText(activation?.owners)}`,
    `【离线释义】${text.text.replace(/\s+/g, ' ')}`,
    facts,
  ].join('\n\n')
}

function mergedChannelFacts(r: CompositeResult, key: string, facts: string): string {
  const activation = r.merged.channels.find((c) => c.key === key)
  const text = getChannel(key)
  const def = CHANNEL_BY_KEY[key]
  const relation = r.relationshipChannels.find((c) => c.key === key)
  return [
    `【本次分项】合并通道 ${key} · ${def?.nameZh ?? ''}`,
    `【两端中心】${def ? def.centers.map((id) => CENTER_LABELS[id]).join(' ↔ ') : ''}｜【两端闸门】${activation?.gates.join(' ↔ ') ?? ''}`,
    `【归属】${ownerText(activation?.owners)}${relation ? `｜【连接动力学】${REL_LABELS[relation.type]}` : ''}`,
    `【离线释义】${text.text.replace(/\s+/g, ' ')}`,
    facts,
  ].join('\n\n')
}

/**
 * 关系场任务清单：合盘既有维度 → 四类连接动力学 → 逐共享闸门 → 逐合并通道。
 * 顺序固定，key 唯一；融合任务由 aiFullReading 统一追加。
 */
export function buildRelationshipTasks(
  r: CompositeResult,
  pairNames?: PairNames,
  extraDimensions: CompositeDimension[] = [],
): FullTask[] {
  const facts = relationshipFactBlock(r, pairNames)
  const tasks: FullTask[] = []

  for (const dim of [...COMPOSITE_DIMENSIONS, ...extraDimensions]) {
    tasks.push({
      key: `dimension:${dim.key}`,
      title: dim.label,
      kind: 'dimension',
      scope: 'full-dimension',
      offline: [
        `【本次分项标题】${dim.label}`,
        `【应用场景】${dim.scene}`,
        `【需要读取的内容】${dim.requires.join('；')}`,
        `【本次重点关注】${dim.focus.join('；')}`,
        `【输出要求】${dim.prompt}`,
        facts,
      ].join('\n\n'),
    })
  }

  for (const type of REL_ORDER) {
    const list = r.relationshipChannels.filter((c) => c.type === type)
    tasks.push({
      key: `dynamic:${type}`,
      title: REL_LABELS[type],
      kind: 'dimension',
      scope: 'full-dimension',
      offline: [
        `【本次分项标题】${REL_LABELS[type]}`,
        `【本次分项数量】${list.length} 条`,
        `【本类通道】${list.map((c) => `${c.key} ${CHANNEL_BY_KEY[c.key]?.nameZh ?? ''}`).join('、') || '无'}`,
        '【输出要求】请只依据以上关系场事实，说明这类连接在这段关系里通常如何发生作用、容易在哪里形成消耗或误解，并给出可执行的相处建议。不要输出个体层面的类型、权威或轮回交叉结论。',
        relationshipBlock(r),
        facts,
      ].join('\n\n'),
    })
  }

  for (const gate of r.sharedGates) {
    tasks.push({
      key: `gate:${gate}`,
      title: `共享闸门 ${gate} · ${GATE_NAMES[gate]?.zh ?? ''}`,
      kind: 'gate',
      scope: 'full-gate',
      offline: sharedGateFacts(r, gate, facts),
    })
  }

  for (const c of r.merged.channels) {
    tasks.push({
      key: `channel:${c.key}`,
      title: `合并通道 ${c.key} · ${CHANNEL_BY_KEY[c.key]?.nameZh ?? ''}`,
      kind: 'channel',
      scope: 'full-channel',
      offline: mergedChannelFacts(r, c.key, facts),
    })
  }

  return tasks
}

/** 交给 useAiReading 的完整编排计划（合规版） */
export function relationshipFullPlan(
  r: CompositeResult,
  options: RelationshipPlanOptions = {},
): FullReadingPlan {
  return {
    tasks: buildRelationshipTasks(r, options.pairNames, options.extraDimensions),
    factBlock: relationshipFactBlock(r, options.pairNames),
    summary: relationshipSummary(r, options.pairNames),
    fusionAngle: '关系场整合分析与最终总结论',
  }
}

export { customDimension } from './compositeDimensions'
