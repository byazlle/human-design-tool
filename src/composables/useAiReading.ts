/**
 * AI 解读的编排：把「请求 → 状态 → 面板」串起来。
 * 失败时只展示错误与重试，绝不写入伪造内容（DESIGN.md §7）。
 *
 * 取消：面板关闭或组件卸载时 abort 在途请求，避免返回后仍写入 ui.aiReading。
 * 重试：模块级记住上一次请求参数（不进 UI 状态模型），「重试」按上次 scope/ref 重跑。
 *
 * v2.3.0 / T-5：接入模块级单例 useAiStatus（三档统一状态区）。
 * ★ T-C5 的 degradedNotified 去重、两个并发参数拼装、`...(options.fullPlan ?? {})` 位置逐字不动。
 */
import { computed, onScopeDispose, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { AiError, chartSummaryOf, explain, validateAiConfig } from '../services/aiClient'
import {
  runFullReading,
  type FullReadingPlan,
  type FullReadingUpdate,
} from '../services/aiFullReading'
import { serializeFullReport } from '../services/aiExport'
import { useAiStatus } from './useAiStatus'
import type { AiDetailMode, AiStepMode, BodyGraph } from '../types/hd'

interface RunOptions {
  scope: string
  ref?: string
  title: string
  offline: string
  chart?: BodyGraph
  /** 显式给定的「盘面事实」摘要；合盘用它替换标准的单人摘要（规范 §3.8） */
  chartSummary?: string
  /** 解读详细度；不传则跟随设置里的「解读详细度」 */
  detailMode?: AiDetailMode
  /** 解读角度标签，注入【用户选择】 */
  angle?: string
  /**
   * #9：是否走「完整版」多轮分步编排。
   * 整盘类请求（单人整盘 / 合盘 / 双盘对比 / 凯龙回归盘）置 true；
   * 单点闸门/通道/中心仍按三档做单次解读（Q3.3）。
   */
  full?: boolean
  /** 完整版串行 / 并发；不传跟随全局设置 */
  stepMode?: AiStepMode
  /**
   * 关系场（合盘 / 双盘对比）的完整版编排计划：注入合规任务清单与事实块。
   * 不传时走单人整盘默认编排，行为不变。
   */
  fullPlan?: FullReadingPlan
}

/** 上一次请求参数：仅用于「重试」，不写入 ui 状态 */
let lastOptions: RunOptions | null = null

/**
 * 在途请求的控制器。
 *
 * ★ 必须是**模块级**而不是 `useAiReading()` 的闭包变量：
 *   同一个 AI 解读面板可能由两个组件分别调用本 composable——
 *   视图负责发起（`run`），`AiReadingHost` 负责「中断」按钮与关闭（`abort`）。
 *   若 controller 是每个实例各持一份，host 侧的 `abort()` 看到的是自己的
 *   `null`，判定「没有在途请求」直接返回，中断按钮静默失效。
 *   全局同时只可能存在一次 AI 解读（`ui.aiReading` 是单一槽位、
 *   `useAiStatus` 是模块级单例），所以共用一份 controller 与既有语义一致。
 */
let activeController: AbortController | null = null

function errorKindOf(err: unknown): AiError['kind'] {
  return err instanceof AiError ? err.kind : 'network'
}

function terminalPhaseOf(kind: AiError['kind']): 'failed' | 'timeout' | 'cancelled' {
  if (kind === 'timeout') return 'timeout'
  if (kind === 'cancelled') return 'cancelled'
  return 'failed'
}

export function useAiReading() {
  const ui = useUiStore()
  const settings = useSettingsStore()
  // 模块级单例：5 个盘面视图各自调用也只拿到同一份快照
  const status = useAiStatus()

  const state = computed(() => ui.aiReading)
  const configured = computed(() => settings.aiConfigured)

  function abort() {
    const hadController = Boolean(activeController)
    activeController?.abort()
    activeController = null
    // 主动取消后必须退出 loading，否则面板会一直停在骨架屏
    if (hadController) {
      ui.setAiLoading(false)
      // 仅当确实存在在途 controller 时才标记取消，避免空闲时误标
      status.finish('cancelled', 'cancelled')
    }
  }

  // 面板关闭 → 取消在途请求
  watch(
    () => ui.aiReading.open,
    (open) => {
      if (!open) abort()
    },
  )
  // 组件卸载 → 取消在途请求
  onScopeDispose(abort)

  /**
   * #9 完整版编排：进度与「已完成分项快照」实时写入 UI，取消 / 失败都不写伪造内容。
   * 完成后 content 仍是完整 Markdown（复制 / 保存到本地记录继续可用），
   * 面板的模块化展示则由 report 承担。
   */
  async function runFull(options: RunOptions, own: AbortController) {
    const chart = options.chart!
    const title = options.title
    const generatedAt = new Date().toISOString()
    // 条件 ② 降级 info toast：每次 runFull 重置，保证每次降级恰好一次
    let degradedNotified = false
    const publish = (update: FullReadingUpdate) => {
      status.applyProgress(update.progress)
      if (!degradedNotified && update.progress.phase.includes('按上限')) {
        degradedNotified = true
        ui.notify(update.progress.current, 'info')
      }
      ui.setAiProgress(update.progress)
      ui.setAiReport({
        title,
        sections: update.sections,
        fusion: update.fusion,
        summary: update.summary,
        totalChars:
          update.sections.reduce((n, s) => n + s.content.replace(/\s/g, '').length, 0) +
          update.fusion.replace(/\s/g, '').length,
        skipped: update.skipped,
        generatedAt,
      })
    }
    try {
      const report = await runFullReading({
        cfg: { ...settings.ai },
        chart,
        title,
        stepMode: options.stepMode ?? settings.aiStepMode,
        signal: own.signal,
        onUpdate: publish,
        aiConcurrency: settings.aiConcurrency,
        aiConcurrencyLimit: settings.aiConcurrencyLimit,
        ...(options.fullPlan ?? {}),
      })
      if (own.signal.aborted) {
        ui.setAiLoading(false)
        return
      }
      ui.setAiReport(report)
      ui.setAiContent(serializeFullReport(report))
      status.finish('completed')
    } catch (err) {
      if (own.signal.aborted) {
        ui.setAiLoading(false)
        return
      }
      const message =
        err instanceof AiError ? err.message : `调用失败：${(err as Error).message ?? '未知错误'}`
      ui.setAiError(message)
      const kind = errorKindOf(err)
      status.finish(terminalPhaseOf(kind), kind)
    }
  }

  async function run(options: RunOptions, externalSignal?: AbortSignal) {
    lastOptions = { ...options }
    const mode: AiDetailMode = options.full
      ? 'full'
      : (options.detailMode ?? settings.aiDetailMode)

    // 同一面板「重新生成」：保留旧内容，只置 loading；首次打开或切换面板时重置。
    const samePanel =
      ui.aiReading.open &&
      ui.aiReading.scope === options.scope &&
      ui.aiReading.ref === options.ref &&
      ui.aiReading.content.trim().length > 0
    if (samePanel) {
      ui.beginRegenerate()
    } else {
      ui.openAi(options.scope, options.ref, options.title)
    }

    const configError = validateAiConfig(settings.ai)
    if (configError) {
      // 未配置 / 配置错误：不进入连接阶段（AC-23）
      status.finish('failed', 'config')
      ui.setAiError(configError)
      return
    }

    abort()
    // abort() 可能把上一轮状态标成 cancelled；begin() 在它之后重置，避免串台
    status.begin(mode, settings.ai.timeoutMs)
    const own = new AbortController()
    activeController = own
    if (externalSignal) {
      if (externalSignal.aborted) own.abort()
      else externalSignal.addEventListener('abort', () => own.abort(), { once: true })
    }

    // abort() 可能把 loading 置回 false（取消旧请求），这里统一重新进入 loading
    ui.setAiLoading(true)

    // 完整版：整盘类请求才走多轮编排；单点解读仍按三档做单次请求
    if (options.full && options.chart) {
      try {
        await runFull(options, own)
      } finally {
        if (activeController === own) activeController = null
      }
      return
    }

    try {
      const content = await explain({
        cfg: { ...settings.ai },
        scope: options.scope,
        ref: options.ref,
        offline: options.offline,
        chartSummary:
          options.chartSummary ?? (options.chart ? chartSummaryOf(options.chart) : undefined),
        detailMode: options.detailMode ?? settings.aiDetailMode,
        angle: options.angle,
        signal: own.signal,
        onStage: (e) => status.applyStage(e),
      })
      if (own.signal.aborted) {
        ui.setAiLoading(false)
        return
      }
      ui.setAiContent(content)
      status.finish('completed')
    } catch (err) {
      // 主动取消（关闭面板 / 卸载）不算错误，也不写入状态
      if (own.signal.aborted) {
        ui.setAiLoading(false)
        return
      }
      const message =
        err instanceof AiError ? err.message : `调用失败：${(err as Error).message ?? '未知错误'}`
      ui.setAiError(message)
      const kind = errorKindOf(err)
      status.finish(terminalPhaseOf(kind), kind)
    } finally {
      if (activeController === own) activeController = null
    }
  }

  /** 重试上一次请求（保留原 scope / ref / 离线释义 / 盘面摘要） */
  async function retry(externalSignal?: AbortSignal) {
    if (!lastOptions) return
    await run(lastOptions, externalSignal)
  }

  /** 重试当前面板的请求需要上层提供上下文，这里只清空错误以便重新触发 */
  function clearError() {
    ui.aiReading.error = null
  }

  return { state, configured, run, retry, abort, clearError }
}
