/**
 * v3.0.0：逐路（per-task）AI 流式状态注册表。
 *
 * 为什么另起一个模块而不是塞进 `useAiStatus`：
 * - `useAiStatus` 是「当前这一个面板」的模块级单例，且完整档 `applyStage` 是空操作，
 *   它表达不了 N 路并发；硬塞会引入第二套「当前状态」，与既有断言的状态唯一源冲突。
 * - 本模块只管**观测事实**（连接、增量字符、时间戳、速率），不进 Pinia、不持久化、
 *   不进备份，也不改 `AiProgress`（那个类型被静态断言锁死 8 字段）。
 *
 * 性能：delta 可能每秒数十次，内部用普通对象逐字累计（不丢字符），
 * 对外 ≤4 次/秒 用 shallowRef 整体替换一次快照，避免每个 delta 触发 Vue 更新。
 */
import { computed, shallowRef, type ComputedRef, type Ref } from 'vue'

export type StreamPhase =
  | 'idle'
  | 'sending'
  | 'connected'
  | 'receiving'
  | 'fallback'
  | 'done'
  | 'failed'

export interface StreamSnapshot {
  key: string
  label: string
  phase: StreamPhase
  chars: number
  /** 最近 3 秒滑动窗口的瞬时速率（字/秒） */
  charsPerSec: number
  /** 从首个 delta 到结束的整体平均速率（字/秒） */
  avgCharsPerSec: number
  elapsedMs: number
  /** 距上一次 delta 的秒数；0 表示还没开始输出 */
  silentSec: number
  /** 附加提示（思考期静默 / 非流式回退 / 错误） */
  hint: string
  /** 唯一文案出口 */
  text: string
}

interface Internal extends StreamSnapshot {
  startedAt: number
  firstDeltaAt: number | null
  lastDeltaAt: number | null
  samples: { t: number; chars: number }[]
}

const WINDOW_MS = 3000
const FLUSH_MS = 250
const SILENT_HINT_MS = 5000

const store = new Map<string, Internal>()
const snapshots: Ref<ReadonlyMap<string, StreamSnapshot>> = shallowRef(new Map())
const dirty = new Set<string>()
let flushTimer: ReturnType<typeof setInterval> | null = null

function rateOf(s: Internal, now: number): number {
  s.samples = s.samples.filter((p) => now - p.t <= WINDOW_MS).slice(-200)
  if (s.samples.length < 2) return 0
  const first = s.samples[0]
  const last = s.samples[s.samples.length - 1]
  const dt = last.t - first.t
  return dt > 0 ? ((last.chars - first.chars) * 1000) / dt : 0
}

function avgOf(s: Internal, now: number): number {
  if (s.firstDeltaAt === null) return 0
  const end = s.lastDeltaAt ?? now
  const dt = Math.max(1, end - s.firstDeltaAt)
  return (s.chars * 1000) / dt
}

function textOf(s: Internal): string {
  const seconds = Math.max(0, Math.floor(s.elapsedMs / 1000))
  switch (s.phase) {
    case 'sending':
      return '请求已发出，等待连接'
    case 'connected':
      return `已连接，等待模型开始输出（已等待 ${seconds}s）`
    case 'receiving':
      return `正在输出 · 已 ${s.chars} 字 · ${s.charsPerSec.toFixed(1)} 字/秒 · 耗时 ${seconds}s`
    case 'fallback':
      return '该接口不支持流式，已改用整段返回'
    case 'done':
      return `已完成（耗时 ${seconds}s · ${s.chars} 字 · 平均 ${s.avgCharsPerSec.toFixed(1)} 字/秒）`
    case 'failed':
      return `请求失败：${s.hint || '未知原因'}`
    default:
      return '等待发起'
  }
}

function refresh(s: Internal, now: number): void {
  s.elapsedMs = now - s.startedAt
  s.silentSec = s.lastDeltaAt ? Math.max(0, Math.floor((now - s.lastDeltaAt) / 1000)) : 0
  s.charsPerSec = rateOf(s, now)
  s.avgCharsPerSec = avgOf(s, now)
  const active = s.phase === 'connected' || s.phase === 'receiving'
  const silent =
    active &&
    (s.lastDeltaAt !== null
      ? now - s.lastDeltaAt > SILENT_HINT_MS
      : now - s.startedAt > SILENT_HINT_MS)
  s.hint =
    s.phase === 'fallback' || s.phase === 'failed'
      ? s.hint
      : silent
        ? `已 ${s.silentSec}s 无新内容（模型可能在思考）`
        : ''
  s.text = textOf(s)
}

function snapshotOf(s: Internal): StreamSnapshot {
  return {
    key: s.key,
    label: s.label,
    phase: s.phase,
    chars: s.chars,
    charsPerSec: s.charsPerSec,
    avgCharsPerSec: s.avgCharsPerSec,
    elapsedMs: s.elapsedMs,
    silentSec: s.silentSec,
    hint: s.hint,
    text: s.text,
  }
}

function flush(): void {
  const now = Date.now()
  const next = new Map(snapshots.value)
  for (const s of store.values()) {
    // 非终态每 250ms 重算耗时 / 速率 / 静默提示；终态只在标脏时更新
    if (!s.phase || s.phase === 'done' || s.phase === 'failed') {
      if (!dirty.has(s.key)) continue
    } else {
      refresh(s, now)
    }
    next.set(s.key, snapshotOf(s))
  }
  dirty.clear()
  snapshots.value = next
}

function ensureTimer(): void {
  if (flushTimer !== null || typeof setInterval !== 'function') return
  flushTimer = setInterval(flush, FLUSH_MS)
}

function maybeStopTimer(): void {
  if (flushTimer !== null && store.size === 0) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

/** delta 只标脏，由 250ms 定时器统一刷新；状态跃迁立即反馈 */
function mark(key: string, immediate = true): void {
  dirty.add(key)
  ensureTimer()
  if (immediate) flush()
}

function blank(key: string, label: string, now: number): Internal {
  return {
    key,
    label: label || key,
    phase: 'sending',
    chars: 0,
    charsPerSec: 0,
    avgCharsPerSec: 0,
    elapsedMs: 0,
    silentSec: 0,
    hint: '',
    text: '',
    startedAt: now,
    firstDeltaAt: null,
    lastDeltaAt: null,
    samples: [],
  }
}

export function useAiStreams(): {
  snapshots: Ref<ReadonlyMap<string, StreamSnapshot>>
  list: ComputedRef<StreamSnapshot[]>
  begin: (key: string, label?: string) => void
  connected: (key: string) => void
  delta: (key: string, text: string) => void
  fallback: (key: string, reason?: string) => void
  finish: (key: string, ok: boolean, error?: string) => void
  remove: (key: string) => void
  resetAll: () => void
} {
  const list = computed(() => [...snapshots.value.values()])

  function begin(key: string, label = ''): void {
    const now = Date.now()
    const s = blank(key, label, now)
    s.text = textOf(s)
    store.set(key, s)
    mark(key)
  }

  function connected(key: string): void {
    const s = store.get(key)
    if (!s) return
    // 收到过 delta 之后迟到的 connected 不应把状态打回去
    if (s.phase === 'sending') s.phase = 'connected'
    mark(key)
  }

  function delta(key: string, text: string): void {
    const s = store.get(key) ?? blank(key, key, Date.now())
    if (!store.has(key)) store.set(key, s)
    const now = Date.now()
    const isFirst = s.firstDeltaAt === null
    if (isFirst) s.firstDeltaAt = now
    s.lastDeltaAt = now
    s.chars += [...text].length // 按字符计，中文一个字
    s.samples.push({ t: now, chars: s.chars })
    if (s.phase !== 'fallback') s.phase = 'receiving'
    refresh(s, now)
    // 首个 delta 是「从无回复 → 正在输出」的关键跃迁，立刻反馈；之后节流
    mark(key, isFirst)
  }

  function fallback(key: string, reason = '该接口不支持流式，已改用整段返回'): void {
    const s = store.get(key)
    if (!s) return
    if (s.phase === 'sending' || s.phase === 'connected') s.phase = 'fallback'
    s.hint = reason
    mark(key)
  }

  function finish(key: string, ok: boolean, error = ''): void {
    const s = store.get(key)
    if (!s) return
    const now = Date.now()
    s.phase = ok ? 'done' : 'failed'
    if (!ok) s.hint = error
    s.avgCharsPerSec = avgOf(s, now)
    s.elapsedMs = now - s.startedAt
    s.text = textOf(s)
    mark(key)
  }

  function remove(key: string): void {
    store.delete(key)
    dirty.delete(key)
    const next = new Map(snapshots.value)
    next.delete(key)
    snapshots.value = next
    maybeStopTimer()
  }

  function resetAll(): void {
    store.clear()
    dirty.clear()
    snapshots.value = new Map()
    maybeStopTimer()
  }

  return { snapshots, list, begin, connected, delta, fallback, finish, remove, resetAll }
}

/** 单面板固定 key：5 个盘面视图共用同一块状态区 */
export const PANEL_STREAM_KEY = 'panel'
