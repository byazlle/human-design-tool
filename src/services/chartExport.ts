/**
 * 盘面文档导出（v3.2.0）：「一键导出成文档」——不经过 AI，纯结构事实。
 *
 * 为什么单独成模块：`aiExport.ts` 负责**解读文本**的四种格式序列化，
 * 而这里要导出的是**这份盘的完整档案**（显意识 / 潜意识、回路、通道、闸门、
 * 中心、类型权威策略）。两者共用同一套保存链路（MD / Word / HTML / PDF），
 * 但内容来源完全不同，混在一起会让「AI 报告」的口径被盘面字段污染。
 *
 * 文案口径：只陈述本盘可验证的结构，不写任何推断性结论、不做命运 / 健康断言。
 */
import type { Archive, BodyGraph, CenterId } from '../types/hd'
import {
  AUTHORITY_LABELS,
  CENTER_IDS,
  CENTER_LABELS,
  DEFINITION_LABELS,
  PLANET_LABELS,
  TYPE_LABELS,
} from '../types/hd'
import { CHANNEL_BY_KEY, GATE_CENTER, GATE_NAMES } from '../engine/gateData'
import {
  CIRCUIT_BY_ID,
  CIRCUIT_NOTE,
  GROUP_BY_ID,
  analyzeCircuitry,
  circuitryBrief,
  groupChannels,
} from '../engine/circuitData'
import { CENTER_TEXT, getChannel, getGate } from './interpretations'
import { crossNameOf } from './crossData'
import { exportReport, type ExportResult } from './aiExport'
import { firstSentence } from './chartFacts'
import type { ReportFormat, ReportInput } from '../types/report'

const SHORT_CENTER: Record<CenterId, string> = {
  head: '头顶',
  ajna: '眉心',
  throat: '喉咙',
  g: 'G',
  heart: '心',
  spleen: '脾',
  sacral: '骶骨',
  solar: '情绪',
  root: '根',
}

function two(n: number): string {
  return String(n).padStart(2, '0')
}

function birthText(a: Archive): string {
  const b = a.birth
  return `${b.year}-${two(b.month)}-${two(b.day)} ${two(b.hour)}:${two(b.minute)}`
}

function degree(n: number): string {
  return `${n.toFixed(2)}°`
}

function table(head: string[], rows: string[][]): string {
  const out = [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '／')).join(' | ')} |`),
  ]
  return out.join('\n')
}

/** 13 星表（显意识 / 潜意识共用同一格式） */
function starTable(chart: BodyGraph, side: 'personality' | 'design'): string {
  const list = side === 'personality' ? chart.personality : chart.design
  const rows = list.map((s) => [
    PLANET_LABELS[s.planet] ?? s.planet,
    `${s.gate}.${s.line}`,
    GATE_NAMES[s.gate]?.zh ?? '',
    degree(s.longitude),
    `${s.color}/${s.tone}/${s.base}`,
  ])
  return table(['星体', '闸门.爻', '闸门名称', '黄经', '色/调/基'], rows)
}

/** 中心表：状态 + 一句说明（说明取自离线释义库，保持与详情面板同源） */
function centerTable(chart: BodyGraph): string {
  const rows = CENTER_IDS.map((id) => {
    const defined = chart.centers.find((c) => c.id === id)?.defined ?? false
    const t = CENTER_TEXT[id]
    const text = firstSentence(defined ? t.defined : t.open, 60)
    return [CENTER_LABELS[id], defined ? '已定义' : '开放', text]
  })
  return table(['中心', '状态', '说明'], rows)
}

/** 闸门表：状态取值只有「通道内 / 悬挂」；未列出的闸门即未激活 */
function gateTable(chart: BodyGraph): string {
  const rows = [...chart.gates]
    .sort((a, b) => a.gate - b.gate)
    .map((g) => [
      String(g.gate),
      GATE_NAMES[g.gate]?.zh ?? '',
      SHORT_CENTER[GATE_CENTER[g.gate]],
      g.state === 'hanging' ? '悬挂（未接通）' : '通道内',
      g.stars.map((p) => PLANET_LABELS[p] ?? p).join('、'),
      getGate(g.gate).keyword,
    ])
  if (!rows.length) return '这张盘没有激活任何闸门。'
  return table(['闸门', '名称', '中心', '状态', '激活星体', '关键词'], rows)
}

/** 通道按回路分组：只列已定义的，未激活的子回路不占篇幅 */
function channelByCircuit(chart: BodyGraph): string {
  const analysis = analyzeCircuitry(chart.channels.map((c) => c.key))
  const blocks: string[] = []

  for (const group of analysis.groups) {
    const groupMeta = GROUP_BY_ID[group.id]
    blocks.push(`### ${groupMeta.label} · ${groupMeta.en}`)
    blocks.push('')
    blocks.push(`主题：${groupMeta.theme}｜已定义 ${group.count} 条 / 该组共 ${group.total} 条`)
    blocks.push('')

    const touched = group.circuits.filter((c) => c.active.length)
    if (!touched.length) {
      blocks.push('本盘没有该回路组的完整通道。')
      blocks.push('')
      continue
    }
    for (const circuit of touched) {
      const meta = CIRCUIT_BY_ID[circuit.id]
      blocks.push(`#### ${meta.label} ${circuit.active.length}/${circuit.total} · ${meta.theme}`)
      blocks.push('')
      for (const key of circuit.active) {
        const def = CHANNEL_BY_KEY[key]
        const name = def ? `${def.nameZh}（${def.name}）` : key
        const ends = def
          ? `${SHORT_CENTER[def.centers[0]]} ↔ ${SHORT_CENTER[def.centers[1]]}`
          : ''
        blocks.push(`- **${key} ${name}**${ends ? `　${ends}` : ''}`)
        blocks.push(`  - ${getChannel(key).text}`)
      }
      blocks.push('')
      blocks.push(`> ${meta.essence}`)
      blocks.push('')
    }
  }

  // 防御：表外通道（例如导入的旧快照）不静默丢弃
  if (analysis.unknown.length) {
    blocks.push(`### 未归类通道`)
    blocks.push('')
    for (const key of analysis.unknown) blocks.push(`- ${key}：不在标准 36 通道回路表内，请核对数据。`)
    blocks.push('')
  }
  return blocks.join('\n')
}

/** 回路统计摘要（三行表 + 主导结论 + 口径说明） */
function circuitStatBlock(chart: BodyGraph): string {
  const analysis = analyzeCircuitry(chart.channels.map((c) => c.key))
  const rows = analysis.groups.map((g) => {
    const subs = g.circuits
      .map((c) => `${c.label.replace(/回路$/, '')} ${c.active.length}/${c.total}`)
      .join('；')
    return [
      g.label,
      `${g.count} / ${g.total}`,
      `${Math.round(g.share * 100)}%`,
      subs,
    ]
  })
  const out = [table(['回路组', '已定义 / 该组总数', '占本盘已定义通道', '子回路分布'], rows), '']
  out.push(`**主导**：${circuitryBrief(analysis).replace(/^回路分布：/, '')}`)
  out.push('')
  out.push(`> ${CIRCUIT_NOTE}`)
  return out.join('\n')
}

/** 盘面文档标题（文件名也用这个） */
export function chartDocTitle(archive: Pick<Archive, 'name'>): string {
  return `${archive.name} · 完整盘面资料`
}

/**
 * 拼装盘面文档（Markdown 正文）。
 * 顺序：基本信息 → 核心结论 → 显意识 → 潜意识 → 九中心 → 回路 → 通道 → 闸门。
 */
export function buildChartDocument(
  archive: Archive,
  chart: BodyGraph,
  generatedAt?: string,
): ReportInput {
  const body: string[] = []

  body.push('## 一、出生与计算信息')
  body.push('')
  body.push(
    table(
      ['项目', '内容'],
      [
        ['姓名', archive.name],
        ['出生时间', birthText(archive)],
        ['时区', archive.timezone],
        ['出生地', `${archive.location.place}（${archive.location.lat}, ${archive.location.lng}）`],
        ['显意识时刻（UTC）', chart.meta.personalityTime],
        ['潜意识时刻（UTC）', chart.meta.designTime],
      ],
    ),
  )
  if (chart.meta.warning) {
    body.push('')
    body.push(`> 注意：${chart.meta.warning}`)
  }

  body.push('')
  body.push('## 二、核心结论')
  body.push('')
  body.push(
    [
      `- **能量类型**：${TYPE_LABELS[chart.type]}（${chart.type}）`,
      `- **人生策略**：${chart.strategy}`,
      `- **内在权威**：${AUTHORITY_LABELS[chart.authority]}（${chart.authority}）`,
      `- **人生角色**：${chart.profile}`,
      `- **定义类型**：${DEFINITION_LABELS[chart.definition]}（${chart.definition}）`,
      `- **轮回交叉**：${crossNameOf(chart.personality, chart.design, chart.profile)}`,
      `- **已定义中心**：${
        chart.centers.filter((c) => c.defined).map((c) => SHORT_CENTER[c.id]).join('、') || '无'
      }`,
      `- **已定义通道**：${chart.channels.length} 条｜**激活闸门**：${chart.gates.length} 个｜**悬挂闸门**：${chart.hangingGates.length} 个`,
    ].join('\n'),
  )

  body.push('')
  body.push('## 三、显意识 13 星（Personality · 意识层）')
  body.push('')
  body.push(starTable(chart, 'personality'))

  body.push('')
  body.push('## 四、潜意识 13 星（Design · 身体层）')
  body.push('')
  body.push(starTable(chart, 'design'))

  body.push('')
  body.push('## 五、九大能量中心')
  body.push('')
  body.push(centerTable(chart))

  body.push('')
  body.push('## 六、回路分布')
  body.push('')
  body.push(circuitStatBlock(chart))

  body.push('')
  body.push('## 七、已定义通道（按回路分组）')
  body.push('')
  body.push(channelByCircuit(chart))

  body.push('')
  body.push('## 八、已激活闸门与悬挂闸门')
  body.push('')
  body.push(gateTable(chart))

  if (chart.hangingGates.length) {
    body.push('')
    body.push(
      `**悬挂闸门（只一端激活，未形成通道）**：${chart.hangingGates
        .map((g) => `${g} ${GATE_NAMES[g]?.zh ?? ''}`)
        .join('、')}`,
    )
  }

  // 各回路组的通道总数写在附录，便于人工核对（15 / 14 / 7 = 36）
  body.push('')
  body.push('## 附录 · 回路组通道总数')
  body.push('')
  body.push(
    table(
      ['回路组', '通道总数', '全部通道'],
      (['individual', 'collective', 'tribal'] as const).map((id) => {
        const list = groupChannels(id)
        return [GROUP_BY_ID[id].label, String(list.length), list.join('、')]
      }),
    ),
  )

  return {
    title: chartDocTitle(archive),
    // 复用「完整」档的序列化通道，但页眉文案改由 modeLabel 覆盖
    mode: 'full',
    modeLabel: '完整盘面',
    content: body.join('\n'),
    meta: { chartName: archive.name, scope: '完整盘面资料' },
    generatedAt,
  }
}

/** 一键导出：format 缺省给 Word（用户要的「文档」） */
export async function exportChartDocument(
  archive: Archive,
  chart: BodyGraph,
  format: ReportFormat = 'docx',
): Promise<ExportResult> {
  return exportReport(format, buildChartDocument(archive, chart))
}
