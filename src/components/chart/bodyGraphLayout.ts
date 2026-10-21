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
export const GATE_FONT = 24
/** 白色通道管宽度（底图实测约 17px） */
export const TUBE_W = 16
/** 彩色通道覆盖层宽度 */
export const CH_W = 14

export interface CenterShape {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
}

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
  // 心（意志）：小三角，尖朝上（底图精扫：顶点 y=1084，底边 y=1182）
  heart: {
    id: 'heart',
    polygon: [
      [768, 1084],
      [660, 1184],
      [884, 1184],
    ],
    cx: 768,
    cy: 1149,
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

/** 64 闸门数字中心坐标（底图实测，锁定不变） */
const GATE_POS: Record<number, [number, number]> = {
  // 顶轮
  64: [536, 238],
  61: [575, 238],
  63: [613, 238],
  // 眉心
  47: [537, 348],
  24: [575, 348],
  4: [613, 348],
  17: [552, 440],
  11: [601, 440],
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
  21: [734, 1135],
  51: [702, 1166],
  26: [818, 1168],
  40: [862, 1166],
  // 脾
  48: [132, 1322],
  57: [132, 1372],
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

  // 10-34 改走「20-57 通道中点」，避免与中心内部其它连线重叠
  const spine = byKey.get('20-57')
  const exploration = byKey.get('10-34')
  if (spine && exploration) {
    const mid: [number, number] = [(spine.x1 + spine.x2) / 2, (spine.y1 + spine.y2) / 2]
    const g10 = GATE_POINTS[10]
    const g34 = GATE_POINTS[34]
    // 34 → 中点（从骶骨边界穿出）
    const p34 = clipPoint([g34.x, g34.y], mid, 'sacral')
    // 中点 → 10（进入 G 中心边界）
    const p10 = clipPoint([g10.x, g10.y], mid, 'g')
    exploration.points = [p34, mid, p10]
    exploration.x1 = p34[0]
    exploration.y1 = p34[1]
    exploration.x2 = p10[0]
    exploration.y2 = p10[1]
  }
  return lines
})()

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

/** 人体剪影路径（底图淡剪影，用于底板层） */
export const SILHOUETTE_PATH =
  'M576 150 c-56 0 -101 45 -101 101 c0 34 17 64 42 82 c-30 12 -54 28 -54 28 ' +
  'c-64 34 -102 92 -110 168 c-4 42 -6 102 -6 158 h458 c0 -56 -2 -116 -6 -158 ' +
  'c-8 -76 -46 -134 -110 -168 c0 0 -24 -16 -54 -28 c25 -18 42 -48 42 -82 ' +
  'c0 -56 -45 -101 -101 -101 Z'
