<script setup lang="ts">
/**
 * 合盘页（核心）：桌面三栏 A|B|合盘 同屏；手机只显合盘总图 + A/B 切换。
 * 「仅看共享通道」是渲染过滤，不会修改原始数据（DESIGN.md §7）。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useCompositeStore } from '../stores/board'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import {
  COMPOSITE_DIMENSIONS,
  customDimension,
  type CompositeDimension,
} from '../services/compositeDimensions'
import { composite, mergedAsChart } from '../engine/composite'
import { getChannel, getGate, CENTER_TEXT } from '../services/interpretations'
import { CHANNEL_BY_KEY } from '../engine/gateData'
import { CENTER_LABELS, TYPE_LABELS, type CenterId, type Ownership } from '../types/hd'
import AppToolbar from '../components/base/AppToolbar.vue'
import CompositeColumn from '../components/composite/CompositeColumn.vue'
import CompositeToolbar from '../components/composite/CompositeToolbar.vue'
import GateChannelPanel from '../components/panel/GateChannelPanel.vue'
import AiReadingPanel from '../components/panel/AiReadingPanel.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import HdToggle from '../components/base/HdToggle.vue'
import HdButton from '../components/base/HdButton.vue'
import EmptyState from '../components/base/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const compositeStore = useCompositeStore()
const ui = useUiStore()
const { isMobile } = useBreakpoint()
const { state: aiState, run: runAi } = useAiReading()

const dimensionKey = ref('love')
const customTopic = ref('')

const activeDimension = computed<CompositeDimension>(() => {
  if (dimensionKey.value === 'custom') {
    return customDimension(customTopic.value.trim() || '我想理解的议题')
  }
  return COMPOSITE_DIMENSIONS.find((d) => d.key === dimensionKey.value) ?? COMPOSITE_DIMENSIONS[0]
})

const aId = computed(() => String(route.params.aId ?? ''))
const bId = computed(() => String(route.params.bId ?? ''))
const archiveA = computed(() => archiveStore.byId(aId.value))
const archiveB = computed(() => archiveStore.byId(bId.value))

watch(
  [aId, bId],
  ([a, b]) => {
    if (a) archiveStore.ensureChart(a)
    if (b) archiveStore.ensureChart(b)
    if (a && b) compositeStore.setPair(a, b)
  },
  { immediate: true },
)

const ready = computed(() => Boolean(archiveA.value?.chart && archiveB.value?.chart))

const result = computed(() => {
  const a = archiveA.value?.chart
  const b = archiveB.value?.chart
  if (!a || !b) return null
  return composite(a, b)
})

const mergedChart = computed(() => (result.value ? mergedAsChart(result.value) : null))
const filters = computed(() => compositeStore.filters)

/** 手机端当前 Tab */
const mobileTab = ref<'a' | 'b' | 'merged'>('merged')

/** A/B 列用自身盘，颜色按归属（A 蓝 / B 橙 / 共享紫） */
const ownershipFor = (role: 'a' | 'b' | 'merged') => {
  if (!result.value) return { gateOwners: {}, channelOwners: {} }
  if (role === 'merged') {
    return {
      gateOwners: result.value.gateOwners,
      channelOwners: result.value.channelOwners,
    }
  }
  const gateOwners: Record<number, Ownership> = {}
  const channelOwners: Record<string, Ownership> = {}
  const chart = role === 'a' ? result.value.a : result.value.b
  for (const g of chart.gates) gateOwners[g.gate] = role
  for (const c of chart.channels) channelOwners[c.key] = role
  return { gateOwners, channelOwners }
}

const panelChart = computed(() => {
  const sel = ui.panel
  if (!sel || !result.value) return mergedChart.value ?? undefined
  if (sel.source === 'a') return result.value.a
  if (sel.source === 'b') return result.value.b
  return mergedChart.value ?? undefined
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

async function requestSelectionAi() {
  const sel = ui.panel
  if (!sel) return
  const title =
    sel.kind === 'gate'
      ? getGate(Number(sel.ref)).title
      : sel.kind === 'channel'
        ? getChannel(String(sel.ref)).title
        : CENTER_LABELS[String(sel.ref) as CenterId]
  await runAi({
    scope: `composite-${sel.kind}`,
    ref: String(sel.ref),
    title: `${title} · 合盘视角解读`,
    offline: offlineText.value,
    chart: mergedChart.value ?? undefined,
  })
}

async function requestFullAi() {
  if (!result.value || !archiveA.value || !archiveB.value) return
  const r = result.value
  const dim = activeDimension.value

  const offline = [
    `合盘双方：${archiveA.value.name}（${TYPE_LABELS[r.a.type]} ${r.a.profile}） × ${archiveB.value.name}（${TYPE_LABELS[r.b.type]} ${r.b.profile}）`,
    `合并后类型：${TYPE_LABELS[mergedChart.value?.type ?? r.a.type]}`,
    `共享通道（${r.sharedChannels.length}）：${r.sharedChannels.map((c) => c.key).join('、') || '无'}`,
    `A 独有通道：${r.merged.channels.filter((c) => c.owners.length === 1 && c.owners[0] === 'a').map((c) => c.key).join('、') || '无'}`,
    `B 独有通道：${r.merged.channels.filter((c) => c.owners.length === 1 && c.owners[0] === 'b').map((c) => c.key).join('、') || '无'}`,
    `共享闸门：${r.sharedGates.join('、') || '无'}`,
    '',
    `【解读维度】${dim.label}`,
    `【应用场景】${dim.scene}`,
    `【需要读取的内容】${dim.requires.join('；')}`,
    `【本次重点关注】${dim.focus.join('；')}`,
    `【输出要求】${dim.prompt}`,
  ].join('\n')

  await runAi({
    scope: `composite-${dim.key}`,
    ref: dim.key === 'custom' ? customTopic.value.trim() || 'custom' : dim.key,
    title: `合盘解读 · ${dim.label}`,
    offline,
    chart: mergedChart.value ?? undefined,
  })
}

const mobileChart = computed(() => {
  if (!result.value) return null
  if (mobileTab.value === 'a') return result.value.a
  if (mobileTab.value === 'b') return result.value.b
  return mergedChart.value
})

const mobileOwnership = computed(() => ownershipFor(mobileTab.value))

/** 手机端闸门清单（标注归属） */
const gateList = computed(() => {
  if (!result.value) return []
  return result.value.merged.gates.map((g) => ({
    gate: g.gate,
    owners: g.owners,
    label: g.owners.length === 2 ? '共享' : g.owners[0] === 'a' ? 'A' : 'B',
  }))
})

const visibleGates = computed(() =>
  filters.value.sharedOnly ? gateList.value.filter((g) => g.owners.length === 2) : gateList.value,
)

function setFilter(key: 'showDecimals' | 'showColorToneBase' | 'sharedOnly', value: boolean) {
  compositeStore.setFilter(key, value)
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
    <AppToolbar title="合盘" back-label="档案库" @back="goBack" @new="goNew" @settings="goSettings" @help="ui.notify('蓝 = A 独有，橙 = B 独有，紫 = 双方共享。开启「仅看共享通道」只改变显示，不改变数据。')" />

    <EmptyState
      v-if="!ready || !result || !mergedChart"
      title="无法生成合盘"
      desc="需要两份已生成的档案。请返回档案库，勾选恰好两份后点击「生成合盘」。"
      action-label="返回档案库"
      @action="goBack"
    />

    <template v-else>
      <main class="layout" :class="{ mobile: isMobile }">
        <div class="head-row">
          <CompositeToolbar
            :filters="filters"
            :shared-count="result.sharedChannels.length"
            :ai-loading="aiState.loading"
            :ai-label="`生成「${activeDimension.label}」解读`"
            @update:filter="setFilter"
            @request-ai="requestFullAi"
          />
        </div>

        <!-- 解读维度：同一份数据，换提示词分别生成，不一次性全量请求 -->
        <section class="card dim-bar">
          <header class="dim-head">
            <div>
              <h3 class="t-title">解读维度</h3>
              <p class="t-xs">{{ activeDimension.scene }}</p>
            </div>
          </header>

          <ul class="dim-chips">
            <li v-for="d in COMPOSITE_DIMENSIONS" :key="d.key">
              <button
                type="button"
                class="dim-chip"
                :class="{ on: dimensionKey === d.key }"
                @click="dimensionKey = d.key"
              >
                {{ d.label }}
              </button>
            </li>
            <li>
              <button
                type="button"
                class="dim-chip"
                :class="{ on: dimensionKey === 'custom' }"
                @click="dimensionKey = 'custom'"
              >
                自定义
              </button>
            </li>
          </ul>

          <input
            v-if="dimensionKey === 'custom'"
            v-model="customTopic"
            class="dim-input"
            type="text"
            placeholder="输入想解读的议题，例如：异地相处是否可行 / 适合一起养育孩子吗"
          />

          <p class="t-xs dim-meta">读取内容：{{ activeDimension.requires.join(' · ') }}</p>
          <p class="t-xs dim-meta">
            每个维度独立请求、独立缓存；相同维度重复查看不会重复消耗额度。
          </p>
        </section>

        <!-- 桌面三栏 -->
        <div v-if="!isMobile" class="grid3">
          <CompositeColumn
            role="a"
            :chart="result.a"
            :name="archiveA?.name ?? 'A'"
            :gate-owners="ownershipFor('a').gateOwners"
            :channel-owners="ownershipFor('a').channelOwners"
            :filter="filters"
            @gate-click="ui.openGate($event, 'a')"
            @channel-click="ui.openChannel($event, 'a')"
          />
          <CompositeColumn
            role="b"
            :chart="result.b"
            :name="archiveB?.name ?? 'B'"
            :gate-owners="ownershipFor('b').gateOwners"
            :channel-owners="ownershipFor('b').channelOwners"
            :filter="filters"
            @gate-click="ui.openGate($event, 'b')"
            @channel-click="ui.openChannel($event, 'b')"
          />
          <CompositeColumn
            role="merged"
            :chart="mergedChart"
            :name="`${archiveA?.name ?? 'A'} × ${archiveB?.name ?? 'B'}`"
            :gate-owners="result.gateOwners"
            :channel-owners="result.channelOwners"
            :filter="filters"
            :shared-channels="result.sharedChannels.map((c) => c.key)"
            @gate-click="ui.openGate($event, 'merged')"
            @channel-click="ui.openChannel($event, 'merged')"
          />
        </div>

        <!-- 手机：Tab + 单图 -->
        <div v-else class="mobile-wrap">
          <div class="tabs">
            <button type="button" :class="{ on: mobileTab === 'a' }" @click="mobileTab = 'a'">A 盘</button>
            <button type="button" :class="{ on: mobileTab === 'b' }" @click="mobileTab = 'b'">B 盘</button>
            <button type="button" :class="{ on: mobileTab === 'merged' }" @click="mobileTab = 'merged'">合盘</button>
          </div>

          <HdToggle
            compact
            label="仅展示共享通道"
            :model-value="filters.sharedOnly"
            @update:model-value="setFilter('sharedOnly', $event)"
          />

          <div class="card graph-card">
            <HumanDesignBodyGraph
              v-if="mobileChart"
              :chart="mobileChart"
              mode="composite"
              :gate-owners="mobileOwnership.gateOwners"
              :channel-owners="mobileOwnership.channelOwners"
              :filter="filters"
              @gate-click="ui.openGate($event, mobileTab)"
              @channel-click="ui.openChannel($event, mobileTab)"
            />
          </div>

          <section class="card gate-list">
            <header class="row-between">
              <h2 class="t-title">闸门清单</h2>
              <span class="t-xs t-muted">{{ visibleGates.length }} 个</span>
            </header>
            <ul class="gates">
              <li v-for="item in visibleGates" :key="item.gate">
                <button type="button" class="gate-row" @click="ui.openGate(item.gate, mobileTab)">
                  <span class="t-mono gate-no">{{ item.gate }}</span>
                  <span class="t-sm grow ellipsis">{{ getGate(item.gate).title }}</span>
                  <span class="owner" :class="item.owners.length === 2 ? 'shared' : item.owners[0]">
                    {{ item.label }}
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <div class="mobile-spacer" />
        </div>

        <GateChannelPanel
          v-if="!isMobile"
          :selection="ui.panel"
          :open="Boolean(ui.panel)"
          :mobile="false"
          :chart="panelChart"
          :ai-loading="aiState.loading"
          @close="ui.closePanel()"
          @request-ai="requestSelectionAi"
          @open-channel="ui.openChannel($event, ui.panel?.source ?? 'merged')"
        />
      </main>

      <!-- 手机底部 -->
      <div v-if="isMobile" class="mobile-bar safe-bottom">
        <HdButton block :loading="aiState.loading" @click="requestFullAi">
          生成「{{ activeDimension.label }}」解读
        </HdButton>
      </div>

      <GateChannelPanel
        v-if="isMobile"
        :selection="ui.panel"
        :open="Boolean(ui.panel)"
        :mobile="true"
        :chart="panelChart"
        :ai-loading="aiState.loading"
        @close="ui.closePanel()"
        @request-ai="requestSelectionAi"
        @open-channel="ui.openChannel($event, ui.panel?.source ?? 'merged')"
      />
    </template>

    <AiReadingPanel
      :open="aiState.open"
      :title="aiState.title"
      :content="aiState.content"
      :loading="aiState.loading"
      :error="aiState.error"
      @close="ui.closeAi()"
      @copy="() => {}"
      @save="() => {}"
      @regenerate="requestFullAi"
    />
  </div>
</template>

<style scoped>
.dim-bar {
  width: 100%;
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.dim-head h3 {
  margin-bottom: 2px;
}

.dim-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dim-chip {
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-soft);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
  transition:
    background var(--dur-fast) ease,
    border-color var(--dur-fast) ease,
    color var(--dur-fast) ease,
    transform var(--dur-fast) var(--ease-out);
}

.dim-chip:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}

.dim-chip.on {
  background: rgba(124, 58, 237, 0.14);
  border-color: var(--owner-shared);
  color: var(--text-primary);
  font-weight: 600;
}

.dim-input {
  height: 38px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-soft);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.dim-input:focus {
  outline: 2px solid rgba(124, 58, 237, 0.28);
  outline-offset: 1px;
  border-color: rgba(124, 58, 237, 0.4);
}

.dim-meta {
  color: var(--text-muted);
  line-height: 1.55;
}

.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.layout {
  flex: 1;
  display: flex;
  width: 100%;
  max-width: 1560px;
  margin: 0 auto;
  padding: 0 var(--sp-4) var(--sp-4);
  gap: var(--sp-4);
  align-items: flex-start;
  flex-direction: column;
}

.head-row {
  width: 100%;
}

.grid3 {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--sp-4);
  align-items: start;
}

.mobile-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-bottom: 72px;
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
}

.tabs button {
  flex: 1;
  min-height: 40px;
  border-radius: 8px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.tabs button.on {
  background: var(--glass-bg-float);
  color: var(--text-primary);
  box-shadow: 0 2px 8px -4px rgba(16, 24, 40, 0.4);
}

.graph-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
}

.graph-card :deep(svg) {
  width: 100%;
}

.gate-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
}

.gates {
  display: flex;
  flex-direction: column;
}

.gate-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.gate-row:last-child {
  border-bottom: none;
}

.gate-no {
  width: 28px;
  flex: none;
  color: var(--text-secondary);
}

.owner {
  flex: none;
  min-width: 34px;
  text-align: center;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  border: 1px solid currentColor;
}

.owner.a {
  color: var(--owner-a);
}
.owner.b {
  color: var(--owner-b);
}
.owner.shared {
  color: var(--owner-shared);
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

@media (max-width: 1024px) {
  .grid3 {
    grid-template-columns: 1fr;
  }
}
</style>
