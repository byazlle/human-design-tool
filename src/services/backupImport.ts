/**
 * 备份导入的纯校验层（与 Vue 组件解耦，便于回归测试）。
 *
 * 事实：SettingsView.exportAll 导出的档案会去掉 `chart`，且 `Archive.birth`
 * 不含 timezone（时区在 Archive 顶层）。因此导入时必须把顶层 timezone 补回
 * 出生信息后再校验，否则本应用自己导出的备份会被误判「时区缺失」。
 *
 * 本文件只做数据形状与字段校验，不包含任何人类图计算规则。
 */
import { ENGINE_VERSION, SCHEMA_VERSION } from '../engine/version'
import { validateBirth } from './validate'
import type { Archive } from '../types/hd'

export interface RejectedItem {
  name: string
  reason: string
}

export interface BackupImportResult {
  accepted: Archive[]
  rejected: RejectedItem[]
  /** schemaVersion 高于当前版本时的可见警告；null 表示无警告 */
  schemaWarning: string | null
  /**
   * 低版本备份的提示（schemaVersion < 当前）。
   * 这类备份**直接接受**，字段向下兼容；盘面快照会因 ENGINE_VERSION 不一致被清掉并自动补算。
   */
  legacyNote: string | null
}

function labelOf(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '(未命名)'
  const a = raw as Partial<Archive>
  const name = typeof a.name === 'string' ? a.name : ''
  const id = typeof a.id === 'string' ? a.id : ''
  return name || id || '(未命名)'
}

/**
 * 解析并校验一份备份文件的内容。
 * - 不丢弃未识别字段（高版本备份继续导入，只给警告）
 * - 同批次重复 id 去重
 * - 旧内核产出的盘面快照清掉，交给 ensureChart 重算
 */
export function parseBackup(data: unknown): BackupImportResult {
  const root = (data && typeof data === 'object' ? data : {}) as {
    archives?: unknown
    schemaVersion?: unknown
  }
  if (!Array.isArray(root.archives)) throw new Error('文件格式不正确')

  const incomingSchema = typeof root.schemaVersion === 'number' ? root.schemaVersion : null
  const schemaWarning =
    incomingSchema !== null && incomingSchema > SCHEMA_VERSION
      ? `备份 schemaVersion=${incomingSchema} 高于当前 ${SCHEMA_VERSION}；已继续导入，未识别字段原样保留。`
      : null
  // 低版本备份：直接接受（字段向下兼容），盘面快照由 ENGINE_VERSION 校验清掉后补算
  const legacyNote =
    incomingSchema !== null && incomingSchema < SCHEMA_VERSION
      ? `备份为旧版 schema v${incomingSchema}（当前 v${SCHEMA_VERSION}），已按现有结构导入，盘面将自动重算。`
      : null

  const accepted: Archive[] = []
  const rejected: RejectedItem[] = []
  const seen = new Set<string>()

  for (const raw of root.archives) {
    const label = labelOf(raw)
    if (!raw || typeof raw !== 'object') {
      rejected.push({ name: label, reason: '条目不是对象' })
      continue
    }
    const a = raw as Archive
    if (!a.id || !a.name || !a.birth || !a.timezone) {
      rejected.push({ name: label, reason: '缺少必要字段（id / 名称 / 出生信息 / 时区）' })
      continue
    }
    if (seen.has(a.id)) {
      rejected.push({ name: label, reason: '同批次内重复 id，已跳过重复项' })
      continue
    }
    // 出生字段必须逐项校验：Date.UTC 会静默滚动 month=13 / hour=25 之类的非法值。
    // 顶层 timezone 补回后再校验，不改 validateBirth 的签名。
    const issues = validateBirth({ ...a.birth, timezone: a.timezone })
    if (issues.length) {
      rejected.push({ name: label, reason: issues[0] })
      continue
    }
    seen.add(a.id)

    // 快照不是当前计算内核产出时清掉，让 ensureChart 重算，避免显示与出生信息不符的旧结果。
    // 其余字段（含未来版本可能新增的未识别字段）原样保留。
    const item: Archive = { ...a }
    if (item.chart && item.chart.meta?.engineVersion !== ENGINE_VERSION) {
      item.chart = undefined
      item.chartError = undefined
    }
    accepted.push(item)
  }

  return { accepted, rejected, schemaWarning, legacyNote }
}
