/**
 * 人体图几何：九中心多边形 + 64 闸门锚点 + 36 通道连线。
 *
 * 闸门锚点的排布策略：先把每个闸门「它要连出去的方向」算出（伙伴中心的平均方位角），
 * 再按方位角排序、沿该中心的椭圆等分落位。这样通道线大致朝向外侧，不会横穿中心，
 * 且同一中心内的闸门永不重叠——比手工写 64 个坐标更可控，也不会随调整而错位。
 */
import type { CenterId } from '../../types/hd'
import { GATE_CENTER, CHANNELS } from '../../engine/gateData'

export const VIEW_W = 640
export const VIEW_H = 900
export const GATE_R = 12

export interface CenterShape {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  rx: number
  ry: number
}

export const CENTER_SHAPES: Record<CenterId, CenterShape> = {
  head: {
    id: 'head',
    polygon: [
      [320, 38],
      [400, 142],
      [240, 142],
    ],
    cx: 320,
    cy: 91,
    rx: 82,
    ry: 52,
  },
  ajna: {
    id: 'ajna',
    polygon: [
      [240, 162],
      [400, 162],
      [320, 266],
    ],
    cx: 320,
    cy: 213,
    rx: 82,
    ry: 52,
  },
  throat: {
    id: 'throat',
    polygon: [
      [250, 284],
      [390, 284],
      [390, 404],
      [250, 404],
    ],
    cx: 320,
    cy: 344,
    rx: 74,
    ry: 64,
  },
  g: {
    id: 'g',
    polygon: [
      [288, 470],
      [358, 530],
      [288, 590],
      [218, 530],
    ],
    cx: 288,
    cy: 530,
    rx: 74,
    ry: 64,
  },
  heart: {
    id: 'heart',
    polygon: [
      [404, 470],
      [458, 502],
      [404, 534],
    ],
    cx: 428,
    cy: 502,
    rx: 34,
    ry: 36,
  },
  spleen: {
    id: 'spleen',
    polygon: [
      [116, 570],
      [116, 708],
      [198, 639],
    ],
    cx: 156,
    cy: 639,
    rx: 46,
    ry: 72,
  },
  sacral: {
    id: 'sacral',
    polygon: [
      [222, 576],
      [338, 576],
      [338, 704],
      [222, 704],
    ],
    cx: 280,
    cy: 640,
    rx: 62,
    ry: 68,
  },
  solar: {
    id: 'solar',
    polygon: [
      [458, 570],
      [458, 708],
      [376, 639],
    ],
    cx: 418,
    cy: 639,
    rx: 46,
    ry: 72,
  },
  root: {
    id: 'root',
    polygon: [
      [222, 742],
      [338, 742],
      [338, 858],
      [222, 858],
    ],
    cx: 280,
    cy: 800,
    rx: 62,
    ry: 62,
  },
}

export interface GatePoint {
  gate: number
  center: CenterId
  x: number
  y: number
  angle: number
}

function centerGates(): Record<CenterId, number[]> {
  const map: Record<CenterId, number[]> = {
    head: [],
    ajna: [],
    throat: [],
    g: [],
    heart: [],
    spleen: [],
    sacral: [],
    solar: [],
    root: [],
  }
  for (let g = 1; g <= 64; g += 1) map[GATE_CENTER[g]].push(g)
  return map
}

function buildGatePoints(): Record<number, GatePoint> {
  const byCenter = centerGates()
  const result: Record<number, GatePoint> = {}

  for (const [centerId, gates] of Object.entries(byCenter) as Array<[CenterId, number[]]>) {
    const shape = CENTER_SHAPES[centerId]

    // 每个闸门的目标方位 = 其伙伴中心方向的平均
    const targets = gates.map((gate) => {
      const partners = CHANNELS.filter((c) => c.gates.includes(gate))
        .map((c) => (c.gates[0] === gate ? c.gates[1] : c.gates[0]))
        .map((other) => CENTER_SHAPES[GATE_CENTER[other]])
      if (!partners.length) return 0
      let sx = 0
      let sy = 0
      for (const p of partners) {
        const dx = p.cx - shape.cx
        const dy = p.cy - shape.cy
        const len = Math.hypot(dx, dy) || 1
        sx += dx / len
        sy += dy / len
      }
      return Math.atan2(sy, sx)
    })

    // 按方位排序，保证连线不交叉
    const order = gates
      .map((gate, i) => ({ gate, target: targets[i] }))
      .sort((a, b) => a.target - b.target)

    const n = order.length
    const step = (Math.PI * 2) / n

    // 旋转偏置：令等分槽位尽量贴近各自目标方位（圆周均值）
    let sumSin = 0
    let sumCos = 0
    order.forEach((item, i) => {
      const diff = item.target - i * step
      sumSin += Math.sin(diff)
      sumCos += Math.cos(diff)
    })
    const offset = Math.atan2(sumSin, sumCos)

    order.forEach((item, i) => {
      const angle = i * step + offset
      result[item.gate] = {
        gate: item.gate,
        center: centerId,
        x: shape.cx + Math.cos(angle) * shape.rx,
        y: shape.cy + Math.sin(angle) * shape.ry,
        angle,
      }
    })
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

/** 中心中心点（用于标签定位） */
export function centerAnchor(id: CenterId): { x: number; y: number } {
  const s = CENTER_SHAPES[id]
  return { x: s.cx, y: s.cy }
}
