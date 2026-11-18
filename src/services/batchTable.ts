/**
 * 批量导入 / 导出用的表格解析（v3.3.0）。
 *
 * 列约定（A–F，与用户给的模板一致，必须是这个顺序）：
 * A 序号｜B 案主名称｜C 出生时间 YYYYMMDDHHMM｜D 性别｜E 省份｜F 地区
 *
 * 设计取舍：
 * - 不引入 xlsx 依赖：Excel 复制出来就是制表符分隔，另存 CSV 是逗号分隔，
 *   两种都支持；分隔符自动识别（有 TAB 就按 TAB）。
 * - 表头自动跳过（首列形如「序号 / 编号 / A」或含「名称 / 出生」）。
 * - 出生时间只认 8 位（YYYYMMDD，只有日期）与 12 位（YYYYMMDDHHMM）；
 *   另外容忍 YYYY-MM-DD HH:mm 这类带分隔符的写法，方便从别的表格直接粘贴。
 * - 解析失败不抛错，按行收集错误，界面逐行提示——批量任务不能因为一行脏数据整体失败。
 */

export interface ParsedBirth {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** true = 只给了日期（8 位），需要展开当日全部不同的图 */
  dateOnly: boolean
}

export interface BatchInputRow {
  /** 原始序号文本（可能为空，调用方用行号兜底） */
  seq: string
  name: string
  birthRaw: string
  gender: string
  province: string
  region: string
  /** 源文件里的行号（1 起，含表头行），用于报错定位 */
  line: number
}

export interface ParseIssue {
  line: number
  message: string
}

export interface ParsedBatch {
  rows: BatchInputRow[]
  issues: ParseIssue[]
  /** 是否识别并跳过了表头 */
  headerSkipped: boolean
  delimiter: 'tab' | 'comma'
}

const HEADER_HINTS = /^(序号|编号|案主|姓名|名称|出生|生日|性别|province)/i

function splitLine(line: string, delimiter: 'tab' | 'comma'): string[] {
  const sep = delimiter === 'tab' ? '\t' : ','
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === sep) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

/** 出生时间：8 位 / 12 位 / 带分隔符；失败返回 null */
export function parseBirthCell(raw: string): ParsedBirth | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null

  const digits = text.replace(/[^\d]/g, '')
  const compact = /^\d+$/.test(text.replace(/\s/g, ''))

  // 纯数字：只接受 8 / 12 位，其他长度一律判错（避免把 10 位当时间瞎猜）
  if (compact) {
    if (digits.length === 8) return birthOf(digits, '0000', true)
    if (digits.length === 12) return birthOf(digits.slice(0, 8), digits.slice(8), false)
    return null
  }

  // 带分隔符：2020-01-01 01:01 / 2020/1/1 1:01
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2})[:：时](\d{1,2})?)?/.exec(text)
  if (!m) return null
  const y = m[1]
  const mo = m[2].padStart(2, '0')
  const d = m[3].padStart(2, '0')
  if (m[4] === undefined) return birthOf(`${y}${mo}${d}`, '0000', true)
  const hh = m[4].padStart(2, '0')
  const mm = (m[5] ?? '0').padStart(2, '0')
  return birthOf(`${y}${mo}${d}`, `${hh}${mm}`, false)
}

function birthOf(ymd: string, hm: string, dateOnly: boolean): ParsedBirth | null {
  const year = Number(ymd.slice(0, 4))
  const month = Number(ymd.slice(4, 6))
  const day = Number(ymd.slice(6, 8))
  const hour = Number(hm.slice(0, 2))
  const minute = Number(hm.slice(2, 4))
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null
  if (month < 1 || month > 12) return null
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > dim) return null
  if (hour > 23 || minute > 59) return null
  return { year, month, day, hour, minute, dateOnly }
}

export function parseBatchTable(text: string): ParsedBatch {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n')
  const nonEmpty = rawLines.filter((l) => l.trim())
  const delimiter: 'tab' | 'comma' = nonEmpty.some((l) => l.includes('\t')) ? 'tab' : 'comma'

  const rows: BatchInputRow[] = []
  const issues: ParseIssue[] = []
  let headerSkipped = false

  rawLines.forEach((line, i) => {
    const lineNo = i + 1
    if (!line.trim()) return
    const cells = splitLine(line, delimiter)
    const first = cells[0] ?? ''
    if (!headerSkipped && rows.length === 0 && HEADER_HINTS.test(first.replace(/^["']|["']$/g, ''))) {
      headerSkipped = true
      return
    }
    const row: BatchInputRow = {
      seq: (cells[0] ?? '').trim(),
      name: (cells[1] ?? '').trim(),
      birthRaw: (cells[2] ?? '').trim(),
      gender: (cells[3] ?? '').trim(),
      province: (cells[4] ?? '').trim(),
      region: (cells[5] ?? '').trim(),
      line: lineNo,
    }
    if (!row.name && !row.birthRaw) {
      issues.push({ line: lineNo, message: '姓名与出生时间都为空，已跳过' })
      return
    }
    if (!row.name) issues.push({ line: lineNo, message: '缺少案主名称（B 列）' })
    if (!parseBirthCell(row.birthRaw)) {
      issues.push({
        line: lineNo,
        message: `出生时间「${row.birthRaw || '空'}」无法识别（需 YYYYMMDDHHMM 或 YYYYMMDD）`,
      })
    }
    rows.push(row)
  })

  return { rows, issues, headerSkipped, delimiter }
}

const GENDER_MAP: Record<string, 'male' | 'female' | 'other'> = {
  男: 'male',
  m: 'male',
  male: 'male',
  女: 'female',
  f: 'female',
  female: 'female',
  其他: 'other',
  other: 'other',
  未知: 'other',
}

export function genderOf(raw: string): 'male' | 'female' | 'other' | undefined {
  if (!raw) return undefined
  return GENDER_MAP[raw.trim().toLowerCase()]
}

/* ── CSV 输出 ──────────────────────────────────────────── */

/** 导出列名（A–T，顺序即用户模板） */
export const BATCH_EXPORT_HEADER = [
  '序号',
  '案主名称',
  '出生时间',
  '性别',
  '省份',
  '地区',
  '人类图类型',
  '策略',
  '定义',
  '内在权威',
  '剖面',
  '轮回交叉',
  '人格太阳',
  '人格地球',
  '设计太阳',
  '设计地球',
  '激活通道',
  '激活闸门',
  '九大能量中心状态',
  '备注',
] as const

function csvCell(value: string): string {
  const v = value ?? ''
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** 生成 CSV 文本（带 BOM，Excel 打开不乱码） */
export function toCsv(rows: string[][], header: readonly string[] = BATCH_EXPORT_HEADER): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
