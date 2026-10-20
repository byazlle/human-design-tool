/**
 * 轻量 Markdown 渲染器（离线、零依赖、防注入）。
 *
 * 流程：先整体 HTML 转义（防注入），再做结构化替换。
 * 支持：# 标题层级、**加粗**、*斜体*、`行内代码`、- / 1. 列表、> 引用、--- 分隔线、段落与换行。
 * 供 AI 解读结果使用；生成逻辑不变，仅改变展示。
 */

/** HTML 转义，防注入 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 行内元素：加粗 / 斜体 / 行内代码 */
function inline(s: string): string {
  let out = s
  // 行内代码（先处理，避免内部被再加粗/斜体）
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  // 加粗
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // 斜体（避免吃掉已生成的加粗标签：只匹配单个 * 且不成对紧邻）
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>')
  return out
}

/** 把连续的列表行聚合成 ul / ol */
function renderList(lines: string[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul'
  const items = lines.map((l) => `<li>${inline(l)}</li>`).join('')
  return `<${tag}>${items}</${tag}>`
}

export function renderMarkdown(src: string): string {
  const text = escapeHtml(src.replace(/\r\n/g, '\n'))
  const lines = text.split('\n')

  const html: string[] = []
  let para: string[] = []
  let listBuf: string[] = []
  let listOrdered = false
  let quoteBuf: string[] = []

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${para.map(inline).join('<br>')}</p>`)
      para = []
    }
  }
  const flushList = () => {
    if (listBuf.length) {
      html.push(renderList(listBuf, listOrdered))
      listBuf = []
    }
  }
  const flushQuote = () => {
    if (quoteBuf.length) {
      html.push(`<blockquote>${quoteBuf.map(inline).join('<br>')}</blockquote>`)
      quoteBuf = []
    }
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushQuote()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // 空行：段落/列表结束
    if (!line.trim()) {
      flushAll()
      continue
    }

    // 分隔线
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line.trim())) {
      flushAll()
      html.push('<hr>')
      continue
    }

    // 标题（# 到 ####）
    const h = line.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      flushAll()
      const level = h[1].length
      html.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }

    // 引用
    const q = line.match(/^&gt;\s?(.*)$/)
    if (q) {
      flushPara()
      flushList()
      quoteBuf.push(q[1])
      continue
    }

    // 无序列表（- 或 *）
    const ul = line.match(/^[-*]\s+(.+)$/)
    if (ul && !/^\*{3,}$/.test(line.trim())) {
      flushPara()
      flushQuote()
      if (listBuf.length && listOrdered) {
        flushList()
      }
      listOrdered = false
      listBuf.push(ul[1])
      continue
    }

    // 有序列表（1. / 1、）
    const ol = line.match(/^\d+[.、]\s*(.+)$/)
    if (ol) {
      flushPara()
      flushQuote()
      if (listBuf.length && !listOrdered) {
        flushList()
      }
      listOrdered = true
      listBuf.push(ol[1])
      continue
    }

    // 普通文本行
    flushList()
    flushQuote()
    para.push(line)
  }

  flushAll()
  return html.join('\n')
}
