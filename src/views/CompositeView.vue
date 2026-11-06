<script setup lang="ts">
/**
 * 合盘页（核心）：桌面三栏 A|B|合盘 同屏；手机只显合盘总图 + A/B 切换。
 * 「仅看共享通道」是渲染过滤，不会修改原始数据（DESIGN.md §7）。
 */
import { computed, ref, watch } from 'vue'

import { useDrawingEngine } from '../composables/useDrawingEngine'
const engine = useDrawingEngine()
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useCompositeStore } from '../stores/board'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import { copyAiResult, saveAiResult } from '../composables/useAiResultActions'
import {
  COMPOSITE_DIMENSIONS,
  customDimension,
  type CompositeDimension,
} from '../services/compositeDimensions'
import { composite, mergedAsChart } from '../engine/composite'
import { relationshipTheme } from '../services/relationshipTheme'
import { getChannel, getGate, CENTER_TEXT } from '../services/interpretations'
import { CHANNEL_BY_KEY } from '../engine/gateData'
import { CENTER_LABELS, type CenterId, type Ownership } from '../types/hd'
import AppToolbar from '../components/base/AppToolbar.vue'
import CompositeColumn from '../components/composite/CompositeColumn.vue'
import CompositeToolbar from '../components/composite/CompositeToolbar.vue'
import RelationshipChannels from '../components/composite/RelationshipChannels.vue'
import CompositePlanets from '../components/composite/CompositePlanets.vue'
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
const {
  state: aiState,
  run: runAi,
  retry: retryAi,
  abort: abortAi,
  configured: aiConfigured,
} = useAiReading()

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

/** 前置条件：必须是两位不同的人。手改 URL 为 /composite/X/X 时在此拦截。 */
const invalidPair = computed(() => !aId.value || !bId.value || aId.value === bId.value)

watch(
  [aId, bId],
  ([a, b]) => {
    if (a) archiveStore.ensureChart(a)
    if (b) archiveStore.ensureChart(b)
    if (a && b && a !== b) compositeStore.setPair(a, b)
  },
  { immediate: true },
)

const ready = computed(() => Boolean(archiveA.value?.chart && archiveB.value?.chart))

const result = computed(() => {
  if (invalidPair.value) return null
  const a = archiveA.value?.chart
  const b = archiveB.value?.chart
  if (!a || !b) return null
  // 规范 §3.8：同一 Archive.id 视为同一人（副本/重算后对象不同但 id 相同）
  return composite(a, b, { aId: aId.value, bId: bId.value })
})

/** 关系主题：离线结论，不依赖 AI */
const theme = computed(() => (result.value ? relationshipTheme(result.value) : []))

/** 四象限分组（渲染用） */
const quadrants = computed(() => {
  const r = result.value
  if (!r) return []
  const groups: Array<{ key: string; label: string; hint: string; items: string[] }> = [
    { key: 'both', label: '双方都定义', hint: '各自稳定，也各有主见', items: [] },
    { key: 'onlyA', label: '仅 A 定义', hint: 'B 在此更易受 A 影响', items: [] },
    { key: 'onlyB', label: '仅 B 定义', hint: 'A 在此更易受 B 影响', items: [] },
    { key: 'open', label: '双方都开放', hint: '一起放大，也一起失焦', items: [] },
  ]
  for (const c of r.centerQuadrant) {
    const g = groups.find((x) => x.key === c.state)
    if (g) g.items.push(CENTER_LABELS[c.id])
  }
  return groups
})

const mergedChart = computed(() => (result.value ? mergedAsChart(result.value) : null))
const filters = computed(() => compositeStore.filters)

/**
 * 合盘的 AI 事实摘要：规范 §3.8 只允许
 * 中心四象限 / 共享·独有闸门通道数 / 四类关系通道计数 / 双方各自 profile。
 * 严禁出现合图类型、权威、定义型、轮回交叉。
 */
const compositeSummary = computed(() => {
  const r = result.value
  if (!r) return ''
  const quadCount = (state: string) => r.centerQuadrant.filter((c) => c.state === state).length
  const sharedChannelCount = r.sharedChannels.length
  const onlyA = r.merged.channels.filter((c) => c.owners.length === 1 && c.owners[0] === 'a').length
  const onlyB = r.merged.channels.filter((c) => c.owners.length === 1 && c.owners[0] === 'b').length
  const relCount = (type: string) => r.relationshipChannels.filter((c) => c.type === type).length
  return [
    `双方人生角色：A ${r.a.profile} × B ${r.b.profile}`,
    `中心四象限：双方都定义 ${quadCount('both')} · 仅 A 定义 ${quadCount('onlyA')} · 仅 B 定义 ${quadCount('onlyB')} · 双方都开放 ${quadCount('open')}`,
    `通道：共享 ${sharedChannelCount} 条 · A 独有 ${onlyA} 条 · B 独有 ${onlyB} 条`,
    `共享闸门：${r.sharedGates.length} 个`,
    `关系通道：电磁 ${relCount('electromagnetic')} · 同伴 ${relCount('companionship')} · 主导 ${relCount('dominance')} · 妥协 ${relCount('compromise')}`,
  ].join('\n')
})

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
    chartSummary: compositeSummary.value,
    chart: mergedChart.value ?? undefined,
  })
}

async function requestFullAi() {
  if (!result.value || !archiveA.value || !archiveB.value) return
  const r = result.value
  const dim = activeDimension.value

  const REL_LABELS: Record<string, string> = {
    electromagnetic: '电磁通道（互补吸引）',
    companionship: '同伴通道（同频共鸣）',
    dominance: '主导通道（单向输出）',
    compromise: '妥协通道（迁就卡点）',
  }
  const relLines = ['electromagnetic', 'companionship', 'dominance', 'compromise'].map((t) => {
    const list = r.relationshipChannels.filter((c) => c.type === t)
    const items = list
      .map((c) => {
        const def = CHANNEL_BY_KEY[c.key]
        return `${c.key} ${def?.nameZh ?? ''}`
      })
      .join('、')
    return `${REL_LABELS[t]}（${list.length}）：${items || '无'}`
  })

  const quadLines = quadrants.value.map(
    (g) => `${g.label}（${g.items.length}）：${g.items.join('、') || '无'}`,
  )

  const offline = [
    `合盘双方：${archiveA.value.name}（人生角色 ${r.a.profile}） × ${archiveB.value.name}（人生角色 ${r.b.profile}）`,
    '',
    '【中心四象限（关系影响方向）】',
    ...quadLines,
    `合并后共 ${r.merged.centers.filter((c) => c.defined).length} 个中心被定义`,
    '',
    '【口径约束】合盘只讨论影响力方向、共鸣区、共同放大区与四类连接通道；个体层面的结论不进入关系场。',
    '',
    '【四类关系通道】',
    ...relLines,
    '',
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
    chartSummary: compositeSummary.value,
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

function copyAi() {
  void copyAiResult(aiState.value.content)
}

function saveAi() {
  saveAiResult({ title: aiState.value.title, content: aiState.value.content })
}
</script>

<template>
  <div class="page">
    <AppToolbar title="合盘" back-label="档案库" @back="goBack" @new="goNew" @settings="goSettings" @help="ui.notify('蓝 = A 独有，橙 = B 独有，紫 = 双方共享。开启「仅看共享通道」只改变显示，不改变数据。')" />

    <EmptyState
      v-if="invalidPair"
      title="合盘需要两位不同的人"
      desc="当前路径指向的是同一份档案。请返回档案库，勾选两份不同的档案后点击「生成合盘」。"
      action-label="返回档案库"
      @action="goBack"
    />

    <EmptyState
      v-else-if="!ready || !result || !mergedChart"
      title="无法生成合盘"
      desc="需要两份已生成的档案。若其中一份已被删除或重算失败，请返回档案库重新选择两份档案。"
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
            <HumanDesignBodyGraph :engine="engine"
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

        <!-- 合盘结论：关系主题 + 中心四象限
             注意：这里不输出「能量类型 / 内在权威 / 轮回交叉」——
             类型与权威属个体属性，关系场没有类型；交叉由个体四闸门构成。 -->
        <div class="info-grid">
          <section class="card info-card">
            <h3 class="t-title">关系主题</h3>
            <div class="theme-blocks">
              <div v-for="b in theme" :key="b.h" class="theme-block">
                <p class="t-sm theme-h">{{ b.h }}</p>
                <p class="t-sm theme-p">{{ b.p }}</p>
              </div>
            </div>
          </section>

          <section class="card info-card">
            <h3 class="t-title">中心四象限</h3>
            <p class="t-xs muted quad-lead">
              并集只说「合起来定义了哪些」，四象限才说「谁在影响谁」。
            </p>
            <ul class="quad">
              <li v-for="g in quadrants" :key="g.key" class="quad-row">
                <div class="quad-head">
                  <span class="quad-label">{{ g.label }}</span>
                  <span class="t-xs muted">{{ g.hint }}</span>
                </div>
                <p class="t-sm">{{ g.items.length ? g.items.join('、') : '—' }}</p>
              </li>
            </ul>
          </section>

          <section class="card info-card">
            <h3 class="t-title">关系通道动力学</h3>
            <RelationshipChannels
              :channels="result.relationshipChannels"
              :name-a="archiveA?.name ?? 'A'"
              :name-b="archiveB?.name ?? 'B'"
              @channel-click="ui.openChannel($event, 'merged')"
            />
          </section>

          <section class="card info-card">
            <h3 class="t-title">行星落点（闸门.爻）</h3>
            <CompositePlanets
              :chart-a="result.a"
              :chart-b="result.b"
              :name-a="archiveA?.name ?? 'A'"
              :name-b="archiveB?.name ?? 'B'"
            />
          </section>
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
      :configured="aiConfigured"
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

/* 合图扩容信息卡 */
.info-grid {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.4fr;
  gap: var(--sp-3);
  align-items: start;
}

.info-card {
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}

.cp-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
}

.cp-facts dt {
  margin-bottom: 2px;
  color: var(--keyword-color, var(--text-muted));
  font-weight: 600;
}

.cp-facts dd {
  margin: 0;
}

.cp-facts .small {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.chip {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  border: 1px solid var(--border);
}

.chip.on {
  background: var(--hd-center-defined);
  border-color: var(--hd-center-defined);
  color: var(--center-defined-color, #ffffff);
  font-weight: var(--center-defined-weight, 700);
}

.chip.off {
  color: var(--center-open-color, var(--text-muted));
  font-weight: var(--center-open-weight, 400);
  border-style: dashed;
}

@media (max-width: 1080px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
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

/* ── 关系主题 ── */
.theme-blocks {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}
.theme-block {
  padding-left: var(--sp-3);
  border-left: 2px solid var(--border);
}
.theme-h {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.theme-p {
  color: var(--text-secondary);
  line-height: 1.65;
}

/* ── 中心四象限 ── */
.quad-lead {
  margin: var(--sp-1) 0 var(--sp-2);
}
.quad {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.quad-row {
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
.quad-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: 2px;
}
.quad-label {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
}
</style>
