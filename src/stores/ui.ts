import { defineStore } from 'pinia'
import type { CenterId } from '../types/hd'
import type { AiProgress, FullReport } from '../types/report'

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

interface UiState {
  panel: PanelSelection | null
  drawerOpen: boolean
  aiReading: AiReadingState
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
