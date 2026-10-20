/**
 * 固定参考数据：64 闸门 ↔ 九中心，36 通道拓扑。
 * 数据源：Jovian Archive / Ra Uru Hu 标准人体图（与 rave-engine / free-human-design 一致）。
 * 顺序：闸门按编号 1–64；通道按两端闸门升序排列。
 */
import type { CenterId } from '../types/hd'

/** 闸门 → 所属中心（64 个闸门各出现一次） */
export const GATE_CENTER: Record<number, CenterId> = {
  // 头顶 Head
  64: 'head', 61: 'head', 63: 'head',
  // 眉心 Ajna
  47: 'ajna', 24: 'ajna', 4: 'ajna', 17: 'ajna', 11: 'ajna', 43: 'ajna',
  // 喉咙 Throat
  62: 'throat', 23: 'throat', 56: 'throat', 35: 'throat', 12: 'throat',
  45: 'throat', 33: 'throat', 8: 'throat', 31: 'throat', 20: 'throat', 16: 'throat',
  // G 中心
  1: 'g', 13: 'g', 25: 'g', 46: 'g', 2: 'g', 15: 'g', 10: 'g', 7: 'g',
  // 心（意志）Heart
  21: 'heart', 40: 'heart', 26: 'heart', 51: 'heart',
  // 脾 Spleen
  48: 'spleen', 57: 'spleen', 44: 'spleen', 50: 'spleen', 32: 'spleen',
  28: 'spleen', 18: 'spleen',
  // 骶骨 Sacral
  34: 'sacral', 5: 'sacral', 14: 'sacral', 29: 'sacral', 59: 'sacral',
  9: 'sacral', 3: 'sacral', 42: 'sacral', 27: 'sacral',
  // 情绪 Solar Plexus
  6: 'solar', 37: 'solar', 30: 'solar', 55: 'solar', 49: 'solar',
  22: 'solar', 36: 'solar',
  // 根 Root
  53: 'root', 60: 'root', 52: 'root', 19: 'root', 39: 'root', 41: 'root',
  58: 'root', 38: 'root', 54: 'root',
}

/** 36 条通道（无序闸门对） */
export const CHANNEL_GATE_PAIRS: Array<[number, number]> = [
  [1, 8], [2, 14], [3, 60], [4, 63], [5, 15], [6, 59], [7, 31], [9, 52],
  [10, 20], [10, 34], [10, 57], [11, 56], [12, 22], [13, 33], [16, 48], [17, 62],
  [18, 58], [19, 49], [20, 34], [20, 57], [21, 45], [23, 43], [24, 61], [25, 51],
  [26, 44], [27, 50], [28, 38], [29, 46], [30, 41], [32, 54], [34, 57], [35, 36],
  [37, 40], [39, 55], [42, 53], [47, 64],
]

export interface ChannelDef {
  key: string
  gates: [number, number]
  centers: [CenterId, CenterId]
  name: string
  nameZh: string
}

const CHANNEL_NAMES: Record<string, [string, string]> = {
  '1-8': ['Inspiration', '启发'],
  '2-14': ['The Beat', '脉动'],
  '3-60': ['Mutation', '突变'],
  '4-63': ['Logic', '逻辑'],
  '5-15': ['Rhythm', '节奏'],
  '6-59': ['Mating', '亲密'],
  '7-31': ['The Alpha', '领导'],
  '9-52': ['Concentration', '专注'],
  '10-20': ['Awakening', '觉醒'],
  '10-34': ['Exploration', '探索'],
  '10-57': ['Perfected Form', '完美的形式'],
  '11-56': ['Curiosity', '好奇心'],
  '12-22': ['Openness', '开放'],
  '13-33': ['The Prodigal', '回归'],
  '16-48': ['The Wavelength', '波长'],
  '17-62': ['Acceptance', '接受'],
  '18-58': ['Judgment', '评判'],
  '19-49': ['Synthesis', '综合'],
  '20-34': ['Charisma', '魅力'],
  '20-57': ['The Brainwave', '脑波'],
  '21-45': ['Money', '金钱'],
  '23-43': ['Structuring', '结构化'],
  '24-61': ['Awareness', '觉察'],
  '25-51': ['Initiation', '启蒙'],
  '26-44': ['Surrender', '交付'],
  '27-50': ['Preservation', '保存'],
  '28-38': ['Struggle', '挣扎'],
  '29-46': ['Discovery', '发现'],
  '30-41': ['Recognition', '认同'],
  '32-54': ['Transformation', '转化'],
  '34-57': ['Power', '力量'],
  '35-36': ['Transitoriness', '无常'],
  '37-40': ['Community', '社群'],
  '39-55': ['Emoting', '情绪'],
  '42-53': ['Maturation', '成熟'],
  '47-64': ['Abstraction', '抽象'],
}

export function channelKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export const CHANNELS: ChannelDef[] = CHANNEL_GATE_PAIRS.map(([a, b]) => {
  const [lo, hi] = a < b ? [a, b] : [b, a]
  const key = `${lo}-${hi}`
  const names = CHANNEL_NAMES[key] ?? ['', '']
  return {
    key,
    gates: [lo, hi] as [number, number],
    centers: [GATE_CENTER[lo], GATE_CENTER[hi]] as [CenterId, CenterId],
    name: names[0],
    nameZh: names[1],
  }
})

export const CHANNEL_BY_KEY: Record<string, ChannelDef> = Object.fromEntries(
  CHANNELS.map((c) => [c.key, c]),
)

/** 闸门名称（Rave I 易） */
export const GATE_NAMES: Record<number, { en: string; zh: string }> = {
  1: { en: 'Self-Expression', zh: '自我表达' },
  2: { en: 'The Direction of the Self', zh: '自我的方向' },
  3: { en: 'Ordering', zh: '秩序' },
  4: { en: 'Answers', zh: '答案' },
  5: { en: 'Fixed Rhythms', zh: '固定的节奏' },
  6: { en: 'Friction', zh: '摩擦' },
  7: { en: 'The Role of the Self', zh: '自我的角色' },
  8: { en: 'Contribution', zh: '贡献' },
  9: { en: 'Focus', zh: '专注' },
  10: { en: 'Behavior of the Self', zh: '自我的行为' },
  11: { en: 'Ideas', zh: '想法' },
  12: { en: 'Caution', zh: '谨慎' },
  13: { en: 'The Listener', zh: '倾听者' },
  14: { en: 'Power Skills', zh: '力量技能' },
  15: { en: 'Extremes', zh: '极端' },
  16: { en: 'Skills', zh: '技能' },
  17: { en: 'Opinions', zh: '观点' },
  18: { en: 'Work on What Has Been Spoiled', zh: '修正' },
  19: { en: 'Wanting', zh: '需求' },
  20: { en: 'The Now', zh: '当下' },
  21: { en: 'The Hunter', zh: '掌控' },
  22: { en: 'Grace', zh: '优雅' },
  23: { en: 'Assimilation', zh: '同化' },
  24: { en: 'Rationalization', zh: '合理化' },
  25: { en: 'The Spirit of the Self', zh: '纯真的精神' },
  26: { en: 'The Egoist', zh: '自我销售' },
  27: { en: 'Caring', zh: '照顾' },
  28: { en: 'The Game Player', zh: '冒险者' },
  29: { en: 'Perseverance', zh: '承诺' },
  30: { en: 'Feelings', zh: '欲望' },
  31: { en: 'Influence', zh: '影响力' },
  32: { en: 'Continuity', zh: '延续' },
  33: { en: 'Retreat', zh: '退隐' },
  34: { en: 'Power', zh: '力量' },
  35: { en: 'Change', zh: '改变' },
  36: { en: 'Crisis', zh: '危机' },
  37: { en: 'Friendship', zh: '友谊' },
  38: { en: 'The Fighter', zh: '战士' },
  39: { en: 'Provocation', zh: '挑衅' },
  40: { en: 'Aloneness', zh: '独自' },
  41: { en: 'Contraction', zh: '收缩' },
  42: { en: 'Growth', zh: '成长' },
  43: { en: 'Insight', zh: '洞见' },
  44: { en: 'Alertness', zh: '警觉' },
  45: { en: 'The Gatherer', zh: '主宰' },
  46: { en: 'Determination of the Self', zh: '决心' },
  47: { en: 'Realizing', zh: '领悟' },
  48: { en: 'Depth', zh: '深度' },
  49: { en: 'Principles', zh: '原则' },
  50: { en: 'Values', zh: '价值观' },
  51: { en: 'Shock', zh: '震惊' },
  52: { en: 'Stillness', zh: '静止' },
  53: { en: 'Beginnings', zh: '开始' },
  54: { en: 'Ambition', zh: '野心' },
  55: { en: 'Spirit', zh: '丰盛' },
  56: { en: 'Stimulation', zh: '刺激' },
  57: { en: 'Intuitive Insight', zh: '直觉洞见' },
  58: { en: 'Vitality', zh: '活力' },
  59: { en: 'Sexuality', zh: '亲密' },
  60: { en: 'Acceptance', zh: '接受' },
  61: { en: 'Mystery', zh: '神秘' },
  62: { en: 'Details', zh: '细节' },
  63: { en: 'Doubt', zh: '怀疑' },
  64: { en: 'Confusion', zh: '困惑' },
}

/** 每个闸门关联的通道（用于详情面板展示） */
export const GATE_CHANNELS: Record<number, string[]> = (() => {
  const map: Record<number, string[]> = {}
  for (let g = 1; g <= 64; g += 1) map[g] = []
  for (const ch of CHANNELS) {
    map[ch.gates[0]].push(ch.key)
    map[ch.gates[1]].push(ch.key)
  }
  return map
})()
