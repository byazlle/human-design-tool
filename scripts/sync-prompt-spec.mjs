#!/usr/bin/env node
/**
 * 把 src/services/aiClient.ts 里的四套 PROMPT_SYSTEM_* 常量同步到
 * docs/spec/AI-PROMPT-v2.0.md 的对应 ```text 代码块，避免逐字漂移。
 *
 * 用法：
 *   node scripts/sync-prompt-spec.mjs            # 生成 / 更新文档代码块
 *   node scripts/sync-prompt-spec.mjs --check    # 只校验一致性（不改文件，CI 可用）
 *
 * tests/ai-prompt.test.ts 按代码块出现顺序做逐字比对，所以本脚本只替换
 * 2.1 / 3.1 / 5.1 / 5.2 四个小节，不动 1.3 事实块模板与 4.6 验收夹具。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'src/services/aiClient.ts')
const DOC = resolve(ROOT, 'docs/spec/AI-PROMPT-v2.0.md')
const CHECK = process.argv.includes('--check')

const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n')

/** 提取常量的模板字符串正文（正文内不含反引号 / ${}） */
function promptOf(name) {
  const re = new RegExp('export const PROMPT_SYSTEM_' + name + ' = `([\\s\\S]*?)`', 'm')
  const m = re.exec(src)
  if (!m) throw new Error(`源码里找不到 PROMPT_SYSTEM_${name}`)
  return m[1]
}

const MAPPING = [
  { heading: '### 2.1', name: 'CONCISE', blockIndex: 1 },
  { heading: '### 3.1', name: 'DETAILED', blockIndex: 2 },
  { heading: '### 5.1', name: 'FULL', blockIndex: 4 },
  { heading: '### 5.2', name: 'FUSION', blockIndex: 5 },
]

/** 取出文档中所有 ```text 代码块正文（与测试的提取口径一致） */
function textBlocks(md) {
  const blocks = []
  const re = /```text\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(md))) blocks.push(m[1].replace(/\s+$/, ''))
  return blocks
}

let doc = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n')

for (const { heading, name } of MAPPING) {
  const body = promptOf(name)
  const start = doc.indexOf(heading)
  if (start < 0) throw new Error(`文档缺少小节 ${heading}`)
  const open = doc.indexOf('```text\n', start)
  if (open < 0) throw new Error(`${heading} 之后没有 text 代码块`)
  const close = doc.indexOf('```', open + 8)
  if (close < 0) throw new Error(`${heading} 的代码块未闭合`)
  doc = doc.slice(0, open) + '```text\n' + body + '\n```' + doc.slice(close + 3)
}

const blocks = textBlocks(doc)
if (blocks.length !== 6) {
  throw new Error(`规范文档应有 6 个 text 代码块，实际 ${blocks.length} 个（不要增删代码块）`)
}
for (const { name, blockIndex } of MAPPING) {
  if (promptOf(name) !== blocks[blockIndex]) {
    throw new Error(`PROMPT_SYSTEM_${name} 与代码块 [${blockIndex}] 不一致`)
  }
}

if (CHECK) {
  const current = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n')
  if (current !== doc) {
    console.error('[FAIL] 规范文档与源码常量不一致，请运行 node scripts/sync-prompt-spec.mjs')
    process.exit(1)
  }
  console.log('[OK] 规范文档四个提示词代码块与源码常量逐字一致')
} else {
  writeFileSync(DOC, doc, 'utf8')
  console.log('[OK] 已同步 2.1 / 3.1 / 5.1 / 5.2 四个提示词代码块（共 6 个 text 块）')
}
