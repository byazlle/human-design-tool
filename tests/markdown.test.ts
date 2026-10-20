/**
 * Markdown 渲染器测试：层级、列表、防注入。
 */
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/services/markdown'

describe('renderMarkdown', () => {
  it('标题层级', () => {
    const html = renderMarkdown('# 大标题\n## 小标题\n### 三级')
    expect(html).toContain('<h1>大标题</h1>')
    expect(html).toContain('<h2>小标题</h2>')
    expect(html).toContain('<h3>三级</h3>')
  })

  it('加粗 / 斜体 / 行内代码', () => {
    const html = renderMarkdown('**重点**与*强调*以及`代码`')
    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<em>强调</em>')
    expect(html).toContain('<code>代码</code>')
  })

  it('无序与有序列表', () => {
    const html = renderMarkdown('- 甲\n- 乙\n\n1. 一\n2. 二')
    expect(html).toContain('<ul><li>甲</li><li>乙</li></ul>')
    expect(html).toContain('<ol><li>一</li><li>二</li></ol>')
  })

  it('防注入：HTML 被转义', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('段落与换行', () => {
    const html = renderMarkdown('第一行\n第二行\n\n第三段')
    expect(html).toContain('第一行<br>第二行')
    expect((html.match(/<p>/g) ?? []).length).toBe(2)
  })
})
