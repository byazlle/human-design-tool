/**
 * 图形几何回归：意志力中心旋转与闸门布点、枢纽辐条去重、打坐剪影包围盒。
 *
 * 只校验几何约束（不涉及人类图计算规则）。
 */
import { describe, expect, it } from 'vitest'
import {
  CENTER_SHAPES,
  CHANNEL_LINES,
  GATE_POINTS,
  GATE_R,
  HEART_ROTATION_DEG,
  HEART_TRIANGLE,
  SILHOUETTE_PATH,
  VIEW_H,
  VIEW_W,
  barycentricCoords,
  minEdgeDistance,
  triangleEdgeDistances,
} from '../src/components/chart/bodyGraphLayout'

const heartTri = HEART_TRIANGLE
const HEART_GATES = [21, 51, 26, 40]

describe('意志力中心：顺时针旋转 30° + 闸门三角内布点', () => {
  it('三角以自身中心旋转，边长/半径不变，顶点与预期一致', () => {
    const centroid: [number, number] = [768, 1149]
    const originals: Array<[number, number]> = [
      [768, 1084],
      [660, 1184],
      [884, 1184],
    ]
    expect(HEART_ROTATION_DEG).toBe(30)

    // 到中心距离保持不变（只转角度）
    const radii = heartTri.map(([x, y]) => Math.hypot(x - centroid[0], y - centroid[1]))
    const originalRadii = originals.map(([x, y]) =>
      Math.hypot(x - centroid[0], y - centroid[1]),
    )
    radii.forEach((r, i) => expect(r).toBeCloseTo(originalRadii[i], 6))

    // 三个顶点：顺时针 30° 后的坐标
    expect(heartTri[0][0]).toBeCloseTo(800.5, 2)
    expect(heartTri[0][1]).toBeCloseTo(1092.71, 2)
    expect(heartTri[1][0]).toBeCloseTo(656.97, 2)
    expect(heartTri[1][1]).toBeCloseTo(1125.31, 2)
    expect(heartTri[2][0]).toBeCloseTo(850.96, 2)
    expect(heartTri[2][1]).toBeCloseTo(1237.31, 2)
  })

  it('21/51/26/40 全部落在三角内部，且到三条边距离 > 26', () => {
    for (const gate of HEART_GATES) {
      const p = GATE_POINTS[gate]
      expect(p, `gate ${gate} missing`).toBeTruthy()
      const bc = barycentricCoords([p.x, p.y], heartTri)
      expect(bc).not.toBeNull()
      // 三个重心坐标都为正 = 严格在三角形内部
      for (const v of bc as [number, number, number]) expect(v).toBeGreaterThan(0)
      const dists = triangleEdgeDistances([p.x, p.y], heartTri)
      for (const d of dists) expect(d).toBeGreaterThan(26)
      expect(minEdgeDistance([p.x, p.y], heartTri)).toBeGreaterThan(26)
    }
  })

  it('四个闸门点两两间距 ≥ 2R − 2（与全局「圆不重叠」同口径）', () => {
    const pts = HEART_GATES.map((g) => [GATE_POINTS[g].x, GATE_POINTS[g].y])
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
        expect(d).toBeGreaterThanOrEqual(GATE_R * 2 - 2)
      }
    }
  })

  it('旋转后的四个闸门仍在画布内', () => {
    for (const gate of HEART_GATES) {
      const p = GATE_POINTS[gate]
      expect(p.x).toBeGreaterThan(GATE_R)
      expect(p.x).toBeLessThan(VIEW_W - GATE_R)
      expect(p.y).toBeGreaterThan(GATE_R)
      expect(p.y).toBeLessThan(VIEW_H - GATE_R)
    }
  })

  it('中心多边形与旋转后的三角一致（渲染用同一份几何）', () => {
    expect(CENTER_SHAPES.heart.polygon.map(([x, y]) => [x, y])).toEqual(
      heartTri.map(([x, y]) => [x, y]),
    )
  })
})

describe('20-57 枢纽：辐条去重', () => {
  const HUB_KEYS = ['10-20', '10-34', '10-57', '20-34', '34-57']

  it('5 条原始直连线不再出现', () => {
    for (const key of HUB_KEYS) {
      expect(CHANNEL_LINES.some((l) => l.key === key)).toBe(false)
    }
  })

  it('主干 20 → M → 57 只有一条，且三点共线', () => {
    const trunks = CHANNEL_LINES.filter((l) => l.key === '20-57')
    expect(trunks).toHaveLength(1)
    const pts = trunks[0].points ?? []
    expect(pts).toHaveLength(3)
    const [p0, M, p2] = pts
    // 叉积 ≈ 0 → 共线（M 在 20 与 57 的连线上）
    const cross = (M[0] - p0[0]) * (p2[1] - p0[1]) - (M[1] - p0[1]) * (p2[0] - p0[0])
    expect(Math.abs(cross)).toBeLessThan(1e-3)
  })

  it('10 与 34 各只有一条辐条连到 M，且闸门之间无直接连线', () => {
    const spokes10 = CHANNEL_LINES.filter((l) => l.hub && l.gates[0] === 10)
    const spokes34 = CHANNEL_LINES.filter((l) => l.hub && l.gates[0] === 34)
    expect(spokes10).toHaveLength(1)
    expect(spokes34).toHaveLength(1)

    // 枢纽辐条必须是两点折线（闸门 → M），且 spokeOf 覆盖涉及通道
    for (const l of [...spokes10, ...spokes34]) {
      expect(l.points).toHaveLength(2)
      expect(l.spokeOf?.length).toBeGreaterThan(0)
    }
    expect(spokes10[0].spokeOf).toEqual(['10-20', '10-34', '10-57'])
    expect(spokes34[0].spokeOf).toEqual(['10-34', '20-34', '34-57'])

    // 非辐条的线段里，只有共线主干可以两端都是枢纽闸门
    const hubGates = [10, 20, 34, 57]
    for (const l of CHANNEL_LINES) {
      if (l.hub) continue
      if (!hubGates.includes(l.gates[0]) || !hubGates.includes(l.gates[1])) continue
      expect(l.key).toBe('20-57')
    }
  })

  it('线段总数 = 原始 36 − 5 去重 + 2 支路', () => {
    expect(CHANNEL_LINES).toHaveLength(36 - 5 + 2)
  })
})

describe('背景剪影：盘腿打坐', () => {
  const numbers = (SILHOUETTE_PATH.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const xs = numbers.filter((_, i) => i % 2 === 0)
  const ys = numbers.filter((_, i) => i % 2 === 1)

  it('单条闭合路径，且坐标成对解析', () => {
    expect(SILHOUETTE_PATH.startsWith('M')).toBe(true)
    expect(SILHOUETTE_PATH.trim().endsWith('Z')).toBe(true)
    expect(numbers.length % 2).toBe(0)
    expect(numbers.length).toBeGreaterThan(20)
  })

  it('横向覆盖 60–1090、顶部 y < 320', () => {
    expect(Math.min(...xs)).toBeLessThanOrEqual(60)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(1090)
    expect(Math.min(...ys)).toBeLessThan(320)
  })

  it('左右对称（包围盒关于 x=576 镜像）', () => {
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(1152, 6)
  })
})
