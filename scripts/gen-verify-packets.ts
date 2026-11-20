/** 生成 L2 盲审包与 L3 试读包：脱敏（去 ID/来源）、固定种子打乱。用 vite-node 运行。 */
import { writeFileSync } from 'node:fs'
import { CHANNELS } from '../src/engine/gateData'
import { getGate, getChannel, CENTER_TEXT, TYPE_TEXT, AUTHORITY_TEXT } from '../src/services/interpretations'
import { GATE_INSIGHT } from '../src/services/gateInsight'
import { TYPE_DETAIL } from '../src/services/typeDetail'
import { destinyReadings } from '../src/services/destinyText'
import type { BodyGraph, Planet } from '../src/types/hd'

const entries: Array<{ id: string; text: string; cat: string }> = []
for (let g = 1; g <= 64; g++) {
  const parts = getGate(g).text.split('\n\n【开放时】')
  entries.push({ id: `gate-${g}-defined`, text: parts[0], cat: 'gate' })
  entries.push({ id: `gate-${g}-open`, text: parts[1] ?? '', cat: 'gate' })
}
for (const c of CHANNELS) entries.push({ id: `channel-${c.key}`, text: getChannel(c.key).text, cat: 'channel' })
for (const [id, v] of Object.entries(CENTER_TEXT)) {
  entries.push({ id: `center-${id}-defined`, text: v.defined, cat: 'center' })
  entries.push({ id: `center-${id}-open`, text: v.open, cat: 'center' })
}
for (const [id, v] of Object.entries(TYPE_TEXT)) entries.push({ id: `type-${id}-desc`, text: v.desc, cat: 'type' })
for (const [id, v] of Object.entries(AUTHORITY_TEXT)) entries.push({ id: `authority-${id}-desc`, text: v.desc, cat: 'authority' })
for (let g = 1; g <= 64; g++) {
  const v = GATE_INSIGHT[g]
  for (const f of ['trait','growth','grounding','drive'] as const) entries.push({ id: `insight-${g}-${f}`, text: v[f], cat: 'insight' })
}
for (const [id, v] of Object.entries(TYPE_DETAIL)) {
  for (const f of ['mechanism','strategyDetail','signatureDetail','notSelfDetail','authorityNote'] as const) entries.push({ id: `detail-${id}-${f}`, text: v[f], cat: 'detail' })
  v.misconceptions.forEach((t,i) => entries.push({ id: `detail-${id}-misconceptions-${i}`, text: t, cat: 'detail' }))
  v.practice.forEach((t,i) => entries.push({ id: `detail-${id}-practice-${i}`, text: t, cat: 'detail' }))
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
for (const reading of destinyReadings(chart)) reading.sections.forEach((s,i) => entries.push({ id: `destiny-${reading.key}-${i}`, text: s.p, cat: 'destiny' }))

// 固定种子伪随机
let seed = 20261120
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
const shuffle = <T>(arr: T[]): T[] => { const a = [...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a }

// L2 盲审包：每类抽 5 条。
// 注意口径：insight 四字段是"素材片段"(关键词式短句)，不是用户直读文案，
// 不进入盲审抽样；用户实际读的是 gate/channel/center/type/authority/detail/destiny 完整句。
const cats = ['gate','channel','center','type','authority','detail','destiny']
const l2: Array<{ n: number; text: string }> = []
for (const cat of cats) {
  const pool = shuffle(entries.filter(e => e.cat === cat)).slice(0, 5)
  for (const e of pool) l2.push({ n: 0, text: e.text })
}
const l2shuf = shuffle(l2).map((x,i) => ({ n: i+1, text: x.text }))
writeFileSync('docs/VERIFY-L2-盲审包-v3.8.0.json', JSON.stringify(l2shuf, null, 2), 'utf8')

// L3 试读包：3 人各 10 条，随机
const l3all = shuffle(entries).slice(0, 30)
const l3: Record<string, Array<{ n: number; text: string }>> = {}
for (let p = 0; p < 3; p++) {
  l3[`试读者${p+1}`] = l3all.slice(p*10, p*10+10).map((e,i) => ({ n: i+1, text: e.text }))
}
writeFileSync('docs/VERIFY-L3-试读包-v3.8.0.json', JSON.stringify(l3, null, 2), 'utf8')

console.log('L2 盲审包:', l2shuf.length, '条 → docs/VERIFY-L2-盲审包-v3.8.0.json')
console.log('L3 试读包: 3人x10条 → docs/VERIFY-L3-试读包-v3.8.0.json')
console.log('\n--- L2 盲审包内容（脱敏，编号1-40）---')
l2shuf.forEach(x => console.log(`${x.n}. ${x.text}`))
