/**
 * #4 自定义页面布局：纯函数回归（预设排布、网格吸附、隐藏模块、边界夹取）。
 * 不触碰 Pinia store / localStorage，只测可判定的算法部分。
 */
import { describe, expect, it } from 'vitest'
import {
  GRID_PX,
  LAYOUT_MODULE_KEYS,
  clampNumber,
  makePresetBoxes,
  snapPercent,
  snapPx,
  totalHeight,
} from '../src/stores/pageLayout'

describe('自定义页面布局（#4）', () => {
  it('7 个模块 key 固定，三种预设都给全', () => {
    expect(LAYOUT_MODULE_KEYS).toHaveLength(7)
    for (const preset of ['single', 'double', 'triple'] as const) {
      const boxes = makePresetBoxes(preset)
      expect(Object.keys(boxes).sort()).toEqual([...LAYOUT_MODULE_KEYS].sort())
      for (const key of LAYOUT_MODULE_KEYS) {
        expect(boxes[key].w).toBeGreaterThan(0)
        expect(boxes[key].h).toBeGreaterThan(0)
        expect(boxes[key].visible).toBe(true)
        expect(boxes[key].locked).toBe(false)
      }
    }
  })

  it('默认「单列」预设保持单列流：x=0、w=100 且纵向不重叠', () => {
    const boxes = makePresetBoxes('single')
    let bottom = 0
    for (const key of LAYOUT_MODULE_KEYS) {
      expect(boxes[key].x).toBe(0)
      expect(boxes[key].w).toBe(100)
      expect(boxes[key].y).toBeGreaterThanOrEqual(bottom)
      bottom = boxes[key].y + boxes[key].h
    }
  })

  it('双列 / 三列的 x 分布在不同列且不越出 100%', () => {
    for (const [preset, cols] of [['double', 2], ['triple', 3]] as const) {
      const boxes = makePresetBoxes(preset)
      const xs = new Set(LAYOUT_MODULE_KEYS.map((k) => Math.round(boxes[k].x)))
      expect(xs.size).toBe(cols)
      for (const key of LAYOUT_MODULE_KEYS) {
        expect(boxes[key].x).toBeGreaterThanOrEqual(0)
        expect(boxes[key].x + boxes[key].w).toBeLessThanOrEqual(100.001)
      }
    }
  })

  it('8px 网格吸附与百分比折算', () => {
    expect(snapPx(0)).toBe(0)
    expect(snapPx(11)).toBe(GRID_PX)
    expect(snapPx(13)).toBe(2 * GRID_PX)
    expect(snapPercent(50, 800)).toBe(50)
    expect(snapPercent(1, 800)).toBe(1)
    expect(clampNumber(99, 0, 1.6)).toBe(1.6)
    expect(clampNumber(Number.NaN, 0.6, 1.6)).toBe(0.6)
  })

  it('画布总高忽略隐藏模块', () => {
    const boxes = makePresetBoxes('single')
    const full = totalHeight(boxes)
    boxes.detail.visible = false
    expect(totalHeight(boxes)).toBeLessThan(full)
  })
})
