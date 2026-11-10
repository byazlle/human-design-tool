import { defineStore } from 'pinia'
import type { CenterId } from '../types/hd'
import type { AiProgress, FullReport } from '../types/report'
import type { BatchProgress } from '../services/aiBatchReading'

export type PanelKind = 'gate' | 'channel' | 'center'
export type PanelSource = 'a' | 'b' | 'merged' | 'single'

export interface PanelSelection {
  kind: PanelKind
  ref: string | number
  source: PanelSource
}

export interface AiReadingState {
  open: boolean
  scope: string
  ref?: string
  title: string
  content: string
  loading: boolean
  error: string | null
  /** 完整版多轮编排的实时进度（#9）；精简/详细恒为 null */
  progress: AiProgress | null
  /** 完整版结构化报告（#9）；生成中即为已完成分项的快照 */
  report: FullReport | null
}

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  /** toast 内可点击的动作（如「撤销」） */
  action?: ToastAction
  /** 停留毫秒数，默认 2600 */
  duration?: number
}

/**
 * 跨档案批量生成解读的运行态（v2.4.0）。
 *
 * 为什么放在 ui store 而不是组件局部：批量生成可能跑几十份、耗时数分钟，
 * 用户从档案库页发起后会切到别的页面继续浏览。状态必须比发起它的组件活得久，
 * 才能让弹层/进度条在任何视图里都显示同一次运行的进度。
 *
 * 不持久化：这是「本次运行」的瞬时状态，刷新后丢失；已生成的解读存在 readings store 里。
 */
export interface BatchState {
  running: boolean
  total: number
  done: number
  /** 当前处理项名称 */
  current: string
  phase: string
  ok: number
  /** 成功生成解读的档案 id（按完成顺序），供结果条「查看」跳转 */
  okIds: string[]
  failed: string[]
  skipped: string[]
  elapsedMs: number
  etaMs: number | null
  /** 最近一次运行的结论（成功/失败/中断），供结果条展示 */
  summary: string
  /** 结论是否为正面（决定提示色） */
  summaryOk: boolean
}

const BATCH_IDLE: BatchState = {
  running: false,
  total: 0,
  done: 0,
  current: '',
  phase: '',
  ok: 0,
  okIds: [],
  failed: [],
  skipped: [],
  elapsedMs: 0,
  etaMs: null,
  summary: '',
  summaryOk: true,
}

interface UiState {
  panel: PanelSelection | null
  drawerOpen: boolean
  aiReading: AiReadingState
  batch: BatchState
  toast: { text: string; kind: 'info' | 'success' | 'error'; action?: ToastAction } | null
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    panel: null,
    drawerOpen: false,
    aiReading: {
      open: false,
      scope: 'single',
      ref: undefined,
      title: 'AI 深度解读',
      content: '',
      loading: false,
      error: null,
      progress: null,
      report: null,
    },
    batch: { ...BATCH_IDLE, failed: [], skipped: [] },
    toast: null,
  }),

  actions: {
    openGate(gate: number, source: PanelSource = 'single') {
      this.panel = { kind: 'gate', ref: gate, source }
      this.drawerOpen = true
    },
    openChannel(key: string, source: PanelSource = 'single') {
      this.panel = { kind: 'channel', ref: key, source }
      this.drawerOpen = true
    },
    openCenter(id: CenterId, source: PanelSource = 'single') {
      this.panel = { kind: 'center', ref: id, source }
      this.drawerOpen = true
    },
    closePanel() {
      this.panel = null
      this.drawerOpen = false
    },

    openAi(scope: string, ref?: string, title = 'AI 深度解读') {
      this.aiReading = {
        open: true,
        scope,
        ref,
        title,
        content: '',
        loading: false,
        error: null,
        progress: null,
        report: null,
      }
    },
    setAiLoading(loading: boolean) {
      this.aiReading.loading = loading
    },
    /**
     * 重新生成同一面板：保留已展示的旧内容，只标记 loading 并清掉旧错误。
     * （对应 U-20：失败时不应把上一次的解读清空）
     */
    beginRegenerate() {
      this.aiReading.loading = true
      this.aiReading.error = null
      this.aiReading.progress = null
      this.aiReading.report = null
    },
    /** 完整版：进度与「已完成分项快照」一起更新，面板可边生成边看 */
    setAiProgress(progress: AiProgress | null) {
      this.aiReading.progress = progress
    },
    setAiReport(report: FullReport | null) {
      this.aiReading.report = report
    },
    setAiContent(content: string) {
      this.aiReading.content = content
      this.aiReading.loading = false
      this.aiReading.error = null
    },
    setAiError(message: string) {
      this.aiReading.error = message
      this.aiReading.loading = false
    },
    closeAi() {
      this.aiReading.open = false
    },

    /* ── 批量生成解读（v2.4.0）────────────────────────── */
    /** 开始一次批量生成：重置并置 running（重复调用不应覆盖正在跑的运行） */
    beginBatch(total: number, init: { current?: string; phase?: string } = {}) {
      if (this.batch.running) return
      this.batch = {
        ...BATCH_IDLE,
        running: true,
        total,
        current: init.current ?? '',
        phase: init.phase ?? '批量生成',
        okIds: [],
        failed: [],
        skipped: [],
      }
    },
    setBatchProgress(progress: BatchProgress) {
      this.batch.total = progress.total
      this.batch.done = progress.done
      this.batch.current = progress.current
      this.batch.phase = progress.phase
      this.batch.ok = progress.ok
      this.batch.okIds = progress.okIds
      this.batch.failed = progress.failed
      this.batch.skipped = progress.skipped
      this.batch.elapsedMs = progress.elapsedMs
      this.batch.etaMs = progress.etaMs
    },
    /** 结束一次批量生成（ok=false 时结论条按错误色展示） */
    finishBatch(summary: string, ok = true) {
      this.batch.running = false
      this.batch.phase = '已完成'
      this.batch.summary = summary
      this.batch.summaryOk = ok
      this.batch.etaMs = null
    },
    /** 关闭结论条（保留统计数字，便于用户回看「上次跑了几份」） */
    dismissBatchSummary() {
      this.batch.summary = ''
    },

    notify(text: string, kind: 'info' | 'success' | 'error' = 'info', options: ToastOptions = {}) {
      const duration = options.duration ?? 2600
      this.toast = { text, kind, action: options.action }
      window.setTimeout(() => {
        if (this.toast?.text === text) this.toast = null
      }, duration)
    },
    /** 执行 toast 上的动作（并立即关闭 toast） */
    runToastAction() {
      const action = this.toast?.action
      this.toast = null
      action?.onClick()
    },
    clearToast() {
      this.toast = null
    },
  },
})
