#!/usr/bin/env node
/**
 * 把 `src/services/aiPrompt.ts` 里的 12 个段落常量同步到
 * `docs/spec/AI-PROMPT-v4.0.md` 的对应 ```text 代码块，避免逐字漂移。
 *
 * 用法：
 *   node scripts/sync-prompt-spec.mjs            # 生成 / 更新文档代码块
 *   node scripts/sync-prompt-spec.mjs --check    # 只校验一致性（不改文件，CI 可用）
 *
 * v4.0.0：权威来源从 `aiClient.ts` 的四套整篇常量改成 `aiPrompt.ts` 的 12 段常量；
 * 文档按 `<!-- id: 常量名 -->` 标记定位代码块（不再靠数组下标），
 * 与 `tests/ai-prompt.test.ts` 的取块口径完全一致。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'src/services/aiPrompt.ts')
const DOC = resolve(ROOT, 'docs/spec/AI-PROMPT-v4.0.md')
const CHECK = process.argv.includes('--check')

const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n')

/** 文档里必须出现、且顺序固定的 12 段（顺序 = 五段拼装的阅读顺序） */
const NAMES = [
  'PROMPT_CORE',
  'PROMPT_ENTRY_FULL',
  'PROMPT_ENTRY_COMPOSITE',
  'PROMPT_ENTRY_SELECTION',
  'PROMPT_DETAIL_CONCISE',
  'PROMPT_DETAIL_DETAILED',
  'PROMPT_DETAIL_FULL',
  'PROMPT_STYLE_PLAIN',
  'PROMPT_STYLE_PRO',
  'PROMPT_SCOPE_FUSION',
  'PROMPT_SCOPE_ITEM',
  'PROMPT_SCOPE_OVERVIEW',
]

/** 提取常量的模板字符串正文（正文内不含反引号 / ${}） */
function promptOf(name) {
  const re = new RegExp('export const ' + name + '(?:\\s*:\\s*string)? = `([\\s\\S]*?)`', 'm')
  const m = re.exec(src)
  if (!m) throw new Error(`源码里找不到 ${name}`)
  return m[1].replace(/\s+$/, '')
}

/** 取出文档中所有 ```text 代码块正文（与测试的提取口径一致） */
function textBlocks(md) {
  const blocks = []
  const re = /```text\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(md))) blocks.push(m[1].replace(/\s+$/, ''))
  return blocks
}

/**
 * 按 `<!-- id: X -->` 标记替换紧随其后的第一个 text 代码块。
 * 标记缺失直接报错：宁可失败也不要「静默写到错误的块里」。
 */
function replaceBlock(doc, name, body) {
  const marker = `<!-- id: ${name} -->`
  const at = doc.indexOf(marker)
  if (at < 0) throw new Error(`文档缺少标记 ${marker}`)
  const open = doc.indexOf('```text\n', at)
  if (open < 0) throw new Error(`${marker} 之后没有 text 代码块`)
  const close = doc.indexOf('```', open + 8)
  if (close < 0) throw new Error(`${marker} 的代码块未闭合`)
  return {
    doc: doc.slice(0, open) + '```text\n' + body + '\n```' + doc.slice(close + 3),
    start: open,
  }
}

let doc = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n')

/** 标记出现顺序必须与 NAMES 一致：顺序错位说明文档结构被动过 */
const markerOrder = [...doc.matchAll(/<!-- id: (\w+) -->/g)].map((m) => m[1])
if (markerOrder.join(',') !== NAMES.join(',')) {
  throw new Error(
    `文档里的段落标记顺序与规范不符：\n  期望 ${NAMES.join(' → ')}\n  实际 ${markerOrder.join(' → ')}`,
  )
}

for (const name of NAMES) {
  doc = replaceBlock(doc, name, promptOf(name)).doc
}

const blocks = textBlocks(doc)
if (blocks.length !== NAMES.length) {
  throw new Error(`规范文档应有 ${NAMES.length} 个 text 代码块，实际 ${blocks.length} 个`)
}
for (const name of NAMES) {
  if (!blocks.includes(promptOf(name))) throw new Error(`${name} 与文档代码块不一致`)
}

if (CHECK) {
  const current = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n')
  if (current !== doc) {
    console.error('[FAIL] 规范文档与源码常量不一致，请运行 node scripts/sync-prompt-spec.mjs')
    process.exit(1)
  }
  console.log(`[OK] 规范文档 ${NAMES.length} 个提示词代码块与源码常量逐字一致`)
} else {
  writeFileSync(DOC, doc, 'utf8')
  console.log(`[OK] 已同步 ${NAMES.length} 个提示词代码块`)
}
