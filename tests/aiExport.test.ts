/**
 * 需求 #10 回归：报告四格式导出的纯函数与 Word 运行时可用性。
 *
 * 只测「不依赖 DOM / Electron」的部分：序列化、文件名、HTML 表格、
 * Word 文本块与 docx Blob。真实另存为 / 打印由桌面壳与浏览器承担，
 * 不做 mock 伪造成功。
 */
import { describe, expect, it } from 'vitest'
import {
  REPORT_FORMATS,
  REPORT_FORMAT_LABELS,
  buildWordBlob,
  markdownToHtml,
  parseReportLines,
  reportFileName,
  reportToHtml,
  reportToMarkdown,
  serializeFullReport,
} from '../src/services/aiExport'
import type { FullReport, ReportInput } from '../src/types/report'

const GENERATED_AT = '2026-11-07T03:21:15.000Z'

const conciseInput: ReportInput = {
  title: '张三 / 完整盘',
  mode: 'concise',
  content: '## 整图基调\n\n这张盘以**荐骨回应**为主。\n\n- 建议一\n- 建议二',
  generatedAt: GENERATED_AT,
  meta: { scope: 'single', chartName: '张三的完整盘' },
}

const fullReport: FullReport = {
  title: '张三 / 完整盘',
  sections: [
    { kind: 'dimension', key: 'dimension:综合解读', title: '综合解读', content: '维度正文 A' },
    { kind: 'gate', key: 'gate:13', title: '闸门 13', content: '闸门正文 B' },
    { kind: 'channel', key: 'channel:20-34', title: '通道 20-34', content: '通道正文 C' },
    { kind: 'gate', key: 'gate:62', title: '闸门 62', content: '' },
  ],
  fusion: '全盘整合分析正文',
  summary: '最终总结论正文',
  totalChars: 18000,
  skipped: ['闸门 62'],
  generatedAt: GENERATED_AT,
}

describe('导出格式契约', () => {
  it('四格式齐全且顺序固定（MD / Word / HTML / PDF）', () => {
    expect([...REPORT_FORMATS]).toEqual(['md', 'docx', 'html', 'pdf'])
    expect(REPORT_FORMATS.map((f) => REPORT_FORMAT_LABELS[f])).toEqual(['MD', 'Word', 'HTML', 'PDF'])
  })

  it('文件名去非法字符、带档位与 UTC 日期、扩展名正确', () => {
    const name = reportFileName({ ...conciseInput, title: 'A/B:C*D?E' }, 'docx')
    expect(name).toBe('A_B_C_D_E-精简-20261107.docx')
    expect(reportFileName(conciseInput, 'md').endsWith('.md')).toBe(true)
    expect(reportFileName(conciseInput, 'html').endsWith('.html')).toBe(true)
    expect(reportFileName(conciseInput, 'pdf').endsWith('.pdf')).toBe(true)
  })
})

describe('三档统一序列化（reportToMarkdown）', () => {
  it('精简档：页眉带档位/UTC 时间/上下文，正文逐字保留，末尾附免责声明', () => {
    const md = reportToMarkdown(conciseInput)
    expect(md).toContain('# 张三 / 完整盘')
    expect(md).toContain('解读档位：精简')
    expect(md).toContain('2026-11-07 03:21:15 UTC')
    expect(md).toContain('> 盘面：张三的完整盘')
    expect(md).toContain('> 范围：single')
    expect(md).toContain('## 整图基调')
    expect(md).toContain('- 建议二')
    expect(md).toContain('不构成医疗、命运、吉凶或投资建议')
  })

  it('详细档只换档位标签，不改写 AI 正文', () => {
    const md = reportToMarkdown({ ...conciseInput, mode: 'detailed' })
    expect(md).toContain('解读档位：详细')
    expect(md).toContain('这张盘以**荐骨回应**为主。')
  })

  it('完整档传入结构化报告时，按分项序列化而非用单篇 content', () => {
    const md = reportToMarkdown({
      title: '张三 / 完整盘',
      mode: 'full',
      content: '这是不该被采用的单篇占位内容',
      report: fullReport,
      generatedAt: GENERATED_AT,
    })
    expect(md).not.toContain('这是不该被采用的单篇占位内容')
    expect(md).toContain('维度正文 A')
    expect(md).toContain('闸门正文 B')
    expect(md).toContain('通道正文 C')
    expect(md).toContain('解读档位：完整')
  })
})

describe('完整版报告结构（serializeFullReport）', () => {
  it('顺序固定：维度 → 闸门 → 通道 → 全盘整合 → 最终总结论 → 未完成专项', () => {
    const md = serializeFullReport(fullReport)
    const positions = [
      md.indexOf('一、八大维度专项解读'),
      md.indexOf('二、逐闸门专项解读'),
      md.indexOf('三、逐通道专项解读'),
      md.indexOf('四、全盘整合分析'),
      md.indexOf('五、最终总结论'),
      md.indexOf('附：未完成的专项'),
    ]
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('失败跳过的分项不进正文，只在末尾列出', () => {
    const md = serializeFullReport(fullReport)
    expect(md).toContain('- 闸门 62（重试后仍失败，已跳过；本次报告不含该分项）')
    expect(md).not.toContain('### 2. 闸门 62')
  })

  it('某类分项全空时不留空章节，章号连续', () => {
    const md = serializeFullReport({
      ...fullReport,
      sections: fullReport.sections.filter((s) => s.kind !== 'gate'),
      skipped: [],
    })
    expect(md).toContain('一、八大维度专项解读')
    expect(md).toContain('二、逐通道专项解读')
    expect(md).toContain('三、全盘整合分析')
    expect(md).not.toContain('附：未完成的专项')
  })
})

describe('HTML 导出（表格与防注入）', () => {
  it('Markdown 表格转成真正的 table，普通 Markdown 仍交给 renderMarkdown', () => {
    const html = markdownToHtml(
      '## 清单\n\n| 项目 | 说明 |\n| --- | --- |\n| 闸门 13 | **倾听** |\n\n- 甲\n- 乙',
    )
    expect(html).toContain('<h2>清单</h2>')
    expect(html).toContain('<table><thead><tr><th>项目</th><th>说明</th></tr></thead>')
    expect(html).toContain('<td>闸门 13</td>')
    expect(html).toContain('<td><strong>倾听</strong></td>')
    expect(html).toContain('<ul><li>甲</li><li>乙</li></ul>')
  })

  it('表格单元格里的 HTML 同样被转义', () => {
    const html = markdownToHtml('| 名称 | 值 |\n| --- | --- |\n| <script>alert(1)</script> | 1 |')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('完整 HTML 文档：UTF-8 / CJK 字体 / 打印按钮 / @media print', () => {
    const html = reportToHtml(conciseInput)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('Microsoft YaHei')
    expect(html).toContain('@page { size: A4')
    expect(html).toContain('window.print()')
    expect(html).toContain('.no-print { display: none !important; }')
    expect(html).toContain('<h2>整图基调</h2>')
  })
})

describe('Word 导出（纯文本块 + docx 运行时）', () => {
  it('parseReportLines 识别标题层级、列表、引用、分隔线与表格', () => {
    const lines = parseReportLines(
      '# 标题\n### 三级\n- 甲\n1. 乙\n> 提示\n---\n| A | B |\n| --- | --- |\n| 1 | 2 |\n正文段',
    )
    expect(lines[0]).toMatchObject({ kind: 'heading', level: 1, text: '标题' })
    expect(lines[1]).toMatchObject({ kind: 'heading', level: 3, text: '三级' })
    expect(lines[2]).toMatchObject({ kind: 'bullet', text: '甲' })
    expect(lines[3]).toMatchObject({ kind: 'number', text: '1. 乙' })
    expect(lines[4]).toMatchObject({ kind: 'quote', text: '提示' })
    expect(lines[5].kind).toBe('hr')
    expect(lines[6]).toMatchObject({ kind: 'table', cells: [['A', 'B'], ['1', '2']] })
    expect(lines[7]).toMatchObject({ kind: 'paragraph', text: '正文段' })
  })

  it('行内标记被剥掉，且 docx 动态 import 能产出非空 Blob', async () => {
    const lines = parseReportLines('**重点**与`代码`')
    expect(lines[0].text).toBe('重点与代码')
    const blob = await buildWordBlob(reportToMarkdown(conciseInput), '测试报告')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000)
    expect(blob.type).toContain('wordprocessingml')
  })
})
