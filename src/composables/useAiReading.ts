/**
 * AI 解读的编排：把「请求 → 状态 → 面板」串起来。
 * 失败时只展示错误与重试，绝不写入伪造内容（DESIGN.md §7）。
 */
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { AiError, chartSummaryOf, explain, validateAiConfig } from '../services/aiClient'
import type { BodyGraph } from '../types/hd'

export function useAiReading() {
  const ui = useUiStore()
  const settings = useSettingsStore()

  const state = computed(() => ui.aiReading)
  const configured = computed(() => settings.aiConfigured)

  async function run(options: {
    scope: string
    ref?: string
    title: string
    offline: string
    chart?: BodyGraph
  }) {
    const configError = validateAiConfig(settings.ai)
    if (configError) {
      ui.openAi(options.scope, options.ref, options.title)
      ui.setAiError(configError)
      return
    }

    ui.openAi(options.scope, options.ref, options.title)
    ui.setAiLoading(true)

    try {
      const content = await explain({
        cfg: { ...settings.ai },
        scope: options.scope,
        ref: options.ref,
        offline: options.offline,
        chartSummary: options.chart ? chartSummaryOf(options.chart) : undefined,
      })
      ui.setAiContent(content)
    } catch (err) {
      const message =
        err instanceof AiError ? err.message : `调用失败：${(err as Error).message ?? '未知错误'}`
      ui.setAiError(message)
    }
  }

  /** 重试当前面板的请求需要上层提供上下文，这里只清空错误以便重新触发 */
  function clearError() {
    ui.aiReading.error = null
  }

  return { state, configured, run, clearError }
}
