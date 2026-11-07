/**
 * #7 档案卡片排布回归：新增盘不得与第一个盘重叠。
 * 纯算法见 src/components/archive/canvasLayout.ts。
 */
import { describe, expect, it } from 'vitest'
import {
  CARD_H,
  CARD_W,
  GAP_X,
  GAP_Y,
  ensureCanvasLayout,
  type CanvasPoint,
} from '../src/components/archive/canvasLayout'

const overlaps = (a: CanvasPoint, b: CanvasPoint) =>
  Math.abs(a.x - b.x) < CARD_W + GAP_X / 2 && Math.abs(a.y - b.y) < CARD_H + GAP_Y / 2

describe('档案画布排布（#7 回归）', () => {
  it('空画布：3 份档案落在第一行的前三个互不重叠的格位', () => {
    const r = ensureCanvasLayout({}, ['a', 'b', 'c'])
    expect(r.a).toEqual({ x: 24, y: 24 })
    expect(r.b.x).toBeGreaterThan(r.a.x)
    expect(overlaps(r.a, r.b)).toBe(false)
    expect(overlaps(r.b, r.c)).toBe(false)
  })

  it('核心回归：已有卡片被拖到 (24,24)，新增档案插到数组第一位也不重叠', () => {
    const saved = { old: { x: 24, y: 24 } }
    const r = ensureCanvasLayout(saved, ['new', 'old'])
    expect(r.old).toEqual(saved.old) // 已有坐标不动
    expect(overlaps(r.new, r.old)).toBe(false) // 旧实现在这里会重叠
    expect(r.new.x).toBeGreaterThan(r.old.x)
  })

  it('已有坐标占据某个格位时，新卡片跳过它', () => {
    const saved = { p: { x: 24 + CARD_W + GAP_X, y: 24 } } // 占住 slot(1)
    const r = ensureCanvasLayout(saved, ['p', 'q'])
    expect(overlaps(r.q, r.p)).toBe(false)
    expect(r.q).toEqual({ x: 24, y: 24 })
  })

  it('第 5 份档案自动换到第二行且不与第一行相交', () => {
    const r = ensureCanvasLayout({}, ['a', 'b', 'c', 'd', 'e'])
    expect(r.e.y).toBeGreaterThan(r.a.y)
    for (const id of ['a', 'b', 'c', 'd']) expect(overlaps(r.e, r[id])).toBe(false)
  })

  it('已删除档案的坐标被清理，且不丢仍在册的坐标', () => {
    const saved = { gone: { x: 900, y: 900 }, keep: { x: 24, y: 24 } }
    const r = ensureCanvasLayout(saved, ['keep', 'fresh'])
    expect(r.gone).toBeUndefined()
    expect(r.keep).toEqual(saved.keep)
    expect(overlaps(r.fresh, r.keep)).toBe(false)
  })

  it('不修改入参（返回新表，组件可安全同步到 reactive 对象）', () => {
    const saved = { a: { x: 24, y: 24 } }
    const r = ensureCanvasLayout(saved, ['a', 'b'])
    expect(saved).toEqual({ a: { x: 24, y: 24 } })
    expect(r).not.toBe(saved)
    expect(r.a).not.toBe(saved.a)
  })
})
