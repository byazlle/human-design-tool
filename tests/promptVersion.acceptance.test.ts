/**
 * PROMPT-3 · 提示词版本断言 CI 加固（docs/roadmap/PROMPT-DEV-GUIDE.md 第 6 节）
 *
 * 背景：改提示词必须升 PROMPT_VERSION 并同步改 4 处测试断言（SOP 步骤 5）。
 * 历史上漏改过多次，CI 虽会红，但报错只说"期望 4.x 收到 4.y"，不指出是哪一处漏了，
 * 开发者要逐个文件翻。本测试：
 *   ① 动态读取 aiClient.ts 的当前版本（本文件自身不写死版本号，升版本时无需改自己）；
 *   ② 扫描 tests/ 下全部 .test.ts 里的版本字面量断言，逐处核对；
 *   ③ 不一致时一次性列出「文件名:行号:旧版本」，并守住断言数量（防止删掉断言蒙混过关）。
 *
 * 约束：environment = node；只读源码文件，不修改任何源码；无新增依赖。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

/** 当前权威版本：从源码常量读取，避免本测试硬编码版本而成为第 5 处需要手改的断言 */
function currentPromptVersion(): string {
  const m = /export const PROMPT_VERSION = '([^']+)'/.exec(read('src/services/aiClient.ts'))
  if (!m) throw new Error('[PROMPT-3] 找不到 PROMPT_VERSION 常量声明')
  return m[1]
}

interface VersionAssertion {
  file: string
  line: number
  version: string
}

/** 两种合法的断言形式：直接断言导入常量、或静态扫描 aiClient.ts 源码 */
const ASSERTION_PATTERNS = [
  /expect\(PROMPT_VERSION\)\.toBe\('([^']+)'\)/g,
  /toContain\("PROMPT_VERSION = '([^']+)'"\)/g,
]

function collectVersionAssertions(): VersionAssertion[] {
  const found: VersionAssertion[] = []
  const files = readdirSync(resolve(ROOT, 'tests')).filter((f) => f.endsWith('.test.ts'))
  for (const file of files) {
    const lines = read(`tests/${file}`).split('\n')
    lines.forEach((line, index) => {
      for (const pattern of ASSERTION_PATTERNS) {
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(line))) {
          found.push({ file: `tests/${file}`, line: index + 1, version: match[1] })
        }
      }
    })
  }
  return found
}

describe('PROMPT-3 提示词版本断言加固', () => {
  const expected = currentPromptVersion()

  it('4 处版本断言都在，且字面量与 aiClient.ts 的 PROMPT_VERSION 一致', () => {
    const assertions = collectVersionAssertions()
    expect(
      assertions.length >= 4,
      `[PROMPT-3] 版本字面量断言不得删减或改成动态自比（当前只找到 ${assertions.length} 处，应至少 4 处）`,
    ).toBe(true)

    const stale = assertions.filter((a) => a.version !== expected)
    expect(
      stale.map((a) => `${a.file}:${a.line} 断言版本 '${a.version}' 未同步，当前 aiClient.ts 为 '${expected}'`),
      `[PROMPT-3] 以下断言未同步，请逐处改正：\n${stale.map((a) => `  · ${a.file}:${a.line} ('${a.version}' → '${expected}')`).join('\n')}`,
    ).toEqual([])
  })

  it('规范文档头注的「内容修订」号与 PROMPT_VERSION 一致', () => {
    // 头注在 ```text 代码块之外，sync-prompt-spec.mjs 不会覆盖，必须人工同步
    const head = read('docs/spec/AI-PROMPT-v4.0.md').split('\n').slice(0, 24).join('\n')
    expect(head, '[PROMPT-3] 规范文档头注未标注当前内容修订号').toContain(`内容修订 ${expected}`)
    expect(head, '[PROMPT-3] 规范文档头注的 PROMPT_VERSION 未同步').toContain(`PROMPT_VERSION='${expected}'`)
  })
})
