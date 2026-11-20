/** 临时审计脚本：输出当前全部不达标条目与原因分布。用 vite-node 运行。 */
import { writeFileSync } from 'node:fs'
import { CHANNELS } from '../src/engine/gateData'
import { getGate, getChannel, CENTER_TEXT, TYPE_TEXT, AUTHORITY_TEXT } from '../src/services/interpretations'
import { GATE_INSIGHT } from '../src/services/gateInsight'
import { TYPE_DETAIL } from '../src/services/typeDetail'
import { destinyReadings } from '../src/services/destinyText'
import type { BodyGraph, Planet } from '../src/types/hd'

const BANNED_WORDS = ['能量','频率','磁场','共振','天命','业力','高维','模式','制约','放大','整合','课题']
const SCENE_ANCHORS = ['开会','被问','被邀请','被改约','临时','下次','早上','晚上','睡前','半夜','周末','每天','每周','每年','每季度','争执','争吵','道歉','吃饭','做饭','走路','通勤','排队','加班','深夜','独处','休息','腹部','肚子','呼吸','心跳','肩膀','胃','手心','身体','第一反应','本能','放松','收紧','开口','沉默','停下','记下来','写下来','记录','试一次','三秒','10 秒','28 天','问自己','观察','练习']
const MAX_SENTENCE = 45
const splitSentences = (t: string) => t.split(/[。！？；\n]+/).map(s => s.trim()).filter(Boolean)
const audit = (t: string) => {
  const r: string[] = []
  const b = BANNED_WORDS.filter(w => t.includes(w))
  if (b.length) r.push(`禁用词(${b.join('/')})`)
  const l = splitSentences(t).filter(s => s.length > MAX_SENTENCE)
  if (l.length) r.push(`长句x${l.length}`)
  if (!SCENE_ANCHORS.some(a => t.includes(a))) r.push('无场景锚点')
  return r
}
const entries: Array<{ id: string; text: string }> = []
for (let g = 1; g <= 64; g++) {
  const parts = getGate(g).text.split('\n\n【开放时】')
  entries.push({ id: `gate-${g}-defined`, text: parts[0] })
  entries.push({ id: `gate-${g}-open`, text: parts[1] ?? '' })
}
for (const c of CHANNELS) entries.push({ id: `channel-${c.key}`, text: getChannel(c.key).text })
for (const [id, v] of Object.entries(CENTER_TEXT)) {
  entries.push({ id: `center-${id}-defined`, text: v.defined }); entries.push({ id: `center-${id}-open`, text: v.open })
}
for (const [id, v] of Object.entries(TYPE_TEXT)) entries.push({ id: `type-${id}-desc`, text: v.desc })
for (const [id, v] of Object.entries(AUTHORITY_TEXT)) entries.push({ id: `authority-${id}-desc`, text: v.desc })
for (let g = 1; g <= 64; g++) {
  const v = GATE_INSIGHT[g]
  for (const f of ['trait','growth','grounding','drive'] as const) entries.push({ id: `insight-${g}-${f}`, text: v[f] })
}
for (const [id, v] of Object.entries(TYPE_DETAIL)) {
  for (const f of ['mechanism','strategyDetail','signatureDetail','notSelfDetail','authorityNote'] as const) entries.push({ id: `detail-${id}-${f}`, text: v[f] })
  v.misconceptions.forEach((t,i) => entries.push({ id: `detail-${id}-misconceptions-${i}`, text: t }))
  v.practice.forEach((t,i) => entries.push({ id: `detail-${id}-practice-${i}`, text: t }))
}
const star = (planet: Planet, gate: number, line = 1) => ({ planet, longitude: 0, gate, line, color: 1, tone: 1, base: 1 }) as const
const chart = {
  type: 'Generator', strategy: '等待回应', authority: 'Sacral', profile: '2/4',
  definition: 'Split', incarnationCross: '右角度交叉之解释',
  centers: ['head','ajna','throat','g','heart','spleen','sacral','solar','root'].map(id => ({ id, defined: id === 'sacral' })),
  gates: [{ gate: 34, stars: ['Sun'], state: 'in-channel' }],
  channels: [{ key: '34-57', gates: [34, 57] }], hangingGates: [41],
  personality: [star('Sun',34),star('Earth',20),star('NorthNode',44),star('SouthNode',24)],
  design: [star('Sun',20),star('NorthNode',41)],
  meta: { personalityTime: '', designTime: '', personalitySun: 34, designSun: 20 },
} as unknown as BodyGraph
for (const reading of destinyReadings(chart)) reading.sections.forEach((s,i) => entries.push({ id: `destiny-${reading.key}-${i}`, text: s.p }))

const failing = entries.filter(e => audit(e.text).length).map(e => ({ id: e.id, text: e.text, reasons: audit(e.text) }))
const byPrefix: Record<string, number> = {}
for (const f of failing) { const p = f.id.split('-')[0]; byPrefix[p] = (byPrefix[p]||0)+1 }
console.log(`总数=${entries.length} 不达标=${failing.length} 达标=${entries.length-failing.length}`)
console.log('分类不达标:', JSON.stringify(byPrefix))
writeFileSync('tests/fixtures/_current-fail.json', JSON.stringify(failing, null, 2), 'utf8')
console.log('已写 tests/fixtures/_current-fail.json')
