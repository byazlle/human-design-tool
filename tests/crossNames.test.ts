/**
 * 回路 / 交叉主题名回归（v3.3.0）。
 *
 * 守的是「名字不能瞎编」：192 个交叉里，右角度 16 个主题 ×4 轴、左角度 32×2、并列 64×1；
 * 去重后英文主题 111 个（社区常说 112，差异来自编号变体计法）。
 * 每个主题都必须有中文译名，任何一个漏译都会让界面掉回英文。
 */
import { describe, expect, it } from 'vitest'
import {
  CROSS_AXIS_THEMES,
  CROSS_NAME_NOTE,
  angleKeyOf,
  crossEnglishFullName,
  crossThemeOf,
  crossThemeStats,
} from '../src/services/crossNames'

describe('交叉主题表', () => {
  it('64 条人格太阳/地球轴', () => {
    expect(Object.keys(CROSS_AXIS_THEMES)).toHaveLength(64)
    expect(crossThemeStats().axes).toBe(64)
  })

  it('★ 主题计数：右 16 / 左 32 / 并列 64，去重 111', () => {
    const s = crossThemeStats()
    expect(s.right).toBe(16)
    expect(s.left).toBe(32)
    expect(s.juxtaposition).toBe(64)
    expect(s.themes).toBe(111)
    expect(s.unnamed).toEqual([])
  })

  it('每条轴三个角度都有名字，且不重复到同一条轴上', () => {
    for (const [axis, row] of Object.entries(CROSS_AXIS_THEMES)) {
      expect(row.right.length, axis).toBeGreaterThan(1)
      expect(row.left.length, axis).toBeGreaterThan(1)
      expect(row.juxtaposition.length, axis).toBeGreaterThan(1)
    }
  })

  it('抽查公开对照表里的已知交叉', () => {
    expect(crossThemeOf(17, 18, 'right')?.en).toBe('Service')
    expect(crossThemeOf(17, 18, 'right')?.zh).toBe('服务')
    expect(crossThemeOf(16, 9, 'right')?.en).toBe('Planning')
    expect(crossThemeOf(1, 2, 'right')?.en).toBe('The Sphinx')
    expect(crossThemeOf(1, 2, 'juxtaposition')?.en).toBe('Self-expression')
    expect(crossThemeOf(1, 2, 'left')?.en).toBe('Defiance')
    expect(crossThemeOf(52, 58, 'left')?.en).toBe('Demands')
    expect(crossThemeOf(55, 59, 'right')?.en).toBe('The Sleeping Phoenix')
  })

  it('中文标签格式为「角度交叉之XX」+ 英文全称', () => {
    const t = crossThemeOf(17, 18, 'right')!
    expect(t.label).toBe('右角度交叉之服务')
    expect(crossEnglishFullName(t)).toBe('Right Angle Cross of Service')
    expect(crossThemeOf(4, 49, 'left')!.label).toBe('左角度交叉之革命')
    expect(crossThemeOf(4, 49, 'juxtaposition')!.label).toBe('并列交叉之公式化')
  })

  it('轴不在表内返回 null，不臆造名字', () => {
    expect(crossThemeOf(1, 3, 'right')).toBeNull()
    expect(crossThemeOf(99, 100, 'left')).toBeNull()
  })

  it('口径说明写清三种角度与「中文是工作译名」', () => {
    expect(CROSS_NAME_NOTE).toContain('112')
    expect(CROSS_NAME_NOTE).toContain('工作译名')
    expect(CROSS_NAME_NOTE).toContain('右角度')
    expect(CROSS_NAME_NOTE).toContain('并列')
  })
})

describe('角度判定', () => {
  it('4/1 是并列，5/1–6/3 是左角度，其余是右角度', () => {
    expect(angleKeyOf('4/1')).toBe('juxtaposition')
    for (const p of ['5/1', '5/2', '6/2', '6/3']) expect(angleKeyOf(p)).toBe('left')
    for (const p of ['1/3', '1/4', '2/4', '2/5', '3/5', '3/6', '4/6']) {
      expect(angleKeyOf(p)).toBe('right')
    }
  })
})
