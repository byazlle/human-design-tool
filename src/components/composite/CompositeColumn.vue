<script setup lang="ts">
/** 合盘单列：A 盘 / B 盘 / 合并盘（DESIGN.md §6.10） */
import type { BodyGraph, Ownership, UiFilter } from '../../types/hd'
import { TYPE_LABELS } from '../../types/hd'
import HumanDesignBodyGraph from '../chart/HumanDesignBodyGraph.vue'
import { CHANNEL_BY_KEY } from '../../engine/gateData'

const props = defineProps<{
  role: 'a' | 'b' | 'merged'
  chart: BodyGraph
  name: string
  gateOwners: Record<number, Ownership>
  channelOwners: Record<string, Ownership>
  filter: UiFilter
  sharedChannels?: string[]
}>()

const emit = defineEmits<{
  'gate-click': [gate: number]
  'channel-click': [key: string]
}>()

const roleLabel = { a: 'A 盘', b: 'B 盘', merged: '合盘' } as const

function titleOf(key: string) {
  const def = CHANNEL_BY_KEY[key]
  return def ? `${key} ${def.nameZh}` : key
}
</script>

<template>
  <section class="col">
    <header class="head">
      <div class="badge" :class="`b-${role}`">{{ roleLabel[role] }}</div>
      <div class="grow">
        <h2 class="t-title ellipsis">{{ name }}</h2>
        <p class="t-sm">
          <template v-if="role === 'merged'">
            合并后：{{ TYPE_LABELS[chart.type] }} · {{ chart.centers.filter((c) => c.defined).length }}
            中心有定义
          </template>
          <template v-else>{{ TYPE_LABELS[chart.type] }} · {{ chart.profile }}</template>
        </p>
      </div>
    </header>

    <div class="graph">
      <HumanDesignBodyGraph
        :chart="chart"
        mode="composite"
        :gate-owners="gateOwners"
        :channel-owners="channelOwners"
        :filter="filter"
        @gate-click="emit('gate-click', $event)"
        @channel-click="emit('channel-click', $event)"
      />
    </div>

    <div v-if="role === 'merged'" class="shared">
      <p class="t-xs">
        共享通道 {{ sharedChannels?.length ?? 0 }} 条 · 仅看共享通道时以此为准
      </p>
      <ul class="chips">
        <li v-for="key in sharedChannels" :key="key">
          <button type="button" class="chip" @click="emit('channel-click', key)">
            {{ titleOf(key) }}
          </button>
        </li>
        <li v-if="!sharedChannels?.length" class="t-sm t-muted">两盘没有共同点亮的通道</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
}

.badge {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 600;
  color: #fff;
}
.b-a {
  background: var(--owner-a);
}
.b-b {
  background: var(--owner-b);
}
.b-merged {
  background: var(--owner-shared);
}

.graph {
  flex: 1;
  overflow: auto;
  padding: var(--sp-2) var(--sp-3);
}

.graph :deep(svg) {
  max-height: 640px;
  width: 100%;
  margin: 0 auto;
}

.shared {
  border-top: 1px solid var(--border);
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.chip {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--owner-shared);
  color: var(--owner-shared);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
</style>
