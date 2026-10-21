/**
 * AI 解读多角度选项（用户需求 #8）：
 * 用户可选择不同解读方向；同一盘面数据，按角度换提示词生成。
 * 也用于离线内容的焦点提示。
 */
export interface ReadingAngle {
  key: string
  label: string
  desc: string
  /** 注入 AI 提示词的方向指令 */
  prompt: string
}

export const READING_ANGLES: ReadingAngle[] = [
  {
    key: 'comprehensive',
    label: '综合解读',
    desc: '类型、权威、人生角色与能量结构的整体图景',
    prompt: '请给出综合解读：先概括类型与策略，再讲能量结构（定义中心/通道），最后给落地建议。',
  },
  {
    key: 'growth',
    label: '成长方向',
    desc: '从激活闸门的成长课题出发',
    prompt: '请聚焦成长方向：结合已激活闸门的成长课题与人生角色，指出当前阶段最值得发展的 2-3 个方向。',
  },
  {
    key: 'grounding',
    label: '扎根力',
    desc: '如何稳定能量、回到身体与当下',
    prompt: '请聚焦扎根力：分析哪些中心开放容易失焦，给出具体的日常扎根练习（身体、环境、节律）。',
  },
  {
    key: 'drive',
    label: '驱动力',
    desc: '什么在推动这个人行动',
    prompt: '请聚焦驱动力：从激活闸门的驱动主题与动力中心连接，说明这个人「为什么而动」，以及如何避免驱动被误用。',
  },
  {
    key: 'trajectory',
    label: '人生轨迹',
    desc: '南北交点与人生阶段的大方向',
    prompt: '请聚焦人生轨迹：结合南北交点的闸门/爻，描述人生从熟悉区（南交）走向成长区（北交）的大方向与阶段感。',
  },
  {
    key: 'forecast',
    label: '未来形势',
    desc: '基于行星周期的行运观察',
    prompt: '请聚焦未来形势：基于本命盘的太阳闸门与人生角色，说明未来 1-3 年可能的能量主题与心态建议（避免绝对化预测）。',
  },
  {
    key: 'karma',
    label: '前世姻缘',
    desc: '设计侧继承的主题与关系模式',
    prompt: '请聚焦前世姻缘：从设计侧（无意识）激活的闸门与通道，描述继承而来的关系模式与情感课题，语言保持温和、非宿命。',
  },
  {
    key: 'career',
    label: '事业方向',
    desc: '能量类型适合的协作与工作方式',
    prompt: '请聚焦事业方向：结合类型、权威与喉咙连接方式，说明适合的工作节奏、协作姿势与环境。',
  },
]

export const DEFAULT_ANGLE = READING_ANGLES[0]

export function angleOf(key: string): ReadingAngle {
  return READING_ANGLES.find((a) => a.key === key) ?? DEFAULT_ANGLE
}
