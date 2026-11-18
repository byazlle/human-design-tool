/**
 * 批量导入 / 计算 / 导出（v3.3.0）回归。
 *
 * 守的是三件事：
 * 1. 表格解析要宽容但不瞎猜（8 位 / 12 位 / 带分隔符都认，10 位这种必须报错）；
 * 2. 只有日期的行必须展开成「当天所有不同的图」，且序号 / 名称带后缀、备注写清第几个；
 * 3. 失败行不丢弃——照样占一行，原因写进备注列（T），否则用户会以为数据已入库。
 */
import { describe, expect, it } from 'vitest'
import {
  BATCH_EXPORT_HEADER,
  parseBatchTable,
  parseBirthCell,
  toCsv,
} from '../src/services/batchTable'
import { computeBatch, rowsFromArchives } from '../src/services/batchChart'

const SAMPLE = `序号,案主名称,出生时间,性别,省份,地区
1,张三,200001010101,男,浙江省,绍兴市
2,李四,20000101,女,浙江省,绍兴市
3,王五,199005211430,男,上海市,上海市`

describe('parseBirthCell', () => {
  it('12 位 = 精确到分', () => {
    expect(parseBirthCell('200001010101')).toEqual({
      year: 2000,
      month: 1,
      day: 1,
      hour: 1,
      minute: 1,
      dateOnly: false,
    })
  })

  it('8 位 = 只有日期（dateOnly）', () => {
    const b = parseBirthCell('20000101')!
    expect(b.dateOnly).toBe(true)
    expect(b.hour).toBe(0)
  })

  it('容忍带分隔符的写法', () => {
    expect(parseBirthCell('1990-05-21 14:30')?.hour).toBe(14)
    expect(parseBirthCell('1990/5/21 9:05')?.minute).toBe(5)
    expect(parseBirthCell('1990年5月21日')?.dateOnly).toBe(true)
    expect(parseBirthCell('1990-05-21T14:30')?.hour).toBe(14)
  })

  it('★ 长度不对或日期不存在时报错，不瞎猜', () => {
    expect(parseBirthCell('2000010112')).toBeNull() // 10 位
    expect(parseBirthCell('20000230')).toBeNull() // 2 月没有 30 日
    expect(parseBirthCell('18990101')).toBeNull() // 超出 1900–2100
    expect(parseBirthCell('200001012400')).toBeNull() // 24 点
    expect(parseBirthCell('')).toBeNull()
  })
})

describe('parseBatchTable', () => {
  const parsed = parseBatchTable(SAMPLE)

  it('跳过表头，三行都解析出来', () => {
    expect(parsed.headerSkipped).toBe(true)
    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows[0]).toMatchObject({ seq: '1', name: '张三', gender: '男', province: '浙江省', region: '绍兴市' })
    expect(parsed.issues).toEqual([])
  })

  it('制表符分隔（Excel 直接粘贴）也能解析', () => {
    const tsv = '1\t张三\t200001010101\t男\t浙江省\t绍兴市'
    const r = parseBatchTable(tsv)
    expect(r.delimiter).toBe('tab')
    expect(r.rows[0].name).toBe('张三')
  })

  it('缺名称 / 时间不合法时给出逐行问题，但仍保留该行', () => {
    const r = parseBatchTable(`1,,200001010101,男,a,b\n2,张三,2000010112,男,a,b`)
    expect(r.rows).toHaveLength(2)
    expect(r.issues.map((i) => i.line)).toEqual([1, 2])
    expect(r.issues[0].message).toContain('缺少案主名称')
    expect(r.issues[1].message).toContain('无法识别')
  })

  it('全空行被忽略', () => {
    expect(parseBatchTable('\n\n1,张三,200001010101,男,,,,\n\n').rows).toHaveLength(1)
  })
})

describe('toCsv', () => {
  it('带 BOM，表头是 A–T 共 20 列', () => {
    const csv = toCsv([])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(BATCH_EXPORT_HEADER).toHaveLength(20)
    expect(csv).toContain('序号,案主名称,出生时间')
    expect(csv).toContain('备注')
  })

  it('含逗号 / 引号 / 换行的单元格被正确转义', () => {
    const csv = toCsv([['1', '张,三', '含"引号"', '多\n行']])
    expect(csv).toContain('"张,三"')
    expect(csv).toContain('"含""引号"""')
    expect(csv).toContain('"多\n行"')
  })
})

describe('computeBatch', () => {
  it('精确时间的行：20 列齐全，核心结论与交叉名都在', async () => {
    const parsed = parseBatchTable('1,张三,200001010101,男,浙江省,绍兴市')
    const res = await computeBatch(parsed.rows, { timezone: 'Asia/Shanghai' })
    expect(res.rows).toHaveLength(1)
    const row = res.rows[0]
    expect(row).toHaveLength(20)
    expect(row[2]).toBe('200001010101')
    expect(row[6]).toBe('显化生产者')
    expect(row[7]).toContain('再告知')
    expect(row[8]).toBe('一分人')
    expect(row[9]).toContain('权威')
    expect(row[10]).toMatch(/^\d\/\d$/)
    expect(row[11]).toContain('右角度交叉之')
    expect(row[12]).toMatch(/^\d+\.\d$/)
    expect(row[16]).toContain('-')
    expect(row[18].split(';')).toHaveLength(9)
    expect(row[19]).toBe('')
  })

  it('★ 只有日期的行展开成多个图，序号与名称带后缀、备注写清第几个', async () => {
    const parsed = parseBatchTable('7,李四,20000101,女,浙江省,绍兴市')
    const res = await computeBatch(parsed.rows, { timezone: 'Asia/Shanghai' })
    expect(res.rows.length).toBeGreaterThan(1)
    expect(res.expandedRows).toBe(res.rows.length)
    res.rows.forEach((row, i) => {
      expect(row[0]).toBe(`7-${i + 1}`)
      expect(row[1]).toBe(`李四（${i + 1}）`)
      expect(row[2]).toHaveLength(12) // YYYYMMDD + 首次出现的 HHmm
      expect(row[19]).toContain(`该日共 ${res.rows.length} 个不同的图`)
      expect(row[19]).toContain(`第 ${i + 1} 个`)
    })
    // 不同行的图必须真的不同（用交叉 + 剖面 + 通道组合判断）
    const sig = res.rows.map((r) => `${r[10]}|${r[11]}|${r[16]}|${r[17]}`)
    expect(new Set(sig).size).toBe(res.rows.length)
  }, 30000)

  it('解析失败的行保留一行，原因写进备注列', async () => {
    const parsed = parseBatchTable('1,张三,2000010112,男,,')
    const res = await computeBatch(parsed.rows, { timezone: 'Asia/Shanghai' })
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0][0]).toBe('1')
    expect(res.rows[0][19]).toContain('无法识别')
    expect(res.rows[0][6]).toBe('')
  })

  it('空表格不产生行', async () => {
    const res = await computeBatch([], { timezone: 'Asia/Shanghai' })
    expect(res.rows).toEqual([])
    expect(res.expandedRows).toBe(0)
  })
})

describe('rowsFromArchives', () => {
  it('没算过盘的档案也占一行，备注说明原因', () => {
    const { rows, missing } = rowsFromArchives([
      {
        name: '甲',
        gender: 'female',
        birth: { year: 1990, month: 5, day: 21, hour: 14, minute: 30 },
        location: { place: '上海' },
        chartError: '出生信息非法',
      },
    ])
    expect(missing).toEqual(['甲'])
    expect(rows[0][1]).toBe('甲')
    expect(rows[0][19]).toContain('出生信息非法')
  })
})
