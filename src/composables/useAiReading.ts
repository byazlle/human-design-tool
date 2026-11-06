/**
 * AI 解读的编排：把「请求 → 状态 → 面板」串起来。
 * 失败时只展示错误与重试，绝不写入伪造内容（DESIGN.md §7）。
 *
 * 取消：面板关闭或组件卸载时 abort 在途请求，避免返回后仍写入 ui.aiReading。
 * 重试：模块级记住上一次请求参数（不进 UI 状态模型），「重试」按上次 scope/ref 重跑。
 */
import { computed, onScopeDispose, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { AiError, chartSummaryOf, explain, validateAiConfig } from '../services/aiClient'
import type { BodyGraph } from '../types/hd'

interface RunOptions {
  scope: string
  ref?: string
  title: string
  offline: string
  chart?: BodyGraph
  /** 显式给定的「盘面事实」摘要；合盘用它替换标准的单人摘要（规范 §3.8） */
  chartSummary?: string
}

/** 上一次请求参数：仅用于「重试」，不写入 ui 状态 */
let lastOptions: RunOptions | null = null

export function useAiReading() {
  const ui = useUiStore()
  const settings = useSettingsStore()

  const state = computed(() => ui.aiReading)
  const configured = computed(() => settings.aiConfigured)

  let controller: AbortController | null = null

  function abort() {
    const hadController = Boolean(controller)
    controller?.abort()
    controller = null
    // 主动取消后必须退出 loading，否则面板会一直停在骨架屏
    if (hadController) ui.setAiLoading(false)
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

  async function run(options: RunOptions, externalSignal?: AbortSignal) {
    lastOptions = { ...options }

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
      ui.setAiError(configError)
      return
    }

    abort()
    const own = new AbortController()
    controller = own
    if (externalSignal) {
      if (externalSignal.aborted) own.abort()
      else externalSignal.addEventListener('abort', () => own.abort(), { once: true })
    }

    // abort() 可能把 loading 置回 false（取消旧请求），这里统一重新进入 loading
    ui.setAiLoading(true)

    try {
      const content = await explain({
        cfg: { ...settings.ai },
        scope: options.scope,
        ref: options.ref,
        offline: options.offline,
        chartSummary:
          options.chartSummary ?? (options.chart ? chartSummaryOf(options.chart) : undefined),
        signal: own.signal,
      })
      if (own.signal.aborted) {
        ui.setAiLoading(false)
        return
      }
      ui.setAiContent(content)
    } catch (err) {
      // 主动取消（关闭面板 / 卸载）不算错误，也不写入状态
      if (own.signal.aborted) {
        ui.setAiLoading(false)
        return
      }
      const message =
        err instanceof AiError ? err.message : `调用失败：${(err as Error).message ?? '未知错误'}`
      ui.setAiError(message)
    } finally {
      if (controller === own) controller = null
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
