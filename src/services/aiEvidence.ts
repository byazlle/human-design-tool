/**
 * 回复后检测（v4.0.0 · ARCH §2.3 / §3.2 / §3.3）。
 *
 * 治理哲学与既有 `validateAiReplyFacts` 完全一致：**可测、只告警、不阻断、不改写内容**。
 * 提示词里的「依据前置」「输出白名单」「逐项覆盖」都是对模型的请求，不是保证；
 * 这里只把「模型有没有照做」量出来，交给 UI 提示与调试日志，绝不因此丢弃或篡改正文
 * （用户付了额度拿到的内容必须原样可见，误判的代价远高于收益）。
 *
 * 判定口径**写死**在代码里（供 `tests/aiEvidence.test.ts` 锁定），所有阈值都是常量，
 * 不做「自适应」——自适应会让同一个回复在不同版本给出不同结论，无法回归。
 */
import type { AiDetailMode } from '../types/hd'
import { CENTER_LABELS } from '../types/hd'
import { READING_DIMENSIONS } from './chartFacts'
import type { ReadingDimKey } from './chartFacts'

/** 「结论块」的最小长度：去空白后 ≥ 24 字（ARCH §2.3） */
export const EVIDENCE_MIN_BLOCK_CHARS = 24

/** 「缺依据段落首句」的截断长度，供 UI 提示与调试日志 */
export const EVIDENCE_SNIPPET_CHARS = 40

/** 白名单 / 条目覆盖告警里单行文本的截断长度 */
const LINE_SNIPPET_CHARS = 60

/**
 * 依据检测只在详细 / 完整档执行。
 *
 * 精简档明确禁止事实性断言（§2.4：没有断言就没有依据可查），
 * 对它跑依据检测会把「合格的倾向描述」全部判成缺失，属于自相矛盾的告警。
 */
export function evidenceAppliesTo(detail: AiDetailMode): boolean {
  return detail === 'detailed' || detail === 'full'
}

/* ── 依据覆盖 ─────────────────────────────────────────── */

export interface EvidenceCoverage {
  /** 被判定为「结论块」的段落数 */
  total: number
  /** 其中含合法依据的段落数 */
  withEvidence: number
  /** 缺依据的段落首句（截断 40 字），供 UI 提示与调试日志 */
  missing: string[]
}

/** `#` 开头的 Markdown 标题行 */
function isHeadingLine(line: string): boolean {
  return /^\s{0,3}#{1,6}(\s|$)/.test(line)
}

/** 水平分割线 / 表格分隔行：既不是标题也不是正文，跳过 */
function isSeparatorLine(line: string): boolean {
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return true
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')
}

/** 去掉行首的引用 / 列表标记与常见行内标记，只留可判定文字 */
function normalizeLine(line: string): string {
  return line
    .replace(/^\s*(?:>\s*)+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/[`*_]/g, '')
    .trim()
}

/**
 * 把回复切成「块」：Markdown 中以空行或单换行分段，逐块判断
 * （§2.3：非标题行、去空白后 ≥ 24 字的自然段）。
 */
function blocksOf(reply: string): string[] {
  return reply
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .filter((line) => !isHeadingLine(line) && !isSeparatorLine(line))
    .map(normalizeLine)
    .filter((line) => line.replace(/\s+/g, '').length >= EVIDENCE_MIN_BLOCK_CHARS)
}

/** 文本里的通道 key（`20-34` / `20 - 34` / `20–34` 统一成 `20-34`） */
function channelKeysOf(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/g)) {
    out.add(`${Number(m[1])}-${Number(m[2])}`)
  }
  return out
}

/** 文本里出现过的闸门号（`\d{1,2}` 即可，事实块里 `10（G）` / `20↔34` 都不带「闸门」前缀） */
function gateNumbersOf(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/\d{1,2}/g)) out.add(String(Number(m[0])))
  return out
}

/**
 * 可作为依据的九个中心名。
 *
 * 由 `CENTER_LABELS` 派生，并补上三种常见写法：完整标签（「骶骨中心」）、
 * 去「中心」后缀的短名、括号内的别名（「太阳神经丛」/「意志」）与其 + 中心。
 * 过滤掉长度 1 的名字（「G」），否则任何含字母 G 的段落都会被判成「有依据」。
 */
export const CENTER_EVIDENCE_NAMES: string[] = (() => {
  const names = new Set<string>()
  for (const label of Object.values(CENTER_LABELS)) {
    names.add(label)
    const short = label.replace(/\s*中心$/, '').trim()
    if (short) names.add(short)
    const alias = label.match(/（(.+?)）/)?.[1]
    if (alias) {
      names.add(alias)
      names.add(`${alias}中心`)
    }
  }
  names.add('G中心')
  return [...names].filter((name) => name.length > 1)
})()

/** 判定单个段落是否含合法依据（§2.3「含依据」的四个命中项） */
function blockHasEvidence(
  block: string,
  factChannels: Set<string>,
  factGates: Set<string>,
): boolean {
  // ① 事实块中出现过的通道 key
  for (const key of channelKeysOf(block)) {
    if (factChannels.has(key)) return true
  }
  // ② `闸门 N`，且 N 在事实块白名单内
  for (const m of block.matchAll(/闸门\s*(\d{1,2})/g)) {
    if (factGates.has(String(Number(m[1])))) return true
  }
  // ③ 任一中心名（9 个 CENTER_LABELS 及其常见写法）
  if (CENTER_EVIDENCE_NAMES.some((name) => block.includes(name))) return true
  // ④ 字面量「依据」
  return block.includes('依据')
}

/** 段落首句（截断 40 字），供 missing 列表展示 */
function snippetOf(block: string): string {
  const clean = block.replace(/\s+/g, ' ').trim()
  return clean.length > EVIDENCE_SNIPPET_CHARS ? `${clean.slice(0, EVIDENCE_SNIPPET_CHARS)}…` : clean
}

/**
 * 依据覆盖检测：统计「结论块」里有多少段给了合法依据。
 *
 * 只告警：`total === 0`（例如纯标题的短回复）时 `withEvidence === 0`、`missing` 为空，
 * 调用方不应据此判定失败。
 */
export function checkEvidenceCoverage(reply: string, facts: string): EvidenceCoverage {
  const blocks = blocksOf(reply)
  const factChannels = channelKeysOf(facts)
  const factGates = gateNumbersOf(facts)
  const missing: string[] = []
  let withEvidence = 0
  for (const block of blocks) {
    if (blockHasEvidence(block, factChannels, factGates)) withEvidence += 1
    else missing.push(snippetOf(block))
  }
  return { total: blocks.length, withEvidence, missing }
}

/* ── 维度白名单（入口 B）────────────────────────────── */

/** 一条维度越界：未勾选的维度出现在了标题或段首 */
export interface DimLeak {
  dim: ReadingDimKey
  /** 命中的那一行（截断 60 字），便于 UI 定位；判定为「独立段」时是段首那句 */
  heading: string
}

/** 回复里的标题行（去掉 `#` 之后的内容） */
function headingsOf(reply: string): string[] {
  return reply
    .split(/\n+/)
    .filter((line) => isHeadingLine(line))
    .map((line) => normalizeLine(line.replace(/^\s*#{1,6}\s*/, '')))
    .filter((line) => line.length > 0)
}

function clipLine(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > LINE_SNIPPET_CHARS ? `${clean.slice(0, LINE_SNIPPET_CHARS)}…` : clean
}

/**
 * 入口 B 的维度白名单检测：未勾选维度不得成为小标题 / 独立段（§3.3）。
 *
 * 两类命中都算泄漏：
 * 1. 标题行里出现未勾选维度的中文名；
 * 2. 段落以未勾选维度名开头且长度 ≥ 24 字（说明它被写成了独立段）。
 *
 * 只作为「一句附带修饰」出现在段落中间的不算泄漏——那是白名单条款 2 允许的。
 */
export function checkDimensionWhitelist(reply: string, dims: ReadingDimKey[]): DimLeak[] {
  const allowed = new Set<ReadingDimKey>(dims)
  const lines = reply.split(/\n+/).filter((line) => line.trim().length > 0)
  const leaks: DimLeak[] = []

  for (const dim of READING_DIMENSIONS) {
    if (allowed.has(dim.key)) continue
    let hit = ''
    for (const line of lines) {
      const raw = line.trim()
      if (isHeadingLine(raw)) {
        // ① 标题行里出现该维度名
        const text = normalizeLine(raw.replace(/^\s*#{1,6}\s*/, ''))
        if (text.includes(dim.label)) {
          hit = text
          break
        }
        continue
      }
      // ② 独立段：以维度名开头且长度达到「结论块」门槛
      const text = normalizeLine(raw)
      if (text.startsWith(dim.label) && text.replace(/\s+/g, '').length >= EVIDENCE_MIN_BLOCK_CHARS) {
        hit = text
        break
      }
    }
    if (hit) leaks.push({ dim: dim.key, heading: clipLine(hit) })
  }
  return leaks
}

/* ── 条目覆盖（入口 A ②③）──────────────────────────── */

/** 条目覆盖结果：每条通道 / 闸门是否都有标题 */
export interface ItemCoverage {
  expected: string[]
  missing: string[]
}

/** 把 key 编译成「边界安全」的匹配器：`57` 不会命中 `157`，`20-34` 容忍空格与破折号变体 */
function keyPatternOf(key: string): RegExp {
  const escaped = key.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (/^\d+$/.test(escaped)) return new RegExp(`(^|\\D)${escaped}(\\D|$)`)
  return new RegExp(escaped.replace(/-/g, '\\s*[-–—]\\s*'))
}

/**
 * 条目覆盖检测：入口 A ②③「一次通解全部」时，每条通道 / 闸门必须各有标题（§3.2）。
 *
 * 只看标题行：正文里顺带提到某条闸门不算覆盖——用户扫标题时看不见它，
 * 就等同于漏了（R4 的处置口径：报告分项标题要让用户一眼看出漏了哪条）。
 */
export function checkItemCoverage(reply: string, expectedKeys: string[]): ItemCoverage {
  const headings = headingsOf(reply).map((line) => line.replace(/\s+/g, ' '))
  const missing = expectedKeys.filter((key) => {
    const pattern = keyPatternOf(key)
    return !headings.some((heading) => pattern.test(heading))
  })
  return { expected: [...expectedKeys], missing }
}
