/**
 * 备份导出 → 导入 回归测试。
 *
 * 背景（A 组缺陷）：SettingsView.exportAll 导出的档案会去掉 `chart`，且
 * `Archive.birth` 不含 timezone（时区在 Archive 顶层）。旧实现导入时直接
 * `validateBirth(a.birth)`，导致本应用自己导出的备份 100% 被判「时区缺失」。
 *
 * 本测试锁定导出形状 → 导入全部被接受、0 跳过，并覆盖 schemaVersion 警告、
 * 同批次重复 id、旧内核快照清理。
 */
import { describe, expect, it } from 'vitest'
import { parseBackup } from '../src/services/backupImport'
import { ENGINE_VERSION, SCHEMA_VERSION } from '../src/engine/version'

/** 与 SettingsView.exportAll 的输出形状一致：archive 去掉 chart，birth 不含 timezone */
function exportedArchiveShape(id: string) {
  return {
    id,
    name: `档案 ${id}`,
    gender: 'other',
    birth: { year: 1990, month: 5, day: 21, hour: 14, minute: 30, second: 0 },
    timezone: 'Asia/Shanghai',
    location: { lat: 31.23, lng: 121.47, place: '上海' },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function backupPayload(archives: unknown[], schemaVersion: number = SCHEMA_VERSION) {
  return {
    app: 'humandesign-tool',
    version: schemaVersion,
    schemaVersion,
    exportedAt: '2026-01-01T00:00:00.000Z',
    archives,
  }
}

describe('备份导入校验', () => {
  it('本应用导出的备份形状 → 全部被接受，0 跳过', () => {
    const data = JSON.parse(
      JSON.stringify(backupPayload([exportedArchiveShape('a'), exportedArchiveShape('b')])),
    )
    const result = parseBackup(data)
    expect(result.rejected).toEqual([])
    expect(result.accepted.map((a) => a.id)).toEqual(['a', 'b'])
    expect(result.schemaWarning).toBeNull()
    // 顶层 timezone 必须在校验时补回出生信息
    expect(result.accepted[0].timezone).toBe('Asia/Shanghai')
  })

  it('缺时区的条目仍会被拒（校验没有被放宽）', () => {
    const bad = { ...exportedArchiveShape('c'), timezone: '' }
    const result = parseBackup(backupPayload([bad]))
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('时区')
  })

  it('同批次内重复 id 只保留第一份', () => {
    const result = parseBackup(
      backupPayload([exportedArchiveShape('dup'), exportedArchiveShape('dup')]),
    )
    expect(result.accepted.map((a) => a.id)).toEqual(['dup'])
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('重复')
  })

  it('schemaVersion 高于当前时给出可见警告但继续导入', () => {
    const result = parseBackup(
      backupPayload([exportedArchiveShape('future')], SCHEMA_VERSION + 1),
    )
    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
    expect(result.schemaWarning).toContain('schemaVersion')
  })

  it('旧内核产出的 chart 会被清掉，交给 ensureChart 重算', () => {
    const withStaleChart = {
      ...exportedArchiveShape('stale'),
      chart: { meta: { engineVersion: '0.9.0-legacy' } },
    }
    const result = parseBackup(backupPayload([withStaleChart]))
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].chart).toBeUndefined()
    expect(result.accepted[0].chartError).toBeUndefined()
  })

  it('同内核版本的 chart 会原样保留', () => {
    const withChart = {
      ...exportedArchiveShape('fresh'),
      chart: { meta: { engineVersion: ENGINE_VERSION } },
    }
    const result = parseBackup(backupPayload([withChart]))
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].chart).toBeTruthy()
  })

  it('schemaVersion 低于当前（旧版备份）直接接受并提示重算', () => {
    const result = parseBackup(
      backupPayload([exportedArchiveShape('legacy')], SCHEMA_VERSION - 1),
    )
    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
    expect(result.schemaWarning).toBeNull()
    expect(result.legacyNote).toContain('旧版')
  })

  it('archives 不是数组时直接抛错（文件格式不正确）', () => {
    expect(() => parseBackup({ archives: 'nope' })).toThrow('文件格式不正确')
  })
})
