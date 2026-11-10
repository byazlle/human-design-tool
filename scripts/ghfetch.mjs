/**
 * GitHub HTTP 传输层（Node 版）。
 *
 * 为什么需要它：本机的 schannel 后端与 curl.exe 都无法完成 TLS 握手
 * （curl 报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`，
 * PowerShell Invoke-RestMethod 报「基础连接已经关闭」）。唯一可用通道是 Node 内置 fetch
 * （走 Node 自带的 OpenSSL）。因此所有 GitHub API 调用统一经由本脚本。
 *
 * 用法：
 *   node scripts/ghfetch.mjs <METHOD> <PATH> [bodyFile]
 *   - PATH 以 / 开头则前缀 https://api.github.com；也可直接给完整 URL
 *   - bodyFile 传 "-" 表示从 stdin 读 JSON
 * 输出：stdout 第一行为 HTTP 状态码，其后为响应体原文。4xx/5xx 时退出码仍为 0
 *（便于调用方读取错误体），仅在网络层失败时退出码非 0。
 */
import { readFileSync } from 'node:fs'

const [, , method = 'GET', path = '', bodyFile] = process.argv

function token() {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = text.match(/ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}/)
  if (!m) throw new Error('.env 中找不到 GITHUB_TOKEN / ghp_ 密钥')
  return m[0]
}

async function readStdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`
  const body = bodyFile
    ? (bodyFile === '-' ? await readStdin() : readFileSync(bodyFile, 'utf8'))
    : undefined

  const headers = {
    Authorization: `Bearer ${token()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'hd-tool-ghfetch',
  }
  if (body) headers['Content-Type'] = 'application/json'

  const t0 = Date.now()
  const res = await fetch(url, { method, headers, body })
  const text = await res.text()
  process.stdout.write(`${res.status}\n${text}`)
  if (res.status >= 400) {
    process.stderr.write(`ghfetch ${method} ${path} -> HTTP ${res.status} (${Date.now() - t0}ms)\n`)
  }
}

main().catch((e) => {
  process.stderr.write(`ghfetch 网络失败：${e.message}\n`)
  process.exit(1)
})
