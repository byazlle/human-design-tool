<script setup lang="ts">
/** 单人盘页：桌面并排信息 + 右侧详情面板；手机折叠 + 底部抽屉（DESIGN.md §5.2 / §8） */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import { getChannel, getGate } from '../services/interpretations'
import { CENTER_LABELS, type CenterId } from '../types/hd'
import AppToolbar from '../components/base/AppToolbar.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import StarList from '../components/chart/StarList.vue'
import BoardMeta from '../components/chart/BoardMeta.vue'
import ActivationPanels from '../components/chart/ActivationPanels.vue'
import GateChannelPanel from '../components/panel/GateChannelPanel.vue'
import AiReadingPanel from '../components/panel/AiReadingPanel.vue'
import HdButton from '../components/base/HdButton.vue'
import EmptyState from '../components/base/EmptyState.vue'
import IconButton from '../components/base/IconButton.vue'
import HdToggle from '../components/base/HdToggle.vue'
import { CENTER_TEXT } from '../services/interpretations'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()
const settings = useSettingsStore()
const { isMobile } = useBreakpoint()
const { state: aiState, run: runAi } = useAiReading()

const id = computed(() => String(route.params.id ?? ''))
const archive = computed(() => archiveStore.byId(id.value))
const chart = computed(() => archive.value?.chart ?? null)

watch(
  id,
  (value) => {
    if (value) archiveStore.ensureChart(value)
  },
  { immediate: true },
)

const filter = ref({ showDecimals: true, showColorToneBase: true, sharedOnly: false })
const panelOpen = computed(() => Boolean(ui.panel))

const offlineText = computed(() => {
  const sel = ui.panel
  if (!sel) return ''
  if (sel.kind === 'gate') return `${getGate(Number(sel.ref)).title}\n\n${getGate(Number(sel.ref)).text}`
  if (sel.kind === 'channel') return `${getChannel(String(sel.ref)).title}\n\n${getChannel(String(sel.ref)).text}`
  const id = String(sel.ref) as CenterId
  const text = CENTER_TEXT[id]
  const defined = chart.value?.centers.find((c) => c.id === id)?.defined
  return `${CENTER_LABELS[id]}\n\n${defined ? text.defined : text.open}`
})

async function requestAiForSelection() {
  const sel = ui.panel
  if (!sel || !chart.value) return
  const title =
    sel.kind === 'gate'
      ? getGate(Number(sel.ref)).title
      : sel.kind === 'channel'
        ? getChannel(String(sel.ref)).title
        : CENTER_LABELS[String(sel.ref) as CenterId]
  await runAi({
    scope: sel.kind,
    ref: String(sel.ref),
    title: `${title} · AI 深度解读`,
    offline: offlineText.value,
    chart: chart.value,
  })
}

interface BulkPayload {
  gates: number[]
  channels: string[]
  centers: CenterId[]
  offline: string
  title: string
}

/** 选中多个闸门/通道/中心后一次性解读：缓存键由选择内容决定，选择相同即复用 */
async function onBulkAi(payload: BulkPayload) {
  if (!chart.value) return
  const ref = [
    ...payload.channels,
    ...payload.gates.map((g) => `g${g}`),
    ...payload.centers.map((c) => `c-${c}`),
  ].join('|')
  await runAi({
    scope: 'selection',
    ref,
    title: `${archive.value?.name ?? ''} · ${payload.title}`,
    offline: payload.offline,
    chart: chart.value,
  })
}

async function requestFullReading() {
  if (!chart.value || !archive.value) return
  await runAi({
    scope: 'single',
    title: `${archive.value.name} · 全盘 AI 解读`,
    offline: [
      `类型：${chart.value.type}`,
      `人生角色：${chart.value.profile}`,
      `内在权威：${chart.value.authority}`,
      `定义：${chart.value.definition}`,
      `轮回交叉：${chart.value.incarnationCross}`,
      `已定义通道：${chart.value.channels.map((c) => c.key).join('、') || '无'}`,
      `激活闸门：${chart.value.gates.map((g) => g.gate).join('、')}`,
    ].join('\n'),
    chart: chart.value,
  })
}

async function copyAi() {
  try {
    await navigator.clipboard.writeText(aiState.value.content)
    ui.notify('已复制', 'success')
  } catch {
    ui.notify('复制失败，请手动选择文本', 'error')
  }
}

function saveAi() {
  try {
    const key = 'hdt.ai.history.v1'
    const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
    list.unshift({
      title: aiState.value.title,
      content: aiState.value.content,
      at: new Date().toISOString(),
    })
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)))
    ui.notify('已保存到本地记录', 'success')
  } catch {
    ui.notify('保存失败', 'error')
  }
}

function goBack() {
  router.push('/')
}
function goNew() {
  router.push('/new')
}
function goSettings() {
  router.push('/settings')
}

const starListOpen = ref(false)
</script>

<template>
  <div class="page">
    <AppToolbar
      :title="archive?.name ?? '未找到'"
      back-label="档案库"
      @back="goBack"
      @new="goNew"
      @settings="goSettings"
      @help="ui.notify('点击人体图上的闸门或通道圆点，即可查看离线释义；右侧面板底部可按需调用 AI。')"
    >
      <template #right>
        <HdButton size="sm" :loading="aiState.loading" @click="requestFullReading">
          全盘 AI 解读
        </HdButton>
      </template>
    </AppToolbar>

    <EmptyState
      v-if="!archive || !chart"
      title="没有找到这份档案"
      desc="它可能已被删除，或链接不完整。"
      action-label="返回档案库"
      @action="goBack"
    />

    <main v-else class="layout" :class="{ mobile: isMobile }">
      <div class="main-col">
        <section class="card chart-card">
          <header class="chart-head">
            <div class="grow">
              <p class="t-xs">
                {{ archive.birth.year }}-{{ String(archive.birth.month).padStart(2, '0') }}-{{
                  String(archive.birth.day).padStart(2, '0')
                }}
                {{ String(archive.birth.hour).padStart(2, '0') }}:{{
                  String(archive.birth.minute).padStart(2, '0')
                }}
                · {{ archive.timezone }} · {{ archive.location.place }}
              </p>
            </div>
            <div class="toggles">
              <HdToggle
                compact
                label="小度数"
                :model-value="filter.showDecimals"
                @update:model-value="filter.showDecimals = $event"
              />
              <HdToggle
                compact
                label="色/调/基"
                :model-value="filter.showColorToneBase"
                @update:model-value="filter.showColorToneBase = $event"
              />
            </div>
          </header>

          <div class="graph-wrap">
            <HumanDesignBodyGraph
              :chart="chart"
              mode="single"
              :filter="filter"
              :highlight="{
                gates: ui.panel?.kind === 'gate' ? [Number(ui.panel.ref)] : [],
                channels: ui.panel?.kind === 'channel' ? [String(ui.panel.ref)] : [],
              }"
              @gate-click="ui.openGate($event, 'single')"
              @channel-click="ui.openChannel($event, 'single')"
              @center-click="ui.openCenter($event, 'single')"
            />
          </div>
        </section>

        <!-- 手机：折叠区 -->
        <section v-if="isMobile" class="card fold">
          <button type="button" class="fold-head" @click="starListOpen = !starListOpen">
            <span class="t-title">星体清单 / 盘面信息</span>
            <IconButton :label="starListOpen ? '收起' : '展开'" :icon="starListOpen ? 'chevron-up' : 'chevron-down'" size="sm" />
          </button>
          <div v-if="starListOpen" class="fold-body">
            <BoardMeta :chart="chart" dense />
            <ActivationPanels
              :chart="chart"
              compact
              @ai-read="onBulkAi"
              @gate-click="ui.openGate($event, 'single')"
              @channel-click="ui.openChannel($event, 'single')"
              @center-click="ui.openCenter($event, 'single')"
            />
            <StarList :personality="chart.personality" :design="chart.design" :filter="filter" :collapsible="false" compact />
          </div>
        </section>

        <div v-else class="side-col">
          <section class="card section">
            <BoardMeta :chart="chart" />
          </section>

          <!-- 完整盘直接展示已激活通道 / 闸门 / 中心，支持多选批量解读 -->
          <ActivationPanels
            :chart="chart"
            @ai-read="onBulkAi"
            @gate-click="ui.openGate($event, 'single')"
            @channel-click="ui.openChannel($event, 'single')"
            @center-click="ui.openCenter($event, 'single')"
          />

          <section class="card section">
            <h2 class="t-title">星体数据</h2>
            <StarList :personality="chart.personality" :design="chart.design" :filter="filter" />
          </section>
        </div>
      </div>

      <GateChannelPanel
        v-if="!isMobile"
        :selection="ui.panel"
        :open="panelOpen"
        :mobile="false"
        :chart="chart"
        :ai-loading="aiState.loading"
        @close="ui.closePanel()"
        @request-ai="requestAiForSelection"
        @open-channel="ui.openChannel($event, 'single')"
      />
    </main>

    <!-- 手机：底部固定操作 -->
    <div v-if="isMobile && chart" class="mobile-bar safe-bottom">
      <HdButton block :loading="aiState.loading" @click="requestFullReading">全盘 AI 解读</HdButton>
    </div>

    <GateChannelPanel
      v-if="isMobile"
      :selection="ui.panel"
      :open="panelOpen"
      :mobile="true"
      :chart="chart ?? undefined"
      :ai-loading="aiState.loading"
      @close="ui.closePanel()"
      @request-ai="requestAiForSelection"
      @open-channel="ui.openChannel($event, 'single')"
    />

    <AiReadingPanel
      :open="aiState.open"
      :title="aiState.title"
      :content="aiState.content"
      :loading="aiState.loading"
      :error="aiState.error"
      @close="ui.closeAi()"
      @copy="copyAi"
      @save="saveAi"
      @regenerate="requestFullReading"
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
  flex: 1;
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--sp-4);
  gap: var(--sp-4);
  align-items: flex-start;
}

.layout.mobile {
  padding: var(--sp-3) var(--sp-3) 96px;
}

.layout.mobile .main-col {
  display: flex;
  flex-direction: column;
}

.main-col {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(440px, 1.05fr) minmax(360px, 1fr);
  gap: var(--sp-3);
  align-items: start;
}

.side-col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.chart-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 人体图区域提高玻璃不透明度，保证浅色背景上的对比度 */
  background: var(--glass-bg-strong);
}

.chart-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.toggles {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.graph-wrap {
  display: flex;
  justify-content: center;
  padding: var(--sp-3);
}

.graph-wrap :deep(svg) {
  max-height: 760px;
  width: 100%;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
}

.fold {
  overflow: hidden;
}

.fold-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
}

.fold-body {
  padding: 0 var(--sp-4) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.mobile-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--sp-3);
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: var(--z-toolbar);
}

@media (max-width: 768px) {
  .graph-wrap {
    padding: var(--sp-2);
  }
  .graph-wrap :deep(svg) {
    max-height: none;
  }
}
</style>
