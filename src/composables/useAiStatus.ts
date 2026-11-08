/**
 * 三档统一状态区（v2.3.0 · T-5 / Q-2）。
 *
 * ★ 模块级 UI 局部单例：不进 Pinia、不进 `AiReadingState`、不持久化、不进备份、
 *   不进 `types/`。`useAiReading` 写入，`AiReadingPanel.vue` 直接 import 读取，
 *   因此 5 个盘面视图的 `<AiReadingPanel>` props 与事件绑定零改动。
 *
 * 同一时刻只挂载 1 个盘面视图 / 1 个面板，单例安全。
 * 所有时间来自 `Date.now()` 客户端本地时钟；阶段只描述客户端可观测事实。
 *
 * 禁止词：「AI 正在思考」「服务端已连接」「模型正在生成第 N 段」「正在连接大模型」
 * 「服务端处理中」以及任何暗示服务端内部状态的表述，一律不得写入 label。
 */
import { shallowRef, type Ref } from 'vue'
import type { AiDetailMode } from '../types/hd'
import type { AiProgress } from '../types/report'
import type { AiError, AiStage, AiStageEvent } from '../services/aiClient'

/** 阶段枚举：全部为客户端可观测事实 */
export type AiStatusPhase =
  | 'idle'
  | 'config-validated'
  | 'request-sent'
  | 'waiting'
  | 'receiving'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled'

/** UI 局部状态快照（不是业务数据，不入库、不持久化） */
export interface AiStatusSnapshot {
  phase: AiStatusPhase
  mode: AiDetailMode
  startedAt: number | null
  elapsedMs: number
  timeoutMs: number
  lastActivityAt: number | null
  /** 完整档确定进度；精简 / 详细恒为 null */
  progress: AiProgress | null
  terminal: boolean
  terminalAt: number | null
  errorKind?: AiError['kind']
  /** 唯一文案出口 */
  label: string
  /** 终态保留的并发同义提示（完成态仍显示 N/Y/K 与「最后一步，单独执行」） */
  terminalHint: string
}

function initialSnapshot(): AiStatusSnapshot {
  return {
    phase: 'idle',
    mode: 'concise',
    startedAt: null,
    elapsedMs: 0,
    timeoutMs: 60000,
    lastActivityAt: null,
    progress: null,
    terminal: false,
    terminalAt: null,
    label: '等待发起',
    terminalHint: '',
  }
}

const state = shallowRef<AiStatusSnapshot>(initialSnapshot())
let timer: ReturnType<typeof setInterval> | null = null

const KIND_TEXT: Record<NonNullable<AiStatusSnapshot['errorKind']>, string> = {
  config: '配置未通过校验',
  network: '网络请求失败',
  timeout: '请求已超时',
  http: '接口返回错误',
  format: '响应格式不正确',
  cancelled: '请求已取消',
}

function errorText(kind: AiStatusSnapshot['errorKind']): string {
  return kind ? KIND_TEXT[kind] : '请求失败'
}

/** 阶段文案模板（TX-1 / TX-2）；完整档「超时上限」固定写「单项超时上限」 */
function computeLabel(s: AiStatusSnapshot): string {
  const seconds = Math.max(0, Math.floor(s.elapsedMs / 1000))
  const limitSec = Math.max(0, Math.round(s.timeoutMs / 1000))
  const remaining = Math.max(0, limitSec - seconds)
  const ago = s.lastActivityAt
    ? Math.max(0, Math.floor((Date.now() - s.lastActivityAt) / 1000))
    : 0
  const limitLabel = s.mode === 'full' ? `单项超时上限 ${limitSec}s` : `超时上限 ${limitSec}s`

  switch (s.phase) {
    case 'config-validated':
      return '配置校验通过'
    case 'request-sent':
      return '请求已发出，等待响应'
    case 'waiting':
      return `已等待 ${seconds}s ｜ ${limitLabel}（剩余 ${remaining}s）｜ 最后活动 ${ago}s 前`
    case 'receiving':
      return '已收到响应，正在整理内容'
    case 'completed':
      return `已完成（耗时 ${seconds}s）`
    case 'failed':
      return `请求失败：${errorText(s.errorKind)}`
    case 'timeout':
      return `已超时（超时上限 ${limitSec}s）`
    case 'cancelled':
      return '已取消（本次结果不会生成，已生成内容保留）'
    default:
      return '等待发起'
  }
}

function withLabel(s: AiStatusSnapshot): AiStatusSnapshot {
  return { ...s, label: computeLabel(s) }
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function startTimer(): void {
  stopTimer()
  if (typeof setInterval !== 'function') return
  // 计时器只在 begin() 启动、在 finish() / reset() 清理，不会残留
  timer = setInterval(tick, 500)
}

/** 每 ≤1s 刷新一次（500ms 留余量）；不因 visibilitychange 暂停，避免时间失真 */
function tick(): void {
  const s = state.value
  if (!s.startedAt || s.terminal) return
  const next: AiStatusSnapshot = { ...s, elapsedMs: Date.now() - s.startedAt }
  // 请求已发出后进入本地计时阶段；已收到响应时保持「整理内容」文案
  if (next.phase === 'config-validated' || next.phase === 'request-sent' || next.phase === 'waiting') {
    next.phase = 'waiting'
  }
  state.value = withLabel(next)
}

function reset(): void {
  stopTimer()
  state.value = initialSnapshot()
}

function begin(mode: AiDetailMode, timeoutMs: number): void {
  reset()
  const now = Date.now()
  const next: AiStatusSnapshot = {
    ...initialSnapshot(),
    mode,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
    startedAt: now,
    lastActivityAt: now,
    phase: 'config-validated',
  }
  state.value = withLabel(next)
  startTimer()
}

const STAGE_PHASE: Record<AiStage, AiStatusPhase> = {
  'config-validated': 'config-validated',
  'request-sent': 'request-sent',
  'response-received': 'receiving',
  completed: 'completed',
  failed: 'failed',
  timeout: 'timeout',
  cancelled: 'cancelled',
}

/** 单次档阶段推进；完整档由 applyProgress 驱动，两者互斥（FB-6 状态唯一源） */
function applyStage(e: AiStageEvent): void {
  const s = state.value
  if (s.mode === 'full' || s.terminal) return
  const now = Date.now()
  const next: AiStatusSnapshot = {
    ...s,
    phase: STAGE_PHASE[e.stage] ?? s.phase,
    elapsedMs: s.startedAt ? now - s.startedAt : s.elapsedMs,
    lastActivityAt: now,
    errorKind: e.errorKind ?? s.errorKind,
  }
  if (e.stage === 'completed' || e.stage === 'failed' || e.stage === 'timeout' || e.stage === 'cancelled') {
    next.terminal = true
    next.terminalAt = now
    stopTimer()
  }
  state.value = withLabel(next)
}

/** 完整档进度推进；精简 / 详细恒不写入 progress（禁止假百分比） */
function applyProgress(p: AiProgress): void {
  const s = state.value
  if (s.mode !== 'full' || s.terminal) return
  const now = Date.now()
  // 记住分项阶段的 N/Y/K 长文案；融合 / 完成态 current 被覆盖后仍可常驻显示
  const hint =
    p.current.includes('超过并发上限') || p.current.includes('一次性并发')
      ? p.current
      : s.terminalHint
  const next: AiStatusSnapshot = {
    ...s,
    progress: p,
    terminalHint: hint,
    phase: s.phase === 'receiving' ? 'receiving' : 'waiting',
    elapsedMs: s.startedAt ? now - s.startedAt : s.elapsedMs,
    lastActivityAt: now,
  }
  state.value = withLabel(next)
}

/** 终态静态常驻，直到下一次 begin()；≥3s 自然满足 */
function finish(
  phase: 'completed' | 'failed' | 'timeout' | 'cancelled',
  kind?: AiError['kind'],
): void {
  stopTimer()
  const s = state.value
  const now = Date.now()
  const next: AiStatusSnapshot = {
    ...s,
    phase,
    terminal: true,
    terminalAt: now,
    elapsedMs: s.startedAt ? now - s.startedAt : s.elapsedMs,
    errorKind: kind ?? s.errorKind,
    // 不覆盖：分项阶段已累积的 N/Y/K 长文案在终态继续常驻
    terminalHint: s.terminalHint,
  }
  state.value = withLabel(next)
}

/** 模块级单例：每次调用返回同一份 snapshot 与同一组函数 */
export function useAiStatus(): {
  snapshot: Readonly<Ref<AiStatusSnapshot>>
  begin: typeof begin
  applyStage: typeof applyStage
  applyProgress: typeof applyProgress
  finish: typeof finish
  reset: typeof reset
} {
  return { snapshot: state, begin, applyStage, applyProgress, finish, reset }
}
