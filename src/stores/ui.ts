import { defineStore } from 'pinia'
import type { AiDetailMode, AiStyle, CenterId } from '../types/hd'
import type { AiEntry, ReadingDirection, SelectionPick } from '../types/aiReading'
import type { ReadingDimKey } from '../services/chartFacts'
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
  /**
   * v3.0.0：本次解读的生成元数据（生成时锁定，不随设置页改动而漂移）。
   * 保存进档案时必须用这三个值——此前 saveAiResult 把档位缺省成 detailed、
   * 受众丢成 undefined，导致「简明版记录挡住专业版批量」的静默跳过。
   *
   * v4.0.0：`resultAudience` → `resultStyle`（值不变、语义反转）；
   * `resultEntry` 记录这次解读出自哪个入口，存档时一并落库。
   */
  resultStyle?: AiStyle
  resultTruncated?: boolean
  resultMode?: AiDetailMode
  /** 本次解读的入口（A 全盘 / B 综合 / C 勾选）；单点解读也按 composite 记 */
  resultEntry?: AiEntry
  /**
   * @deprecated v4.0.0 起叫 `resultStyle`。保留为只读镜像（`setAiResultMeta` 同步写入），
   * 让 `views/*` 与 `useAiResultActions` 在 T04 改名之前继续工作；T04 后删除。
   */
  resultAudience?: AiStyle
  /** v3.0.0：流式期间已收到的增量正文（纯文本预览，不进持久化） */
  streamText: string
  /* ── 入口回显快照（v4.0.0）：工作区三入口的控件回显与「重新生成」参数来源 ── */
  /** 本次请求的入口 */
  entry?: AiEntry
  /** 入口 B 勾选的维度（按 READING_DIMENSIONS 顺序） */
  dims?: ReadingDimKey[]
  /** 入口 C 的勾选对象 */
  selection?: SelectionPick | null
  /** 入口 A/B 的解读方向 */
  direction?: ReadingDirection
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
  /**
   * AI 工作区接管标记：为 true 时旧侧栏面板让位给 /ai 完整页面。
   * 只控制"在哪显示"，不控制请求生命周期——请求始终由 useAiReading 的模块级
   * controller 持有，切页不中断；显式取消/关闭才 abort。
   */
  aiPanelSuspended: boolean
  /** 进入 AI 工作区前的来源路径，用于"最小化"原路返回 */
  aiReturnPath: string | null
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
      resultStyle: undefined,
      resultTruncated: false,
      resultMode: undefined,
      resultEntry: undefined,
      resultAudience: undefined,
      streamText: '',
      entry: undefined,
      dims: undefined,
      selection: null,
      direction: undefined,
    },
    batch: { ...BATCH_IDLE, failed: [], skipped: [] },
    aiPanelSuspended: false,
    aiReturnPath: null,
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
        resultStyle: undefined,
        resultTruncated: false,
        resultMode: undefined,
        resultEntry: undefined,
        resultAudience: undefined,
        streamText: '',
        entry: undefined,
        dims: undefined,
        selection: null,
        direction: undefined,
      }
      this.aiPanelSuspended = false
    },
    /**
     * 工作区接管：记录来源并让旧侧栏隐藏。
     * 不触碰 aiReading.open —— 那会触发 useAiReading 的 watch(open) 而误中止请求。
     */
    enterAiWorkspace(fromPath?: string) {
      if (fromPath && fromPath !== '/ai' && fromPath.startsWith('/')) this.aiReturnPath = fromPath
      this.aiPanelSuspended = true
    },
    /** 从工作区最小化：恢复旧侧栏显示（有在途结果时用户可在原页继续看到） */
    exitAiWorkspace() {
      this.aiPanelSuspended = false
    },
    consumeAiReturnPath(): string {
      const path = this.aiReturnPath ?? '/'
      this.aiReturnPath = null
      return path
    },
    /**
     * 锁定本次解读的生成元数据（由 useAiReading 在请求发起时调用）。
     *
     * v4.0.0：入参 `style` 取代 `audience`（后者保留为同一版本的过渡别名，
     * 两个都传时 `style` 优先）；`entry` 用于存档与「最近解读」筛选。
     */
    setAiResultMeta(meta: {
      style?: AiStyle
      /** @deprecated 用 `style` */
      audience?: AiStyle
      mode?: AiDetailMode
      truncated?: boolean
      entry?: AiEntry
    }) {
      const style = meta.style ?? meta.audience
      if (style !== undefined) {
        this.aiReading.resultStyle = style
        // 旧字段同步镜像：T04 把视图与保存逻辑改成 style 后即可删除
        this.aiReading.resultAudience = style
      }
      this.aiReading.resultMode = meta.mode
      if (meta.truncated !== undefined) this.aiReading.resultTruncated = meta.truncated
      if (meta.entry !== undefined) this.aiReading.resultEntry = meta.entry
    },
    /** 入口回显快照：工作区三入口的控件状态（不持久化） */
    setAiEntryContext(ctx: {
      entry?: AiEntry
      dims?: ReadingDimKey[]
      selection?: SelectionPick | null
      direction?: ReadingDirection
    }) {
      this.aiReading.entry = ctx.entry
      this.aiReading.dims = ctx.dims
      this.aiReading.selection = ctx.selection ?? null
      this.aiReading.direction = ctx.direction
      if (ctx.entry !== undefined) this.aiReading.resultEntry = ctx.entry
    },
    /** 流式增量：只追加纯文本预览，不动 content / loading / error 的既有语义 */
    appendAiStreamText(text: string) {
      this.aiReading.streamText += text
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
      this.aiReading.resultTruncated = false
      this.aiReading.streamText = ''
    },
    /** 完整版：进度与「已完成分项快照」一起更新，面板可边生成边看 */
    setAiProgress(progress: AiProgress | null) {
      this.aiReading.progress = progress
    },
    setAiReport(report: FullReport | null) {
      this.aiReading.report = report
      // v4.0.0：报告自带入口，同步进生成元数据，存档时不必再问调用方
      if (report?.entry) this.aiReading.resultEntry = report.entry
    },
    setAiContent(content: string) {
      this.aiReading.content = content
      this.aiReading.streamText = ''
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
