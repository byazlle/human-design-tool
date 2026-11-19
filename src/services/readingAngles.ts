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
    key: 'development',
    label: '发展轨迹',
    desc: '从当前结构看接下来能长出来的方向',
    prompt:
      '请聚焦发展轨迹：结合南北交点、人生角色与已定义/开放中心的现状，说明接下来 1–2 年最可能长出来的方向，并给 2–3 个可观察的下一步（有具体场景，不做绝对化预测）。',
  },
  {
    key: 'forecast',
    label: '未来形势',
    desc: '基于行星周期的行运观察',
    prompt: '请聚焦未来形势：基于本命盘的太阳闸门与人生角色，说明未来 1-3 年可能的能量主题与心态建议（避免绝对化预测）。',
  },
  {
    key: 'marriage',
    label: '姻缘情况',
    desc: '本世的关系模式、亲密需求与承诺方式',
    prompt:
      '请聚焦姻缘情况：从设计侧（无意识）激活的闸门与通道出发，说明这个人在这一生的关系里容易被什么吸引、在亲密中自动扮演谁、承诺方式有什么特点，并给可观察的信号与可执行的调整。不要使用「宿命 / 注定」这类表述。',
  },
  {
    key: 'career',
    label: '事业方向',
    desc: '能量类型适合的协作与工作方式',
    prompt: '请聚焦事业方向：结合类型、权威与喉咙连接方式，说明适合的工作节奏、协作姿势与环境。',
  },
]

export const DEFAULT_ANGLE = READING_ANGLES[0]

/**
 * 「不限方向」的注入文案（入口 C 允许不选方向，入口 B 不允许）。
 *
 * 与「注入某个角度 prompt」区分：这里给的是**组织方式**约束，不是内容侧重，
 * 否则用户没选方向时模型会自己编一个方向出来。
 */
export const ANGLE_UNSET_LABEL =
  '不限方向：按这些勾选项在这张盘里如何互相影响来组织，不套用固定角度，也不引入未勾选的结构。'

/**
 * 旧角度键 → 新角度键的只读兼容映射（v4.0.0）。
 *
 * v3.5.0 的旧姻缘角度整章改写为「姻缘情况」（键 `marriage`），
 * 但历史解读档案与批量导出里存的 `ref` 可能仍是 `karma`。
 * 打开旧记录时按这张表回落，**不改写**历史记录本身（保真，R12）。
 */
const LEGACY_ANGLE_ALIAS: Record<string, string> = { karma: 'marriage' }

export function angleOf(key: string): ReadingAngle {
  const resolved = LEGACY_ANGLE_ALIAS[key] ?? key
  return READING_ANGLES.find((a) => a.key === resolved) ?? DEFAULT_ANGLE
}

/**
 * 入口 A ⑤ 的五个方向（顺序固定，不可调换）：
 * 人生轨迹 → 发展轨迹 → 未来形势 → 扎根力 → 成长方向。
 *
 * ★ 这里只做「按 key 取引用」，不复制文案：文案的唯一定义仍在 `READING_ANGLES`，
 *   计划器直接渲染本数组即可（ARCH §3.2 ⑤ / §8.2）。
 */
export const A5_DIRECTION_KEYS = ['trajectory', 'development', 'forecast', 'grounding', 'growth'] as const

export const MODULE_A5_DIRECTIONS: ReadingAngle[] = A5_DIRECTION_KEYS.map((key) => angleOf(key))
