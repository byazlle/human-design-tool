<script setup lang="ts">
/**
 * 双完整盘对比视图：左右并排展示两份完整盘（手机端上下堆叠）。
 * 数据与单盘完全一致，仅布局不同；闸门/通道/中心点击释义复用同一套弹层。
 */
import { computed, ref, watch } from 'vue'

import { useDrawingEngine } from '../composables/useDrawingEngine'
const engine = useDrawingEngine()
import { useRoute, useRouter } from 'vue-router'
import AppToolbar from '../components/base/AppToolbar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import HdButton from '../components/base/HdButton.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import { useArchiveStore } from '../stores/archive'
import { useUiStore } from '../stores/ui'
import { TYPE_LABELS, AUTHORITY_LABELS } from '../types/hd'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()

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

function goBack() {
  router.push('/')
}
function goSettings() {
  router.push('/settings')
}
</script>

<template>
  <div class="page">
    <AppToolbar
      title="双盘对比"
      back-label="档案库"
      @back="goBack"
      @new="router.push('/new')"
      @settings="goSettings"
      @help="ui.notify('左右两列各选一份档案，即可并排对比两份完整盘；点击闸门可查看释义。')"
    />

    <EmptyState
      v-if="all.length < 2"
      title="档案不足"
      desc="双盘对比至少需要两份档案，请先新建或载入示例档案。"
      action-label="返回档案库"
      @action="goBack"
    />

    <main v-else class="compare-layout">
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
      </section>
    </main>
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
