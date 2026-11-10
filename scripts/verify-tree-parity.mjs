/**
 * 校验两棵树是否「内容等价」——忽略文件模式位与行尾差异。
 *
 * 背景：本地 main 与 origin/main 曾出现 88 个 M 但内容完全相同的情况，
 * 根因是文件模式位（100644 vs 100755）。本脚本把差异精确归类，避免再次误判。
 *
 * 用法：node scripts/verify-tree-parity.mjs [revA] [revB]
 * 默认 revA=main revB=origin/main
 * 退出码：0 = 等价；1 = 存在真实内容差异
 */
import { execFileSync } from 'node:child_process'

const A = process.argv[2] || 'main'
const B = process.argv[3] || 'origin/main'

const git = (...args) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' })

/** 解析 ls-tree -r 输出为 [{mode, sha, path}] */
function listTree(rev) {
  return git('ls-tree', '-r', rev)
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const [meta, path] = line.split('\t')
      const [mode, , sha] = meta.split(/\s+/)
      return { mode, sha, path }
    })
}

/** 取 blob 原始字节 */
function blob(sha) {
  return execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 1 << 28 })
}

/** 去掉行尾 CR（只用于比较，不写回） */
function stripCr(buf) {
  return Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
}

const ta = listTree(A)
const tb = listTree(B)
const ma = new Map(ta.map((e) => [e.path, e]))
const mb = new Map(tb.map((e) => [e.path, e]))

const onlyA = ta.filter((e) => !mb.has(e.path)).map((e) => e.path)
const onlyB = tb.filter((e) => !ma.has(e.path)).map((e) => e.path)

const modeOnly = []
const eolOnly = []
const identical = []
const realDiff = []

for (const [path, ea] of ma) {
  const eb = mb.get(path)
  if (!eb) continue
  const sameSha = ea.sha === eb.sha
  const sameMode = ea.mode === eb.mode
  if (sameSha && sameMode) { identical.push(path); continue }
  if (sameSha && !sameMode) { modeOnly.push({ path, a: ea.mode, b: eb.mode }); continue }
  // sha 不同：看是否只是行尾
  const ca = blob(ea.sha)
  const cb = blob(eb.sha)
  const normA = stripCr(ca)
  const normB = stripCr(cb)
  if (normA.equals(normB)) {
    eolOnly.push({ path, modeSame: sameMode, a: ea.mode, b: eb.mode })
  } else {
    realDiff.push({ path, bytesA: ca.length, bytesB: cb.length })
  }
}

const line = (s) => console.log(s)
line(`比较 ${A} ↔ ${B}`)
line(`  A 文件数：${ta.length}    B 文件数：${tb.length}`)
line('')
line(`  完全一致（sha + mode）     ${identical.length}`)
line(`  仅模式位不同               ${modeOnly.length}`)
line(`  仅行尾不同（去 CR 后相同） ${eolOnly.length}`)
line(`  真实内容不同               ${realDiff.length}`)
line(`  仅存在 A                   ${onlyA.length}`)
line(`  仅存在 B                   ${onlyB.length}`)

if (modeOnly.length) {
  line('')
  line(`—— 仅模式位不同（前 10，共 ${modeOnly.length}）——`)
  for (const x of modeOnly.slice(0, 10)) line(`  ${x.a} → ${x.b}  ${x.path}`)
}
if (eolOnly.length) {
  line('')
  line(`—— 仅行尾不同（共 ${eolOnly.length}）——`)
  for (const x of eolOnly) line(`  ${x.path}`)
}
if (realDiff.length) {
  line('')
  line(`—— 真实内容不同（共 ${realDiff.length}）——`)
  for (const x of realDiff.slice(0, 40)) line(`  ${x.path}  (${x.bytesA} → ${x.bytesB} 字节)`)
}
if (onlyA.length) {
  line('')
  line(`—— 仅存在于 ${A}（共 ${onlyA.length}）——`)
  for (const p of onlyA.slice(0, 40)) line(`  ${p}`)
}
if (onlyB.length) {
  line('')
  line(`—— 仅存在于 ${B}（共 ${onlyB.length}）——`)
  for (const p of onlyB.slice(0, 40)) line(`  ${p}`)
}

const ok = realDiff.length === 0
line('')
line(ok ? '结论：两棵树内容等价（差异仅为模式位 / 行尾）。' : '结论：存在真实内容差异，需人工处理。')
process.exit(ok ? 0 : 1)
