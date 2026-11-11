<script setup lang="ts">
/**
 * 凯龙回归图（Chiron Return Chart）：
 * 凯龙周期 49–51 年，人生第三阶段（疗愈 / 传承 / 榜样）的独立周期盘。
 * 规范 §3.9：这是**扩展层**，凯龙不属于标准 13 体；本页只展示回归时刻的结构
 * （行星落点 / 闸门 / 通道 / 九中心 / 人生角色），不展示类型 / 权威 / 轮回交叉等个体结论，
 * 也不替换本命盘。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import { saveAiResult } from '../composables/useAiResultActions'
import { useDrawingEngine } from '../composables/useDrawingEngine'
import { computeChironReturn } from '../services/chironChart'
import AppToolbar from '../components/base/AppToolbar.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import BoardMeta from '../components/chart/BoardMeta.vue'
import ActivationPanels from '../components/chart/ActivationPanels.vue'
import PlanetColumn from '../components/chart/PlanetColumn.vue'
import AiReadingHost from '../components/panel/AiReadingHost.vue'
import HdButton from '../components/base/HdButton.vue'
import EmptyState from '../components/base/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()
const { isMobile } = useBreakpoint()
const {
  state: aiState,
  run: runAi,
} = useAiReading()
const engine = useDrawingEngine()

const id = computed(() => String(route.params.id ?? ''))
const archive = computed(() => archiveStore.byId(id.value))

const result = computed(() => {
  const a = archive.value
  if (!a) return null
  // 计算失败（含非法时区）不应让整页白屏：降级为「无法计算」空态。
  try {
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
  } catch (err) {
    console.warn('[chiron] 凯龙回归计算失败', err)
    return null
  }
})

const filter = ref({ showDecimals: true, showColorToneBase: true, sharedOnly: false })

const returnLocal = computed(() => {
  if (!result.value) return ''
  try {
    const d = new Date(result.value.returnUtc)
    if (!Number.isFinite(d.getTime())) return ''
    // 显示口径不变：仍按本机本地时区展示
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${fmt.format(d)}（本地时区）`
  } catch (err) {
    console.warn('[chiron] 本地时间格式化失败', err)
    return ''
  }
})

/**
 * 凯龙盘的结构摘要（规范 §3.9）：只给回归时刻的结构事实
 * （人生角色 / 中心 / 通道 / 闸门），不输出类型 / 权威 / 轮回交叉等个体结论。
 */
const chironStructureSummary = computed(() => {
  const r = result.value
  if (!r) return ''
  const c = r.chart
  return [
    `回归时刻人生角色：${c.profile}`,
    `已定义中心：${c.centers.filter((x) => x.defined).map((x) => x.id).join('、') || '无'}`,
    `已定义通道：${c.channels.map((x) => x.key).join('、') || '无'}`,
    `激活闸门：${c.gates.map((x) => x.gate).join('、')}`,
  ].join('\n')
})

async function requestChironAi() {
  if (!result.value || !archive.value) return
  const r = result.value
  const offline = [
    `【凯龙回归图背景】凯龙周期约 49–51 年，凯龙回归代表人生第三阶段：疗愈、传承、榜样阶段。`,
    `本命凯龙落点：闸门 ${r.natalChiron.gate}.${r.natalChiron.line}`,
    `凯龙回归时刻：${r.returnUtc}（约 ${r.age} 岁）`,
    `回归时刻盘面事实如下，请围绕「疗愈与传承」主题解读：`,
    `【口径约束】本盘为扩展层，不参与本命的个体气场判定。`,
    chironStructureSummary.value,
  ].join('\n')
  await runAi({
    scope: 'chiron',
    ref: String(r.natalChiron.gate),
    title: `${archive.value.name} · 凯龙回归图解读`,
    offline,
    chartSummary: chironStructureSummary.value,
    chart: r.chart,
  })
}

import { goDerivedBack, derivedBackLabel } from '../utils/navigationSource'
import AiConfigBadge from '../components/base/AiConfigBadge.vue'

function goBack() {
  goDerivedBack(router)
}

function goSettings() {
  router.push('/settings')
}

function saveAi() {
  saveAiResult({
    title: aiState.value.title,
    content: aiState.value.content,
    archiveId: archive.value?.id,
    scope: 'chiron',
    ref: result.value ? String(result.value.natalChiron.gate) : '-',
    mode: aiState.value.resultMode,
    audience: aiState.value.resultAudience,
    truncated: aiState.value.resultTruncated,
  })
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
  <div class="page page-shell">
    <AppToolbar
      :title="`凯龙回归图 · ${archive?.name ?? '未找到'}`"
      :back-label="derivedBackLabel()"
      @back="goBack"
      @new="router.push('/new')"
      @settings="router.push('/settings')"
      @help="ui.notify('凯龙回归图是约 50 岁前后的独立周期盘，代表疗愈 / 传承 / 榜样阶段，不替换本命盘。')"
    >
      <template #right>
        <HdButton size="sm" :loading="aiState.loading" @click="requestChironAi">凯龙图 AI 解读</HdButton>
      </template>
    </AppToolbar>

    <!-- R-4：AI 配置状态标识 + 未配置去设置 -->
    <div class="sk-banner ai-config-row">
      <span class="t-xs t-muted">凯龙回归盘 · 扩展层标注（独立周期盘，不替换本命盘）</span>
      <AiConfigBadge @settings="goSettings" />
    </div>

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

    <main v-else class="layout content-shell" :class="{ mobile: isMobile }">
      <!-- 规范 §3.9：扩展层必须标注，且不展示个体气场结论 -->
      <p class="layer-note" role="note">
        <span class="layer-badge">扩展层</span>
        非 13 体扩展层 · 不参与本命类型 / 权威判定，仅作疗愈 / 传承主题参考
      </p>

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
          <BoardMeta :chart="result.chart" hide-conclusions />
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

    <AiReadingHost :chart-name="archive?.name" @save="saveAi" />
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
  max-width: 840px; /* SK-3：凯龙单列，1500 → 840 */
  margin: 0 auto;
  padding: 8px var(--sp-4) 64px;
  box-sizing: border-box;
  align-items: start;
}

/* 扩展层标注（规范 §3.9） */
.layer-note {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid rgba(217, 119, 6, 0.4);
  background: rgba(217, 119, 6, 0.12);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  line-height: 1.6;
}

.layer-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: rgba(217, 119, 6, 0.85);
  color: #fff;
  font-size: calc(var(--fs-xs) * var(--font-scale));
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
