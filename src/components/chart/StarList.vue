<script setup lang="ts">
/** 星体数据表：度数保留两位 + 闸门/爻/color-tone-base 全展示（DESIGN.md §4.6） */
import { computed, ref } from 'vue'
import type { StarPosition, UiFilter } from '../../types/hd'
import { PLANET_LABELS } from '../../types/hd'

const props = withDefaults(
  defineProps<{
    personality: StarPosition[]
    design: StarPosition[]
    filter: UiFilter
    collapsible?: boolean
    defaultOpen?: boolean
    compact?: boolean
  }>(),
  { collapsible: true, defaultOpen: true, compact: false },
)

const emit = defineEmits<{ 'gate-click': [gate: number] }>()

const open = ref(props.defaultOpen)
const tab = ref<'personality' | 'design'>('personality')

const rows = computed(() =>
  tab.value === 'personality' ? props.personality : props.design,
)

function degreeText(v: number): string {
  return props.filter.showDecimals ? `${v.toFixed(2)}°` : `${Math.round(v)}°`
}
</script>

<template>
  <section class="star-list">
    <header class="head">
      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'personality'"
          :class="{ active: tab === 'personality' }"
          @click="tab = 'personality'"
        >
          意识 Personality
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'design'"
          :class="{ active: tab === 'design' }"
          @click="tab = 'design'"
        >
          无意识 Design
        </button>
      </div>
      <button
        v-if="collapsible"
        type="button"
        class="collapse"
        :aria-label="open ? '收起星体表' : '展开星体表'"
        @click="open = !open"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path :d="open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'" />
        </svg>
      </button>
    </header>

    <div v-if="open" class="table-wrap" :class="{ compact }">
      <table>
        <thead>
          <tr>
            <th class="c-planet">星体</th>
            <th class="c-num">度数</th>
            <th class="c-num">闸门</th>
            <th class="c-num">爻</th>
            <th v-if="filter.showColorToneBase" class="c-num">色/调/基</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.planet">
            <td>{{ PLANET_LABELS[row.planet] }}</td>
            <td class="num">{{ degreeText(row.longitude) }}</td>
            <td class="num">
              <button type="button" class="gate-chip" @click="emit('gate-click', row.gate)">
                {{ row.gate }}
              </button>
            </td>
            <td class="num">{{ row.line }}</td>
            <td v-if="filter.showColorToneBase" class="num code">
              {{ row.color }}/{{ row.tone }}/{{ row.base }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.star-list {
  border-top: 1px solid var(--border);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-1);
}

.tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.tabs button {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 500;
  color: var(--text-secondary);
}

.tabs button.active {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: var(--elev-card);
}

.collapse {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.collapse:hover {
  background: var(--surface-2);
}

.table-wrap {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.table-wrap.compact {
  max-height: 200px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

thead th {
  position: sticky;
  top: 0;
  background: var(--surface-2);
  color: var(--text-secondary);
  font-weight: 500;
  text-align: left;
  padding: 6px var(--sp-2);
  border-bottom: 1px solid var(--border);
  z-index: 1;
  white-space: nowrap;
}

td {
  height: 32px;
  padding: 0 var(--sp-2);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

tbody tr:last-child td {
  border-bottom: none;
}

.num {
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.code {
  color: var(--text-secondary);
  letter-spacing: 0;
}

.c-planet {
  padding-left: var(--sp-3);
}
.c-num {
  text-align: right;
}
.c-num:last-child {
  padding-right: var(--sp-3);
}

.gate-chip {
  font-family: var(--font-mono);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  min-width: 26px;
  height: 22px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.gate-chip:hover {
  border-color: var(--border-strong);
}
</style>
