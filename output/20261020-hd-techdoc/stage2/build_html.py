# -*- coding: utf-8 -*-
"""Markdown -> 合规单文件 HTML 转换器（面向 html-to-doc 引擎）。
产出：封面(role=cover) + 目录(nav.doc-toc) + 正文(section)，
含 @page 页码规则、宋体小四、首行缩进等版式。"""
import re, sys, os, json

SRC = sys.argv[1]
OUT = sys.argv[2]

with open(SRC, encoding="utf-8") as f:
    lines = f.read().split("\n")

def inline(t):
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"`([^`]+?)`", r"<code>\1</code>", t)
    return t

title = "人类图（Human Design）桌面端计算应用 技术文档"
subtitle = "技术设计文档 · V1.0"
date_str = "2026-10-20"

# ---- 解析 ----
toc = []          # (level, id, text)  level=1 章, level=2 节
body = []         # 已渲染的正文 HTML 片段
chapter_idx = 0
section_idx = 0
in_code = False
code_buf = []
i = 0
list_stack = []   # (indent, tag)
para_buf = []

def flush_para():
    global para_buf
    if para_buf:
        txt = " ".join(para_buf).strip()
        if txt:
            body.append(f'<p>{inline(txt)}</p>')
        para_buf = []

def close_lists(upto_indent=None):
    global list_stack
    while list_stack and (upto_indent is None or list_stack[-1][0] >= upto_indent):
        ind, tag = list_stack.pop()
        body.append(f"</{tag}>")

def render_table(rows):
    # rows: list of raw cell lines (without leading/trailing |)
    html = ['<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;margin:10px 0;font-size:11pt">']
    # header
    hdr = [c.strip() for c in rows[0].strip("|").split("|")]
    html.append("<thead><tr>" + "".join(f'<th style="background-color:#eef2f8;border:1px solid #b8c4d8">{inline(c)}</th>' for c in hdr) + "</tr></thead>")
    for r in rows[2:]:
        cells = [c.strip() for c in r.strip("|").split("|")]
        html.append("<tr>" + "".join(f'<td style="border:1px solid #cdd6e6">{inline(c)}</td>' for c in cells) + "</tr>")
    html.append("</table>")
    return "".join(html)

table_buf = []

while i < len(lines):
    line = lines[i]
    # 代码块
    if line.strip().startswith("```"):
        if not in_code:
            flush_para(); close_lists()
            in_code = True; code_buf = []
        else:
            in_code = False
            code = "\n".join(code_buf)
            code_esc = code.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
            body.append(f'<pre style="background-color:#f5f5f5;border:1px solid #ddd;padding:10px;font-size:10.5pt;white-space:pre-wrap;font-family:Consolas,monospace">{code_esc}</pre>')
        i += 1; continue
    if in_code:
        code_buf.append(line); i += 1; continue

    s = line.strip()
    # 空行
    if s == "":
        flush_para(); close_lists()
        if table_buf:
            body.append(render_table(table_buf)); table_buf = []
        i += 1; continue

    # 表格
    if s.startswith("|") and "|" in s[1:]:
        # 可能是表格行
        if table_buf:
            table_buf.append(s)
        else:
            # 需确认下一行是分隔行
            if i+1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i+1]):
                table_buf = [s]
            else:
                flush_para(); para_buf.append(s)
        i += 1; continue
    else:
        if table_buf:
            body.append(render_table(table_buf)); table_buf = []

    # 标题
    m = re.match(r"^(#{1,4})\s+(.*)$", line)
    if m:
        flush_para(); close_lists()
        level = len(m.group(1)); text = m.group(2).strip()
        if level == 1:
            title = text  # 文档标题（封面用，正文不重复）
            i += 1; continue
        elif level == 2:
            chapter_idx += 1; section_idx = 0
            cid = f"section-{chapter_idx}"
            toc.append((1, cid, text))
            restart = ' data-page-restart="1"' if chapter_idx == 1 else ''
            if chapter_idx > 1:
                body.append("</section>")
            body.append(f'<section class="chapter" id="{cid}"{restart}><h1 class="chapter-h">{inline(text)}</h1>')
        elif level == 3:
            section_idx += 1
            sid = f"section-{chapter_idx}-{section_idx}"
            toc.append((2, sid, text))
            body.append(f'<h2 class="section-h" id="{sid}">{inline(text)}</h2>')
        else:
            body.append(f'<h3 class="sub-h">{inline(text)}</h3>')
        i += 1; continue

    # 列表
    lm = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
    if lm:
        flush_para()
        indent = len(lm.group(1))
        marker = lm.group(2)
        tag = "ol" if re.match(r"\d+\.", marker) else "ul"
        # 维护栈
        if not list_stack or indent > list_stack[-1][0]:
            list_stack.append((indent, tag)); body.append(f"<{tag}>")
        else:
            while list_stack and list_stack[-1][0] > indent:
                ind2, t2 = list_stack.pop(); body.append(f"</{t2}>")
            if not list_stack or list_stack[-1][0] < indent:
                list_stack.append((indent, tag)); body.append(f"<{tag}>")
        item = lm.group(3).strip()
        if re.match(r"^\[ \]|^\[x\]", item):
            sym = "☑" if item.startswith("[x]") else "☐"
            item = sym + " " + item[4:].strip()
        body.append(f"<li>{inline(item)}</li>")
        i += 1; continue

    # 引用
    if s.startswith(">"):
        flush_para(); close_lists()
        body.append(f'<blockquote style="border-left:3px solid #b8c4d8;margin:8px 0;padding:4px 12px;color:#555;background-color:#fafbfd">{inline(s[1:].strip())}</blockquote>')
        i += 1; continue

    # 普通段落
    para_buf.append(s)
    i += 1

flush_para(); close_lists()
if table_buf:
    body.append(render_table(table_buf))
if chapter_idx > 0:
    body.append("</section>")

# ---- 组装目录 ----
toc_html = ['<section role="cover">',
            '<nav class="doc-toc" aria-label="文档目录">',
            '<p class="toc-title" style="font-size:15pt;font-weight:bold;margin-bottom:10px">目录</p>',
            '<ol class="toc-list">']
cur_open = False
for lv, cid, txt in toc:
    if lv == 1:
        if cur_open:
            toc_html.append("</ol></li>")
        toc_html.append(f'<li><a href="#{cid}">{inline(txt)}</a><ol>')
        cur_open = True
    else:
        toc_html.append(f'<li><a href="#{cid}">{inline(txt)}</a></li>')
if cur_open:
    toc_html.append("</ol></li>")
toc_html.append("</ol></nav></section>")

# ---- 封面 ----
cover_html = f'''<section role="cover">
  <p style="font-size:26pt;font-weight:bold;text-align:center;margin-top:90px;line-height:1.4">{inline(title)}</p>
  <p style="font-size:15pt;text-align:center;color:#444;margin-top:24px">{subtitle}</p>
  <p style="font-size:12pt;text-align:center;color:#666;margin-top:300px">编制日期：{date_str}</p>
  <p style="font-size:12pt;text-align:center;color:#666">版本：V1.0</p>
</section>'''

style = """
<style>
  @page { @bottom-center { content: "第 " counter(page) " 页"; } }
  @page cover { @bottom-center { content: none; } }
  section[role="cover"] { page: cover; }
  body { font-family:"SimSun","宋体",serif; font-size:12pt; line-height:1.8; color:#1a1a1a; }
  .chapter-h { font-size:16pt; font-weight:bold; color:#16335c; margin:24px 0 12px 0; text-indent:0; }
  .section-h { font-size:13pt; font-weight:bold; color:#1f4e8c; margin:18px 0 8px 0; text-indent:0; }
  .sub-h { font-size:12pt; font-weight:bold; color:#333; margin:12px 0 6px 0; text-indent:0; }
  p { text-indent:2em; margin:6px 0; }
  blockquote p { text-indent:0; }
  table { border-collapse:collapse; }
  th, td { border:1px solid #cdd6e6; }
  ul, ol { margin:6px 0 6px 24px; }
  li { margin:2px 0; }
  pre { font-family:Consolas,monospace; }
  .doc-toc .toc-list, .doc-toc .toc-list ol { list-style:none; }
  .doc-toc .toc-list li { margin:4px 0; }
  .doc-toc a { text-decoration:none; color:#16335c; }
  code { font-family:Consolas,monospace; background-color:#f0f0f0; padding:0 3px; }
</style>
"""

html = ["<!DOCTYPE html><html><head><meta charset='utf-8'>", style, "</head><body>"]
html.append(cover_html)
html.append("\n".join(toc_html))
html.append("\n".join(body))
html.append("</body></html>")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(html))

print(f"OK {OUT} chapters={chapter_idx}")
