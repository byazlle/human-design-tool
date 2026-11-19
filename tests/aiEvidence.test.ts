/**
 * 回复后检测回归（ARCH v4.0.0 §2.3 / §3.2 / §3.3 / §11.3）。
 *
 * 这三个检测只告警、不阻断，因此测试的重点不是「拦住什么」，而是
 * **判定口径稳定**：同一个回复在任何版本下都必须给出同一份数字，
 * 否则告警会时而刷屏、时而不出现，用户与调试都无法依赖。
 */
import { describe, expect, it } from 'vitest'
import {
  CENTER_EVIDENCE_NAMES,
  EVIDENCE_MIN_BLOCK_CHARS,
  checkDimensionWhitelist,
  checkEvidenceCoverage,
  checkItemCoverage,
  evidenceAppliesTo,
} from '../src/services/aiEvidence'

const FACTS = [
  '类型：生产者（Generator）｜策略：等待回应',
  '内在权威：骶骨权威（Sacral）',
  '已激活通道（2）：20-34（喉咙↔G）；34-57（脾↔骶骨）',
  '悬挂闸门（1）：10（G）',
].join('\n')

describe('依据覆盖 checkEvidenceCoverage', () => {
  it('有依据的段落计入 withEvidence，缺依据的段落进 missing', () => {
    const reply = [
      '## 底色',
      '因为通道 20-34（喉咙↔G），所以在当下这一刻你更需要先出声再行动，这件事在会议上尤其明显。',
      '你的天赋很特别，很多事情你只要想做就一定能做成，别人也会不断来找你确认方向。',
    ].join('\n')
    const res = checkEvidenceCoverage(reply, FACTS)
    expect(res.total).toBe(2)
    expect(res.withEvidence).toBe(1)
    expect(res.missing).toHaveLength(1)
    expect(res.missing[0].startsWith('你的天赋很特别')).toBe(true)
  })

  it('标题行与短于门槛的段落不算「结论块」', () => {
    const reply = ['### 闸门 41', '很短的一句。', '## 收束'].join('\n')
    const res = checkEvidenceCoverage(reply, FACTS)
    expect(res.total).toBe(0)
    expect(res.withEvidence).toBe(0)
    expect(res.missing).toEqual([])
  })

  it('门槛是 24 字：23 字不算，24 字算', () => {
    const short = '一'.repeat(EVIDENCE_MIN_BLOCK_CHARS - 1)
    const exact = '一'.repeat(EVIDENCE_MIN_BLOCK_CHARS)
    expect(checkEvidenceCoverage(short, FACTS).total).toBe(0)
    expect(checkEvidenceCoverage(exact, FACTS).total).toBe(1)
  })

  it('三种依据命中：中心名 / 闸门编号（在事实块白名单内）/ 字面量「依据」', () => {
    const center = checkEvidenceCoverage(
      '因为骶骨中心已定义，所以你在体力活上比别人更能持续下去，这一点在周末尤其明显。',
      FACTS,
    )
    expect(center.withEvidence).toBe(1)

    const gate = checkEvidenceCoverage(
      '因为闸门 10 单独激活（G 中心），所以你对「怎么活得像自己」这件事格外敏感，也容易反复确认。',
      FACTS,
    )
    expect(gate.withEvidence).toBe(1)

    const literal = checkEvidenceCoverage(
      '本段依据：通道 34-57，所以你的直觉往往先于语言出现，在需要当场表态的场合尤其明显。',
      FACTS,
    )
    expect(literal.withEvidence).toBe(1)
  })

  it('事实块里没有的闸门编号不算依据（引用盘外结构即违规）', () => {
    const res = checkEvidenceCoverage(
      '因为闸门 99 单独激活，所以你在任何场合都想当那个最后拍板的人，而且不喜欢被追问理由。',
      FACTS,
    )
    expect(res.withEvidence).toBe(0)
    expect(res.missing).toHaveLength(1)
  })

  it('段落首句超过 40 字时截断并加省略号', () => {
    const long = '你的天赋很特别，'.repeat(10)
    const res = checkEvidenceCoverage(long, FACTS)
    expect(res.missing[0].endsWith('…')).toBe(true)
    expect(res.missing[0].length).toBeLessThanOrEqual(41)
  })

  it('精简档不执行依据检测（该档明确禁止事实断言）', () => {
    expect(evidenceAppliesTo('concise')).toBe(false)
    expect(evidenceAppliesTo('detailed')).toBe(true)
    expect(evidenceAppliesTo('full')).toBe(true)
  })

  it('九个中心名都可作为依据（CENTER_LABELS 派生）', () => {
    expect(CENTER_EVIDENCE_NAMES.length).toBeGreaterThanOrEqual(9)
    expect(CENTER_EVIDENCE_NAMES).toContain('骶骨中心')
    expect(CENTER_EVIDENCE_NAMES).toContain('G 中心')
  })
})

describe('维度白名单 checkDimensionWhitelist', () => {
  it('未勾选维度成为标题 → 泄漏', () => {
    const reply = ['## 内在权威', '正文一段。', '## 轮回交叉', '正文一段。'].join('\n')
    const leaks = checkDimensionWhitelist(reply, ['authority'])
    expect(leaks.map((l) => l.dim)).toEqual(['cross'])
    expect(leaks[0].heading).toContain('轮回交叉')
  })

  it('未勾选维度成为独立段（段首 + 长度达门槛）→ 泄漏', () => {
    const reply = '轮回交叉是这一生的主线不是职业也不是头衔，它描述的是你最自然的贡献方式与主题。'
    const leaks = checkDimensionWhitelist(reply, ['authority'])
    expect(leaks.map((l) => l.dim)).toEqual(['cross'])
  })

  it('只在段中作为一句附带修饰 → 不算泄漏', () => {
    const reply = [
      '## 内在权威',
      '你的内在权威是骶骨权威，做决定时身体的即时回应比头脑分析更可靠（这一点会连带影响轮回交叉的主题表达）。',
    ].join('\n')
    expect(checkDimensionWhitelist(reply, ['authority'])).toEqual([])
  })

  it('已勾选维度不报（同一维度集合顺序无关）', () => {
    const reply = ['## 已激活通道', '一段。', '## 内在权威', '一段。'].join('\n')
    expect(checkDimensionWhitelist(reply, ['channels', 'authority'])).toEqual([])
    expect(checkDimensionWhitelist(reply, ['authority', 'channels'])).toEqual([])
  })

  it('三类泄漏同时出现时按 READING_DIMENSIONS 顺序返回', () => {
    const reply = [
      '## 轮回交叉',
      '## 九大能量中心',
      '## 已激活闸门',
      '## 内在权威',
    ].join('\n')
    const leaks = checkDimensionWhitelist(reply, ['authority'])
    expect(leaks.map((l) => l.dim)).toEqual(['gates', 'centers', 'cross'])
  })
})

describe('条目覆盖 checkItemCoverage', () => {
  const GATES = Array.from({ length: 20 }, (_, i) => String(i + 1))

  it('20 条闸门漏 1 条 → missing 恰为那一条', () => {
    const reply = GATES.filter((g) => g !== '13')
      .map((g) => `### 闸门 ${g}：主题`)
      .join('\n')
    const res = checkItemCoverage(reply, GATES)
    expect(res.expected).toHaveLength(20)
    expect(res.missing).toEqual(['13'])
  })

  it('通道 key 容忍空格与破折号变体', () => {
    const reply = ['### 通道 20 - 34（喉咙↔G）', '### 通道 34–57（脾↔骶骨）'].join('\n')
    expect(checkItemCoverage(reply, ['20-34', '34-57']).missing).toEqual([])
  })

  it('数字 key 边界安全：「闸门 157」不能算作覆盖 57', () => {
    const reply = '### 闸门 157：不存在的条目'
    expect(checkItemCoverage(reply, ['57']).missing).toEqual(['57'])
  })

  it('只在正文提到、没有标题 → 仍算未覆盖', () => {
    const reply = ['### 闸门 1：主题', '正文里提到了闸门 2 却没给它标题。'].join('\n')
    expect(checkItemCoverage(reply, ['1', '2']).missing).toEqual(['2'])
  })

  it('空清单直接通过', () => {
    expect(checkItemCoverage('随便一段话', []).missing).toEqual([])
  })
})
