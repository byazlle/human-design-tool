/**
 * 绘图程序 · 版本二
 *
 * 【衍生作品署名】本文件（中心坐标、形状、渐变、闸门偏移等布局数据）部分衍生于
 *   adamblvck/free-human-design —— https://github.com/adamblvck/free-human-design
 * 其站点绘图数据（site/charts.min.js）以 MIT 许可发布，版权归 adamblvck 所有。
 * 本项目在原始布局基础上做了本地校准（闸门偏移内收、字号/圆点/管宽调整、viewBox 由包围盒自动计算）。
 *
 * 依据其站点绘图数据：
 *   - 画布基准 800（百分比坐标换算）
 *   - 九中心位置/尺寸/形状（圆角三角、方形、八角星、心形三角）
 *   - 各中心专属渐变配色
 *   - 64 闸门在中心内的相对偏移（dx, dy × size）
 *
 * 规则与版本一保持一致（设计侧蓝底白字 / 个性侧无圈黑字 / 通道红黑白条纹虚线规则）。
 *
 * 原始 MIT 许可见仓库根目录 LICENSE 与 THIRD-PARTY.md。
 */
import type { CenterId } from '../../types/hd'
import { CHANNELS, GATE_CENTER } from '../../engine/gateData'

const BASE = 800
const pct = (v: number) => (v / 100) * BASE

export const VIEW_W_V2 = 800
export const VIEW_H_V2 = 800
export const GATE_R_V2 = 11
export const GATE_FONT_V2 = 14
export const TUBE_W_V2 = 12
export const CH_W_V2 = 10

export interface CenterShapeV2 {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  /** 有定义时的渐变 stops（取自参考实现） */
  gradient: Array<[number, string]>
  border: string
}

/** 参考实现的中心定义（x/y/size 为 800 基准的百分比） */
const CENTER_DEFS: Array<{
  key: CenterId
  x: number
  y: number
  size: number
  shape: 'triangle-up' | 'triangle-down' | 'square' | 'octagram' | 'triangle-right' | 'triangle-left'
  border: string
  gradient: Array<[number, string]>
}> = [
  {
    key: 'head',
    x: 50,
    y: 2,
    size: 6.5,
    shape: 'triangle-up',
    border: '#A586E2',
    gradient: [
      [0, '#E7D5F8'],
      [100, '#A586E2'],
    ],
  },
  {
    key: 'ajna',
    x: 50,
    y: 19,
    size: 6.5,
    shape: 'triangle-down',
    border: '#2F4CBF',
    gradient: [
      [0, '#6949D8'],
      [100, '#311B7C'],
    ],
  },
  {
    key: 'throat',
    x: 50,
    y: 33,
    size: 6,
    shape: 'square',
    border: '#1E4CC0',
    gradient: [
      [0, '#2D68FF'],
      [100, '#0A2A8A'],
    ],
  },
  {
    key: 'g',
    x: 50,
    y: 51,
    size: 8,
    shape: 'octagram',
    border: '#B9F6B8',
    gradient: [
      [0, '#ABDC80'],
      [40, '#56C09A'],
      [100, '#439A6E'],
    ],
  },
  {
    key: 'heart',
    x: 62,
    y: 57,
    size: 5,
    shape: 'triangle-up',
    border: '#E86186',
    gradient: [
      [0, '#E44E71'],
      [100, '#F79AC0'],
    ],
  },
  {
    key: 'spleen',
    x: 30,
    y: 72,
    size: 8.2,
    shape: 'triangle-right',
    border: '#E9C46A',
    gradient: [
      [0, '#F9E79F'],
      [100, '#F4D03F'],
    ],
  },
  {
    key: 'solar',
    x: 70,
    y: 72,
    size: 8.2,
    shape: 'triangle-left',
    border: '#D87B36',
    gradient: [
      [0, '#FF8800'],
      [100, '#FF0000'],
    ],
  },
  {
    key: 'sacral',
    x: 50,
    y: 72,
    size: 6,
    shape: 'square',
    border: '#E67E22',
    gradient: [
      [0, '#F39C12'],
      [100, '#D35400'],
    ],
  },
  {
    key: 'root',
    x: 50,
    y: 89,
    size: 6,
    shape: 'square',
    border: '#C13A2E',
    gradient: [
      [0, '#E74C3C'],
      [100, '#922B21'],
    ],
  },
]

function shapePolygon(
  cx: number,
  cy: number,
  s: number,
  shape: (typeof CENTER_DEFS)[number]['shape'],
): Array<[number, number]> {
  const hy = s * 0.92
  switch (shape) {
    case 'triangle-up':
      return [
        [cx, cy - hy],
        [cx - s, cy + hy],
        [cx + s, cy + hy],
      ]
    case 'triangle-down':
      return [
        [cx - s, cy - hy],
        [cx + s, cy - hy],
        [cx, cy + hy],
      ]
    case 'square':
      return [
        [cx - s, cy - hy],
        [cx + s, cy - hy],
        [cx + s, cy + hy],
        [cx - s, cy + hy],
      ]
    case 'triangle-right':
      return [
        [cx - s, cy - hy],
        [cx - s, cy + hy],
        [cx + s, cy],
      ]
    case 'triangle-left':
      return [
        [cx + s, cy - hy],
        [cx + s, cy + hy],
        [cx - s, cy],
      ]
    case 'octagram': {
      const pts: Array<[number, number]> = []
      for (let i = 0; i < 16; i += 1) {
        const ang = (Math.PI / 8) * i - Math.PI / 2
        const r = i % 2 === 0 ? s * 1.12 : s * 0.7
        pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r])
      }
      return pts
    }
    default:
      return []
  }
}

export const CENTER_SHAPES_V2: Record<CenterId, CenterShapeV2> = (() => {
  const out = {} as Record<CenterId, CenterShapeV2>
  for (const d of CENTER_DEFS) {
    const cx = pct(d.x)
    const cy = pct(d.y)
    const s = pct(d.size)
    out[d.key] = {
      id: d.key,
      polygon: shapePolygon(cx, cy, s, d.shape),
      cx,
      cy,
      gradient: d.gradient,
      border: d.border,
    }
  }
  return out
})()

/** 参考实现的闸门相对偏移（dx, dy 为 size 的倍数） */
const GATE_OFFSETS: Record<CenterId, Array<[number, number, number]>> = {
  head: [
    [64, -0.468, 0.663],
    [61, 0.0, 0.663],
    [63, 0.468, 0.663],
  ],
  ajna: [
    [47, -0.468, -0.663],
    [24, 0.0, -0.663],
    [4, 0.468, -0.663],
    [17, -0.273, -0.273],
    [11, 0.273, -0.273],
    [43, 0.0, 0.117],
  ],
  throat: [
    [62, -0.39, -0.663],
    [23, 0.0, -0.663],
    [56, 0.39, -0.663],
    [16, -0.624, -0.195],
    [35, 0.624, -0.351],
    [20, -0.624, 0.39],
    [12, 0.624, 0.0],
    [45, 0.624, 0.351],
    [31, -0.39, 0.663],
    [8, 0.0, 0.663],
    [33, 0.39, 0.663],
  ],
  g: [
    [1, 0.0, -0.624],
    [7, -0.429, -0.429],
    [13, 0.429, -0.429],
    [10, -0.585, 0.0],
    [25, 0.585, 0.0],
    [15, -0.429, 0.429],
    [46, 0.429, 0.429],
    [2, 0.0, 0.624],
  ],
  heart: [
    [21, 0.0, -0.117],
    [51, -0.218, 0.218],
    [26, -0.468, 0.585],
    [40, 0.468, 0.624],
  ],
  spleen: [
    [48, -0.663, -0.585],
    [57, -0.39, -0.39],
    [44, -0.078, -0.195],
    [50, 0.195, 0.0],
    [32, -0.078, 0.195],
    [28, -0.39, 0.39],
    [18, -0.663, 0.585],
  ],
  solar: [
    [36, 0.663, -0.585],
    [22, 0.39, -0.39],
    [37, 0.078, -0.195],
    [6, -0.195, 0.0],
    [49, 0.078, 0.195],
    [55, 0.39, 0.39],
    [30, 0.663, 0.585],
  ],
  sacral: [
    [5, -0.39, -0.624],
    [14, 0.0, -0.624],
    [29, 0.39, -0.624],
    [34, -0.624, -0.234],
    [27, -0.624, 0.234],
    [59, 0.624, 0.234],
    [42, -0.39, 0.624],
    [3, 0.0, 0.624],
    [9, 0.39, 0.624],
  ],
  root: [
    [53, -0.39, -0.624],
    [60, 0.0, -0.624],
    [52, 0.39, -0.624],
    [54, -0.624, -0.234],
    [38, -0.624, 0.156],
    [58, -0.624, 0.546],
    [19, 0.624, -0.234],
    [39, 0.624, 0.156],
    [41, 0.624, 0.546],
  ],}

export interface GatePointV2 {
  gate: number
  center: CenterId
  x: number
  y: number
  angle: number
  len: number
}

export const GATE_POINTS_V2: Record<number, GatePointV2> = (() => {
  const out: Record<number, GatePointV2> = {}
  for (const d of CENTER_DEFS) {
    const cx = pct(d.x)
    const cy = pct(d.y)
    const s = pct(d.size)
    for (const [gate, dx, dy] of GATE_OFFSETS[d.key]) {
      const x = cx + dx * s
      const y = cy + dy * s
      const angle = Math.atan2(y - cy, x - cx)
      out[gate] = { gate, center: d.key, x, y, angle, len: angle }
    }
  }
  // 兜底：确保 64 个闸门齐全且归属一致
  for (let g = 1; g <= 64; g += 1) {
    if (!out[g]) {
      const center = GATE_CENTER[g]
      const shape = CENTER_SHAPES_V2[center]
      out[g] = { gate: g, center, x: shape.cx, y: shape.cy, angle: 0, len: 0 }
    }
  }
  return out
})()

/* ── 通道：按中心边界裁剪（与版本一同一算法） ─────────── */

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

function clip(
  from: [number, number],
  to: [number, number],
  poly: Array<[number, number]>,
): [number, number] {
  const t = firstExitT(from[0], from[1], to[0], to[1], poly)
  if (t === null) return from
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

export interface ChannelLineV2 {
  key: string
  gates: [number, number]
  centers: [CenterId, CenterId]
  x1: number
  y1: number
  x2: number
  y2: number
  internal: boolean
}

export const CHANNEL_LINES_V2: ChannelLineV2[] = CHANNELS.map((c) => {
  const [g0, g1] = c.gates
  const a = GATE_POINTS_V2[g0]
  const b = GATE_POINTS_V2[g1]
  const internal = a.center === b.center
  if (internal) {
    return { key: c.key, gates: [g0, g1], centers: c.centers, x1: a.x, y1: a.y, x2: b.x, y2: b.y, internal: true }
  }
  const p0 = clip([a.x, a.y], [b.x, b.y], CENTER_SHAPES_V2[a.center].polygon)
  const p1 = clip([b.x, b.y], [a.x, a.y], CENTER_SHAPES_V2[b.center].polygon)
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

export const VIEW_BOX_V2 = (() => {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of Object.values(GATE_POINTS_V2)) {
    minX = Math.min(minX, p.x - GATE_R_V2)
    maxX = Math.max(maxX, p.x + GATE_R_V2)
    minY = Math.min(minY, p.y - GATE_R_V2)
    maxY = Math.max(maxY, p.y + GATE_R_V2)
  }
  for (const s of Object.values(CENTER_SHAPES_V2)) {
    for (const [x, y] of s.polygon) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  const pad = 18
  const x = Math.floor(minX - pad)
  const y = Math.floor(minY - pad)
  const w = Math.ceil(maxX - minX + pad * 2)
  const h = Math.ceil(maxY - minY + pad * 2)
  return { x, y, w, h, str: `${x} ${y} ${w} ${h}` }
})()

/** 多边形 points 字符串 */
export function polygonPointsV2(id: CenterId): string {
  return CENTER_SHAPES_V2[id].polygon.map(([x, y]) => `${x},${y}`).join(' ')
}
