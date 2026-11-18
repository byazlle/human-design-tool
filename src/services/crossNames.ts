/**
 * 轮回交叉主题名（112 个主题 / 192 个交叉）。
 *
 * ── 口径与来源 ─────────────────────────────────────────────
 * 192 = 64 右角度 + 64 左角度 + 64 并列。计数的构造是：
 * - 右角度：16 个主题 × 4 种「人格太阳/地球」轴 = 64（同一主题在四条轴上重复）；
 * - 左角度：32 个主题 × 2 种轴 = 64；
 * - 并列：64 个主题 × 1 种轴 = 64。
 * 按英文名去重后是 **111 个**（16+32+64 表面上 112，但 Limitation 同时出现在
 * 左角度与并列），社区常说的「112」还包含「Wishes 2」这类编号变体的计法，
 * 两者属统计口径差异，不是矛盾——这就是「一百多种」说法的来源。
 * 若把爻位 / 旋转变体全部展开可到 768；早期还有 108 的口径，属统计口径差异。
 *
 * 交叉的**名称**只由「人格太阳/地球轴 + 角度」决定；四闸门里的设计太阳/地球
 * 由实际出生时刻决定，可能落在教材示例之外。所以本模块只负责「叫什么」，
 * 闸门一律以引擎实算为准，绝不拿示例去替换真实结果。
 *
 * 英文名取自公开的 192 条对照表（如 humandesign4all.com、schoolofhumandesign.nl、
 * SharpAstrology.HumanDesign 等流通版本），属 Jovian 体系的通行命名。
 * **中文名为本项目工作译名**，社区译法不统一（同一主题可能被译成「服务 / 服务之交 /
 * 服务之交叉」），界面统一写成「角度交叉之XX」，英文名作为权威标识并列显示。
 */

export type CrossAngleKey = 'right' | 'left' | 'juxtaposition'

/** [人格太阳/地球轴, 右角度主题, 左角度主题, 并列主题]（英文，权威标识） */
const AXES: Array<[string, string, string, string]> = [
  ['1/2', 'The Sphinx', 'Defiance', 'Self-expression'],
  ['2/1', 'The Sphinx', 'Defiance', 'The Driver'],
  ['3/50', 'Laws', 'Wishes', 'Mutation'],
  ['4/49', 'Explanation', 'Revolution', 'Formulization'],
  ['5/35', 'Consciousness', 'Separation', 'Habits'],
  ['6/36', 'Eden', 'The Plane', 'Conflict'],
  ['7/13', 'The Sphinx', 'Masks', 'Interaction'],
  ['8/14', 'Contagion', 'Uncertainty', 'Contribution'],
  ['9/16', 'Planning', 'Identification', 'Focus'],
  ['10/15', 'The Vessel of Love', 'Prevention', 'Behavior'],
  ['11/12', 'Eden', 'Education', 'Ideas'],
  ['12/11', 'Eden', 'Education', 'Articulation'],
  ['13/7', 'The Sphinx', 'Masks', 'Listening'],
  ['14/8', 'Contagion', 'Uncertainty', 'Empowering'],
  ['15/10', 'The Vessel of Love', 'Prevention', 'Extremes'],
  ['16/9', 'Planning', 'Identification', 'Experimentation'],
  ['17/18', 'Service', 'Upheaval', 'Opinions'],
  ['18/17', 'Service', 'Upheaval', 'Correction'],
  ['19/33', 'The Four Ways', 'Refinement', 'Need'],
  ['20/34', 'The Sleeping Phoenix', 'Duality', 'The Now'],
  ['21/48', 'Tension', 'Endeavor', 'Control'],
  ['22/47', 'Rulership', 'Informing', 'Grace'],
  ['23/43', 'Explanation', 'Dedication', 'Assimilation'],
  ['24/44', 'The Four Ways', 'Incarnation', 'Rationalization'],
  ['25/46', 'The Vessel of Love', 'Healing', 'Innocence'],
  ['26/45', 'Rulership', 'Confrontation', 'The Trickster'],
  ['27/28', 'The Unexpected', 'Alignment', 'Caring'],
  ['28/27', 'The Unexpected', 'Alignment', 'Risks'],
  ['29/30', 'Contagion', 'Industry', 'Commitment'],
  ['30/29', 'Contagion', 'Industry', 'Fates'],
  ['31/41', 'The Unexpected', 'The Alpha', 'Influence'],
  ['32/42', 'Maya', 'Limitation', 'Conservation'],
  ['33/19', 'The Four Ways', 'Refinement', 'Retreat'],
  ['34/20', 'The Sleeping Phoenix', 'Duality', 'Power'],
  ['35/5', 'Consciousness', 'Separation', 'Experience'],
  ['36/6', 'Eden', 'The Plane', 'Crisis'],
  ['37/40', 'Planning', 'Migration', 'Bargains'],
  ['38/39', 'Tension', 'Individualism', 'Opposition'],
  ['39/38', 'Tension', 'Individualism', 'Provocation'],
  ['40/37', 'Planning', 'Migration', 'Denial'],
  ['41/31', 'The Unexpected', 'The Alpha', 'Fantasy'],
  ['42/32', 'Maya', 'Limitation', 'Completion'],
  ['43/23', 'Explanation', 'Dedication', 'Insight'],
  ['44/24', 'The Four Ways', 'Incarnation', 'Alertness'],
  ['45/26', 'Rulership', 'Confrontation', 'Possession'],
  ['46/25', 'The Vessel of Love', 'Healing', 'Serendipity'],
  ['47/22', 'Rulership', 'Informing', 'Oppression'],
  ['48/21', 'Tension', 'Endeavor', 'Depth'],
  ['49/4', 'Explanation', 'Revolution', 'Principles'],
  ['50/3', 'Laws', 'Wishes', 'Values'],
  ['51/57', 'Penetration', 'The Clarion', 'Shock'],
  ['52/58', 'Service', 'Demands', 'Stillness'],
  ['53/54', 'Penetration', 'Cycles', 'Beginnings'],
  ['54/53', 'Penetration', 'Cycles', 'Ambition'],
  ['55/59', 'The Sleeping Phoenix', 'Spirit', 'Moods'],
  ['56/60', 'Laws', 'Distraction', 'Stimulation'],
  ['57/51', 'Penetration', 'The Clarion', 'Intuition'],
  ['58/52', 'Service', 'Demands', 'Vitality'],
  ['59/55', 'The Sleeping Phoenix', 'Spirit', 'Strategy'],
  ['60/56', 'Laws', 'Distraction', 'Limitation'],
  ['61/62', 'Maya', 'Obscuration', 'Thinking'],
  ['62/61', 'Maya', 'Obscuration', 'Detail'],
  ['63/64', 'Consciousness', 'Dominion', 'Doubts'],
  ['64/63', 'Consciousness', 'Dominion', 'Confusion'],
]

/**
 * 英文主题 → 中文工作译名。
 * 译名原则：能直译就直译，不添加体系外的玄学词；「Fates」译「际遇」而非「天命」，
 * 避免把交叉读成宿命。同一英文主题在三个角度共用同一中文名（与通行做法一致）。
 */
const THEME_ZH: Record<string, string> = {
  // 右角度 16
  'The Sphinx': '斯芬克斯',
  Laws: '法则',
  Explanation: '解释',
  Consciousness: '意识',
  Eden: '伊甸园',
  Contagion: '感染',
  Planning: '计划',
  'The Vessel of Love': '爱之器皿',
  Service: '服务',
  'The Four Ways': '四道',
  'The Sleeping Phoenix': '沉睡的凤凰',
  Tension: '张力',
  Rulership: '统御',
  'The Unexpected': '意外',
  Maya: '幻象',
  Penetration: '穿透',
  // 左角度 32
  Defiance: '反抗',
  Wishes: '愿望',
  Revolution: '革命',
  Separation: '分离',
  'The Plane': '层面',
  Masks: '面具',
  Uncertainty: '不确定',
  Identification: '认同',
  Prevention: '预防',
  Education: '教育',
  Upheaval: '动荡',
  Refinement: '精炼',
  Dedication: '投入',
  Incarnation: '化身',
  Healing: '疗愈',
  Confrontation: '对抗',
  Alignment: '对齐',
  Industry: '勤勉',
  'The Alpha': '领头者',
  Limitation: '限制',
  Migration: '迁徙',
  Informing: '告知',
  Duality: '二元',
  Endeavor: '努力',
  Cycles: '循环',
  'The Clarion': '号角',
  Demands: '要求',
  Spirit: '精神',
  Distraction: '分神',
  Obscuration: '遮蔽',
  Dominion: '掌权',
  Individualism: '个体性',
  // 并列 64
  'Self-expression': '自我表达',
  'The Driver': '驾驭者',
  Mutation: '突变',
  Formulization: '公式化',
  Habits: '习惯',
  Conflict: '冲突',
  Interaction: '互动',
  Contribution: '贡献',
  Focus: '专注',
  Behavior: '行为',
  Ideas: '想法',
  Articulation: '表达',
  Listening: '倾听',
  Empowering: '赋能',
  Extremes: '极端',
  Experimentation: '实验',
  Opinions: '观点',
  Correction: '修正',
  Need: '需求',
  'The Now': '当下',
  Control: '掌控',
  Grace: '优雅',
  Assimilation: '同化',
  Rationalization: '合理化',
  Innocence: '纯真',
  'The Trickster': '捣蛋鬼',
  Caring: '照顾',
  Risks: '冒险',
  Commitment: '承诺',
  Fates: '际遇',
  Influence: '影响力',
  Conservation: '保存',
  Retreat: '退隐',
  Power: '力量',
  Experience: '体验',
  Crisis: '危机',
  Bargains: '交易',
  Opposition: '对立',
  Provocation: '挑衅',
  Denial: '否认',
  Fantasy: '幻想',
  Completion: '完成',
  Insight: '洞见',
  Alertness: '警觉',
  Possession: '占有',
  Serendipity: '机缘',
  Oppression: '压抑',
  Depth: '深度',
  Principles: '原则',
  Values: '价值',
  Shock: '震撼',
  Stillness: '静止',
  Beginnings: '开始',
  Ambition: '野心',
  Moods: '情绪起伏',
  Stimulation: '刺激',
  Intuition: '直觉',
  Vitality: '活力',
  Strategy: '策略',
  Thinking: '思考',
  Detail: '细节',
  Doubts: '怀疑',
  Confusion: '困惑',
}

export interface CrossTheme {
  /** 人格太阳/地球轴，如 '17/18' */
  axis: string
  angle: CrossAngleKey
  /** 英文主题名（权威标识，如 'Service'） */
  en: string
  /** 中文工作译名（如 '服务'） */
  zh: string
  /** 「角度交叉之XX」，如 '右角度交叉之服务' */
  label: string
}

const ANGLE_ZH: Record<CrossAngleKey, string> = {
  right: '右角度',
  left: '左角度',
  juxtaposition: '并列',
}

const ANGLE_EN: Record<CrossAngleKey, string> = {
  right: 'Right Angle',
  left: 'Left Angle',
  juxtaposition: 'Juxtaposition',
}

/** 轴 → 三个角度的英文主题 */
export const CROSS_AXIS_THEMES: Record<string, Record<CrossAngleKey, string>> = Object.fromEntries(
  AXES.map(([axis, ra, la, jx]) => [
    axis,
    { right: ra, left: la, juxtaposition: jx },
  ]),
)

export function angleKeyOf(profile: string): CrossAngleKey {
  const [pl] = profile.split('/').map(Number)
  if (profile === '4/1') return 'juxtaposition'
  return pl >= 5 ? 'left' : 'right'
}

/** 查主题；轴不在表内返回 null（不臆造名字） */
export function crossThemeOf(
  pSunGate: number,
  pEarthGate: number,
  angle: CrossAngleKey,
): CrossTheme | null {
  const axis = `${pSunGate}/${pEarthGate}`
  const row = CROSS_AXIS_THEMES[axis]
  if (!row) return null
  const en = row[angle]
  const zh = THEME_ZH[en] ?? en
  return {
    axis,
    angle,
    en,
    zh,
    label: `${ANGLE_ZH[angle]}交叉之${zh}`,
  }
}

/** 完整英文全称：Right Angle Cross of Service */
export function crossEnglishFullName(theme: CrossTheme): string {
  return `${ANGLE_EN[theme.angle]} Cross of ${theme.en}`
}

/** 统计用：主题总数与各角度主题数（供测试与文档核对） */
export function crossThemeStats(): {
  axes: number
  themes: number
  right: number
  left: number
  juxtaposition: number
  unnamed: string[]
} {
  const right = new Set<string>()
  const left = new Set<string>()
  const jx = new Set<string>()
  const unnamed: string[] = []
  for (const row of Object.values(CROSS_AXIS_THEMES)) {
    right.add(row.right)
    left.add(row.left)
    jx.add(row.juxtaposition)
    for (const en of [row.right, row.left, row.juxtaposition]) {
      if (!THEME_ZH[en]) unnamed.push(en)
    }
  }
  const themes = new Set([...right, ...left, ...jx])
  return {
    axes: AXES.length,
    themes: themes.size,
    right: right.size,
    left: left.size,
    juxtaposition: jx.size,
    unnamed,
  }
}

export const CROSS_NAME_NOTE =
  '交叉名只由「人格太阳/地球轴 + 角度」决定：右角度 16 个主题×4 轴、左角度 32×2、并列 64×1，共 192 个交叉、112 个主题名。中文为本项目工作译名，社区译法并不统一；英文名是权威标识。四闸门一律按实际出生时刻计算，不用教材示例替换。'
