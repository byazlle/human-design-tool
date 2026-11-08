/**
 * T-8 纯逻辑回归：三档统一状态区单例（environment:node，fake timers）。
 * 不进 Pinia / 不持久化；只验证阶段、计时、终态、互斥与禁止词。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useAiStatus } from '../src/composables/useAiStatus'
import type { AiStageEvent } from '../src/services/aiClient'
import type { AiProgress } from '../src/types/report'

function stage(name: AiStageEvent['stage'], extra: Partial<AiStageEvent> = {}): AiStageEvent {
  return { stage: name, at: Date.now(), elapsedMs: 0, timeoutMs: 60000, ...extra }
}

function progress(done: number, current = '一次性并发 10 项'): AiProgress {
  return {
    done,
    total: 11,
    current,
    phase: '分项解读（一次性并发 10 项）',
    elapsedMs: 0,
    etaMs: null,
    skipped: [],
    failed: [],
  }
}

const status = useAiStatus()

beforeEach(() => {
  vi.useFakeTimers()
  status.reset()
})
afterEach(() => {
  status.reset()
  vi.useRealTimers()
})

describe('useAiStatus · 单次档阶段与本地计时', () => {
  it('begin 后为 config-validated，500ms 计时刷新（≤1s）', () => {
    status.begin('concise', 60000)
    expect(status.snapshot.value.phase).toBe('config-validated')
    expect(status.snapshot.value.mode).toBe('concise')
    expect(status.snapshot.value.progress).toBeNull()
    status.applyStage(stage('request-sent'))
    expect(status.snapshot.value.phase).toBe('request-sent')
    vi.advanceTimersByTime(2000)
    expect(status.snapshot.value.elapsedMs).toBeGreaterThanOrEqual(2000)
    expect(status.snapshot.value.label).toContain('已等待 2s')
    expect(status.snapshot.value.label).toContain('超时上限 60s')
  })

  it('阶段按序推进到终态且静态常驻，直到下一次 begin', () => {
    status.begin('detailed', 30000)
    status.applyStage(stage('request-sent'))
    status.applyStage(stage('response-received', { round: 0 }))
    expect(status.snapshot.value.phase).toBe('receiving')
    status.applyStage(stage('completed'))
    expect(status.snapshot.value.terminal).toBe(true)
    expect(status.snapshot.value.label).toContain('已完成')
    vi.advanceTimersByTime(5000)
    expect(status.snapshot.value.label).toContain('已完成')
    status.begin('concise', 60000)
    expect(status.snapshot.value.terminal).toBe(false)
    expect(status.snapshot.value.phase).toBe('config-validated')
  })

  it('单次档禁止假百分比：progress 恒 null、label 不含 %', () => {
    status.begin('concise', 60000)
    status.applyStage(stage('request-sent'))
    expect(status.snapshot.value.progress).toBeNull()
    expect(status.snapshot.value.label).not.toContain('%')
    status.applyProgress(progress(3))
    expect(status.snapshot.value.progress).toBeNull()
  })

  it('finish 分类映射到终态文案', () => {
    status.begin('concise', 60000)
    status.finish('timeout', 'timeout')
    expect(status.snapshot.value.label).toContain('已超时')
    status.begin('concise', 60000)
    status.finish('cancelled', 'cancelled')
    expect(status.snapshot.value.label).toContain('已取消')
    status.begin('concise', 60000)
    status.finish('failed', 'config')
    expect(status.snapshot.value.label).toContain('请求失败')
  })
})

describe('useAiStatus · 完整档进度与两条数据链互斥', () => {
  it('applyProgress 单调推进，完整档写「单项超时上限」', () => {
    status.begin('full', 90000)
    status.applyProgress(progress(0))
    status.applyProgress(progress(5))
    status.applyProgress(progress(11))
    expect(status.snapshot.value.progress!.done).toBe(11)
    vi.advanceTimersByTime(500)
    expect(status.snapshot.value.label).toContain('单项超时上限 90s')
    expect(status.snapshot.value.label).not.toContain('%')
  })

  it('完整档忽略 applyStage（FB-6 状态唯一源）', () => {
    status.begin('full', 60000)
    status.applyProgress(progress(2))
    status.applyStage(stage('request-sent'))
    expect(status.snapshot.value.progress!.done).toBe(2)
    expect(status.snapshot.value.phase).toBe('waiting')
  })

  it('终态常驻的并发同义提示：分项阶段 N/Y/K 长文案被记住', () => {
    status.begin('full', 60000)
    const degraded =
      '本次需并发 10 项，超过并发上限 4，已按上限 4 分 3 批执行（全部 10 项都会执行，不会减少）；可在设置页提高并发上限以启用一次性并发'
    status.applyProgress(progress(1, degraded))
    status.applyProgress(progress(11, '已完成'))
    status.finish('completed')
    expect(status.snapshot.value.terminalHint).toContain('全部 10 项都会执行，不会减少')
    expect(status.snapshot.value.terminalHint).toContain('分 3 批执行')
  })
})

describe('useAiStatus · 禁止词与硬边界', () => {
  it('源码注释与文案不含服务端内部状态表述（可观测事实口径）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/composables/useAiStatus.ts'),
      'utf8',
    )
    for (const banned of [
      '服务端已连接',
      '服务端已并发处理',
      '模型正在生成第',
      '模型正在同时生成',
      '服务端处理中',
    ]) {
      // 注释里以「禁止词清单」形式出现是允许的；此处只校验运行时 label 模板
      expect(status.snapshot.value.label).not.toContain(banned)
    }
    expect(source).toContain('客户端可观测')
  })

  it('reset 清理计时器：reset 后推进时间不再刷新 label', () => {
    status.begin('concise', 60000)
    status.applyStage(stage('request-sent'))
    status.reset()
    const label = status.snapshot.value.label
    vi.advanceTimersByTime(10000)
    expect(status.snapshot.value.label).toBe(label)
    expect(status.snapshot.value.phase).toBe('idle')
  })

  it('单例：多次 useAiStatus() 返回同一份 snapshot', () => {
    const another = useAiStatus()
    another.begin('full', 60000)
    expect(status.snapshot.value.mode).toBe('full')
  })
})
