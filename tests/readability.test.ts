/**
 * DEV-701 → v3.8.0 · 表达可懂性机械检查
 *
 * 背景：用户反复反馈"看不懂"，根因不在提示词，而在离线释义素材本身抽象。
 * 本测试把 ITERATION-PLAN.md 第 5 节「可懂性检查表」的**机械可判定项**固化为规则：
 *   ① 禁用解释词表  ② 单句 ≤45 字  ③ 每条释义含一个可观察场景锚点。
 *
 * 演进：
 * - v3.7.0 / I-1：只做基线。524 条中仅 75 条达标（14.3%），基线快照记录 449 条不达标，
 *   测试守护"新条目登记 + 不达标集合只减不增"。
 * - v3.8.0 / I-2：完成白话化改写，524/524 全部达标、基线快照清零。测试升级为
 *   **全量达标守护**：任何一条退化（禁用词 / 长句 / 无锚点 / 条目数变化）都会立刻变红。
 * - 规则表（BANNED_WORDS / SCENE_ANCHORS / MAX_SENTENCE）与基线快照 rules 字段
 *   一字未改——达标率提升靠改写素材，不靠放宽规则。
 * - AI 输出不在此自动断言（动态生成、无持久化样本），走抽检报告 docs/VERIFY-可懂性-基线.md。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHANNELS } from '../src/engine/gateData'
import {
  getGate,
  getChannel,
  CENTER_TEXT,
  TYPE_TEXT,
  AUTHORITY_TEXT,
} from '../src/services/interpretations'
import { GATE_INSIGHT } from '../src/services/gateInsight'
import { TYPE_DETAIL } from '../src/services/typeDetail'
import { destinyReadings } from '../src/services/destinyText'
import type { BodyGraph, Planet } from '../src/types/hd'

/** 禁用解释词：抽象词解释抽象词 → 用户"似懂非懂"的直接来源 */
const BANNED_WORDS = [
  '能量', '频率', '磁场', '共振', '天命', '业力', '高维',
  '模式', '制约', '放大', '整合', '课题',
]
/** 场景锚点：命中任一，即认为该条描述带"谁 / 什么场合 / 身上什么反应"的可观察画面 */
const SCENE_ANCHORS = [
  '开会', '被问', '被邀请', '被改约', '临时', '下次', '早上', '晚上', '睡前', '半夜', '周末',
  '每天', '每周', '每年', '每季度', '争执', '争吵', '道歉', '吃饭', '做饭', '走路', '通勤',
  '排队', '加班', '深夜', '独处', '休息', '腹部', '肚子', '呼吸', '心跳', '肩膀', '胃',
  '手心', '身体', '第一反应', '本能', '放松', '收紧', '开口', '沉默', '停下', '记下来',
  '写下来', '记录', '试一次', '三秒', '10 秒', '28 天', '问自己', '观察', '练习',
]
const MAX_SENTENCE = 45

function splitSentences(text: string): string[] {
  return text.split(/[。！？；\n]+/).map((s) => s.trim()).filter(Boolean)
}

/** 返回不达标原因（空数组 = 达标） */
function audit(text: string): string[] {
  const reasons: string[] = []
  const banned = BANNED_WORDS.filter((w) => text.includes(w))
  if (banned.length) reasons.push(`禁用词(${banned.join('/')})`)
  const long = splitSentences(text).filter((s) => s.length > MAX_SENTENCE)
  if (long.length) reasons.push(`长句x${long.length}`)
  if (!SCENE_ANCHORS.some((a) => text.includes(a))) reasons.push('无场景锚点')
  return reasons
}

/** 收集全部离线释义条目（与基线快照同一口径，改动收集范围须同步重生成基线） */
function collectOfflineEntries(): Array<{ id: string; text: string }> {
  const entries: Array<{ id: string; text: string }> = []
  for (let g = 1; g <= 64; g++) {
    const parts = getGate(g).text.split('\n\n【开放时】')
    entries.push({ id: `gate-${g}-defined`, text: parts[0] })
    entries.push({ id: `gate-${g}-open`, text: parts[1] ?? '' })
  }
  for (const c of CHANNELS) entries.push({ id: `channel-${c.key}`, text: getChannel(c.key).text })
  for (const [id, v] of Object.entries(CENTER_TEXT)) {
    entries.push({ id: `center-${id}-defined`, text: v.defined })
    entries.push({ id: `center-${id}-open`, text: v.open })
  }
  for (const [id, v] of Object.entries(TYPE_TEXT)) entries.push({ id: `type-${id}-desc`, text: v.desc })
  for (const [id, v] of Object.entries(AUTHORITY_TEXT)) entries.push({ id: `authority-${id}-desc`, text: v.desc })
  for (let g = 1; g <= 64; g++) {
    const v = GATE_INSIGHT[g]
    for (const f of ['trait', 'growth', 'grounding', 'drive'] as const) {
      entries.push({ id: `insight-${g}-${f}`, text: v[f] })
    }
  }
  for (const [id, v] of Object.entries(TYPE_DETAIL)) {
    for (const f of ['mechanism', 'strategyDetail', 'signatureDetail', 'notSelfDetail', 'authorityNote'] as const) {
      entries.push({ id: `detail-${id}-${f}`, text: v[f] })
    }
    v.misconceptions.forEach((t, i) => entries.push({ id: `detail-${id}-misconceptions-${i}`, text: t }))
    v.practice.forEach((t, i) => entries.push({ id: `detail-${id}-practice-${i}`, text: t }))
  }
  // destinyText 的段落为函数式生成，用固定 chart 取样，保证每次扫描口径一致
  const star = (planet: Planet, gate: number, line = 1) =>
    ({ planet, longitude: 0, gate, line, color: 1, tone: 1, base: 1 }) as const
  const chart = {
    type: 'Generator', strategy: '等待回应', authority: 'Sacral', profile: '2/4',
    definition: 'Split', incarnationCross: '右角度交叉之解释',
    centers: ['head', 'ajna', 'throat', 'g', 'heart', 'spleen', 'sacral', 'solar', 'root']
      .map((id) => ({ id, defined: id === 'sacral' })),
    gates: [{ gate: 34, stars: ['Sun'], state: 'in-channel' }],
    channels: [{ key: '34-57', gates: [34, 57] }], hangingGates: [41],
    personality: [star('Sun', 34), star('Earth', 20), star('NorthNode', 44), star('SouthNode', 24)],
    design: [star('Sun', 20), star('NorthNode', 41)],
    meta: { personalityTime: '', designTime: '', personalitySun: 34, designSun: 20 },
  } as unknown as BodyGraph
  for (const reading of destinyReadings(chart)) {
    reading.sections.forEach((s, i) => entries.push({ id: `destiny-${reading.key}-${i}`, text: s.p }))
  }
  return entries
}

interface Baseline {
  generatedAt: string
  productVersion: string
  rules: { bannedWords: string[]; maxSentence: number; sceneAnchors: string[] }
  total: number
  failingCount: number
  allIds: string[]
  failing: Record<string, string[]>
}
const baseline = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/readability-baseline.json'), 'utf8'),
) as Baseline

describe('可懂性检查表 · 规则自检（故意塞入抽象话必须变红）', () => {
  it('好样例：有画面 + 短句 + 场景锚点 → 达标', () => {
    expect(audit('下次开会前，你会先在心里过一遍要说的话，手心微微发热。')).toEqual([])
  })

  it('坏样例：抽象词解释抽象词 → 命中禁用词', () => {
    const reasons = audit('你的能量场会放大这种模式，最终完成整合。')
    expect(reasons.some((r) => r.startsWith('禁用词'))).toBe(true)
  })

  it('坏样例：超过 45 字的长句 → 命中长句', () => {
    const text = '你在工作中会遇到一个需要反复权衡的复杂局面，既想照顾到身边每个人的感受，又不想耽误自己真正重要的进度，于是迟迟无法下手。'
    expect(splitSentences(text)[0].length).toBeGreaterThan(MAX_SENTENCE)
    expect(audit(text).some((r) => r.startsWith('长句'))).toBe(true)
  })

  it('坏样例：换谁都成立的空话、无画面 → 命中无场景锚点', () => {
    expect(audit('你拥有独特的洞察力与稳定的判断基准。')).toContain('无场景锚点')
  })
})

describe('可懂性 · 离线释义全量达标（v3.8.0 / I-2）', () => {
  it('规则未被偷偷放宽（禁用词 / 锚点 / 句长与基线快照一致）', () => {
    expect(baseline.rules.bannedWords).toEqual(BANNED_WORDS)
    expect(baseline.rules.sceneAnchors).toEqual(SCENE_ANCHORS)
    expect(baseline.rules.maxSentence).toBe(MAX_SENTENCE)
  })

  it('条目集合没有新增未登记的释义', () => {
    const registered = new Set(baseline.allIds)
    const unknown = collectOfflineEntries().map((e) => e.id).filter((id) => !registered.has(id))
    expect(unknown).toEqual([])
  })

  it('条目数不减少（不允许靠删条目凑达标）', () => {
    const entries = collectOfflineEntries()
    expect(entries).toHaveLength(baseline.allIds.length)
    expect(entries).toHaveLength(baseline.total)
  })

  it('524 条离线释义全部达标：无禁用词 / 无长句 / 均有场景锚点', () => {
    const failing = collectOfflineEntries()
      .map((e) => ({ id: e.id, reasons: audit(e.text) }))
      .filter((e) => e.reasons.length > 0)
    expect(failing).toEqual([])
  })

  it('基线快照已清零，且与真实数据一致（防止空跑）', () => {
    expect(baseline.failingCount).toBe(0)
    expect(Object.keys(baseline.failing)).toHaveLength(0)
    expect(collectOfflineEntries()).toHaveLength(baseline.total)
  })
})
