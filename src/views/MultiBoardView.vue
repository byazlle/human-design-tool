<script setup lang="ts">
/** 多盘并排（仅桌面）：auto-fit 多栏，每栏独立收起星体表 / 关盘（DESIGN.md §5.2） */
import { computed, watch } from 'vue'

import { useDrawingEngine } from '../composables/useDrawingEngine'
const engine = useDrawingEngine()
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useBoardStore } from '../stores/board'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import { getChannel, getGate, CENTER_TEXT } from '../services/interpretations'
import { CENTER_LABELS, type CenterId } from '../types/hd'
import AppToolbar from '../components/base/AppToolbar.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import StarList from '../components/chart/StarList.vue'
import BoardMeta from '../components/chart/BoardMeta.vue'
import GateChannelPanel from '../components/panel/GateChannelPanel.vue'
import AiReadingPanel from '../components/panel/AiReadingPanel.vue'
import EmptyState from '../components/base/EmptyState.vue'
import IconButton from '../components/base/IconButton.vue'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const board = useBoardStore()
const ui = useUiStore()
const { isMobile } = useBreakpoint()
const { state: aiState, run: runAi } = useAiReading()

const filter = { showDecimals: true, showColorToneBase: true, sharedOnly: false }

const ids = computed(() => {
  const raw = String(route.query.ids ?? '')
  const list = raw ? raw.split(',').filter(Boolean) : board.openIds
  return list
})

watch(
  ids,
  (list) => {
    board.open(list)
    list.forEach((id) => archiveStore.ensureChart(id))
  },
  { immediate: true },
)

/** 手机不做并排：重定向到单人盘 */
watch(
  isMobile,
  (mobile) => {
    if (mobile && ids.value.length) router.replace(`/archive/${ids.value[0]}`)
  },
  { immediate: true },
)

const columns = computed(() =>
  ids.value
    .map((id) => archiveStore.byId(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a?.chart)),
)

const panelChart = computed(() => {
  const sel = ui.panel
  if (!sel) return columns.value[0]?.chart
  const id = sel.source === 'b' ? columns.value[1]?.id : columns.value[0]?.id
  const archive = columns.value.find((c) => c.id === id) ?? columns.value[0]
  return archive?.chart
})

const offlineText = computed(() => {
  const sel = ui.panel
  if (!sel) return ''
  if (sel.kind === 'gate') {
    const g = getGate(Number(sel.ref))
    return `${g.title}\n\n${g.text}`
  }
  if (sel.kind === 'channel') {
    const c = getChannel(String(sel.ref))
    return `${c.title}\n\n${c.text}`
  }
  const id = String(sel.ref) as CenterId
  const defined = panelChart.value?.centers.find((c) => c.id === id)?.defined
  return `${CENTER_LABELS[id]}\n\n${defined ? CENTER_TEXT[id].defined : CENTER_TEXT[id].open}`
})

async function requestAi() {
  const sel = ui.panel
  if (!sel) return
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
    chart: panelChart.value,
  })
}

function closeOne(id: string) {
  board.closeOne(id)
  const rest = ids.value.filter((x) => x !== id)
  if (rest.length) router.replace(`/boards?ids=${rest.join(',')}`)
  else router.replace('/')
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
</script>

<template>
  <div class="page">
    <AppToolbar title="多盘并排" back-label="档案库" @back="goBack" @new="goNew" @settings="goSettings" @help="ui.notify('每栏是一张独立的盘，互不影响；点右上角可收起星体表或关闭该栏。')" />

    <EmptyState
      v-if="!columns.length"
      title="没有可显示的盘"
      desc="请在档案库中勾选档案后点击「并排打开」。"
      action-label="返回档案库"
      @action="goBack"
    />

    <main v-else class="layout">
      <div class="grid">
        <section v-for="archive in columns" :key="archive.id" class="col card">
          <header class="col-head">
            <div class="grow">
              <h2 class="t-title ellipsis">{{ archive.name }}</h2>
              <p class="t-xs">
                {{ archive.birth.year }}-{{ String(archive.birth.month).padStart(2, '0') }}-{{
                  String(archive.birth.day).padStart(2, '0')
                }}
                · {{ archive.location.place }}
              </p>
            </div>
            <IconButton
              :label="board.starListCollapsed[archive.id] ? '展开星体表' : '收起星体表'"
              :icon="board.starListCollapsed[archive.id] ? 'chevron-down' : 'chevron-up'"
              size="sm"
              @click="board.toggleStarList(archive.id)"
            />
            <IconButton label="关闭该盘" icon="close" size="sm" @click="closeOne(archive.id)" />
          </header>

          <div class="graph">
            <HumanDesignBodyGraph :engine="engine"
              v-if="archive.chart"
              :chart="archive.chart"
              mode="single"
              :filter="filter"
              @gate-click="ui.openGate($event, 'single')"
              @channel-click="ui.openChannel($event, 'single')"
              @center-click="ui.openCenter($event, 'single')"
            />
          </div>

          <StarList
            v-if="archive.chart && !board.starListCollapsed[archive.id]"
            :personality="archive.chart.personality"
            :design="archive.chart.design"
            :filter="filter"
            compact
          />
          <div v-if="archive.chart" class="meta">
            <BoardMeta :chart="archive.chart" dense />
          </div>
        </section>
      </div>

      <GateChannelPanel
        :selection="ui.panel"
        :open="Boolean(ui.panel)"
        :mobile="false"
        :chart="panelChart"
        :ai-loading="aiState.loading"
        @close="ui.closePanel()"
        @request-ai="requestAi"
        @open-channel="ui.openChannel($event, 'single')"
      />
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
      @regenerate="requestAi"
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
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: var(--sp-4);
  gap: var(--sp-4);
  align-items: flex-start;
}

.grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--sp-4);
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.col-head {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
}

.graph {
  padding: var(--sp-2) var(--sp-3);
}

.graph :deep(svg) {
  max-height: 560px;
  width: 100%;
}

.meta {
  padding: var(--sp-3);
  border-top: 1px solid var(--border);
}
</style>
