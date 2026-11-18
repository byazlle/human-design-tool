/**
 * 批量计算（v3.3.0）：把导入表格逐行算成人类图，并拼成导出列（A–T）。
 *
 * 两个关键口径：
 * 1. **只给日期（8 位）的行**要展开成「当天所有不同的图」：按分钟遍历 00:00–23:59，
 *    用「类型 / 权威 / 定义 / 剖面 / 交叉 / 九中心 / 通道 / 悬挂闸门」做指纹去重，
 *    每个不同的图输出一行，并在备注里写明「该日共 N 个不同的图，第 i 个，首次出现 HH:mm」。
 *    之所以按分钟遍历而不是随手取几个时间点：出生时间差 4 分钟就可能换通道，抽样会漏图。
 * 2. 解析失败的行**不丢弃**：照样输出一行，把原因写进备注列，避免用户以为数据已入库。
 *
 * 计算全部走 `engine/bodygraph.computeChart()`，与单盘页完全同一套内核，不另写一套判定。
 */
import type { BodyGraph, CenterId } from '../types/hd'
import { AUTHORITY_LABELS, CENTER_IDS, DEFINITION_LABELS, TYPE_LABELS } from '../types/hd'
import { computeChart } from '../engine/bodygraph'
import { crossNameOf } from './crossData'
import { CITIES, PROVINCES } from '../data/regions'
import {
  genderOf,
  parseBirthCell,
  type BatchInputRow,
  type ParseIssue,
  type ParsedBirth,
} from './batchTable'

export interface BatchOptions {
  /** 默认中国时区 */
  timezone: string
  /** 进度回调：已处理 / 总数（日期行按 1440 分钟计） */
  onProgress?: (done: number, total: number) => void
}

export interface BatchResult {
  /** 每行 20 列，顺序与 BATCH_EXPORT_HEADER 一致 */
  rows: string[][]
  /** 逐行问题（含已写进备注列的失败行） */
  issues: ParseIssue[]
  /** 由日期展开出来的额外行数 */
  expandedRows: number
  /** 指纹去重前的取样次数（性能与口径核对用） */
  samples: number
}

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

/** 定义型 → 鼎心口径的「几分人」 */
const DEFINITION_ZH: Record<string, string> = {
  NoDefinition: '无定义',
  Single: '一分人',
  Split: '二分人',
  TripleSplit: '三分人',
  QuadrupleSplit: '四分人',
}

function gateLine(list: BodyGraph['personality'], planet: string): string {
  const p = list.find((x) => x.planet === planet)
  return p ? `${p.gate}.${p.line}` : ''
}

function crossText(chart: BodyGraph): string {
  return crossNameOf(chart.personality, chart.design, chart.profile)
}

function centersText(chart: BodyGraph): string {
  return CENTER_IDS.map((id) => {
    const defined = chart.centers.find((c) => c.id === id)?.defined
    return `${SHORT_CENTER[id]}:${defined ? '有定义' : '空白'}`
  }).join(';')
}

/** 结构指纹：只反映「图」的差别，不把行星度数算进去 */
function signatureOf(chart: BodyGraph): string {
  return [
    chart.type,
    chart.authority,
    chart.definition,
    chart.profile,
    crossText(chart),
    chart.centers.filter((c) => c.defined).map((c) => c.id).sort().join(','),
    chart.channels.map((c) => c.key).sort().join(','),
    [...chart.hangingGates].sort((a, b) => a - b).join(','),
  ].join('|')
}

/** 两个图的差别（用于日期展开时的备注，避免一堆看不出区别的行） */
function diffHint(prev: BodyGraph, cur: BodyGraph): string {
  const parts: string[] = []
  if (prev.type !== cur.type) parts.push('类型')
  if (prev.authority !== cur.authority) parts.push('权威')
  if (prev.definition !== cur.definition) parts.push('定义')
  if (prev.profile !== cur.profile) parts.push('剖面')
  if (crossText(prev) !== crossText(cur)) parts.push('交叉')
  const ch = (c: BodyGraph) => c.channels.map((x) => x.key).sort().join(',')
  if (ch(prev) !== ch(cur)) parts.push('通道')
  const cen = (c: BodyGraph) => c.centers.filter((x) => x.defined).map((x) => x.id).sort().join(',')
  if (cen(prev) !== cen(cur)) parts.push('九中心')
  const hang = (c: BodyGraph) => [...c.hangingGates].sort((a, b) => a - b).join(',')
  if (hang(prev) !== hang(cur)) parts.push('悬挂闸门')
  return parts.length ? `（相比上一个图：${parts.join('、')}不同）` : ''
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function birthText(b: ParsedBirth): string {
  return `${b.year}${pad2(b.month)}${pad2(b.day)}${b.dateOnly ? '' : `${pad2(b.hour)}${pad2(b.minute)}`}`
}

/** 一行结果（A–T） */
function rowOf(
  input: BatchInputRow,
  seq: string,
  name: string,
  birth: string,
  chart: BodyGraph,
  note: string,
): string[] {
  const channels = chart.channels.map((c) => c.key).sort().join(';')
  const gates = [...chart.gates]
    .map((g) => g.gate)
    .sort((a, b) => a - b)
    .join(';')
  return [
    seq,
    name,
    birth,
    input.gender,
    input.province,
    input.region,
    TYPE_LABELS[chart.type] ?? chart.type,
    chart.strategy,
    DEFINITION_ZH[chart.definition] ?? DEFINITION_LABELS[chart.definition] ?? chart.definition,
    AUTHORITY_LABELS[chart.authority] ?? chart.authority,
    chart.profile,
    crossText(chart),
    gateLine(chart.personality, 'Sun'),
    gateLine(chart.personality, 'Earth'),
    gateLine(chart.design, 'Sun'),
    gateLine(chart.design, 'Earth'),
    channels,
    gates,
    centersText(chart),
    note,
  ]
}

function errorRow(input: BatchInputRow, seq: string, reason: string): string[] {
  return [seq, input.name, input.birthRaw, input.gender, input.province, input.region, '', '', '', '', '', '', '', '', '', '', '', '', '', reason]
}

/**
 * 把某个本地日期展开成「当天所有不同的图」。
 * @returns 每个不同的图一条：首次出现的时间 + 图
 */
function expandDate(
  birth: ParsedBirth,
  timezone: string,
  onTick?: () => void,
): Array<{ hour: number; minute: number; chart: BodyGraph }> {
  const seen = new Map<string, { hour: number; minute: number; chart: BodyGraph }>()
  for (let m = 0; m < 1440; m += 1) {
    const hour = Math.floor(m / 60)
    const minute = m % 60
    let chart: BodyGraph
    try {
      chart = computeChart({
        year: birth.year,
        month: birth.month,
        day: birth.day,
        hour,
        minute,
        timezone,
        lat: 0,
        lng: 0,
      })
    } catch {
      // 单个时刻算不出来不应中断整天扫描
      continue
    }
    const sig = signatureOf(chart)
    if (!seen.has(sig)) seen.set(sig, { hour, minute, chart })
    if (onTick) onTick()
  }
  return [...seen.values()].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
}

export async function computeBatch(
  inputs: BatchInputRow[],
  opts: BatchOptions,
): Promise<BatchResult> {
  const issues: ParseIssue[] = []
  const rows: string[][] = []
  let expandedRows = 0
  let samples = 0

  const total = inputs.reduce((n, row) => {
    const b = parseBirthCell(row.birthRaw)
    return n + (b?.dateOnly ? 1440 : 1)
  }, 0)
  let done = 0
  const tick = () => {
    done += 1
    if (done % 90 === 0) opts.onProgress?.(done, total)
  }

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]
    const seq = input.seq || String(i + 1)
    const parsed = parseBirthCell(input.birthRaw)
    if (!parsed) {
      const reason = `出生时间无法识别（${input.birthRaw || '空'}），未计算`
      issues.push({ line: input.line, message: reason })
      rows.push(errorRow(input, seq, reason))
      continue
    }

    if (!parsed.dateOnly) {
      try {
        const chart = computeChart({
          year: parsed.year,
          month: parsed.month,
          day: parsed.day,
          hour: parsed.hour,
          minute: parsed.minute,
          timezone: opts.timezone,
          lat: 0,
          lng: 0,
        })
        rows.push(rowOf(input, seq, input.name, birthText(parsed), chart, ''))
      } catch (err) {
        const reason = `计算失败：${(err as Error).message || '未知错误'}`
        issues.push({ line: input.line, message: reason })
        rows.push(errorRow(input, seq, reason))
      }
      done += 1
      opts.onProgress?.(done, total)
      continue
    }

    // 只给日期：展开当天所有不同的图
    const variants = expandDate(parsed, opts.timezone, tick)
    samples += 1440
    if (!variants.length) {
      const reason = '该日所有时刻都无法计算，请核对日期与时区'
      issues.push({ line: input.line, message: reason })
      rows.push(errorRow(input, seq, reason))
      continue
    }
    if (variants.length === 1) {
      const v = variants[0]
      rows.push(
        rowOf(
          input,
          `${seq}-1`,
          `${input.name}（1）`,
          `${birthText(parsed)}${pad2(v.hour)}${pad2(v.minute)}`,
          v.chart,
          `只给了日期，当天只有 1 个图；按 ${pad2(v.hour)}:${pad2(v.minute)} 计算`,
        ),
      )
      expandedRows += 1
      continue
    }
    variants.forEach((v, idx) => {
      rows.push(
        rowOf(
          input,
          `${seq}-${idx + 1}`,
          `${input.name}（${idx + 1}）`,
          `${birthText(parsed)}${pad2(v.hour)}${pad2(v.minute)}`,
          v.chart,
          `只给了日期，该日共 ${variants.length} 个不同的图，第 ${idx + 1} 个，首次出现 ${pad2(v.hour)}:${pad2(v.minute)}${idx > 0 ? diffHint(variants[idx - 1].chart, v.chart) : ''}`,
        ),
      )
    })
    expandedRows += variants.length
    opts.onProgress?.(done, total)
    // 让出主线程：日期行要扫 1440 个时刻，否则进度条不会刷新
    await new Promise((r) => setTimeout(r, 0))
  }

  return { rows, issues, expandedRows, samples }
}

/** 省 / 市名称 → 经纬度与展示地名（用于「同时保存为档案」；不影响排盘） */
export function locationOf(province: string, region: string): {
  lat: number
  lng: number
  place: string
} {
  const p = province.trim()
  const r = region.trim()
  const hitCity = CITIES.find((c) => c.name === r || c.name.replace(/市$/, '') === r.replace(/市$/, ''))
  if (hitCity) return { lat: hitCity.lat, lng: hitCity.lng, place: `${p}${r}`.trim() || hitCity.name }
  const prov = PROVINCES.find((x) => x.name === p || x.name.replace(/省|市|自治区|维吾尔|壮族|回族/g, '') === p.replace(/省|市|自治区/g, ''))
  if (prov) return { lat: prov.lat, lng: prov.lng, place: `${p}${r}`.trim() || prov.name }
  // 未收录：只做为展示地名，坐标留 0（经纬度不参与人类图计算）
  return { lat: 0, lng: 0, place: `${p}${r}`.trim() || '未填写' }
}

/** 档案库 → 导出表格（批量导出数据用；与导入后的导出列完全一致） */
export function rowsFromArchives(
  archives: Array<{
    name: string
    gender?: 'male' | 'female' | 'other'
    birth: { year: number; month: number; day: number; hour: number; minute: number }
    location: { place: string }
    chart?: BodyGraph
    chartError?: string
  }>,
): { rows: string[][]; missing: string[] } {
  const rows: string[][] = []
  const missing: string[] = []
  archives.forEach((a, i) => {
    const b = a.birth
    const birth = `${b.year}${pad2(b.month)}${pad2(b.day)}${pad2(b.hour)}${pad2(b.minute)}`
    const genderText = a.gender === 'male' ? '男' : a.gender === 'female' ? '女' : a.gender === 'other' ? '其他' : ''
    const seq = String(i + 1)
    if (!a.chart) {
      missing.push(a.name)
      rows.push([seq, a.name, birth, genderText, '', a.location.place, '', '', '', '', '', '', '', '', '', '', '', '', '', a.chartError ? `计算失败：${a.chartError}` : '尚未计算，请先在设置页重新生成图表'])
      return
    }
    const cells = rowOf(
      { seq, name: a.name, birthRaw: birth, gender: genderText, province: '', region: a.location.place, line: i + 1 },
      seq,
      a.name,
      birth,
      a.chart,
      '',
    )
    rows.push(cells)
  })
  return { rows, missing }
}

/** 性别文本 → 档案 gender；无法识别时返回 undefined（不猜） */
export function genderForArchive(raw: string): 'male' | 'female' | 'other' | undefined {
  return genderOf(raw)
}
