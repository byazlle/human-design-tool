/**
 * 人体图几何：九中心多边形 + 64 闸门锚点 + 36 通道连线。
 *
 * 闸门定位策略（重写版）：
 *   1. 把每个中心的边界按 1px 采样，得到「沿周长的有序点列」；
 *   2. 闸门的理想位置 = 它要连出去的那个中心的方位（多伙伴取平均）；
 *   3. 在边界上取最接近该方位角的采样点作为初值；
 *   4. 沿周长做环形松弛，保证同中心闸门之间至少隔开一个直径 —— 于是
 *      同一方向的多个闸门会自然沿边界排开，而不是叠成一团。
 *
 * 这样每条通道都是「两个边界点之间的短直线」，不会横穿中心，
 * 也避免了旧版椭圆近似造成的连线歪斜。
 */
import type { CenterId } from '../../types/hd'
import { GATE_CENTER, CHANNELS } from '../../engine/gateData'

export const VIEW_W = 720
export const VIEW_H = 1034
/** 闸门半径：加大以保证数字可读（旧版 15 在高分屏上偏小） */
export const GATE_R = 14

export interface CenterShape {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  rx: number
  ry: number
  /** 中心名在图形内的锚点与字号微调 */
  labelDy?: number
}

/**
 * 九中心几何（正统人类图排布，卡通化比例）。
 * 间距约束：相邻中心的边界至少留 34px，保证直径 34 的闸门圆不重叠。
 */
export const CENTER_SHAPES: Record<CenterId, CenterShape> = {
  head: {
    id: 'head',
    polygon: [
      [360, 34],
      [286, 150],
      [434, 150],
    ],
    cx: 360,
    cy: 100,
    rx: 74,
    ry: 57,
  },
  ajna: {
    id: 'ajna',
    polygon: [
      [286, 190],
      [434, 190],
      [360, 294],
    ],
    cx: 360,
    cy: 230,
    rx: 74,
    ry: 52,
  },
  throat: {
    id: 'throat',
    polygon: [
      [290, 334],
      [430, 334],
      [430, 456],
      [290, 456],
    ],
    cx: 360,
    cy: 395,
    rx: 70,
    ry: 61,
  },
  g: {
    id: 'g',
    polygon: [
      [330, 496],
      [400, 564],
      [330, 632],
      [260, 564],
    ],
    cx: 330,
    cy: 564,
    rx: 70,
    ry: 68,
  },
  heart: {
    id: 'heart',
    polygon: [
      [434, 520],
      [518, 482],
      [518, 558],
    ],
    cx: 488,
    cy: 520,
    rx: 42,
    ry: 38,
  },
  spleen: {
    id: 'spleen',
    polygon: [
      [76, 628],
      [76, 772],
      [220, 700],
    ],
    cx: 138,
    cy: 700,
    rx: 72,
    ry: 72,
  },
  sacral: {
    id: 'sacral',
    polygon: [
      [264, 672],
      [396, 672],
      [396, 808],
      [264, 808],
    ],
    cx: 330,
    cy: 740,
    rx: 66,
    ry: 68,
  },
  solar: {
    id: 'solar',
    polygon: [
      [584, 628],
      [584, 772],
      [440, 700],
    ],
    cx: 522,
    cy: 700,
    rx: 72,
    ry: 72,
  },
  root: {
    id: 'root',
    polygon: [
      [264, 850],
      [396, 850],
      [396, 974],
      [264, 974],
    ],
    cx: 330,
    cy: 912,
    rx: 66,
    ry: 62,
  },
}

export interface GatePoint {
  gate: number
  center: CenterId
  x: number
  y: number
  /** 边界处的方位角（弧度，0=右，π/2=下） */
  angle: number
  /** 沿中心边界的周长参数（0..perimeter） */
  len: number
}

/** 边界采样点 */
interface BoundarySample {
  x: number
  y: number
  len: number
  /** 相对形心的方位角，范围 (-π, π] */
  angle: number
}

const TAU = Math.PI * 2

function polygonPerimeter(poly: Array<[number, number]>): number {
  let total = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

/** 按 1px 步长沿边界采样 */
function sampleBoundary(shape: CenterShape): BoundarySample[] {
  const poly = shape.polygon
  const samples: BoundarySample[] = []
  let acc = 0

  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (edgeLen < 1e-6) continue
    const steps = Math.max(1, Math.round(edgeLen))
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      const x = a[0] + (b[0] - a[0]) * t
      const y = a[1] + (b[1] - a[1]) * t
      samples.push({
        x,
        y,
        len: acc + edgeLen * t,
        angle: Math.atan2(y - shape.cy, x - shape.cx),
      })
    }
  }
  return samples
}

/** 边界周长参数 → 具体坐标 */
function pointAtLength(shape: CenterShape, samples: BoundarySample[], len: number) {
  const perimeter = polygonPerimeter(shape.polygon)
  let target = ((len % perimeter) + perimeter) % perimeter

  // 采样按 len 单调递增，直接二分
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].len < target) lo = mid + 1
    else hi = mid
  }
  const point = samples[lo]
  // 在相邻采样点间线性插值，避免 1px 台阶
  const prev = samples[lo === 0 ? samples.length - 1 : lo - 1]
  const segLen = point.len - prev.len
  if (segLen > 1e-6) {
    const t = (target - prev.len) / segLen
    if (t > 0 && t < 1) {
      return {
        x: prev.x + (point.x - prev.x) * t,
        y: prev.y + (point.y - prev.y) * t,
      }
    }
  }
  return { x: point.x, y: point.y }
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

function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= TAU
  while (d < -Math.PI) d += TAU
  return Math.abs(d)
}

/**
 * 环形最小间距分配。
 *
 * 旧实现用"互相推挤"的方式做环形松弛：当多个闸门的目标方位完全相同时，
 * 相邻间隔为 0 会让推力反复过冲，最终把一批点挤到同一个坐标上。
 *
 * 这里改成构造性解法：
 *   1. 在边界上找到最大空隙处切断，把环形问题展开成一维单调序列；
 *   2. 用双向 clamp（前向抬升 / 后向压低）求"最小位移"的合法解 ——
 *      clamp 单调收敛，不会震荡；
 *   3. 取模写回原来的顺序。
 */
function relaxAlong(lenValues: number[], perimeter: number, minGap: number): number[] {
  const n = lenValues.length
  if (n < 2) return lenValues.slice()

  const norm = (v: number) => ((v % perimeter) + perimeter) % perimeter
  const order = lenValues.map((v, i) => ({ v: norm(v), i })).sort((a, b) => a.v - b.v)

  // 1) 断开最大空隙
  let breakAt = 0
  let maxGap = -Infinity
  for (let k = 0; k < n; k += 1) {
    const next = (k + 1) % n
    const gap = next === 0 ? order[0].v + perimeter - order[k].v : order[next].v - order[k].v
    if (gap > maxGap) {
      maxGap = gap
      breakAt = next
    }
  }

  // 2) 展开为单调递增序列（同时保留未约束前的原始值，用于回中对齐）
  const seq: number[] = []
  for (let k = 0; k < n; k += 1) {
    const item = order[(breakAt + k) % n]
    let v = item.v
    const prev = seq.length ? seq[seq.length - 1] : -Infinity
    // 只处理环形回绕（值变小），相同初值保持相同，交给后面的 clamp 展开
    if (v < prev) v += perimeter
    seq.push(v)
  }

  // 3) 双向 clamp（最小位移解）
  for (let pass = 0; pass < 16; pass += 1) {
    let changed = false
    for (let k = 1; k < n; k += 1) {
      const need = seq[k - 1] + minGap
      if (seq[k] < need) {
        seq[k] = need
        changed = true
      }
    }
    for (let k = n - 2; k >= 0; k -= 1) {
      const need = seq[k + 1] - minGap
      if (seq[k] > need) {
        seq[k] = need
        changed = true
      }
    }
    if (!changed) break
  }


  // 4) 按原顺序写回
  const out = new Array<number>(n)
  for (let k = 0; k < n; k += 1) {
    out[order[(breakAt + k) % n].i] = norm(seq[k])
  }
  return out
}

function buildGatePoints(): Record<number, GatePoint> {
  const byCenter = centerGates()
  const result: Record<number, GatePoint> = {}

  for (const [centerId, gates] of Object.entries(byCenter) as Array<[CenterId, number[]]>) {
    const shape = CENTER_SHAPES[centerId]
    const samples = sampleBoundary(shape)
    const perimeter = polygonPerimeter(shape.polygon)

    // 每个闸门的目标方位：它连出去的伙伴中心的平均方向
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

    // 初始位置：边界上最接近目标方位的采样点
    const initial = targets.map((target) => {
      let best = samples[0]
      let bestDiff = Infinity
      for (const s of samples) {
        const d = angleDiff(s.angle, target)
        if (d < bestDiff) {
          bestDiff = d
          best = s
        }
      }
      return best.len
    })

    const minGap = GATE_R * 2 + 6
    const relaxed = relaxAlong(initial, perimeter, minGap)

    // 落位后做一次笛卡尔松弛：
    // 三角形尖部「弧长够但直线距离很近」，只靠弧长约束仍会视觉重叠，
    // 因此在坐标空间推开，再投影回边界。
    const placed = gates.map((gate, i) => {
      const pos = pointAtLength(shape, samples, relaxed[i])
      return { gate, x: pos.x, y: pos.y, len: relaxed[i] }
    })

    const minDist = GATE_R * 2 + 2
    for (let iter = 0; iter < 160; iter += 1) {
      let moved = false
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const a = placed[i]
          const b = placed[j]
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
          // 投影回边界（凸多边形：取角度最接近的采样点）
          for (const p of [a, b]) {
            const ang = Math.atan2(p.y - shape.cy, p.x - shape.cx)
            let best = samples[0]
            let bestDiff = Infinity
            for (const s of samples) {
              const d = angleDiff(s.angle, ang)
              if (d < bestDiff) {
                bestDiff = d
                best = s
              }
            }
            p.x = best.x
            p.y = best.y
            p.len = best.len
          }
          moved = true
        }
      }
      if (!moved) break
    }

    // 沿"中心 → 闸门"方向外移一点：圆点整体落在中心外侧，
    // 中心本体保持干净，通道端点也更贴近边缘。
    const OUT = 3
    for (const p of placed) {
      const ang = Math.atan2(p.y - shape.cy, p.x - shape.cx)
      result[p.gate] = {
        gate: p.gate,
        center: centerId,
        x: p.x + Math.cos(ang) * OUT,
        y: p.y + Math.sin(ang) * OUT,
        angle: ang,
        len: p.len,
      }
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
