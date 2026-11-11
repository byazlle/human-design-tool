/**
 * 按版本归档：源文件快照 + 安装包 + 可校验清单。
 *
 * 归档根目录默认 `../rlt-archive`（仓库外，不污染 git）。
 * 每个版本一个目录：
 *   <区间>/v2.3.0/
 *     source/HumanDesignTool-2.3.0-src.zip   ← git archive，只含受版本控制的内容
 *     installers/…                            ← 从 release/ 复制的安装包
 *     MANIFEST.md                             ← 版本、commit、tree、SHA256、字节数
 *
 * 用法：
 *   node scripts/archive-version.mjs               # 归档下表全部版本
 *   node scripts/archive-version.mjs 2.3.0         # 只归档指定版本（可多个）
 *   node scripts/archive-version.mjs --list        # 只打印版本→commit 映射
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ARCHIVE_ROOT = resolve(ROOT, '..', 'rlt-archive')

const git = (...args) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: ROOT, encoding: 'utf8' }).trim()

/**
 * 版本 → 该版本的源码基线 commit。
 * 有 tag 的用 tag；v1.1.0 / v1.2.0 当年未打 tag，用该版本线的最后一个提交。
 */
const VERSIONS = [
  { version: '0.2.0', rev: 'v0.2.0', note: '液态玻璃界面 + 完整安装包' },
  { version: '1.0.0', rev: 'v1.0.0', note: '首个正式版' },
  { version: '1.0.1', rev: 'v1.0.1', note: '修复版' },
  { version: '1.1.0', rev: '1bc1355', note: '八项迭代：轮回交叉/AI 综合解读/样式设置/通道闸门渲染/合图重构/凯龙回归/去毛玻璃' },
  { version: '1.2.0', rev: '159addd', note: '修正曼陀罗锚点、合盘口径与数据校验' },
  { version: '2.0.0', rev: 'v2.0.0', note: '规范成文、多 AI 配置、档案删除、计算逻辑对齐' },
  { version: '2.1.0', rev: 'v2.1.0', note: '单盘页单列布局、人体图三处修正、AI 融合解读两档' },
  { version: '2.2.0', rev: 'v2.2.0', note: '三档 AI 解读、四格式导出、自定义布局与关系场完整版编排' },
  { version: '2.2.1', rev: 'v2.2.1', note: '修复桌面快捷方式目标与完整版解读截断' },
  { version: '2.3.0', rev: 'v2.3.0', note: 'AI 并发能力与全站页面重设计' },
  { version: '2.4.0', rev: 'v2.4.0', note: '跨档案批量生成解读、AI 解读结果持久化、提示词 v3.2' },
  { version: '2.5.0', rev: 'v2.5.0', note: '单份 token 预算、专业版/简明版受众、中转站兼容与模型自动获取、提示词 v3.3' },
  { version: '3.0.0', rev: 'v3.0.0', note: 'nova 视觉体系、全链路流式进度、批量目录自动导出 md、P1/P2/P3 修复' },
]

/** 安装包来源：release/<平台>/<文件名模板> */
const INSTALLERS = [
  { name: (v) => `HumanDesign-Setup-${v}.exe`, from: 'release/desktop', kind: 'Windows 安装包（NSIS）' },
  { name: (v) => `HumanDesign-${v}.apk`, from: 'release/android', kind: 'Android APK' },
]

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`
}

function run(args, opts = {}) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: ROOT,
    stdio: opts.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    ...opts,
  })
}

function revExists(rev) {
  try {
    git('rev-parse', '--verify', `${rev}^{commit}`)
    return true
  } catch {
    return false
  }
}

function archiveVersion(entry) {
  const { version, rev, note } = entry
  if (!revExists(rev)) {
    console.log(`  ⚠ v${version}：找不到 rev ${rev}，跳过`)
    return null
  }
  const sha = git('rev-parse', `${rev}^{commit}`)
  const tree = git('rev-parse', `${rev}^{tree}`)
  const date = git('log', '-1', '--format=%cI', rev)

  const dir = join(ARCHIVE_ROOT, `v${version}`)
  const srcDir = join(dir, 'source')
  const instDir = join(dir, 'installers')
  mkdirSync(srcDir, { recursive: true })
  mkdirSync(instDir, { recursive: true })

  // 1) 源码快照：git archive 只含受版本控制内容，天然排除 node_modules/dist/release
  //    必须让 execFileSync 直接返回 Buffer —— 经 utf8 解码会把 zip 里的非 ASCII 字节改掉。
  const srcZip = join(srcDir, `HumanDesignTool-${version}-src.zip`)
  const buf = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', '-c', 'core.autocrlf=false', 'archive',
     '--format=zip', `--prefix=HumanDesignTool-${version}/`, rev],
    { cwd: ROOT, encoding: 'buffer', maxBuffer: 1 << 30 },
  )
  writeFileSync(srcZip, buf)

  // 2) 安装包
  const installers = []
  for (const spec of INSTALLERS) {
    const fname = spec.name(version)
    const src = join(ROOT, spec.from, fname)
    if (!existsSync(src)) continue
    const dst = join(instDir, fname)
    copyFileSync(src, dst)
    installers.push({ kind: spec.kind, fname, size: statSync(dst).size, sha256: sha256(dst) })
  }

  // 3) 清单
  const fileCount = run(['ls-tree', '-r', '--name-only', rev]).split('\n').filter(Boolean).length
  const lines = [
    `# v${version} 归档清单`,
    '',
    note ? `> ${note}` : '',
    '',
    '## 源码',
    '',
    '| 项 | 值 |',
    '| --- | --- |',
    `| 版本 | ${version} |`,
    `| 基线 rev | \`${rev}\` |`,
    `| commit | \`${sha}\` |`,
    `| tree | \`${tree}\` |`,
    `| 提交时间 | ${date} |`,
    `| 受版本控制文件数 | ${fileCount} |`,
    `| 源码包 | \`source/HumanDesignTool-${version}-src.zip\` |`,
    `| 源码包大小 | ${human(statSync(srcZip).size)} |`,
    `| 源码包 SHA256 | \`${sha256(srcZip)}\` |`,
    '',
    '## 安装包',
    '',
  ]
  if (installers.length) {
    lines.push('| 类型 | 文件 | 大小 | SHA256 |', '| --- | --- | --- | --- |')
    for (const i of installers) {
      lines.push(`| ${i.kind} | \`${i.fname}\` | ${human(i.size)}（${i.size} 字节） | \`${i.sha256}\` |`)
    }
  } else {
    lines.push('_本地无该版本安装包（可能已被清理，见 GitHub Release）_')
  }
  lines.push('', '## 复现', '', '```bash',
    `git archive --format=zip --prefix=HumanDesignTool-${version}/ ${rev} -o HumanDesignTool-${version}-src.zip`,
    `# 校验：sha256sum HumanDesignTool-${version}-src.zip`,
    '```', '')
  writeFileSync(join(dir, 'MANIFEST.md'), lines.filter((l) => l !== null).join('\n'))

  console.log(`  ✓ v${version}  →  ${sha.slice(0, 8)}  源码 ${human(statSync(srcZip).size)}  安装包 ${installers.length} 个`)
  return { version, sha, tree, date, fileCount, installers, srcZip }
}

// ── main ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)

if (argv.includes('--list')) {
  for (const e of VERSIONS) {
    const ok = revExists(e.rev) ? git('rev-parse', `${e.rev}^{commit}`).slice(0, 8) : 'MISSING'
    console.log(`v${e.version.padEnd(7)} ${e.rev.padEnd(12)} ${ok}  ${e.note}`)
  }
  process.exit(0)
}

const wanted = argv.filter((a) => !a.startsWith('--'))
const targets = wanted.length
  ? VERSIONS.filter((e) => wanted.includes(e.version))
  : VERSIONS

if (wanted.length && !targets.length) {
  console.error(`未匹配到版本：${wanted.join(', ')}`)
  process.exit(1)
}

console.log(`归档根目录：${ARCHIVE_ROOT}`)
const results = []
for (const e of targets) results.push(archiveVersion(e))

// 根索引
const idx = [
  '# HumanDesignTool 版本归档索引',
  '',
  `生成时间：${new Date().toISOString()}`,
  `归档根目录：\`${ARCHIVE_ROOT}\``,
  '',
  '| 版本 | commit | 提交时间 | 文件数 | 源码包 | 安装包 |',
  '| --- | --- | --- | --- | --- | --- |',
]
for (const r of results.filter(Boolean)) {
  idx.push(
    `| [v${r.version}](./v${r.version}/MANIFEST.md) | \`${r.sha.slice(0, 8)}\` | ${r.date} | ${r.fileCount} | ✓ | ${r.installers.length || '—'} |`,
  )
}
idx.push('', '安装包为本地构建产物副本；权威发布件见 https://github.com/byazlle/human-design-tool/releases', '')
writeFileSync(join(ARCHIVE_ROOT, 'INDEX.md'), idx.join('\n'))

console.log(`\n完成：${results.filter(Boolean).length} 个版本，索引写入 ${join(ARCHIVE_ROOT, 'INDEX.md')}`)
