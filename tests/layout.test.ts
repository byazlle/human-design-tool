/**
 * 人体图几何校验：闸门锚点不能重叠、不能超出画布。
 * 这是纯数值检查，替代「肉眼看图」的回归手段。
 */
import { describe, expect, it } from 'vitest'
import {
  GATE_POINTS,
  GATE_R,
  VIEW_H,
  VIEW_W,
  CENTER_SHAPES,
  CHANNEL_LINES,
} from '../src/components/chart/bodyGraphLayout'
import { CHANNELS, GATE_CENTER } from '../src/engine/gateData'

describe('人体图几何', () => {
  it('64 个闸门都有锚点，且归属中心正确', () => {
    expect(Object.keys(GATE_POINTS)).toHaveLength(64)
    for (let g = 1; g <= 64; g += 1) {
      expect(GATE_POINTS[g]).toBeTruthy()
      expect(GATE_POINTS[g].center).toBe(GATE_CENTER[g])
    }
  })

  it('闸门不超出画布', () => {
    for (const p of Object.values(GATE_POINTS)) {
      expect(p.x).toBeGreaterThan(GATE_R)
      expect(p.x).toBeLessThan(VIEW_W - GATE_R)
      expect(p.y).toBeGreaterThan(GATE_R)
      expect(p.y).toBeLessThan(VIEW_H - GATE_R)
    }
  })

  it('任意两个闸门圆不重叠（中心距 ≥ 2R - 2）', () => {
    const points = Object.values(GATE_POINTS)
    const minAllowed = GATE_R * 2 - 2
    const violations: string[] = []
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]
        const b = points[j]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (dist < minAllowed) {
          violations.push(`${a.gate}(${a.center}) ↔ ${b.gate}(${b.center}) = ${dist.toFixed(1)}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('每个中心都有形状，通道两端都落在其所属中心的锚点上', () => {
    expect(Object.keys(CENTER_SHAPES)).toHaveLength(9)
    for (const ch of CHANNELS) {
      const a = GATE_POINTS[ch.gates[0]]
      const b = GATE_POINTS[ch.gates[1]]
      expect(a.center).toBe(ch.centers[0])
      expect(b.center).toBe(ch.centers[1])
    }
  })

  it('每个闸门都必须落在所属中心内部（绘制正确性回归）', () => {
    const inside = (poly: Array<[number, number]>, x: number, y: number) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]
        const [xj, yj] = poly[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }
    const bad: string[] = []
    for (const p of Object.values(GATE_POINTS)) {
      const poly = CENTER_SHAPES[p.center].polygon
      if (!inside(poly, p.x, p.y)) bad.push(`${p.gate}(${p.center})`)
    }
    expect(bad).toEqual([])
  })

  it('通道裁剪后长度足够（不出现被中心吞掉的线）', () => {
    const short = CHANNEL_LINES.filter(
      (l) => !l.internal && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 6,
    ).map((l) => l.key)
    expect(short).toEqual([])
  })
})
