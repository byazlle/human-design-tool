/**
 * 通过 GitHub REST API 推送本地提交（curl 通道不可用时的 Node 版兜底）。
 *
 * 用法：node scripts/gh-push.mjs [commit]   默认 HEAD
 *      node scripts/gh-push.mjs --sync      只做远端文件树对齐
 *
 * 与 scripts/push-api.py 等价，仅把 HTTP 通道从 curl 换成 Node fetch：
 * 本机 TLS 通道会随时间变化（curl 有时 HTTP 000、Node 有时 fetch failed），
 * 发布前必须各探一次再选。本脚本不打印 token。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'byazlle/human-design-tool'
const BRANCH = 'main'

function token() {
  const text = readFileSync(path.join(ROOT, '.env'), 'utf8')
  const found = text.match(/ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/)
  if (!found) throw new Error('GitHub Token not found（.env 中需含 ghp_ 或 github_pat_ 开头的密钥）')
  return found[0]
}
const TOKEN = token()

async function api(p, method = 'GET', payload) {
  const res = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hd-tool-push',
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`${method} ${p} -> HTTP ${res.status}: ${raw.slice(0, 800)}`)
  return raw ? JSON.parse(raw) : {}
}

function git(...args) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()
}

function gitBytes(...args) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
}

function maybeGit(...args) {
  try {
    return git(...args)
  } catch {
    return ''
  }
}

/** HEAD 中该文件的原始字节（不用工作区：commit 可能做过行尾归一化） */
function headBlob(p) {
  try {
    return gitBytes('cat-file', 'blob', `HEAD:${p}`)
  } catch {
    return null
  }
}

/** 一律以 git 记录的 mode 为准，不用 os.access（Windows 上普通文本也会返回可执行） */
function headMode(p) {
  const out = maybeGit('ls-tree', 'HEAD', '--', p)
  for (const line of out.split('\n')) {
    if (!line.includes('\t')) continue
    const candidate = line.split('\t', 1)[0].split(/\s+/)[0]
    if (['100644', '100755', '120000'].includes(candidate)) return candidate
  }
  return '100644'
}

async function createBlob(raw) {
  const data = await api(`/repos/${REPO}/git/blobs`, 'POST', {
    content: raw.toString('base64'),
    encoding: 'base64',
  })
  return data.sha
}

async function entryForPath(p, binaryBlobCache = new Map()) {
  const raw = headBlob(p)
  if (raw === null) return { path: p, mode: '100644', type: 'blob', sha: null }
  const mode = headMode(p)
  const text = raw.toString('utf8')
  if (Buffer.from(text, 'utf8').equals(raw)) {
    return { path: p, mode, type: 'blob', content: text }
  }
  if (!binaryBlobCache.has(p)) binaryBlobCache.set(p, await createBlob(raw))
  return { path: p, mode, type: 'blob', sha: binaryBlobCache.get(p) }
}

function localTree() {
  const out = git('ls-tree', '-r', 'HEAD')
  const tree = {}
  for (const line of out.split('\n')) {
    if (!line.trim() || !line.includes('\t')) continue
    const [meta, p] = line.split('\t', 1).concat(line.split('\t').slice(1))
    tree[p] = meta.split(/\s+/)[2]
  }
  return tree
}

async function syncTree() {
  const head = (await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`)).object.sha
  const data = await api(`/repos/${REPO}/git/trees/${head}?recursive=1`)
  if (data.truncated) throw new Error('远端 tree 过大被截断，无法做完整性校验')
  const remote = {}
  for (const x of data.tree) if (x.type === 'blob') remote[x.path] = x.sha
  const local = localTree()

  const stale = Object.keys(local).filter((p) => p in remote && remote[p] !== local[p])
  const missing = Object.keys(local).filter((p) => !(p in remote))
  const extra = Object.keys(remote).filter((p) => !(p in local))
  if (!stale.length && !missing.length && !extra.length) {
    console.log(`远端文件树与本地 HEAD 完全一致（${Object.keys(local).length} 个文件）`)
    return head
  }
  console.log(
    `需同步 ${stale.length + missing.length + extra.length} 个文件：` +
      `内容过期 ${stale.length} / 缺失 ${missing.length} / 远端多余 ${extra.length}`,
  )
  for (const p of [...missing].sort()) console.log('  +', p)
  for (const p of [...stale].sort()) console.log('  ~', p)
  for (const p of [...extra].sort()) console.log('  -', p)

  const cache = new Map()
  const entries = []
  for (const p of missing.concat(stale)) entries.push(await entryForPath(p, cache))
  for (const p of extra) entries.push({ path: p, mode: '100644', type: 'blob', sha: null })

  const tree = await api(`/repos/${REPO}/git/trees`, 'POST', {
    base_tree: data.sha,
    tree: entries,
  })
  const commit = await api(`/repos/${REPO}/git/commits`, 'POST', {
    message:
      'chore: 对齐远端文件树（历史 API 推送遗漏）\n\n' +
      '按 blob sha 补齐缺失、覆盖内容过期文件，修复 CI 的 TS2307 与盘序/金标准断言。',
    tree: tree.sha,
    parents: [head],
  })
  await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', {
    sha: commit.sha,
    force: false,
  })
  console.log('已对齐，远端 main =', commit.sha.slice(0, 8))
  return commit.sha
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--sync')) {
    await syncTree()
    return
  }
  const commit = args.find((a) => !a.startsWith('--')) ?? 'HEAD'
  const sha = git('rev-parse', commit)
  const parent = git('rev-parse', `${commit}~1`)
  const message = git('log', '-1', '--pretty=%B', commit)

  const apiHead = (await api(`/repos/${REPO}/git/ref/heads/${BRANCH}`)).object.sha
  console.log('local', sha.slice(0, 8), 'remote', apiHead.slice(0, 8))
  if (apiHead === sha) {
    console.log('远端已是最新，跳过')
    return
  }

  const remoteTree = (await api(`/repos/${REPO}/git/commits/${apiHead}`)).tree.sha
  const changed = git('diff', '--name-status', parent, sha).split('\n').filter(Boolean)
  const cache = new Map()
  const entries = []
  for (const line of changed) {
    const parts = line.split('\t')
    const status = parts[0]
    const p = parts[parts.length - 1]
    if (status.startsWith('R') && parts.length >= 3) {
      entries.push({ path: parts[1], mode: '100644', type: 'blob', sha: null })
    }
    entries.push(await entryForPath(p, cache))
  }
  console.log(
    'files', entries.length,
    '| inline content', entries.filter((e) => 'content' in e).length,
    '| deletions', entries.filter((e) => e.sha === null).length,
  )

  const tree = await api(`/repos/${REPO}/git/trees`, 'POST', {
    base_tree: remoteTree,
    tree: entries,
  })
  const newCommit = await api(`/repos/${REPO}/git/commits`, 'POST', {
    message,
    tree: tree.sha,
    parents: [apiHead],
  })
  await api(`/repos/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', {
    sha: newCommit.sha,
    force: false,
  })
  console.log('pushed', newCommit.sha.slice(0, 8))
  await syncTree()
}

main().catch((err) => {
  console.error('[gh-push]', err.message)
  process.exitCode = 1
})
