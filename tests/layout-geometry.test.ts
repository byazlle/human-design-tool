/**
 * 图形几何回归：意志力中心旋转与闸门布点、枢纽辐条去重、打坐剪影包围盒。
 *
 * 只校验几何约束（不涉及人类图计算规则）。
 */
import { describe, expect, it } from 'vitest'
import {
  CENTER_SHAPES,
  CHANNEL_LINES,
  GATE_FONT,
  GATE_POINTS,
  GATE_R,
  HEART_CX,
  HEART_CY,
  HEART_ROTATION_DEG,
  HEART_SHIFT_Y,
  HEART_TRIANGLE,
  SILHOUETTE_PATH,
  VIEW_H,
  VIEW_W,
  barycentricCoords,
  hangingEndRatio,
  minEdgeDistance,
  triangleEdgeDistances,
} from '../src/components/chart/bodyGraphLayout'

const heartTri = HEART_TRIANGLE
const HEART_GATES = [21, 51, 26, 40]

describe('意志力中心：顺时针旋转 55° + 整体下移 28px + 闸门三角内布点', () => {
  it('三角以自身中心旋转，边长/半径不变，顶点与预期一致', () => {
    const centroid: [number, number] = [HEART_CX, HEART_CY]
    const originals: Array<[number, number]> = [
      [768, 1084 + HEART_SHIFT_Y],
      [660, 1184 + HEART_SHIFT_Y],
      [884, 1184 + HEART_SHIFT_Y],
    ]
    expect(HEART_ROTATION_DEG).toBe(55)
    expect(HEART_SHIFT_Y).toBe(GATE_FONT)
    expect(HEART_CY).toBe(1149 + GATE_FONT)

    // 到中心距离保持不变（只转角度）
    const radii = heartTri.map(([x, y]) => Math.hypot(x - centroid[0], y - centroid[1]))
    const originalRadii = originals.map(([x, y]) =>
      Math.hypot(x - centroid[0], y - centroid[1]),
    )
    radii.forEach((r, i) => expect(r).toBeCloseTo(originalRadii[i], 6))

    // 三个顶点：先下移 28px、再顺时针 55° 后的坐标
    expect(heartTri[0][0]).toBeCloseTo(821.24, 2)
    expect(heartTri[0][1]).toBeCloseTo(1139.72, 2)
    expect(heartTri[1][0]).toBeCloseTo(677.38, 2)
    expect(heartTri[1][1]).toBeCloseTo(1108.61, 2)
    expect(heartTri[2][0]).toBeCloseTo(805.86, 2)
    expect(heartTri[2][1]).toBeCloseTo(1292.1, 2)

    // 相对上一版（顺时针 30°）的形心，整体下移约一个字符高度
    const cy = heartTri.reduce((sum, p) => sum + p[1], 0) / 3
    const prevCy = (1092.71 + 1125.31 + 1237.31) / 3
    expect(cy - prevCy).toBeCloseTo(HEART_SHIFT_Y, 0)
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

/** 用户口语称「43-23 通道」，代码里的通道 key 为 '23-43' */
describe('通道平行：17-62 / 11-56 与 43-23（key 23-43）', () => {
  const lineOf = (key: string) => {
    const l = CHANNEL_LINES.find((x) => x.key === key)
    expect(l, `channel ${key} missing`).toBeTruthy()
    return l!
  }

  it('三条通道同为竖直（dx ≈ 0），斜率一致', () => {
    for (const key of ['17-62', '11-56', '23-43']) {
      const l = lineOf(key)
      expect(Math.abs(l.x2 - l.x1), key).toBeLessThan(0.01)
      expect(Math.abs(l.y2 - l.y1), key).toBeGreaterThan(6)
    }
  })

  it('17/11 与对端闸门 62/56 同 x，43 与 23 同 x', () => {
    expect(GATE_POINTS[17].x).toBe(GATE_POINTS[62].x)
    expect(GATE_POINTS[11].x).toBe(GATE_POINTS[56].x)
    expect(GATE_POINTS[43].x).toBe(GATE_POINTS[23].x)
  })
})

describe('心中心四条通道：端点与对应闸门数字共线（无误连）', () => {
  it('21-45 / 26-44 / 37-40 / 25-51 的裁剪端点落在两闸门连线上', () => {
    for (const key of ['21-45', '26-44', '37-40', '25-51']) {
      const l = CHANNEL_LINES.find((x) => x.key === key)
      expect(l, key).toBeTruthy()
      const a = GATE_POINTS[l!.gates[0]]
      const b = GATE_POINTS[l!.gates[1]]
      const cross1 = (b.x - a.x) * (l!.y1 - a.y) - (b.y - a.y) * (l!.x1 - a.x)
      const cross2 = (b.x - a.x) * (l!.y2 - a.y) - (b.y - a.y) * (l!.x2 - a.x)
      expect(Math.abs(cross1), key).toBeLessThan(1)
      expect(Math.abs(cross2), key).toBeLessThan(1)
    }
  })
})

describe('悬挂闸门终点比例（「只连 1/4」回归）', () => {
  it('枢纽主干/辐条直达中点 M，普通通道到两端点中点', () => {
    const spine = CHANNEL_LINES.find((l) => l.key === '20-57')!
    const hub10 = CHANNEL_LINES.find((l) => l.hub && l.gates[0] === 10)!
    const normal = CHANNEL_LINES.find((l) => l.key === '23-43')!
    expect(spine.points).toHaveLength(3)
    expect(hub10.points).toHaveLength(2)
    expect(hangingEndRatio(spine)).toBe(1)
    expect(hangingEndRatio(hub10)).toBe(1)
    expect(hangingEndRatio(normal)).toBe(0.5)
    // 直达 M 后，悬挂段是整条支路的一半，不再二次折半成 1/4
    expect(Math.hypot(hub10.x2 - hub10.x1, hub10.y2 - hub10.y1)).toBeGreaterThan(6)
  })
})
