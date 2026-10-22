<script setup lang="ts">
/**
 * 凯龙回归图（Chiron Return Chart）：
 * 凯龙周期 49–51 年，人生第三阶段（疗愈 / 传承 / 榜样）的独立周期盘。
 * 拥有独立的行星落点、闸门、通道、九中心、轮回交叉与人生角色，不替换本命盘。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import { useDrawingEngine } from '../composables/useDrawingEngine'
import { computeChironReturn } from '../services/chironChart'
import { chartSummaryOf } from '../services/aiClient'
import AppToolbar from '../components/base/AppToolbar.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import BoardMeta from '../components/chart/BoardMeta.vue'
import ActivationPanels from '../components/chart/ActivationPanels.vue'
import PlanetColumn from '../components/chart/PlanetColumn.vue'
import AiReadingPanel from '../components/panel/AiReadingPanel.vue'
import HdButton from '../components/base/HdButton.vue'
import EmptyState from '../components/base/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()
const { isMobile } = useBreakpoint()
const { state: aiState, run: runAi } = useAiReading()
const engine = useDrawingEngine()

const id = computed(() => String(route.params.id ?? ''))
const archive = computed(() => archiveStore.byId(id.value))

const result = computed(() => {
  const a = archive.value
  if (!a) return null
  return computeChironReturn({
    year: a.birth.year,
    month: a.birth.month,
    day: a.birth.day,
    hour: a.birth.hour,
    minute: a.birth.minute,
    second: a.birth.second,
    timezone: a.timezone,
    lat: a.location.lat,
    lng: a.location.lng,
  })
})

const filter = ref({ showDecimals: true, showColorToneBase: true, sharedOnly: false })

const returnLocal = computed(() => {
  if (!result.value) return ''
  const d = new Date(result.value.returnUtc)
  const fmt = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${fmt.format(d)}（本地时区）`
})

async function requestChironAi() {
  if (!result.value || !archive.value) return
  const r = result.value
  const offline = [
    `【凯龙回归图背景】凯龙周期约 49–51 年，凯龙回归代表人生第三阶段：疗愈、传承、榜样阶段。`,
    `本命凯龙落点：闸门 ${r.natalChiron.gate}.${r.natalChiron.line}`,
    `凯龙回归时刻：${r.returnUtc}（约 ${r.age} 岁）`,
    `回归时刻盘面事实如下，请围绕「疗愈与传承」主题解读：`,
    chartSummaryOf(r.chart),
  ].join('\n')
  await runAi({
    scope: 'chiron',
    ref: String(r.natalChiron.gate),
    title: `${archive.value.name} · 凯龙回归图解读`,
    offline,
    chart: r.chart,
  })
}

function goBack() {
  router.push(`/archive/${id.value}`)
}

watch(
  id,
  (v) => {
    if (v) archiveStore.ensureChart(v)
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <AppToolbar
      :title="`凯龙回归图 · ${archive?.name ?? '未找到'}`"
      back-label="返回本盘"
      @back="goBack"
      @new="router.push('/new')"
      @settings="router.push('/settings')"
      @help="ui.notify('凯龙回归图是约 50 岁前后的独立周期盘，代表疗愈 / 传承 / 榜样阶段，不替换本命盘。')"
    >
      <template #right>
        <HdButton size="sm" :loading="aiState.loading" @click="requestChironAi">凯龙图 AI 解读</HdButton>
      </template>
    </AppToolbar>

    <EmptyState
      v-if="!archive"
      title="没有找到这份档案"
      desc="请从本命盘页面进入凯龙回归图。"
      action-label="返回"
      @action="goBack"
    />

    <EmptyState
      v-else-if="!result"
      title="无法计算凯龙回归时刻"
      desc="凯龙回归求解失败，请检查出生时间是否正确。"
      action-label="返回"
      @action="goBack"
    />

    <main v-else class="layout" :class="{ mobile: isMobile }">
      <!-- 回归信息 -->
      <section class="card chiron-meta">
        <div class="m-item">
          <p class="t-xs">本命凯龙落点</p>
          <p class="t-title t-mono">{{ result.natalChiron.gate }}.{{ result.natalChiron.line }}</p>
        </div>
        <div class="m-item">
          <p class="t-xs">凯龙回归时刻</p>
          <p class="t-body t-mono">{{ returnLocal }}</p>
        </div>
        <div class="m-item">
          <p class="t-xs">回归年龄</p>
          <p class="t-title t-mono">约 {{ result.age }} 岁</p>
        </div>
        <div class="m-item grow">
          <p class="t-xs">周期含义</p>
          <p class="t-sm">凯龙周期 49–51 年，回归开启人生第三阶段：疗愈旧伤、把经验传承给他人、成为自己人生的榜样。凯龙图是独立周期盘，不替换本命盘。</p>
        </div>
        <HdButton size="sm" :loading="aiState.loading" class="mobile-ai" @click="requestChironAi">
          凯龙图 AI 解读
        </HdButton>
      </section>

      <!-- 图 -->
      <div class="col col-chart">
        <div v-if="isMobile" class="card mobile-planets">
          <PlanetColumn :stars="result.chart.design" side="design" :selected="new Set()" />
          <PlanetColumn :stars="result.chart.personality" side="personality" :selected="new Set()" />
        </div>

        <section class="card chart-card">
          <header class="chart-head">
            <p class="t-xs grow">
              凯龙回归盘 · {{ new Date(result.returnUtc).toISOString().slice(0, 10) }} · Design 时刻 {{ result.chart.meta.designTime.slice(0, 10) }}
            </p>
            <div class="toggles">
              <label class="t-xs tog"><input v-model="filter.showDecimals" type="checkbox" /> 小度数</label>
              <label class="t-xs tog"><input v-model="filter.showColorToneBase" type="checkbox" /> 色/调/基</label>
            </div>
          </header>
          <div class="graph-wrap">
            <HumanDesignBodyGraph
              :engine="engine"
              :chart="result.chart"
              mode="single"
              :filter="filter"
            />
          </div>
        </section>
      </div>

      <!-- 信息 -->
      <div class="col">
        <section class="card module-card">
          <BoardMeta :chart="result.chart" />
        </section>
      </div>

      <div class="col">
        <ActivationPanels
          :chart="result.chart"
          :sections="['channels', 'gates', 'centers']"
          @gate-click="ui.openGate($event, 'single')"
          @channel-click="ui.openChannel($event, 'single')"
          @center-click="ui.openCenter($event, 'single')"
        />
      </div>
    </main>

    <AiReadingPanel
      :open="aiState.open"
      :title="aiState.title"
      :content="aiState.content"
      :loading="aiState.loading"
      :error="aiState.error"
      @close="ui.closeAi()"
      @copy="() => {}"
      @save="() => {}"
      @regenerate="requestChironAi"
    />
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.layout {
  display: grid;
  grid-template-columns:
    minmax(520px, 1.7fr) minmax(240px, 0.75fr) minmax(240px, 0.75fr);
  gap: var(--sp-3);
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: 8px var(--sp-4) 64px;
  box-sizing: border-box;
  align-items: start;
}

.chiron-meta {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  flex-wrap: wrap;
}

.m-item {
  min-width: 140px;
}

.m-item.grow {
  flex: 1;
  min-width: 220px;
}

.col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.chart-card {
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.chart-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.tog {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.graph-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}

.graph-wrap :deep(svg) {
  width: 100%;
  max-width: var(--graph-max-width, 780px);
  height: auto;
}

.mobile-planets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
  padding: var(--sp-3);
}

.mobile-ai {
  display: none;
}

.layout.mobile {
  grid-template-columns: 1fr;
  padding: var(--sp-3) var(--sp-3) 64px;
}

.layout.mobile .mobile-ai {
  display: inline-block;
}
</style>
