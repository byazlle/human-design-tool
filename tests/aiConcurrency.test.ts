/**
 * 最高并发数（单旋钮）回归（ARCH v4.0.0 §5.1–§5.4）。
 *
 * v3.5.0 的「设定并发数 + 并发上限」双旋钮已合并为一个 `aiMaxConcurrency`（1–99）。
 * 这里钉三组口径：
 * 1. 常量与两种归一（加载期宽松 / 保存期严格，两套语义**不得**混用）；
 * 2. 存档迁移的 4 条优先级，尤其「**绝不**用 `aiConcurrencyLimit` 当迁移源」；
 * 3. 边界值（0 / 100 / 小数 / 字符串 / NaN / 空串）。
 *
 * 纯逻辑测试：不加载 store、不 mock 网络，编排类断言分别在
 * `aiFullReading.test.ts` / `aiBatchReading.test.ts` / `aiScheduler.test.ts` 里。
 */
import { describe, expect, it } from 'vitest'
import {
  AI_MAX_CONCURRENCY_MAX,
  AI_MAX_CONCURRENCY_MIN,
  DEFAULT_AI_MAX_CONCURRENCY,
  clampMaxConcurrency,
  normalizeMaxConcurrency,
  validateMaxConcurrency,
} from '../src/services/aiConcurrency'

describe('常量', () => {
  it('区间 1–99、默认 3；上限从旧的 128 收敛到 99', () => {
    expect(AI_MAX_CONCURRENCY_MIN).toBe(1)
    expect(AI_MAX_CONCURRENCY_MAX).toBe(99)
    expect(DEFAULT_AI_MAX_CONCURRENCY).toBe(3)
    // 上限收敛的理由：N=99 起速本身就要 98 秒，再大只是把误设的爆炸半径做大
    expect(AI_MAX_CONCURRENCY_MAX).toBeLessThan(128)
  })
})

describe('clampMaxConcurrency（加载期宽松归一）', () => {
  it('合法整数原样返回', () => {
    for (const v of [1, 2, 3, 50, 99]) expect(clampMaxConcurrency(v)).toBe(v)
  })

  it('非整数 / 越界 / 类型不符一律回落 fallback（默认 3）', () => {
    expect(clampMaxConcurrency(0)).toBe(3)
    expect(clampMaxConcurrency(-5)).toBe(3)
    expect(clampMaxConcurrency(100)).toBe(3)
    expect(clampMaxConcurrency(3.5)).toBe(3)
    expect(clampMaxConcurrency(3.9)).toBe(3)
    expect(clampMaxConcurrency(Number.NaN)).toBe(3)
    expect(clampMaxConcurrency(Number.POSITIVE_INFINITY)).toBe(3)
    expect(clampMaxConcurrency('abc')).toBe(3)
    expect(clampMaxConcurrency('8')).toBe(3)
    expect(clampMaxConcurrency(null)).toBe(3)
    expect(clampMaxConcurrency(undefined)).toBe(3)
    expect(clampMaxConcurrency({})).toBe(3)
  })

  it('边界端点 1 与 99 合法', () => {
    expect(clampMaxConcurrency(1)).toBe(1)
    expect(clampMaxConcurrency(99)).toBe(99)
    expect(validateMaxConcurrency(1)).toBeNull()
    expect(validateMaxConcurrency(99)).toBeNull()
  })

  it('fallback 自身也收敛到 1–99（坏的 fallback 不能把非法值带进调度器）', () => {
    expect(clampMaxConcurrency('x', 7)).toBe(7)
    expect(clampMaxConcurrency('x', 0)).toBe(3)
    expect(clampMaxConcurrency('x', 1000)).toBe(3)
    expect(clampMaxConcurrency('x', 2.5)).toBe(3)
    expect(clampMaxConcurrency(0, 99)).toBe(99)
  })
})

describe('validateMaxConcurrency（保存期严格）', () => {
  it('合法返回 null', () => {
    for (const v of [1, 3, 64, 99]) expect(validateMaxConcurrency(v)).toBeNull()
  })

  it('非法返回固定行内文案（调用方据此拒绝写入，原值不变）', () => {
    const msg = '最高并发数需为 1–99 的整数'
    for (const v of [0, 100, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateMaxConcurrency(v)).toBe(msg)
    }
  })
})

describe('normalizeMaxConcurrency（存档迁移，4 条优先级）', () => {
  it('① 新字段合法 → 直接采用，不报 adjusted', () => {
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 8 })).toMatchObject({
      value: 8,
      adjusted: false,
    })
  })

  it('② 新字段是数字但越界 / 小数 → 夹到 1–99 取整并置 adjusted（不丢弃用户意图）', () => {
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 200 })).toMatchObject({
      value: 99,
      adjusted: true,
    })
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 0 })).toMatchObject({
      value: 1,
      adjusted: true,
    })
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 6.4 })).toMatchObject({
      value: 6,
      adjusted: true,
    })
  })

  it('② 新字段类型不符（字符串 / 对象）→ 回落默认 3 且置 adjusted', () => {
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 'x' })).toMatchObject({
      value: 3,
      adjusted: true,
    })
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: {} })).toMatchObject({
      value: 3,
      adjusted: true,
    })
  })

  it('③ 新字段缺失 → 取旧 aiConcurrency；> 99 时夹紧并置 adjusted', () => {
    expect(normalizeMaxConcurrency({ aiConcurrency: 8, aiConcurrencyLimit: 64 })).toMatchObject({
      value: 8,
      adjusted: false,
    })
    expect(normalizeMaxConcurrency({ aiConcurrency: 128 })).toMatchObject({
      value: 99,
      adjusted: true,
    })
  })

  it('③ 旧字段非法 → 默认 3 且置 adjusted', () => {
    expect(normalizeMaxConcurrency({ aiConcurrency: 'many' })).toMatchObject({
      value: 3,
      adjusted: true,
    })
  })

  it('④ 两个字段都缺失 → 默认 3，不置 adjusted（缺失不是异常，不打扰用户）', () => {
    expect(normalizeMaxConcurrency({})).toMatchObject({ value: 3, adjusted: false })
  })

  it('★ aiConcurrencyLimit 绝不作为迁移来源，只记进 legacy 供提示文案', () => {
    const migration = normalizeMaxConcurrency({ aiConcurrencyLimit: 64 })
    expect(migration.value).toBe(3)
    expect(migration.adjusted).toBe(false)
    expect(migration.legacy).toEqual({ limit: 64 })
    // 即使 limit 是 8 也不能迁成 8——那会变成真实的 8 并发打向中转站
    expect(normalizeMaxConcurrency({ aiConcurrencyLimit: 8 }).value).toBe(3)
  })

  it('★ 新字段优先于旧字段', () => {
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: 50, aiConcurrency: 8 })).toMatchObject({
      value: 50,
      adjusted: false,
    })
  })

  it('legacy 快照记录被忽略的旧值（供「原并发上限不再单独生效」提示）', () => {
    expect(normalizeMaxConcurrency({ aiConcurrency: 8, aiConcurrencyLimit: 64 }).legacy).toEqual({
      concurrency: 8,
      limit: 64,
    })
  })

  it('空字符串视同缺失（旧 persist 可能写空串）', () => {
    expect(normalizeMaxConcurrency({ aiMaxConcurrency: '', aiConcurrency: '' })).toMatchObject({
      value: 3,
      adjusted: false,
    })
  })
})
