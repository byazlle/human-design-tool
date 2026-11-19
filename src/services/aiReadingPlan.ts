/**
 * 请求 → 计划（v4.0.0 · ARCH §3）：纯函数，无 IO、无 store、无随机。
 *
 * 两个必须一次说清的口径：
 * 1. **单次档恒 1 请求**：`concise` / `detailed` 一律 `singleShot = true`，
 *    `tasks` 只有一个任务、`fusion = null`。台账里「精简、详细档三个入口都是一次性
 *    传入全部资料、单次生成，不拆任务、不二次生成」就是这一行。
 * 2. **完整档才拆任务**：A 型 6、B 型 N+1、C 型 k+m+r+1；最后一个请求永远是融合 /
 *    汇总，且**不在 tasks 里**（`fusion` 字段），由执行器在全部落定后单独跑。
 *
 * 所有 `offline` 都由本文件拼装成型：`【本次分项标题】+ 事实块 + 方向（若有）+ 收束指令`。
 * 为什么收束指令放在 offline 而不是 system：system 是全局契约（五段拼装，改一次
 * 全库缓存作废），而「只写这一项」是**本次请求**的约束，属于 user 段职责（§2.6）。
 */
import type { AiDetailMode, BodyGraph } from '../types/hd'
import type {
  AiEntry,
  AiScope,
  ReadingPlan,
  ReadingRequest,
  ReadingTask,
  SelectionPick,
} from '../types/aiReading'
import {
  ALL_READING_DIMS,
  READING_DIMENSIONS,
  buildCentersCircuitFacts,
  buildChannelsOverviewFacts,
  buildCoreFacts,
  buildGateItemFacts,
  buildChannelItemFacts,
  buildGatesOverviewFacts,
  buildPanoramaFacts,
  buildSelectionFacts,
  buildTrajectoryFacts,
  buildUnifiedFacts,
  buildUnifiedOffline,
  buildWholeChartFacts,
  directionPrompt,
  selectionScopeRef,
  unifiedScopeRef,
} from './chartFacts'
import type { ReadingDimKey } from './chartFacts'
import { ANGLE_UNSET_LABEL, MODULE_A5_DIRECTIONS } from './readingAngles'
import { CHANNELS, GATE_NAMES } from '../engine/gateData'

const ENTRY_LABEL: Record<AiEntry, string> = {
  full: '全盘 AI 解读',
  composite: 'AI 综合解读',
  selection: '勾选解读',
}

const DETAIL_LABEL: Record<AiDetailMode, string> = {
  concise: '精简',
  detailed: '详细',
  full: '完整',
}

/** 模块 ⑤ 在报告里的标题（五个方向固定顺序，与 `MODULE_A5_DIRECTIONS` 一致） */
const A5_TITLE = `模块⑤ ${MODULE_A5_DIRECTIONS.map((d) => d.label).join('·')}`

/** 「只写本分项」的收束指令：所有多请求任务共用同一条，避免各写一份措辞 */
const ITEM_CLOSER =
  '【收束】只写本分项：不写整盘总论、不写其他分项、不写「接下来还有……」或「其余见后文」。'

/** 融合 / 汇总任务的收束指令 */
const FUSION_CLOSER =
  '【收束】只做整合与新判断：不逐项复述、不按分项顺序写摘要；冲突以【盘面事实】为准。'

/** 单次档（一篇写完）的收束指令 */
const ONESHOT_CLOSER =
  '【收束】这是一篇独立的完整解读：按 system 的入口契约一次写完，不分篇、不写「下一篇」。'

/**
 * 方向引用：内置角度 / 自定义文案 / 未指定。
 *
 * 入口 B 不提供「不限方向」（与 C 的区别）；入口 C 允许不选，此时用通用收束句。
 */
function directionBlock(req: ReadingRequest, allowUnset: boolean): string {
  const dir = req.direction
  if (!dir) return allowUnset ? `【解读方向】${ANGLE_UNSET_LABEL}` : ''
  if (dir.custom?.trim()) return directionPrompt(dir.label, dir.prompt, dir.custom.trim())
  return directionPrompt(dir.label, dir.prompt, '')
}

/** 方向 key（进 ref）；未指定写 `none`，自定义写 `custom` */
function directionKeyOf(req: ReadingRequest): string {
  const dir = req.direction
  if (!dir) return 'none'
  return dir.custom?.trim() ? 'custom' : dir.key || 'comprehensive'
}

/** 维度白名单：按 `READING_DIMENSIONS` 固定顺序，不按点击顺序（§3.3） */
export function normalizeDims(dims?: ReadingDimKey[]): ReadingDimKey[] {
  if (!dims || dims.length === 0) return []
  return READING_DIMENSIONS.filter((d) => dims.includes(d.key)).map((d) => d.key)
}

/** 勾选对象归一：去掉空项、非法项，返回 null 表示「什么都没勾」 */
export function normalizeSelection(pick?: SelectionPick): SelectionPick | null {
  if (!pick) return null
  const channels = [
    ...new Set(
      pick.channels
        .map((raw) => normalizeChannelKey(raw))
        .filter((key): key is string => key !== null),
    ),
  ].sort((a, b) => {
    const [a1, a2] = a.split('-').map(Number)
    const [b1, b2] = b.split('-').map(Number)
    return a1 - b1 || a2 - b2
  })
  const gates = [...new Set(pick.gates.filter((n) => Number.isInteger(n) && n >= 1 && n <= 64))].sort(
    (a, b) => a - b,
  )
  const normalized: SelectionPick = {
    channels,
    gates,
    definition: pick.definition === true,
    circuit: pick.circuit === true,
    cross: pick.cross === true,
  }
  const empty =
    !channels.length &&
    !gates.length &&
    !normalized.definition &&
    !normalized.circuit &&
    !normalized.cross
  return empty ? null : normalized
}

/**
 * 通道 key 归一为 `lo-hi`，两端必须在 1–64；非法返回 null。
 *
 * 归一化不只是清洗：`34-20` 与 `20-34` 是同一条通道，不归一会产生两个缓存条目。
 */
function normalizeChannelKey(raw: string): string | null {
  const m = /^\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*$/.exec(raw ?? '')
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!(a >= 1 && a <= 64 && b >= 1 && b <= 64) || a === b) return null
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

/** 报告标题：`张三 · 全盘 AI 解读（完整）` */
export function reportTitleOf(req: ReadingRequest): string {
  const name = req.archiveName?.trim() || '本盘'
  return `${name} · ${ENTRY_LABEL[req.entry]}（${DETAIL_LABEL[req.detail]}）`
}

/** 空计划（勾选为空时的唯一出口：不抛错，让 UI 禁用按钮） */
function emptyPlan(req: ReadingRequest): ReadingPlan {
  return {
    entry: req.entry,
    detail: req.detail,
    singleShot: req.detail !== 'full',
    tasks: [],
    fusion: null,
    title: reportTitleOf(req),
  }
}

function taskOf(
  key: string,
  title: string,
  scope: AiScope,
  ref: string,
  offline: string,
  kind: ReadingTask['kind'],
): ReadingTask {
  return { key, title, scope, ref, offline, kind }
}

/* ── 入口 A｜全盘 AI 解读 ─────────────────────────────── */

const A_MODULES: Array<{ key: string; ref: string; title: string; scope: AiScope }> = [
  { key: 'A1-core', ref: 'A1-core', title: '模块① 类型·策略·内在权威', scope: 'full-module' },
  { key: 'A2-channels', ref: 'A2-channels', title: '模块② 全部通道通解', scope: 'full-all-channels' },
  { key: 'A3-gates', ref: 'A3-gates', title: '模块③ 全部闸门通解', scope: 'full-all-gates' },
  { key: 'A4-centers', ref: 'A4-centers', title: '模块④ 中心·定义·回路·交叉', scope: 'full-module' },
  { key: 'A5-trajectory', ref: 'A5-trajectory', title: A5_TITLE, scope: 'full-trajectory' },
]

/** 模块 ⑤ 的五个方向 prompt（一次请求内 5 个三级标题，§3.2 ⑤） */
function a5DirectionsBlock(): string {
  return [
    '【本次分项要求】下面五个方向各占一个三级标题，顺序固定、不得合并、不得跳过：',
    ...MODULE_A5_DIRECTIONS.map((d, i) => `${i + 1}. ${d.label}：${d.prompt}`),
  ].join('\n')
}

/** 模块 ①–⑤ 的事实块（各模块只给自己那一段，避免把无关事实灌进去） */
function aModuleFacts(chart: BodyGraph, ref: string): string {
  if (ref === 'A1-core') {
    return [buildCoreFacts(chart), buildWholeChartFacts(chart)].join('\n\n')
  }
  if (ref === 'A2-channels') {
    return [buildChannelsOverviewFacts(chart), buildWholeChartFacts(chart)].join('\n\n')
  }
  if (ref === 'A3-gates') {
    return [buildGatesOverviewFacts(chart), buildWholeChartFacts(chart)].join('\n\n')
  }
  if (ref === 'A4-centers') {
    return [buildCentersCircuitFacts(chart), buildWholeChartFacts(chart)].join('\n\n')
  }
  return [buildTrajectoryFacts(chart), a5DirectionsBlock(), buildWholeChartFacts(chart)].join('\n\n')
}

function planFullEntryA(req: ReadingRequest): ReadingPlan {
  const chart = req.chart
  const tasks = A_MODULES.map((m) =>
    taskOf(
      m.key,
      m.title,
      m.scope,
      m.ref,
      [`【本次分项标题】${m.title}`, aModuleFacts(chart, m.ref), directionBlock(req, false), ITEM_CLOSER]
        .filter(Boolean)
        .join('\n\n'),
      'module',
    ),
  )
  const fusion = taskOf(
    'A6-fusion',
    '模块⑥ 全盘融合',
    'full-fusion',
    'A6-fusion',
    [
      '【本次分项标题】模块⑥ 全盘融合与最终总结论',
      '【本次分项要求】基于 ①–⑤ 的分项要点做整合与最终判断：写「合起来之后才成立」的结论，最后单独给「最终总结论」小节。',
      FUSION_CLOSER,
    ].join('\n\n'),
    'summary',
  )
  return {
    entry: 'full',
    detail: req.detail,
    singleShot: false,
    tasks,
    fusion,
    title: reportTitleOf(req),
  }
}

function planOneShotEntryA(req: ReadingRequest): ReadingPlan {
  const offline = [
    `【本次分项标题】${ENTRY_LABEL.full}（六个模块一次写完）`,
    buildPanoramaFacts(req.chart),
    a5DirectionsBlock(),
    directionBlock(req, false),
    ONESHOT_CLOSER,
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    entry: 'full',
    detail: req.detail,
    singleShot: true,
    tasks: [taskOf('A-oneshot', ENTRY_LABEL.full, 'panorama-one', 'A-oneshot', offline, 'module')],
    fusion: null,
    title: reportTitleOf(req),
  }
}

/* ── 入口 B｜AI 综合解读 ─────────────────────────────── */

const DIM_TITLE: Record<ReadingDimKey, string> = READING_DIMENSIONS.reduce(
  (acc, d) => {
    acc[d.key] = d.label
    return acc
  },
  {} as Record<ReadingDimKey, string>,
)

function planEntryB(req: ReadingRequest): ReadingPlan {
  const dims = normalizeDims(req.dims)
  if (dims.length === 0) return emptyPlan(req)
  const chart = req.chart
  const ref = unifiedScopeRef(dims, directionKeyOf(req), req.direction?.custom?.trim() ?? '')

  if (req.detail !== 'full') {
    const offline = [
      `【本次分项标题】${ENTRY_LABEL.composite}（${dims.map((d) => DIM_TITLE[d]).join('、')}）`,
      buildUnifiedOffline(
        chart,
        dims,
        req.direction?.label ?? '综合解读',
        req.direction?.prompt ?? '',
        req.direction?.custom?.trim() ?? '',
      ),
      ONESHOT_CLOSER,
    ].join('\n\n')
    return {
      entry: 'composite',
      detail: req.detail,
      singleShot: true,
      tasks: [taskOf('B-oneshot', ENTRY_LABEL.composite, 'unified', ref, offline, 'dimension')],
      fusion: null,
      title: reportTitleOf(req),
    }
  }

  const tasks = dims.map((dim) => {
    const title = DIM_TITLE[dim]
    return taskOf(
      `B-dim:${dim}`,
      title,
      'full-dimension',
      `B-dim:${dim}`,
      [
        `【本次分项标题】${title}`,
        buildUnifiedFactsOfDim(chart, dim),
        directionBlock(req, false),
        ITEM_CLOSER,
      ]
        .filter(Boolean)
        .join('\n\n'),
      'dimension',
    )
  })
  const fusion = taskOf(
    'B-fusion',
    '综合整合',
    'full-fusion',
    'B-fusion',
    [
      '【本次分项标题】综合整合（只在勾选维度之间做关联）',
      `【本次分项要求】只整合这些维度：${dims.map((d) => DIM_TITLE[d]).join('、')}；未勾选维度不得成为标题或独立段落。`,
      FUSION_CLOSER,
    ].join('\n\n'),
    'summary',
  )
  return {
    entry: 'composite',
    detail: req.detail,
    singleShot: false,
    tasks,
    fusion,
    title: reportTitleOf(req),
  }
}

/**
 * 单个维度的事实块：复用 `buildUnifiedFacts` 的既有口径（只传这一个维度），
 * 保证「同维度的手动解读与完整档分项」事实块一致，缓存也能互相复用。
 */
function buildUnifiedFactsOfDim(chart: BodyGraph, dim: ReadingDimKey): string {
  const minimal: ReadingDimKey[] = ALL_READING_DIMS.filter((k) => k === dim)
  return [buildUnifiedFacts(chart, minimal), buildWholeChartFacts(chart)].join('\n\n')
}

/* ── 入口 C｜勾选解读 ─────────────────────────────────── */

function planEntryC(req: ReadingRequest): ReadingPlan {
  const pick = normalizeSelection(req.selection)
  if (!pick) return emptyPlan(req)
  const chart = req.chart
  const ref = selectionScopeRef(pick, directionKeyOf(req))

  if (req.detail !== 'full') {
    const offline = [
      `【本次分项标题】${ENTRY_LABEL.selection}（共 ${
        pick.channels.length + pick.gates.length + (pick.definition ? 1 : 0) + (pick.circuit ? 1 : 0) + (pick.cross ? 1 : 0)
      } 项）`,
      buildSelectionFacts(chart, pick),
      directionBlock(req, true),
      ONESHOT_CLOSER,
    ]
      .filter(Boolean)
      .join('\n\n')
    return {
      entry: 'selection',
      detail: req.detail,
      singleShot: true,
      tasks: [taskOf('C-oneshot', ENTRY_LABEL.selection, 'selection-one', ref, offline, 'module')],
      fusion: null,
      title: reportTitleOf(req),
    }
  }

  const tasks: ReadingTask[] = []
  for (const key of pick.channels) {
    const title = `通道 ${key}${channelNameOf(key) ? ` · ${channelNameOf(key)}` : ''}`
    tasks.push(
      taskOf(
        `C-ch:${key}`,
        title,
        'full-channel',
        `C-ch:${key}`,
        [`【本次分项标题】${title}`, buildChannelItemFacts(chart, key), directionBlock(req, true), ITEM_CLOSER]
          .filter(Boolean)
          .join('\n\n'),
        'channel',
      ),
    )
  }
  for (const gate of pick.gates) {
    const name = GATE_NAMES[gate]?.zh
    const title = `闸门 ${gate}${name ? ` · ${name}` : ''}`
    tasks.push(
      taskOf(
        `C-gate:${gate}`,
        title,
        'full-gate',
        `C-gate:${gate}`,
        [`【本次分项标题】${title}`, buildGateItemFacts(chart, gate), directionBlock(req, true), ITEM_CLOSER]
          .filter(Boolean)
          .join('\n\n'),
        'gate',
      ),
    )
  }
  if (pick.definition) {
    tasks.push(
      taskOf(
        'C-definition',
        '定义状态',
        'full-module',
        'C-definition',
        [
          '【本次分项标题】定义状态',
          [
            buildCoreFacts(chart).split('\n')[2] ?? '',
            `【中心与定义】已定义与开放中心清单见下：\n${buildCentersCircuitFacts(chart)}`,
          ].join('\n\n'),
          directionBlock(req, true),
          ITEM_CLOSER,
        ]
          .filter(Boolean)
          .join('\n\n'),
        'module',
      ),
    )
  }
  if (pick.circuit) {
    tasks.push(
      taskOf(
        'C-circuit',
        '回路分布',
        'full-module',
        'C-circuit',
        [
          '【本次分项标题】回路分布',
          buildCentersCircuitFacts(chart),
          directionBlock(req, true),
          ITEM_CLOSER,
        ]
          .filter(Boolean)
          .join('\n\n'),
        'module',
      ),
    )
  }
  if (pick.cross) {
    tasks.push(
      taskOf(
        'C-cross',
        '轮回交叉',
        'full-module',
        'C-cross',
        [
          '【本次分项标题】轮回交叉',
          buildCentersCircuitFacts(chart),
          directionBlock(req, true),
          ITEM_CLOSER,
        ]
          .filter(Boolean)
          .join('\n\n'),
        'module',
      ),
    )
  }

  const fusion = taskOf(
    'C-relation',
    '关联汇总',
    'selection-fusion',
    'C-relation',
    [
      '【本次分项标题】关联汇总（只汇总勾选项彼此之间的关系）',
      `【本次分项要求】勾选清单：${describePick(pick)}。至少点名 3 组跨条目联动，不得引入未勾选的结构。`,
      FUSION_CLOSER,
    ].join('\n\n'),
    'summary',
  )
  return {
    entry: 'selection',
    detail: req.detail,
    singleShot: false,
    tasks,
    fusion,
    title: reportTitleOf(req),
  }
}

/** 通道中文名（`CHANNELS` 静态表；缺名时返回空串，标题退化为只有 key） */
function channelNameOf(key: string): string {
  return CHANNELS.find((c) => c.key === key)?.nameZh ?? ''
}

function describePick(pick: SelectionPick): string {
  const bits: string[] = []
  if (pick.channels.length) bits.push(`通道 ${pick.channels.join('、')}`)
  if (pick.gates.length) bits.push(`闸门 ${pick.gates.join('、')}`)
  if (pick.definition) bits.push('定义状态')
  if (pick.circuit) bits.push('回路分布')
  if (pick.cross) bits.push('轮回交叉')
  return bits.join('；')
}

/* ── 对外唯一入口 ─────────────────────────────────────── */

/**
 * 请求 → 计划。
 *
 * 空勾选（B 没勾维度 / C 什么都没勾）返回 `tasks: []`，**不抛错**：
 * 按钮禁用是 UI 的职责，服务层不该用异常表达「用户还没选」。
 */
export function planReading(req: ReadingRequest): ReadingPlan {
  if (req.entry === 'composite') return planEntryB(req)
  if (req.entry === 'selection') return planEntryC(req)
  return req.detail === 'full' ? planFullEntryA(req) : planOneShotEntryA(req)
}

/** 计划里要发出的请求总数（含融合；空计划为 0）——供 UI 预览与测试断言 */
export function requestCountOf(plan: ReadingPlan): number {
  if (plan.tasks.length === 0) return 0
  return plan.tasks.length + (plan.fusion ? 1 : 0)
}

/** 勾选清单的可读串（进度区与报告副标题共用） */
export function selectionSummaryOf(pick?: SelectionPick): string {
  const normalized = normalizeSelection(pick)
  return normalized ? describePick(normalized) : ''
}
