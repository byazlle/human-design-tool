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
export const VIEW_H = 950
export const GATE_R = 15

export interface CenterShape {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  rx: number
  ry: number
}

/**
 * 九中心几何。约束：相邻中心的「闸门环」之间至少留出 30px，
 * 保证直径 30 的闸门圆不重叠（见 tests/layout.test.ts）。
 */
export const CENTER_SHAPES: Record<CenterId, CenterShape> = {
  head: {
    id: 'head',
    polygon: [
      [320, 38],
      [400, 148],
      [240, 148],
    ],
    cx: 320,
    cy: 92,
    rx: 78,
    ry: 52,
  },
  ajna: {
    id: 'ajna',
    polygon: [
      [240, 176],
      [400, 176],
      [320, 284],
    ],
    cx: 320,
    cy: 230,
    rx: 78,
    ry: 52,
  },
  throat: {
    id: 'throat',
    polygon: [
      [250, 320],
      [390, 320],
      [390, 440],
      [250, 440],
    ],
    cx: 320,
    cy: 380,
    rx: 74,
    ry: 66,
  },
  g: {
    id: 'g',
    polygon: [
      [288, 486],
      [358, 546],
      [288, 606],
      [218, 546],
    ],
    cx: 288,
    cy: 546,
    rx: 70,
    ry: 64,
  },
  heart: {
    id: 'heart',
    polygon: [
      [404, 484],
      [458, 518],
      [404, 552],
    ],
    cx: 428,
    cy: 518,
    rx: 34,
    ry: 38,
  },
  spleen: {
    id: 'spleen',
    polygon: [
      [116, 630],
      [116, 766],
      [194, 698],
    ],
    cx: 148,
    cy: 698,
    rx: 42,
    ry: 72,
  },
  sacral: {
    id: 'sacral',
    polygon: [
      [222, 644],
      [338, 644],
      [338, 772],
      [222, 772],
    ],
    cx: 280,
    cy: 708,
    rx: 60,
    ry: 68,
  },
  solar: {
    id: 'solar',
    polygon: [
      [460, 630],
      [460, 766],
      [382, 698],
    ],
    cx: 418,
    cy: 698,
    rx: 44,
    ry: 72,
  },
  root: {
    id: 'root',
    polygon: [
      [222, 806],
      [338, 806],
      [338, 930],
      [222, 930],
    ],
    cx: 280,
    cy: 868,
    rx: 60,
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

/**
 * 闸门在各自中心环上的「预期方位」（度，0=右，90=下，-90=上）。
 * 依据标准人体图的排布习惯：朝哪个中心连出的通道，闸门就画在那一侧，
 * 这样连线短、不横穿中心，也与纸质图表的观感一致。
 */
const PREFERRED_ANGLE: Record<number, number> = {
  // 头顶（三角朝上）：三闸门在顶边
  64: -140, 61: -90, 63: -40,
  // 眉心（三角朝下）：上排通向头顶，下排通向喉咙
  47: -140, 24: -90, 4: -40, 17: 140, 11: 90, 43: 40,
  // 喉咙：上接眉心，右下接情绪/心，左下接 G，左侧接脾
  62: -110, 23: -90, 56: -70, 16: 178,
  35: -22, 12: -2, 45: 28,
  31: 108, 8: 124, 33: 140, 20: 158,
  // G：上接喉咙，右上接心，下方接骶骨/脾
  7: -92, 1: -132, 13: -168, 25: -40, 10: -8, 46: 30, 15: 92, 2: 152,
  // 心（意志）：上接喉咙，右接情绪，左接脾，左下达 G
  21: -92, 40: 8, 26: 130, 51: 178,
  // 脾：右上接喉咙，右侧接 G/骶骨/心，右下接根
  48: -104, 57: -34, 44: -4, 50: 22, 32: 58, 28: 80, 18: 102,
  // 骶骨：上接 G，右上接情绪，右下 / 下接根，左接脾
  34: -152, 5: -122, 14: -92, 29: -62, 59: -24, 27: 178, 3: 92, 42: 112, 9: 132,
  // 情绪：上接喉咙/心，左接骶骨，下接根
  36: -122, 22: -74, 6: 178, 30: 100, 55: 80, 49: 60, 37: -100,
  // 根：上排接骶骨，右上接情绪，左上接脾
  52: -112, 60: -90, 53: -68, 41: 2, 39: -18, 19: -38, 58: -152, 38: -170, 54: 178,
}

const DEG = Math.PI / 180

/** 角度松弛：只在可能重叠时把相邻闸门推开，返回与原数组同序的角度 */
function relaxAngles(angles: number[], minSepDeg: number): number[] {
  const n = angles.length
  if (n < 2) return angles
  const norm = (a: number) => ((a % 360) + 360) % 360

  // 排序时记录原始下标，最后按原序写回
  const order = angles
    .map((a, i) => ({ a: norm(a), i }))
    .sort((x, y) => x.a - y.a)
  const vals = order.map((o) => o.a)

  for (let iter = 0; iter < 200; iter += 1) {
    let moved = false
    for (let k = 0; k < n; k += 1) {
      const next = (k + 1) % n
      const gap = next === 0 ? vals[0] + 360 - vals[k] : vals[next] - vals[k]
      if (gap < minSepDeg - 1e-6) {
        const push = (minSepDeg - gap) / 2
        vals[k] -= push
        if (next === 0) vals[0] += push
        else vals[next] += push
        moved = true
      }
    }
    if (!moved) break
  }

  const out = new Array<number>(n)
  order.forEach((o, k) => {
    out[o.i] = vals[k]
  })
  return out
}

function buildGatePoints(): Record<number, GatePoint> {
  const byCenter = centerGates()
  const result: Record<number, GatePoint> = {}

  for (const [centerId, gates] of Object.entries(byCenter) as Array<[CenterId, number[]]>) {
    const shape = CENTER_SHAPES[centerId]

    // 优先用显式方位；缺失时退化为「按伙伴中心平均方位」
    const targets = gates.map((gate) => {
      if (PREFERRED_ANGLE[gate] !== undefined) return PREFERRED_ANGLE[gate]
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
      return Math.atan2(sy, sx) / DEG
    })

    // 最小间隔：按环周长能放下直径 34 的圆来估算，只用于防重叠，不强制均分
    const ringCircumference = Math.PI * (shape.rx + shape.ry)
    const minSepDeg = ((34 / ringCircumference) * 360) * 1.05
    const relaxed = relaxAngles(targets, minSepDeg)

    gates.forEach((gate, i) => {
      const angle = relaxed[i] * DEG
      result[gate] = {
        gate,
        center: centerId,
        x: shape.cx + Math.cos(angle) * shape.rx,
        y: shape.cy + Math.sin(angle) * shape.ry,
        angle,
      }
    })

    // 椭圆上的等角间距在长短轴方向并不等距（扁椭圆的水平侧更挤），
    // 再用笛卡尔松弛把仍然靠得太近的锚点推开，并重新投影回椭圆。
    const group = gates.map((g) => result[g])
    const minDist = GATE_R * 2 + 3
    for (let iter = 0; iter < 200; iter += 1) {
      let moved = false
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const a = group[i]
          const b = group[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let dist = Math.hypot(dx, dy)
          if (dist >= minDist - 1e-6) continue
          if (dist < 0.001) {
            dx = 0
            dy = -1
            dist = 1
          }
          const push = (minDist - dist) / 2
          const ux = (dx / dist) * push
          const uy = (dy / dist) * push
          a.x -= ux
          a.y -= uy
          b.x += ux
          b.y += uy
          moved = true
          for (const p of [a, b]) {
            const ang = Math.atan2((p.y - shape.cy) / shape.ry, (p.x - shape.cx) / shape.rx)
            p.angle = ang
            p.x = shape.cx + Math.cos(ang) * shape.rx
            p.y = shape.cy + Math.sin(ang) * shape.ry
          }
        }
      }
      if (!moved) break
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

/** 中心中心点（用于标签定位） */
export function centerAnchor(id: CenterId): { x: number; y: number } {
  const s = CENTER_SHAPES[id]
  return { x: s.cx, y: s.cy }
}

/**
 * 裁掉左右多余留白：人体图本身是细长的，固定 640×950 的 viewBox
 * 会让图形在容器里显得很小。这里按实际内容包围盒收紧视口。
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

  const pad = 10
  const x = Math.floor(minX - pad)
  const y = Math.floor(minY - pad)
  const w = Math.ceil(maxX - minX + pad * 2)
  const h = Math.ceil(maxY - minY + pad * 2)
  return { x, y, w, h, str: `${x} ${y} ${w} ${h}` }
})()
