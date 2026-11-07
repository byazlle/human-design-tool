/**
 * 人体图几何（1:1 对齐用户提供的「人类图模板」底图，1152×1920）。
 *
 * 所有坐标由底图像素测量得到：
 *   - 九中心顶点/包围盒：从底图黑色描边扫描得出
 *   - 64 闸门数字位置：从底图每个中心内部的数字文本簇提取
 *
 * 渲染分两层：
 *   1) 底板层（plate）：青色渐变背景 + 人体剪影 + 白色通道管 + 白色中心 + 黑描边
 *   2) 数据层：定义中心填色、设计侧闸门蓝底白字、通道红/黑/条纹覆盖
 */
import type { CenterId } from '../../types/hd'
import { GATE_CENTER, CHANNELS } from '../../engine/gateData'

export const VIEW_W = 1152
export const VIEW_H = 1920
/** 闸门底圆半径（底图数字高 18px，r=17 恰好包住） */
export const GATE_R = 17
/** 闸门数字字号 */
export const GATE_FONT = 28
/** 白色通道管宽度（底图实测约 17px） */
export const TUBE_W = 16
/** 彩色通道覆盖层宽度 */
export const CH_W = 14

/* ── 几何工具（旋转 / 重心坐标 / 三角内布点）───────────── */

type Pt = [number, number]
type Tri = [Pt, Pt, Pt]

/** 绕 (cx,cy) 旋转 deg 度；SVG 的 y 轴向下，正角 = 顺时针 */
export function rotatePoint(x: number, y: number, deg: number, cx: number, cy: number): Pt {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/** 有符号面积（用于重心坐标，符号表示点的内外） */
function signedArea(a: Pt, b: Pt, c: Pt): number {
  return ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** 重心坐标 (α,β,γ)：P = αA + βB + γC；三点共线时返回 null */
export function barycentricCoords(p: Pt, tri: Tri): [number, number, number] | null {
  const [A, B, C] = tri
  const total = signedArea(A, B, C)
  if (Math.abs(total) < 1e-9) return null
  return [signedArea(p, B, C) / total, signedArea(A, p, C) / total, signedArea(A, B, p) / total]
}

/**
 * 点到三角形三条边的有符号距离（内部为正）。
 * 某条边的距离 = 该边对面顶点的重心坐标 × 该边上的高。
 */
export function triangleEdgeDistances(p: Pt, tri: Tri): [number, number, number] {
  const bc = barycentricCoords(p, tri)
  if (!bc) return [0, 0, 0]
  const [A, B, C] = tri
  const area = Math.abs(signedArea(A, B, C))
  const hA = (2 * area) / dist(B, C)
  const hB = (2 * area) / dist(C, A)
  const hC = (2 * area) / dist(A, B)
  return [bc[0] * hA, bc[1] * hB, bc[2] * hC]
}

/** 点到三条边的最小有符号距离（内部为正；<0 表示在三角外） */
export function minEdgeDistance(p: Pt, tri: Tri): number {
  return Math.min(...triangleEdgeDistances(p, tri))
}

/**
 * 在三角形内部按重心坐标为若干闸门布点（当前只用于意志力中心 4 枚闸门）。
 *
 * 约束有两条：
 *   1) 每枚闸门到三条边的距离 ≥ margin（圆不压中心描边）；
 *   2) 任意两枚闸门中心距 ≥ 2R − 2（圆与圆不重叠，见 tests/layout.test.ts）。
 *
 * 做法：把三角形三条边各向内平移 margin，得到收缩三角形。取它的三个角点，
 * 再在收缩三角形内做 1px 网格搜索，挑「到已布点最小距离最大」的位置作为第 4 个点
 * （对三角形而言，这个位置落在最长收缩边中点附近，最小间距约等于半边长）。
 */
export function layoutGatesInTriangle(
  tri: Tri,
  gates: number[],
  margin: number = GATE_R + 10,
): Record<number, Pt> {
  const [A, B, C] = tri
  const area = Math.abs(signedArea(A, B, C))
  const lenBC = dist(B, C)
  const lenCA = dist(C, A)
  const lenAB = dist(A, B)
  const hA = (2 * area) / lenBC
  const hB = (2 * area) / lenCA
  const hC = (2 * area) / lenAB

  // 每个重心坐标的下界（保证到对应边 ≥ margin）；留 5% 余量吸收浮点误差
  const safe = margin * 1.05
  const a0 = Math.min(0.3, safe / hA)
  const b0 = Math.min(0.3, safe / hB)
  const c0 = Math.min(0.3, safe / hC)

  const toPoint = (a: number, b: number, c: number): Pt => [
    a * A[0] + b * B[0] + c * C[0],
    a * A[1] + b * B[1] + c * C[1],
  ]

  // 收缩三角形的三个角点（每个角点恰好距两条边 = safe）
  const corners: Pt[] = [
    toPoint(1 - b0 - c0, b0, c0), // 靠顶点 A
    toPoint(a0, 1 - a0 - c0, c0), // 靠顶点 B
    toPoint(a0, b0, 1 - a0 - b0), // 靠顶点 C
  ]

  // 第 4 点：收缩三角形内网格搜索，最大化到三个角点的最小距离
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  let fourth: Pt = corners[0]
  let bestScore = -Infinity
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const p: Pt = [x, y]
      // 比 margin 再多 1px，避免网格取样恰好压在收缩边上
      if (minEdgeDistance(p, tri) < margin + 1) continue
      let score = Infinity
      for (const q of corners) score = Math.min(score, dist(p, q))
      // 严格大于 → 同分时保留先遍历到的点，结果可复现
      if (score > bestScore) {
        bestScore = score
        fourth = p
      }
    }
  }

  const round2 = (v: number): number => Math.round(v * 100) / 100
  // 按 x 从左到右分配，保证布点在视觉上有确定顺序（同一输入必然同一输出）
  const candidates = [...corners, fourth].sort((p, q) => p[0] - q[0])

  const out: Record<number, Pt> = {}
  gates.forEach((gate, i) => {
    const p = candidates[i % candidates.length]
    out[gate] = [round2(p[0]), round2(p[1])]
  })
  return out
}

export interface CenterShape {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
}

/**
 * 意志力中心（中间菱形下方右侧的小三角）：
 * - 在 v2.1.0 的顺时针 30° 基础上再顺时针旋转 25°，共 55°；
 * - 整体下移「一个字符高度」= GATE_FONT = 28px；
 * - 旋转/下移后 51/21/26/40 仍由 layoutGatesInTriangle 按重心坐标重新布点，
 *   GATE_POINTS 与通道裁剪端点随之自动重算，故四条通道始终连到对应数字（不再误连）。
 */
export const HEART_ROTATION_DEG = 55
export const HEART_SHIFT_Y = GATE_FONT
export const HEART_CX = 768
export const HEART_CY = 1149 + HEART_SHIFT_Y
const HEART_BASE: Tri = [
  [768, 1084],
  [660, 1184],
  [884, 1184],
]
/** 先把基底整体下移 28px，再绕下移后的中心旋转 55°（等价于「在原 30° 上追加 25°」） */
export const HEART_TRIANGLE: Tri = HEART_BASE.map(([x, y]) =>
  rotatePoint(x, y + HEART_SHIFT_Y, HEART_ROTATION_DEG, HEART_CX, HEART_CY),
) as Tri

/** 九中心几何（底图实测） */
export const CENTER_SHAPES: Record<CenterId, CenterShape> = {
  // 顶轮：正三角，尖朝上
  head: {
    id: 'head',
    polygon: [
      [576, 58],
      [477, 258],
      [674, 258],
    ],
    cx: 576,
    cy: 191,
  },
  // 眉心：倒三角，尖朝下
  ajna: {
    id: 'ajna',
    polygon: [
      [477, 324],
      [674, 324],
      [576, 530],
    ],
    cx: 576,
    cy: 393,
  },
  // 喉咙：矩形
  throat: {
    id: 'throat',
    polygon: [
      [475, 613],
      [675, 613],
      [675, 818],
      [475, 818],
    ],
    cx: 575,
    cy: 715,
  },
  // G：菱形
  g: {
    id: 'g',
    polygon: [
      [576, 884],
      [704, 1018],
      [576, 1152],
      [447, 1018],
    ],
    cx: 576,
    cy: 1018,
  },
  // 心（意志）：小三角，顺时针 55° + 整体下移 28px
  heart: {
    id: 'heart',
    polygon: HEART_TRIANGLE.map(([x, y]) => [x, y] as Pt),
    cx: HEART_CX,
    cy: HEART_CY,
  },
  // 脾：三角，尖朝右
  spleen: {
    id: 'spleen',
    polygon: [
      [62, 1262],
      [62, 1486],
      [266, 1372],
    ],
    cx: 130,
    cy: 1372,
  },
  // 骶骨：矩形
  sacral: {
    id: 'sacral',
    polygon: [
      [474, 1360],
      [673, 1360],
      [673, 1568],
      [474, 1568],
    ],
    cx: 573,
    cy: 1464,
  },
  // 情绪（太阳神经丛）：三角，尖朝左
  solar: {
    id: 'solar',
    polygon: [
      [889, 1374],
      [1089, 1262],
      [1089, 1486],
    ],
    cx: 1022,
    cy: 1374,
  },
  // 根：矩形
  root: {
    id: 'root',
    polygon: [
      [474, 1615],
      [673, 1615],
      [673, 1823],
      [474, 1823],
    ],
    cx: 573,
    cy: 1719,
  },
}

/** 意志力中心 4 个闸门：旋转后三角内按重心坐标内缩布点（保证不压边、不出界） */
export const HEART_GATE_POS: Record<number, Pt> = layoutGatesInTriangle(HEART_TRIANGLE, [
  51, 21, 26, 40,
])

/** 64 闸门数字中心坐标（底图实测，锁定不变；意志力中心 4 门为旋转后重算值） */
const GATE_POS: Record<number, [number, number]> = {
  // 顶轮
  64: [536, 238],
  61: [575, 238],
  63: [613, 238],
  // 眉心
  47: [537, 348],
  24: [575, 348],
  4: [613, 348],
  // 通道平行：17/11 的 x 分别与 62/56 对齐，并各上移 16px，
  // 使 17-62、11-56 与 43-23 三条通道同为竖直、严格平行。
  17: [540, 424],
  11: [606, 424],
  43: [574, 486],
  // 喉咙
  62: [540, 636],
  23: [574, 635],
  56: [606, 635],
  16: [505, 681],
  35: [648, 680],
  20: [505, 749],
  12: [650, 750],
  31: [534, 793],
  8: [576, 794],
  33: [612, 793],
  45: [648, 792],
  // G
  1: [574, 921],
  7: [538, 966],
  13: [615, 957],
  10: [492, 1018],
  25: [648, 1032],
  15: [538, 1068],
  46: [614, 1068],
  2: [576, 1114],
  // 心
  ...HEART_GATE_POS,
  // 脾
  48: [88, 1288], // 脾中心左上角（与左下角的 18 相对应）
  57: [132, 1322], // 承接原 48 的位置
  44: [186, 1352],
  50: [220, 1378],
  32: [179, 1400],
  28: [134, 1422],
  18: [94, 1451],
  // 骶骨
  5: [537, 1390],
  14: [576, 1389],
  29: [618, 1388],
  34: [504, 1444],
  27: [504, 1510],
  59: [644, 1509],
  42: [530, 1541],
  3: [576, 1541],
  9: [616, 1540],
  // 情绪
  36: [1063, 1300],
  22: [1013, 1324],
  37: [953, 1354],
  6: [922, 1376],
  49: [973, 1406],
  55: [1019, 1430],
  30: [1063, 1452],
  // 根
  53: [534, 1642],
  60: [577, 1642],
  52: [620, 1642],
  54: [506, 1680],
  19: [644, 1674],
  38: [507, 1738],
  39: [645, 1732],
  58: [508, 1796],
  41: [644, 1792],
}

export interface GatePoint {
  gate: number
  center: CenterId
  x: number
  y: number
  angle: number
  len: number
}

function buildGatePoints(): Record<number, GatePoint> {
  const out: Record<number, GatePoint> = {}
  for (let g = 1; g <= 64; g += 1) {
    const pos = GATE_POS[g]
    if (!pos) throw new Error(`Gate ${g} missing position`)
    const center = GATE_CENTER[g]
    const shape = CENTER_SHAPES[center]
    const angle = Math.atan2(pos[1] - shape.cy, pos[0] - shape.cx)
    out[g] = { gate: g, center, x: pos[0], y: pos[1], angle, len: angle }
  }
  return out
}

export const GATE_POINTS: Record<number, GatePoint> = buildGatePoints()

/* ── 通道几何：按中心边界裁剪 ──────────────────────────── */

export interface ChannelLine {
  key: string
  gates: [number, number]
  centers: [CenterId, CenterId]
  /** 起点（从 gates[0] 所在中心边界穿出） */
  x1: number
  y1: number
  /** 终点（进入 gates[1] 所在中心边界） */
  x2: number
  y2: number
  /** 是否同中心内部通道 */
  internal: boolean
  /** 折线走线（存在时优先于 x1..y2 两端点） */
  points?: Array<[number, number]>
  /**
   * 枢纽辐条：该线段由哪些原始通道「共用」。
   * 任一 key 被激活即着色（避免 10→M 被画 3 次、34→M 被画 2 次）。
   */
  spokeOf?: string[]
  /** 枢纽辐条标记：为 true 时折线终点固定在枢纽 M，不做末端向内延伸 */
  hub?: boolean
}

/** 从 p 出发朝向 q，与多边形边界的第一个交点参数 t（0..1） */
function firstExitT(
  px: number,
  py: number,
  qx: number,
  qy: number,
  poly: Array<[number, number]>,
): number | null {
  const dx = qx - px
  const dy = qy - py
  let best: number | null = null
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((a[0] - px) * ey - (a[1] - py) * ex) / den
    const u = ((a[0] - px) * dy - (a[1] - py) * dx) / den
    if (t > 1e-4 && t < 1 - 1e-4 && u >= -1e-6 && u <= 1 + 1e-6) {
      if (best === null || t < best) best = t
    }
  }
  return best
}

function clipPoint(
  from: [number, number],
  to: [number, number],
  center: CenterId,
): [number, number] {
  const t = firstExitT(from[0], from[1], to[0], to[1], CENTER_SHAPES[center].polygon)
  if (t === null) return from
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

function buildChannelLines(): ChannelLine[] {
  return CHANNELS.map((c) => {
    const [g0, g1] = c.gates
    const a = GATE_POINTS[g0]
    const b = GATE_POINTS[g1]
    const internal = a.center === b.center
    if (internal) {
      return {
        key: c.key,
        gates: [g0, g1],
        centers: c.centers,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        internal: true,
      }
    }
    const p0 = clipPoint([a.x, a.y], [b.x, b.y], a.center)
    const p1 = clipPoint([b.x, b.y], [a.x, a.y], b.center)
    return {
      key: c.key,
      gates: [g0, g1],
      centers: c.centers,
      x1: p0[0],
      y1: p0[1],
      x2: p1[0],
      y2: p1[1],
      internal: false,
    }
  })
}

export const CHANNEL_LINES: ChannelLine[] = (() => {
  const lines = buildChannelLines()
  const byKey = new Map(lines.map((l) => [l.key, l]))

  /**
   * 枢纽化走线（用户规格）：
   * 以「20-57 通道中点 M」为唯一枢纽，10 / 20 / 34 / 57 各自只有**一条**线连到 M，
   * 闸门之间没有直接连线。原先 5 条（10-20 / 10-34 / 10-57 / 20-34 / 34-57）
   * 各画 20→M、34→M 会造成重复叠线，这里改为「去重辐条」：
   *   主干：20 → M → 57（20-57 共线，保留一条）
   *   支路：10 → M、34 → M
   * 渲染时按 `spokeOf` 里任一原始通道是否激活来决定该辐条是否着色。
   */
  const spine = byKey.get('20-57')
  if (!spine) return lines

  const M: [number, number] = [(spine.x1 + spine.x2) / 2, (spine.y1 + spine.y2) / 2]
  const HUB_KEYS = ['10-20', '10-34', '10-57', '20-34', '34-57']

  /** 闸门 → 枢纽的支路端点（从所属中心边界穿出） */
  const spoke = (gate: number): [number, number] => {
    const g = GATE_POINTS[gate]
    return clipPoint([g.x, g.y], M, g.center)
  }

  // 主干 20 → M → 57（三点共线，视觉上仍是一条直线）
  const p20 = spoke(20)
  const p57 = spoke(57)
  spine.points = [p20, M, p57]
  spine.x1 = p20[0]
  spine.y1 = p20[1]
  spine.x2 = p57[0]
  spine.y2 = p57[1]
  spine.spokeOf = ['20-57']

  // 支路 10 → M、34 → M（gates 的另一端仅用于意识判定与点击回退）
  const p10 = spoke(10)
  const hub10: ChannelLine = {
    key: 'hub-10',
    gates: [10, 20],
    centers: ['g', 'throat'],
    x1: p10[0],
    y1: p10[1],
    x2: M[0],
    y2: M[1],
    internal: false,
    points: [p10, M],
    spokeOf: ['10-20', '10-34', '10-57'],
    hub: true,
  }
  const p34 = spoke(34)
  const hub34: ChannelLine = {
    key: 'hub-34',
    gates: [34, 20],
    centers: ['sacral', 'throat'],
    x1: p34[0],
    y1: p34[1],
    x2: M[0],
    y2: M[1],
    internal: false,
    points: [p34, M],
    spokeOf: ['10-34', '20-34', '34-57'],
    hub: true,
  }

  // 5 条原始直连线不再作为独立线段出现
  return [...lines.filter((l) => !HUB_KEYS.includes(l.key)), hub10, hub34]
})()

/**
 * 悬挂闸门短段的终点比例（相对「闸门边界 → 路线相邻点」这一段）。
 *
 * 背景：枢纽化后 20-57 主干 route = [20边界, M, 57边界]，10/34 辐条 route = [闸门边界, M]，
 * 其中 M 就是「20 与 57 的中点」，本身已是每条支路的半程终点。若再统一乘 0.45，
 * 等于「半条通道的一半」≈ 整条通道的 1/4（用户反馈的「只连了 1/4」）。
 * 因此：经枢纽的路线直达 M（1），普通通道走到两端点中点（0.5）。
 */
export function hangingEndRatio(line: {
  hub?: boolean
  points?: Array<[number, number]>
}): number {
  const viaHub = line.hub === true || (line.points?.length ?? 0) > 2
  return viaHub ? 1 : 0.5
}

/** 中心形心 */
export function centerAnchor(id: CenterId): { x: number; y: number } {
  const s = CENTER_SHAPES[id]
  return { x: s.cx, y: s.cy }
}

/** 多边形 → SVG points 字符串 */
export function polygonPoints(id: CenterId): string {
  return CENTER_SHAPES[id].polygon.map(([x, y]) => `${x},${y}`).join(' ')
}

/** 视口按内容紧收，四周留边距以容纳底板背景 */
export const VIEW_BOX = (() => {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of Object.values(GATE_POINTS)) {
    minX = Math.min(minX, p.x - GATE_R)
    maxX = Math.max(maxX, p.x + GATE_R)
    minY = Math.min(minY, p.y - GATE_R)
    maxY = Math.max(maxY, p.y + GATE_R)
  }
  for (const s of Object.values(CENTER_SHAPES)) {
    for (const [x, y] of s.polygon) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  const padX = 56
  const padY = 44
  const x = Math.floor(minX - padX)
  const y = Math.floor(minY - padY)
  const w = Math.ceil(maxX - minX + padX * 2)
  const h = Math.ceil(maxY - minY + padY * 2)
  return { x, y, w, h, str: `${x} ${y} ${w} ${h}` }
})()

/**
 * 人体剪影（底板淡剪影）：盘腿打坐的对称剪影。
 *
 * 只描绘右半段，左半段用 x → 1152 − x 镜像生成，保证中轴严格在 x=576。
 * 姿态：头部圆（圆心约 576,250 / 半径约 100）→ 颈 → 肩（宽约 210）→ 躯干收窄至腰
 * → 盘腿横向铺开（覆盖 x≈52…1100、y≈1150…1560，左右腿分别压住脾/情绪中心三角区域）
 * → 回到中轴。双手落在腿上，属剪影内部，不另画轮廓（仅一条闭合 path）。
 */
const SILHOUETTE_RIGHT: Array<[number, number, number, number, number, number]> = [
  // 头顶右半 → 头右下 → 颈右
  [641, 150, 680, 196, 680, 254],
  [680, 302, 656, 336, 620, 352],
  // 颈 → 肩（右肩约 x=682）
  [616, 392, 626, 430, 648, 458],
  // 肩 → 上臂外缘（自然内收进躯干）
  [712, 472, 756, 504, 784, 560],
  // 躯干右侧 → 腰（收窄）
  [824, 648, 840, 766, 840, 902],
  [840, 1014, 826, 1096, 810, 1152],
  // 右腿外缘：覆盖右侧情绪中心三角区域（x 889–1089, y 1262–1486）
  [902, 1178, 1006, 1222, 1056, 1290],
  [1100, 1354, 1088, 1424, 1038, 1468],
  // 腿底 → 回到中轴（盘腿底缘 y≈1548–1560）
  [972, 1514, 888, 1542, 792, 1548],
  [688, 1556, 620, 1560, 576, 1560],
]

function buildSilhouettePath(): string {
  const parts: string[] = ['M576 150']
  for (const [c1x, c1y, c2x, c2y, x, y] of SILHOUETTE_RIGHT) {
    parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x} ${y}`)
  }
  // 反向镜像回中轴
  for (let i = SILHOUETTE_RIGHT.length - 1; i >= 0; i -= 1) {
    const [c1x, c1y, c2x, c2y] = SILHOUETTE_RIGHT[i]
    const [sx, sy] =
      i === 0 ? [576, 150] : [SILHOUETTE_RIGHT[i - 1][4], SILHOUETTE_RIGHT[i - 1][5]]
    parts.push(`C ${1152 - c2x} ${c2y}, ${1152 - c1x} ${c1y}, ${1152 - sx} ${sy}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

/** 人体剪影路径（底图淡剪影，用于底板层） */
export const SILHOUETTE_PATH = buildSilhouettePath()
