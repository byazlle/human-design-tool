<!--
  AI 解读面板的统一挂载点（v2.4.0 页面架构梳理）。

  背景：5 个盘面视图（单盘 / 多盘 / 凯龙 / 对比 / 合盘）此前各自重复了同一段
  18 行 `<AiReadingPanel>` 绑定——9 个 props、6 个事件、以及配套的 copyAi /
  goSettings / retryAi / abortAi 四个包装函数。任何一处改动都要改五遍，
  而它们本应完全一致（面板契约由 AiReadingPanel 自己定义）。

  现在视图只需要：
    <AiReadingHost :chart-name="archive?.name" @save="saveAi" />
  「保存」仍由视图处理，因为解读归属哪个档案是视图才知道的业务事实
  （合盘 / 对比跨两份档案，归属主档案 A；多盘归属当前聚焦栏）。

  ★ 不传 mode：`AiReadingPanel` 的 `effectiveMode = props.mode ?? settings.aiDetailMode`，
  传与不传等价，少一个可能漂移的注入点。
-->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import AiReadingPanel from './AiReadingPanel.vue'
import { useUiStore } from '../../stores/ui'
import { useAiReading } from '../../composables/useAiReading'
import { copyAiResult } from '../../composables/useAiResultActions'

const props = defineProps<{
  /** 报告页眉里的盘面名；合盘 / 对比传「A × B」，不传则页眉不显示该行 */
  chartName?: string
}>()

const emit = defineEmits<{
  /** 保存到档案：归属判定是视图的业务事实，交给视图 */
  save: []
}>()

const router = useRouter()
const ui = useUiStore()
const { state: aiState, retry, abort, configured } = useAiReading()

function copyAi() {
  void copyAiResult(aiState.value.content)
}

function goSettings() {
  router.push('/settings')
}
</script>

<template>
  <AiReadingPanel
    :open="aiState.open"
    :title="aiState.title"
    :content="aiState.content"
    :loading="aiState.loading"
    :error="aiState.error"
    :configured="configured"
    :report="aiState.report"
    :progress="aiState.progress"
    :meta="props.chartName ? { chartName: props.chartName } : undefined"
    @close="ui.closeAi()"
    @copy="copyAi"
    @save="emit('save')"
    @regenerate="retry"
    @cancel="abort"
    @settings="goSettings"
  />
</template>
