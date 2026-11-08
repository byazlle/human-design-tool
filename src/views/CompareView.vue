<script setup lang="ts">
/**
 * 双完整盘对比视图：左右并排展示两份完整盘（手机端上下堆叠）。
 * 数据与单盘完全一致，仅布局不同；闸门/通道/中心点击释义复用同一套弹层。
 * v2.2.0：新增双盘 AI 解读，「完整」档走关系场专用多轮编排（规范 §3.8 口径）。
 */
import { computed, ref, watch } from 'vue'

import { useDrawingEngine } from '../composables/useDrawingEngine'
const engine = useDrawingEngine()
import { useRoute, useRouter } from 'vue-router'
import AppToolbar from '../components/base/AppToolbar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import HdButton from '../components/base/HdButton.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import AiReadingPanel from '../components/panel/AiReadingPanel.vue'
import { useArchiveStore } from '../stores/archive'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useAiReading } from '../composables/useAiReading'
import { copyAiResult, saveAiResult } from '../composables/useAiResultActions'
import { chartSummaryOf } from '../services/aiClient'
import {
  relationshipFactBlock,
  relationshipFullPlan,
  relationshipSummary,
} from '../services/aiRelationshipReading'
import { composite, mergedAsChart } from '../engine/composite'
import { TYPE_LABELS, AUTHORITY_LABELS } from '../types/hd'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()
const settings = useSettingsStore()
const {
  state: aiState,
  run: runAi,
  retry: retryAi,
  abort: abortAi,
  configured: aiConfigured,
} = useAiReading()

const all = computed(() => archiveStore.archives)

function idOf(v: unknown): string | null {
  const s = String(v ?? '')
  return all.value.some((a) => a.id === s) ? s : null
}

const aId = ref<string | null>(idOf(route.params.aId) ?? all.value[0]?.id ?? null)
const bId = ref<string | null>(idOf(route.params.bId) ?? all.value[1]?.id ?? null)

watch(
  () => [route.params.aId, route.params.bId],
  () => {
    aId.value = idOf(route.params.aId) ?? aId.value
    bId.value = idOf(route.params.bId) ?? bId.value
  },
)

function syncRoute() {
  if (aId.value && bId.value) {
    router.replace({ name: 'compare', params: { aId: aId.value, bId: bId.value } })
  }
}

const archiveA = computed(() => all.value.find((a) => a.id === aId.value) ?? null)
const archiveB = computed(() => all.value.find((a) => a.id === bId.value) ?? null)

/** 双盘对比的 AI 解读以「两人关系场」为对象；同人时不构造合图（composite 会抛错）。 */
const pairNames = computed(() => ({
  a: archiveA.value?.name ?? 'A',
  b: archiveB.value?.name ?? 'B',
}))

const pairResult = computed(() => {
  const a = archiveA.value?.chart
  const b = archiveB.value?.chart
  if (!a || !b || !aId.value || !bId.value || aId.value === bId.value) return null
  return composite(a, b, { aId: aId.value, bId: bId.value })
})

const mergedChart = computed(() => (pairResult.value ? mergedAsChart(pairResult.value) : null))
const canRead = computed(() => Boolean(pairResult.value && mergedChart.value))

/** 缺盘面的档案在这里补算，避免左右栏出现空白 */
watch(
  [aId, bId],
  ([a, b]) => {
    if (a) archiveStore.ensureChart(a)
    if (b) archiveStore.ensureChart(b)
  },
  { immediate: true },
)

/** 防止两边选同一人：一侧选中后，另一侧若冲突则自动换到下一个可用档案 */
watch(aId, (v) => {
  if (v && v === bId.value) {
    bId.value = all.value.find((a) => a.id !== v)?.id ?? null
  }
  syncRoute()
})
watch(bId, (v) => {
  if (v && v === aId.value) {
    aId.value = all.value.find((a) => a.id !== v)?.id ?? null
  }
  syncRoute()
})

import { goDerivedBack, derivedBackLabel } from '../utils/navigationSource'
import AiConfigBadge from '../components/base/AiConfigBadge.vue'

function goBack() {
  goDerivedBack(router)
}
function goSettings() {
  router.push('/settings')
}

/**
 * 双盘对比解读：
 * - 单次档：给模型两份单人盘既有摘要 + 关系场合规事实块，一次成文；
 * - 「完整」档：注入关系场专用任务清单（合盘维度 + 四类动力学 + 逐共享闸门
 *   + 逐合并通道 + 融合），由 aiFullReading 统一编排，绝不输出合盘个体结论。
 */
async function requestCompareAi() {
  const r = pairResult.value
  const chart = mergedChart.value
  const a = archiveA.value
  const b = archiveB.value
  if (!r || !chart || !a || !b) {
    ui.notify('请先选择两份可用的人类图档案。')
    return
  }
  const isFull = settings.aiDetailMode === 'full'
  const offline = [
    `【双盘对比】左：${a.name}，右：${b.name}。请把两人作为一组关系来解读。`,
    '【口径说明】以下 A / B 盘摘要只用于说明两份单人盘的差异；关系场结论不输出类型、内在权威、定义型或轮回交叉等个体结论。',
    '',
    `【A 盘摘要】\n${chartSummaryOf(r.a)}`,
    '',
    `【B 盘摘要】\n${chartSummaryOf(r.b)}`,
    '',
    relationshipFactBlock(r, pairNames.value),
    '',
    '【输出要求】先说明两份盘面在能量节奏上的主要差异，再说明这些差异在关系里的互补与摩擦点，最后给出可执行的相处建议。',
  ].join('\n')

  await runAi({
    scope: 'compare',
    ref: `${aId.value}:${bId.value}`,
    title: `双盘对比解读 · ${a.name} × ${b.name}`,
    offline,
    chartSummary: relationshipSummary(r, pairNames.value),
    chart,
    detailMode: settings.aiDetailMode,
    angle: '双盘对比',
    full: isFull,
    stepMode: settings.aiStepMode,
    fullPlan: isFull ? relationshipFullPlan(r, { pairNames: pairNames.value }) : undefined,
  })
}

function copyAi() {
  void copyAiResult(aiState.value.content)
}

function saveAi() {
  saveAiResult({ title: aiState.value.title, content: aiState.value.content })
}
</script>

<template>
  <div class="page page-shell">
    <AppToolbar
      title="双盘对比"
      :back-label="derivedBackLabel()"
      @back="goBack"
      @new="router.push('/new')"
      @settings="goSettings"
      @help="ui.notify('左右两列各选一份档案，即可并排对比两份完整盘；点击闸门可查看释义。')"
    >
      <template #right>
        <HdButton size="sm" :loading="aiState.loading" :disabled="!canRead" @click="requestCompareAi">
          双盘 AI 解读
        </HdButton>
      </template>
    </AppToolbar>

    <!-- R-3：当前对比对象明示条，两个 select 不变 -->
    <div class="sk-banner compare-hint">
      <span class="t-xs">当前对比：{{ pairNames.a }} × {{ pairNames.b }}；可直接在下方下拉框更换任一侧。</span>
    </div>

    <!-- R-4：AI 配置状态标识 + 未配置去设置 -->
    <div class="sk-banner ai-config-row">
      <span class="t-xs t-muted">双盘对比 AI 解读状态</span>
      <AiConfigBadge @settings="goSettings" />
    </div>

    <EmptyState
      v-if="all.length < 2"
      title="档案不足"
      desc="双盘对比至少需要两份档案，请先新建或载入示例档案。"
      action-label="返回档案库"
      @action="goBack"
    />

    <main v-else class="compare-layout content-shell">
      <section class="card pane">
        <header class="pane-head">
          <select v-model="aId" class="picker" aria-label="选择左侧档案">
            <option v-for="a in all" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <p v-if="archiveA?.chart" class="t-xs meta">
            {{ TYPE_LABELS[archiveA.chart.type] }} · {{ AUTHORITY_LABELS[archiveA.chart.authority] }}
            · 人生角色 {{ archiveA.chart.profile }}
          </p>
        </header>
        <div v-if="archiveA?.chart" class="graph-wrap">
          <HumanDesignBodyGraph :engine="engine"
            :chart="archiveA.chart"
            @gate-click="ui.openGate($event, 'single')"
            @channel-click="ui.openChannel($event, 'single')"
            @center-click="ui.openCenter($event, 'single')"
          />
        </div>
        <p v-else class="pane-empty t-sm msg-warning">
          {{
            archiveA?.chartError
              ? `重算失败：${archiveA.chartError}`
              : '这份档案还没有可用的人类图，可在设置页「重新生成全部图表」重试。'
          }}
        </p>
      </section>

      <section class="card pane">
        <header class="pane-head">
          <select v-model="bId" class="picker" aria-label="选择右侧档案">
            <option v-for="a in all" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <p v-if="archiveB?.chart" class="t-xs meta">
            {{ TYPE_LABELS[archiveB.chart.type] }} · {{ AUTHORITY_LABELS[archiveB.chart.authority] }}
            · 人生角色 {{ archiveB.chart.profile }}
          </p>
        </header>
        <div v-if="archiveB?.chart" class="graph-wrap">
          <HumanDesignBodyGraph :engine="engine"
            :chart="archiveB.chart"
            @gate-click="ui.openGate($event, 'single')"
            @channel-click="ui.openChannel($event, 'single')"
            @center-click="ui.openCenter($event, 'single')"
          />
        </div>
        <p v-else class="pane-empty t-sm msg-warning">
          {{
            archiveB?.chartError
              ? `重算失败：${archiveB.chartError}`
              : '这份档案还没有可用的人类图，可在设置页「重新生成全部图表」重试。'
          }}
        </p>
      </section>
    </main>

    <AiReadingPanel
      :open="aiState.open"
      :title="aiState.title"
      :content="aiState.content"
      :loading="aiState.loading"
      :error="aiState.error"
      :configured="aiConfigured"
      :mode="settings.aiDetailMode"
      :report="aiState.report"
      :progress="aiState.progress"
      :meta="{ chartName: `${pairNames.a} × ${pairNames.b}` }"
      @close="ui.closeAi()"
      @copy="copyAi"
      @save="saveAi"
      @regenerate="retryAi"
      @cancel="abortAi"
      @settings="goSettings"
    />
  </div>
</template>

<style scoped>
.compare-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(300px, 1fr));
  gap: var(--sp-4);
  padding: var(--sp-4);
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.pane {
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}

.pane-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker {
  height: 38px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-soft);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  max-width: 100%;
}

.meta {
  color: var(--text-muted);
}

.graph-wrap {
  width: 100%;
  min-width: 0;
}

.graph-wrap :deep(svg) {
  width: 100%;
  height: auto;
  max-height: 78vh;
}

.pane-empty {
  padding: var(--sp-4);
  text-align: center;
  line-height: 1.6;
}

@media (max-width: 860px) {
  .compare-layout {
    grid-template-columns: 1fr;
    padding: var(--sp-3);
  }

  .graph-wrap :deep(svg) {
    max-height: none;
  }
}
</style>
