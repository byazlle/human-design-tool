/**
 * 人体图几何：九中心多边形 + 64 闸门锚点 + 36 通道连线。
 *
 * 布局严格对齐用户提供的参照图（鼎心人类图截屏）：
 *   - 闸门数字写在中心**内部**，位于其连接通道的出口处
 *   - 已定义闸门 = 实心圆点 + 白字；未定义 = 纯文字（无圆）
 *   - 通道为两闸门位置之间的直线，不绕行、不穿中心
 *
 * 坐标来源：参照图 225×374 像素测量后按比例映射到 viewBox。
 */
import type { CenterId } from '../../types/hd'
import { GATE_CENTER, CHANNELS } from '../../engine/gateData'

export const VIEW_W = 720
export const VIEW_H = 1140
/** 闸门圆半径（已定义闸门的底圆；未定义闸门只有文字，用同一值保证间距） */
export const GATE_R = 15

export interface CenterShape {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  rx: number
  ry: number
  labelDy?: number
}

/**
 * 九中心几何（参照图实测比例，均匀缩放 3.3 倍）。
 */
export const CENTER_SHAPES: Record<CenterId, CenterShape> = {
  // 顶轮：正三角（尖朝上），三闸门 64/61/63 落在底边内侧
  head: {
    id: 'head',
    polygon: [
      [330, 12],
      [251, 168],
      [413, 168],
    ],
    cx: 331,
    cy: 116,
    rx: 81,
    ry: 52,
  },
  // 眉心：倒三角（尖朝下），上边 47/24/4，两侧 17/11，尖部 43
  ajna: {
    id: 'ajna',
    polygon: [
      [251, 200],
      [413, 200],
      [332, 358],
    ],
    cx: 332,
    cy: 253,
    rx: 81,
    ry: 53,
  },
  // 喉咙：矩形，11 个闸门分列四边
  throat: {
    id: 'throat',
    polygon: [
      [242, 398],
      [418, 398],
      [418, 580],
      [242, 580],
    ],
    cx: 330,
    cy: 489,
    rx: 88,
    ry: 91,
  },
  // G 中心：菱形（正方形旋转 45°），8 闸门环列
  g: {
    id: 'g',
    polygon: [
      [330, 618],
      [430, 718],
      [330, 818],
      [230, 718],
    ],
    cx: 330,
    cy: 718,
    rx: 100,
    ry: 100,
  },
  // 心（意志）：小三角，尖朝左（指向身体中轴），位于 G 右下
  heart: {
    id: 'heart',
    polygon: [
      [466, 728],
      [592, 650],
      [592, 800],
    ],
    cx: 550,
    cy: 726,
    rx: 63,
    ry: 50,
  },
  // 脾：三角尖朝右（指向骶骨），左侧翼
  spleen: {
    id: 'spleen',
    polygon: [
      [12, 742],
      [12, 948],
      [215, 845],
    ],
    cx: 80,
    cy: 845,
    rx: 102,
    ry: 68,
  },
  // 骶骨：矩形，位于中轴
  sacral: {
    id: 'sacral',
    polygon: [
      [242, 808],
      [418, 808],
      [418, 952],
      [242, 952],
    ],
    cx: 330,
    cy: 880,
    rx: 88,
    ry: 72,
  },
  // 情绪（太阳神经丛）：三角尖朝左（指向骶骨），右侧翼
  solar: {
    id: 'solar',
    polygon: [
      [465, 845],
      [668, 742],
      [668, 948],
    ],
    cx: 600,
    cy: 845,
    rx: 102,
    ry: 68,
  },
  // 根：矩形，位于底部
  root: {
    id: 'root',
    polygon: [
      [242, 962],
      [418, 962],
      [418, 1108],
      [242, 1108],
    ],
    cx: 330,
    cy: 1035,
    rx: 88,
    ry: 73,
  },
}

export interface GatePoint {
  gate: number
  center: CenterId
  x: number
  y: number
  /** 相对所属中心形心的方位角 */
  angle: number
  /** 兼容字段（旧版沿边界周长参数），现等于 angle */
  len: number
}

/**
 * 64 闸门显式坐标（参照图实测位置映射）。
 * 每个闸门放在「其通道从本中心穿出」的那一侧，保证连线短且不交叉中心本体。
 */
const GATE_POS: Record<number, [number, number]> = {
  // ── 顶轮 Head（底边内侧一行）──
  64: [283, 142],
  61: [331, 138],
  63: [379, 142],
  // ── 眉心 Ajna ──
  47: [283, 224], // 顶边左，连 64
  24: [331, 219], // 顶边中，连 61
  4: [379, 224], // 顶边右，连 63
  17: [288, 288], // 中左，连 62
  11: [374, 288], // 中右，连 56
  43: [331, 340], // 尖部，连 23
  // ── 喉咙 Throat ──
  62: [268, 418], // 顶左，连 17
  23: [331, 414], // 顶中，连 43
  56: [394, 418], // 顶右，连 11
  16: [258, 462], // 左上，连 48
  35: [404, 462], // 右上，连 36
  20: [258, 512], // 左下，连 57/34/10
  12: [404, 512], // 右下，连 22
  31: [272, 558], // 底左，连 7
  8: [312, 564], // 底中左，连 1
  33: [356, 564], // 底中右，连 13
  45: [396, 558], // 底右，连 21
  // ── G 中心 ──
  1: [330, 650], // 顶，连 8
  7: [282, 676], // 左上，连 31
  13: [378, 676], // 右上，连 33
  10: [258, 718], // 左，连 20/34/57
  25: [402, 718], // 右，连 51
  15: [282, 762], // 左下，连 5
  46: [378, 762], // 右下，连 29
  2: [330, 792], // 底，连 14
  // ── 心 Heart（尖朝左）──
  21: [566, 676], // 上，连 45
  51: [500, 716], // 尖部（左），连 25
  26: [556, 772], // 左下，连 44
  40: [572, 744], // 右下，连 37
  // ── 脾 Spleen（尖朝右）──
  48: [58, 786], // 上左，连 16
  44: [128, 798], // 上右，连 26
  57: [58, 842], // 中左，连 20
  50: [158, 852], // 中右（近尖），连 27
  32: [45, 893], // 下左，连 54
  28: [68, 914], // 下中，连 38
  18: [126, 884], // 下右，连 58
  // ── 骶骨 Sacral ──
  5: [274, 830], // 上左，连 15
  14: [330, 824], // 上中，连 2
  29: [386, 830], // 上右，连 46
  34: [256, 878], // 左，连 10/20/57
  27: [256, 928], // 左下，连 50
  59: [404, 878], // 右，连 6
  42: [288, 938], // 下左，连 53
  3: [330, 942], // 下中，连 60
  9: [384, 938], // 下右，连 52
  // ── 情绪 Solar（尖朝左）──
  6: [492, 845], // 尖部（左），连 59
  37: [568, 806], // 上左，连 40
  22: [622, 788], // 上右，连 12
  36: [644, 838], // 右上，连 35
  49: [590, 904], // 下左，连 19
  55: [622, 912], // 下右，连 39
  30: [650, 930], // 下，连 41
  // ── 根 Root ──
  53: [276, 986], // 上左，连 42
  60: [330, 980], // 上中，连 3
  52: [384, 986], // 上右，连 9
  54: [258, 1032], // 左上，连 32
  38: [258, 1076], // 左下，连 28
  58: [282, 1100], // 底左，连 18
  19: [402, 1032], // 右上，连 49
  39: [402, 1076], // 右下，连 55
  41: [380, 1100], // 底右，连 30
}

function buildGatePoints(): Record<number, GatePoint> {
  const result: Record<number, GatePoint> = {}
  for (let g = 1; g <= 64; g += 1) {
    const pos = GATE_POS[g]
    if (!pos) throw new Error(`Gate ${g} missing position`)
    const center = GATE_CENTER[g]
    const shape = CENTER_SHAPES[center]
    const angle = Math.atan2(pos[1] - shape.cy, pos[0] - shape.cx)
    result[g] = {
      gate: g,
      center,
      x: pos[0],
      y: pos[1],
      angle,
      len: angle,
    }
  }
  return result
}

export const GATE_POINTS: Record<number, GatePoint> = buildGatePoints()

export interface ChannelLine {
  key: string
  gates: [number, number]
  centers: [CenterId, CenterId]
  x1: number
  y1: number
  x2: number
  y2: number
}

export const CHANNEL_LINES: ChannelLine[] = CHANNELS.map((c) => {
  const a = GATE_POINTS[c.gates[0]]
  const b = GATE_POINTS[c.gates[1]]
  return {
    key: c.key,
    gates: c.gates,
    centers: c.centers,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
  }
})

/** 中心形心（用于名称标签定位） */
export function centerAnchor(id: CenterId): { x: number; y: number } {
  const s = CENTER_SHAPES[id]
  return { x: s.cx, y: s.cy }
}

/** 多边形 → SVG points 字符串 */
export function polygonPoints(id: CenterId): string {
  return CENTER_SHAPES[id].polygon.map(([x, y]) => `${x},${y}`).join(' ')
}

/**
 * 按实际内容包围盒收紧视口，避免细长图形在大容器里显得过小。
 */
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

  const pad = 12
  const x = Math.floor(minX - pad)
  const y = Math.floor(minY - pad)
  const w = Math.ceil(maxX - minX + pad * 2)
  const h = Math.ceil(maxY - minY + pad * 2)
  return { x, y, w, h, str: `${x} ${y} ${w} ${h}` }
})()
