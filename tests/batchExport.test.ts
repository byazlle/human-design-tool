/**
 * v3.0.0：批量导出回归。
 * 钉住三件事：文件名不覆盖用户已有文件的规则入口、正文与手动导出逐字一致、
 * 单份写盘失败不影响其余份（AC-10 / AC-11）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDesktopBridge } from '../src/services/desktopBridge'
import {
  AUTO_EXPORT_KEY,
  OUTPUT_DIR_KEY,
  batchFileName,
  batchMarkdown,
  exportBatchReadings,
  getOutputDir,
  isAutoExport,
  setAutoExport,
  setOutputDir,
  type BatchExportItem,
} from '../src/services/batchExport'
import { reportToMarkdown } from '../src/services/aiExport'

vi.mock('../src/services/desktopBridge', () => ({
  getDesktopBridge: vi.fn(() => null),
}))

const mockedBridge = vi.mocked(getDesktopBridge)

function item(over: Partial<BatchExportItem> = {}): BatchExportItem {
  return {
    archiveId: 'a1',
    name: '张三',
    title: '综合解读',
    content: '这是正文',
    mode: 'detailed',
    scope: 'unified',
    ref: 'gates+profile:comprehensive:-',
    at: '2026-11-11T08:30:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  const mem = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  })
  mockedBridge.mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('保存位置与开关的持久化', () => {
  it('记住用户选的目录，默认开启自动导出', () => {
    expect(getOutputDir()).toBe('')
    expect(isAutoExport()).toBe(true)
    setOutputDir('D:/解读')
    setAutoExport(false)
    expect(getOutputDir()).toBe('D:/解读')
    expect(isAutoExport()).toBe(false)
    expect(OUTPUT_DIR_KEY).toBe('hdt.batch.outputDir.v1')
    expect(AUTO_EXPORT_KEY).toBe('hdt.batch.autoExport.v1')
  })
})

describe('batchFileName', () => {
  it('档案名 / 范围 / 受众 / 本地时间戳都在，且以 .md 结尾', () => {
    const name = batchFileName(item(), 'plain')
    expect(name.endsWith('.md')).toBe(true)
    expect(name).toContain('张三')
    expect(name).toContain('unified')
    expect(name).toContain('简明版')
  })

  it('清洗 Windows 非法字符，长度留出去重后缀的余量', () => {
    const name = batchFileName(item({ name: 'a/b:c*d?e"f<g>h|i' }), 'pro')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
    expect(name.replace(/\.md$/, '').length).toBeLessThanOrEqual(56)
  })
})

describe('batchMarkdown', () => {
  it('与手动导出逐字一致（含页眉、档案名与免责声明）', () => {
    const i = item()
    const expected = reportToMarkdown({
      title: i.title,
      mode: i.mode,
      content: i.content,
      generatedAt: i.at,
      meta: { chartName: i.name, scope: i.scope, ref: i.ref },
    })
    expect(batchMarkdown(i, 'pro')).toBe(expected)
    expect(batchMarkdown(i, 'pro')).toContain('本报告由用户自行配置的 AI 接口生成')
  })
})

describe('exportBatchReadings', () => {
  it('空内容不产生任何导出', async () => {
    expect(await exportBatchReadings([item({ content: '' })])).toEqual({
      mode: 'none',
      written: [],
      failed: [],
    })
  })

  it('无桌面桥时退化为逐个下载，每人一份', async () => {
    const clicks: string[] = []
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => undefined,
    })
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click() {}, remove() {} }),
      body: { appendChild: (a: { download: string }) => clicks.push(a.download) },
    })
    vi.stubGlobal('window', { setTimeout: () => 0 })
    vi.stubGlobal('Blob', class {})

    const res = await exportBatchReadings([item(), item({ archiveId: 'a2', name: '李四' })])
    expect(res.mode).toBe('download')
    expect(res.written).toHaveLength(2)
    expect(res.failed).toHaveLength(0)
    expect(clicks).toHaveLength(2)
  })

  it('★ 单份写盘失败只记进失败清单，其余份继续导出', async () => {
    let n = 0
    mockedBridge.mockReturnValue({
      file: {
        writeInDir: async ({ fileName }: { fileName: string }) => {
          n += 1
          return n === 2
            ? { ok: false, error: '权限不足' }
            : { ok: true, filePath: `C:/out/${fileName}` }
        },
      },
    } as never)

    const res = await exportBatchReadings(
      [item(), item({ archiveId: 'a2', name: '李四' }), item({ archiveId: 'a3', name: '王五' })],
      { dirPath: 'C:/out', audience: 'pro' },
    )
    expect(res.mode).toBe('directory')
    expect(res.written).toHaveLength(2)
    expect(res.failed).toEqual([{ name: '李四', error: '权限不足' }])
    expect(n).toBe(3)
  })

  it('不覆盖：同名只把同一个期望文件名交给主进程，由主进程加 -2', async () => {
    const names: string[] = []
    mockedBridge.mockReturnValue({
      file: {
        writeInDir: async ({ fileName }: { fileName: string }) => {
          names.push(fileName)
          return { ok: true, filePath: `C:/out/${fileName}` }
        },
      },
    } as never)

    await exportBatchReadings([item(), item()], { dirPath: 'C:/out' })
    expect(names).toHaveLength(2)
    expect(names[0]).toBe(names[1])
  })
})
