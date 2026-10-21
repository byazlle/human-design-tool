<script setup lang="ts">
/**
 * 激活清单：完整盘里直接列出「已激活的通道 / 闸门 / 中心」及其作用，
 * 不需要点开侧栏才能看到；同时支持多选后一次性发起 AI 解读。
 */
import { computed, ref, watch } from 'vue'
import type { BodyGraph, CenterId } from '../../types/hd'
import { CENTER_LABELS } from '../../types/hd'
import { GATE_NAMES } from '../../engine/gateData'
import { CENTER_TEXT, getChannel, getGate } from '../../services/interpretations'

const props = withDefaults(
  defineProps<{
    chart: BodyGraph
    /** 紧凑模式：只显示列表，可选 */
    compact?: boolean
    /** 显示哪些模块（默认全部）；布局拆分时按需传值 */
    sections?: Array<'channels' | 'gates' | 'centers'>
  }>(),
  { compact: false, sections: () => ['channels', 'gates', 'centers'] },
)

const emit = defineEmits<{
  'ai-read': [payload: { gates: number[]; channels: string[]; centers: CenterId[]; offline: string; title: string }]
  'gate-click': [gate: number]
  'channel-click': [key: string]
  'center-click': [id: CenterId]
}>()

const selectedGates = ref<number[]>([])
const selectedChannels = ref<string[]>([])
const selectedCenters = ref<CenterId[]>([])
const expandedChannel = ref<string | null>(null)

/** 通道按「已定义」优先排序，便于一眼看到重点 */
const channels = computed(() => {
  return props.chart.channels
    .map((c) => {
      const text = getChannel(c.key)
      // title 形如「通道 1-8 · 洞见（Insight）」，这里只保留名称部分
      const name = text.title.split(' · ').slice(1).join(' · ') || c.key
      return {
        key: c.key,
        name,
        effect: text.text,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }))
})

const gates = computed(() =>
  [...props.chart.gates]
    .map((g) => ({
      gate: g.gate,
      name: GATE_NAMES[g.gate]?.zh ?? '',
      keyword: getGate(g.gate).keyword,
      text: getGate(g.gate).text,
    }))
    .sort((a, b) => a.gate - b.gate),
)

const SHORT_CENTER: Record<CenterId, string> = {
  head: '头顶',
  ajna: '眉心',
  throat: '喉咙',
  g: 'G',
  heart: '心',
  spleen: '脾',
  sacral: '骶骨',
  solar: '情绪',
  root: '根',
}

const centers = computed(() =>
  props.chart.centers.map((c) => ({
    id: c.id,
    label: SHORT_CENTER[c.id],
    full: CENTER_LABELS[c.id],
    defined: c.defined,
    text: c.defined ? CENTER_TEXT[c.id].defined : CENTER_TEXT[c.id].open,
  })),
)

const total = computed(
  () => selectedGates.value.length + selectedChannels.value.length + selectedCenters.value.length,
)

function toggleGate(gate: number) {
  selectedGates.value = selectedGates.value.includes(gate)
    ? selectedGates.value.filter((g) => g !== gate)
    : [...selectedGates.value, gate]
}

function toggleChannel(key: string) {
  selectedChannels.value = selectedChannels.value.includes(key)
    ? selectedChannels.value.filter((k) => k !== key)
    : [...selectedChannels.value, key]
}

function toggleCenter(id: CenterId) {
  selectedCenters.value = selectedCenters.value.includes(id)
    ? selectedCenters.value.filter((c) => c !== id)
    : [...selectedCenters.value, id]
}

function clearAll() {
  selectedGates.value = []
  selectedChannels.value = []
  selectedCenters.value = []
}

/** 切换档案时清空选择，避免把上一个盘的选择带过来 */
watch(
  () => props.chart,
  () => clearAll(),
)

function buildOffline(): string {
  const parts: string[] = []

  if (selectedChannels.value.length) {
    parts.push('【通道】')
    for (const key of selectedChannels.value) {
      const c = getChannel(key)
      parts.push(`${c.title}：${c.text}`)
    }
  }
  if (selectedGates.value.length) {
    parts.push('【闸门】')
    for (const gate of selectedGates.value) {
      const g = getGate(gate)
      parts.push(`${g.title}（${g.keyword}）：${g.text}`)
    }
  }
  if (selectedCenters.value.length) {
    parts.push('【中心】')
    for (const id of selectedCenters.value) {
      const defined = props.chart.centers.find((c) => c.id === id)?.defined
      const t = CENTER_TEXT[id]
      parts.push(`${CENTER_LABELS[id]}（${defined ? '已定义' : '开放'}）：${defined ? t.defined : t.open}`)
    }
  }
  return parts.join('\n')
}

function buildTitle(): string {
  const bits: string[] = []
  if (selectedChannels.value.length) bits.push(`${selectedChannels.value.length} 条通道`)
  if (selectedGates.value.length) bits.push(`${selectedGates.value.length} 个闸门`)
  if (selectedCenters.value.length) bits.push(`${selectedCenters.value.length} 个中心`)
  return `已选 ${bits.join(' · ')} · AI 解读`
}

function requestAi() {
  if (!total.value) return
  emit('ai-read', {
    gates: [...selectedGates.value].sort((a, b) => a - b),
    channels: [...selectedChannels.value].sort(),
    centers: [...selectedCenters.value],
    offline: buildOffline(),
    title: buildTitle(),
  })
}

function onChannelClick(key: string) {
  emit('channel-click', key)
}
</script>

<template>
  <div class="activation" :class="{ compact }">
    <!-- 已激活通道：直接写出通道与作用 -->
    <section v-if="sections.includes('channels')" class="card block">
      <header class="block-head">
        <div>
          <h3 class="t-title">已激活通道</h3>
          <p class="t-xs">共 {{ channels.length }} 条 · 点击查看详情，勾选后可批量解读</p>
        </div>
      </header>

      <ul v-if="channels.length" class="channel-list">
        <li
          v-for="item in channels"
          :key="item.key"
          class="channel-item"
          :class="{ on: selectedChannels.includes(item.key) }"
        >
          <label class="check" @click.stop>
            <input
              type="checkbox"
              :checked="selectedChannels.includes(item.key)"
              @change="toggleChannel(item.key)"
            />
            <span class="box" aria-hidden="true" />
          </label>

          <button type="button" class="channel-main" @click="expandedChannel = expandedChannel === item.key ? null : item.key">
            <span class="channel-key t-mono">{{ item.key }}</span>
            <span class="channel-name">{{ item.name }}</span>
            <span class="chev" :class="{ on: expandedChannel === item.key }" aria-hidden="true">›</span>
          </button>

          <button type="button" class="detail-btn" @click.stop="onChannelClick(item.key)">
            详情
          </button>

          <p v-if="expandedChannel === item.key" class="channel-effect">{{ item.effect }}</p>
        </li>
      </ul>
      <p v-else class="empty t-sm">这张盘没有形成完整通道（需要通道两端闸门都被激活）。</p>
    </section>

    <!-- 已激活闸门 -->
    <section v-if="sections.includes('gates')" class="card block">
      <header class="block-head">
        <div>
          <h3 class="t-title">已激活闸门</h3>
          <p class="t-xs">共 {{ gates.length }} 个 · 勾选可批量解读</p>
        </div>
      </header>

      <ul class="gate-grid">
        <li v-for="item in gates" :key="item.gate">
          <button
            type="button"
            class="act-gate"
            :class="{ on: selectedGates.includes(item.gate) }"
            :title="`${item.name} · ${item.keyword}`"
            @click="toggleGate(item.gate)"
            @dblclick="emit('gate-click', item.gate)"
          >
            <span class="num t-mono">{{ item.gate }}</span>
            <span class="gname">{{ item.name }}</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- 九中心 -->
    <section v-if="sections.includes('centers')" class="card block">
      <header class="block-head">
        <div>
          <h3 class="t-title">九中心状态</h3>
          <p class="t-xs">
            已定义 {{ centers.filter((c) => c.defined).length }} · 开放
            {{ centers.filter((c) => !c.defined).length }} · 勾选可批量解读
          </p>
        </div>
      </header>

      <ul class="center-grid">
        <li v-for="c in centers" :key="c.id">
          <button
            type="button"
            class="center-chip"
            :class="{ on: selectedCenters.includes(c.id), defined: c.defined }"
            :title="`${c.full}：${c.text}`"
            @click="toggleCenter(c.id)"
            @dblclick="emit('center-click', c.id)"
          >
            <span class="cname">{{ c.label }}</span>
            <span class="state">{{ c.defined ? '定义' : '开放' }}</span>
          </button>
        </li>
      </ul>
    </section>

    <!-- 批量解读工具条 -->
    <Transition name="rise">
      <div v-if="total > 0" class="bulk-bar">
        <span class="count">已选 {{ total }} 项</span>
        <button type="button" class="clear" @click="clearAll">清除</button>
        <button type="button" class="run" @click="requestAi">AI 解读选中内容</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.activation {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-bottom: 8px;
}

.block {
  padding: var(--sp-3);
}

.block-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}

.block-head h3 {
  margin-bottom: 2px;
}

/* 通道列表 */
.channel-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.channel-item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 2px var(--sp-2);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) ease;
}

.channel-item:hover {
  background: rgba(124, 58, 237, 0.06);
}

.channel-item.on {
  background: rgba(124, 58, 237, 0.1);
}

.check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.check input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.box {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  border: 1.5px solid var(--border-strong);
  background: var(--surface);
  transition:
    background var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}

.channel-item.on .box {
  background: var(--owner-shared);
  border-color: var(--owner-shared);
  box-shadow: inset 0 0 0 2px var(--surface);
}

.channel-main {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  text-align: left;
  padding: 4px 0;
}

.channel-key {
  flex: none;
  min-width: 44px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
  color: var(--owner-shared);
}

.channel-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
}

.chev {
  flex: none;
  color: var(--text-muted);
  transition: transform var(--dur-fast) ease;
}
.chev.on {
  transform: rotate(90deg);
}

.detail-btn {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}
.detail-btn:hover {
  border-color: var(--owner-shared);
  color: var(--owner-shared);
}

.channel-effect {
  grid-column: 2 / 4;
  margin: 2px 0 6px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  line-height: 1.65;
  color: var(--text-secondary);
}

.empty {
  color: var(--text-muted);
}

/* 闸门网格 */
.gate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
}

.act-gate {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--glass-bg-soft);
  text-align: left;
  transition:
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease,
    transform var(--dur-fast) var(--ease-out);
}

.act-gate:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
}

.act-gate.on {
  border-color: var(--owner-shared);
  background: rgba(124, 58, 237, 0.12);
}

.act-gate .num {
  flex: none;
  min-width: 22px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 700;
}

.gname {
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 中心 */
.center-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
}

.cname {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.center-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--glass-bg-soft);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
  transition:
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}

.center-chip.defined {
  color: var(--text-primary);
  font-weight: 600;
}

.center-chip.on {
  border-color: var(--owner-shared);
  background: rgba(124, 58, 237, 0.12);
}

.state {
  flex: none;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-muted);
  font-weight: 400;
  white-space: nowrap;
}

/* 批量工具条 */
.bulk-bar {
  position: sticky;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 8px 10px;
  border-radius: var(--radius-pill);
  background: var(--glass-bg-float);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: var(--glass-shadow-float);
}

.count {
  flex: 1;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.clear {
  padding: 6px 10px;
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}
.clear:hover {
  background: rgba(16, 24, 40, 0.06);
}

.run {
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  background: var(--action-primary);
  color: var(--surface);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
}
:root[data-theme='dark'] .run {
  color: #16181d;
}

.rise-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.rise-leave-active {
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}
.rise-enter-from,
.rise-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.compact .block {
  padding: var(--sp-2);
}
</style>
