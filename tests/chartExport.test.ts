/**
 * 盘面文档导出（v3.2.0）回归：
 * 1. 一份文档必须覆盖用户要求的全部维度（显/潜意识 13 星、九中心、回路、通道、闸门、
 *    类型 / 策略 / 权威），少一段就是导出漏项；
 * 2. 页眉不能写成「解读档位：完整」——那是 AI 报告的口径，盘面文档用 modeLabel 覆盖；
 * 3. 回路分组要按子回路归位，不能把 20-57 归到整合。
 */
import { describe, expect, it } from 'vitest'
import type { Archive, BodyGraph, CenterId } from '../src/types/hd'
import { buildChartDocument, chartDocTitle } from '../src/services/chartExport'
import { buildWordBlob, reportFileName, reportToHtml, reportToMarkdown } from '../src/services/aiExport'

const CENTERS: CenterId[] = [
  'head',
  'ajna',
  'throat',
  'g',
  'heart',
  'sacral',
  'spleen',
  'solar',
  'root',
]

function makeChart(): BodyGraph {
  return {
    type: 'Generator',
    strategy: '等待回应',
    authority: 'Sacral',
    profile: '2/4',
    definition: 'Split',
    incarnationCross: '右角度交叉之四方之道',
    centers: CENTERS.map((id) => ({ id, defined: ['sacral', 'throat', 'g', 'spleen'].includes(id) })),
    gates: [
      { gate: 20, stars: ['Earth', 'Sun'], state: 'in-channel' },
      { gate: 34, stars: ['Sun'], state: 'in-channel' },
      { gate: 10, stars: ['Moon'], state: 'in-channel' },
      { gate: 57, stars: ['Venus'], state: 'in-channel' },
      { gate: 1, stars: ['Mars'], state: 'hanging' },
    ],
    channels: [
      { key: '10-57', gates: [10, 57] },
      { key: '20-57', gates: [20, 57] },
      { key: '20-34', gates: [20, 34] },
    ],
    hangingGates: [1],
    personality: [
      { planet: 'Sun', longitude: 12.34, gate: 34, line: 3, color: 2, tone: 4, base: 1 },
      { planet: 'Earth', longitude: 192.34, gate: 20, line: 6, color: 1, tone: 2, base: 3 },
    ],
    design: [
      { planet: 'Sun', longitude: 200.71, gate: 57, line: 1, color: 5, tone: 6, base: 2 },
      { planet: 'Earth', longitude: 20.71, gate: 51, line: 4, color: 2, tone: 3, base: 1 },
      { planet: 'Moon', longitude: 88.05, gate: 10, line: 2, color: 3, tone: 1, base: 4 },
    ],
    meta: {
      personalityTime: '1990-05-21T06:30:00.000Z',
      designTime: '1990-05-18T00:00:00.000Z',
      personalitySun: 12.34,
      designSun: 200.71,
    },
  }
}

const ARCHIVE: Archive = {
  id: 'a1',
  name: '测试档案',
  birth: { year: 1990, month: 5, day: 21, hour: 14, minute: 30 },
  timezone: 'Asia/Shanghai',
  location: { lat: 31.23, lng: 121.47, place: '上海' },
  createdAt: '2026-11-17T00:00:00.000Z',
}

describe('buildChartDocument：维度覆盖', () => {
  const doc = buildChartDocument(ARCHIVE, makeChart(), '2026-11-17T02:00:00.000Z')
  const md = reportToMarkdown(doc)

  it('标题带姓名与「完整盘面资料」', () => {
    expect(doc.title).toBe(chartDocTitle(ARCHIVE))
    expect(doc.title).toBe('测试档案 · 完整盘面资料')
    expect(md.startsWith('# 测试档案 · 完整盘面资料')).toBe(true)
  })

  it('★ 页眉用「文档类型」，不冒充 AI 解读档位', () => {
    expect(md).toContain('文档类型：完整盘面')
    expect(md).not.toContain('解读档位：')
  })

  it('八个章节标题齐全（基本信息→核心结论→显→潜→中心→回路→通道→闸门）', () => {
    const titles = [
      '一、出生与计算信息',
      '二、核心结论',
      '三、显意识 13 星',
      '四、潜意识 13 星',
      '五、九大能量中心',
      '六、回路分布',
      '七、已定义通道',
      '八、已激活闸门与悬挂闸门',
    ]
    for (const t of titles) expect(md).toContain(t)
  })

  it('核心结论含类型 / 策略 / 权威 / 角色 / 定义 / 交叉', () => {
    expect(md).toContain('生产者（Generator）')
    expect(md).toContain('等待回应')
    expect(md).toContain('骶骨权威（Sacral）')
    expect(md).toContain('2/4')
    expect(md).toContain('二分定义（Split）')
    // v3.3.0：交叉列改为「角度交叉之主题（English）· 四闸门」，由实算四闸门查表得出
    expect(md).toContain('右角度交叉之')
    expect(md).toContain('· 34/20 | 57/51')
  })

  it('出生信息与两次计算时刻都在', () => {
    expect(md).toContain('1990-05-21 14:30')
    expect(md).toContain('Asia/Shanghai')
    expect(md).toContain('上海')
    expect(md).toContain('1990-05-21T06:30:00.000Z')
    expect(md).toContain('1990-05-18T00:00:00.000Z')
  })

  it('显意识 / 潜意识的星体表按 PLANET 落点逐条列出（闸门.爻 + 度数 + 色调基）', () => {
    expect(md).toContain('34.3')
    expect(md).toContain('20.6')
    expect(md).toContain('57.1')
    expect(md).toContain('10.2')
    expect(md).toContain('12.34°')
    expect(md).toContain('2/4/1')
    expect(md).toContain('5/6/2')
  })

  it('九中心：全部九行都在，且区分已定义 / 开放', () => {
    for (const label of ['头顶中心', '眉心中心', '喉咙中心', 'G 中心', '心（意志）中心', '脾中心', '骶骨中心', '情绪（太阳神经丛）中心', '根中心']) {
      expect(md).toContain(label)
    }
    expect(md).toContain('| 喉咙中心 | 已定义 |')
    expect(md).toContain('| 头顶中心 | 开放 |')
  })

  it('★ 回路统计按组给出，且 20-57 归知晓、10-57/20-34 归整合', () => {
    /** 截取某个三四级标题到下一个 ###/#### 之间的内容（附录里也含 20-57，不能算进整合段） */
    const sectionOf = (head: string) => {
      const start = md.indexOf(head)
      if (start < 0) return ''
      const rest = md.slice(start + head.length)
      const end = rest.search(/\n#{3,4} /)
      return end < 0 ? rest : rest.slice(0, end)
    }

    expect(md).toContain('个体回路组')
    expect(md).toContain('知晓回路 1/9')
    expect(md).toContain('整合通道 2/4')

    const integrationBlock = sectionOf('#### 整合通道 2/4')
    expect(integrationBlock).toContain('10-57')
    expect(integrationBlock).toContain('20-34')
    expect(integrationBlock).not.toContain('20-57')

    const knowingBlock = sectionOf('#### 知晓回路 1/9')
    expect(knowingBlock).toContain('20-57')
  })

  it('通道逐条带名称、两端中心与释义', () => {
    expect(md).toContain('**20-57 脑波（The Brainwave）**')
    expect(md).toContain('喉咙 ↔ 脾')
    expect(md).toContain('你的直觉在当下闪现')
  })

  it('闸门表含状态与激活星体；悬挂闸门单独点名', () => {
    expect(md).toContain('| 34 | 力量 |')
    expect(md).toContain('悬挂（未接通）')
    expect(md).toContain('地球、太阳')
    expect(md).toContain('**悬挂闸门（只一端激活，未形成通道）**：1')
  })

  it('附录给出三组通道总数（15 / 14 / 7）', () => {
    expect(md).toContain('附录 · 回路组通道总数')
    expect(md).toContain('| 个体回路组 | 15 |')
    expect(md).toContain('| 集体回路组 | 14 |')
    expect(md).toContain('| 部落回路组 | 7 |')
  })

  it('末尾带免责声明（与 AI 报告同一份）', () => {
    expect(md).toContain('---')
    expect(md.split('---').length).toBeGreaterThan(2)
  })
})

describe('格式产物', () => {
  it('Word / HTML 都能真的生成（表格走导出侧的表格渲染器）', async () => {
    const doc = buildChartDocument(ARCHIVE, makeChart(), '2026-11-17T02:00:00.000Z')
    const md = reportToMarkdown(doc)
    const blob = await buildWordBlob(md, doc.title)
    expect(blob.size).toBeGreaterThan(4000)
    const html = reportToHtml(doc)
    expect(html).toContain('<table')
    expect(html).toContain('回路分布')
  })
})

describe('文件名与兼容性', () => {
  it('文件名用「完整盘面」而不是「完整」', () => {
    const doc = buildChartDocument(ARCHIVE, makeChart(), '2026-11-17T02:00:00.000Z')
    expect(reportFileName(doc, 'docx')).toBe('测试档案 · 完整盘面资料-完整盘面-20261117.docx')
  })

  it('不传 modeLabel 的 AI 报告页眉逐字不变', () => {
    const md = reportToMarkdown({ title: 'T', mode: 'concise', content: '正文' })
    expect(md).toContain('解读档位：精简')
    expect(md).not.toContain('文档类型')
  })
})
