<script setup lang="ts">
/**
 * 星体数据表：度数 + 闸门/爻/色-调-基。
 * 每一行都解释「这个数据代表什么」——点击行展开该星体的能量主题，
 * 避免只给数字、不给含义。
 */
import { computed, ref } from 'vue'
import type { Planet, StarPosition, UiFilter } from '../../types/hd'
import { CENTER_LABELS, PLANET_LABELS } from '../../types/hd'
import { PLANET_TEXT } from '../../services/planetText'
import { GATE_CENTER } from '../../engine/gateData'

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
const expanded = ref<Planet | null>(null)

const rows = computed(() => (tab.value === 'personality' ? props.personality : props.design))

function degreeText(v: number): string {
  return props.filter.showDecimals ? `${v.toFixed(2)}°` : `${Math.round(v)}°`
}

function toggle(planet: Planet) {
  expanded.value = expanded.value === planet ? null : planet
}

function meaningOf(planet: Planet) {
  return PLANET_TEXT[planet]
}

/** 该闸门所属中心（说明里给出落点语境） */
function gateCenterLabel(gate: number): string {
  const id = GATE_CENTER[gate]
  return id ? CENTER_LABELS[id] : '—'
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

    <p v-if="open" class="hint t-xs">
      {{ tab === 'personality' ? '意识层面：你清楚知道的自己' : '无意识层面：身体自然散发、常被旁人先看见的部分' }}
      · 点击任意一行查看该星体的含义
    </p>

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
          <template v-for="row in rows" :key="row.planet">
            <tr
              class="row"
              :class="{ opened: expanded === row.planet }"
              @click="toggle(row.planet)"
            >
              <td class="planet-cell">
                <span class="chev" :class="{ on: expanded === row.planet }" aria-hidden="true">›</span>
                {{ PLANET_LABELS[row.planet] }}
              </td>
              <td class="num">{{ degreeText(row.longitude) }}</td>
              <td class="num">
                <button
                  type="button"
                  class="gate-chip"
                  @click.stop="emit('gate-click', row.gate)"
                >
                  {{ row.gate }}
                </button>
              </td>
              <td class="num">{{ row.line }}</td>
              <td v-if="filter.showColorToneBase" class="num code">
                {{ row.color }}/{{ row.tone }}/{{ row.base }}
              </td>
            </tr>
            <tr v-if="expanded === row.planet" class="detail-row">
              <td :colspan="filter.showColorToneBase ? 5 : 4">
                <p class="detail-theme">{{ meaningOf(row.planet).theme }}</p>
                <p class="detail-text">
                  <strong>意识面</strong>：{{ meaningOf(row.planet).conscious }}
                </p>
                <p class="detail-text">
                  <strong>无意识面</strong>：{{ meaningOf(row.planet).unconscious }}
                </p>
                <p class="detail-meta t-xs">
                  当前落点：闸门 {{ row.gate }} · 第 {{ row.line }} 爻 · 中心
                  {{ gateCenterLabel(row.gate) }}
                </p>
              </td>
            </tr>
          </template>
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

.hint {
  padding: 0 var(--sp-2) var(--sp-2);
  color: var(--text-muted);
  line-height: 1.5;
}

.tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.tabs button {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 500;
  color: var(--text-secondary);
}

.tabs button.active {
  background: var(--glass-bg-float);
  color: var(--text-primary);
  box-shadow: 0 2px 8px -4px rgba(16, 24, 40, 0.35);
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
  max-height: 340px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.table-wrap.compact {
  max-height: 220px;
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

.row {
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}
.row:hover {
  background: rgba(124, 58, 237, 0.06);
}
.row.opened {
  background: rgba(124, 58, 237, 0.08);
}

.planet-cell {
  padding-left: var(--sp-3);
}

.chev {
  display: inline-block;
  width: 10px;
  margin-right: 2px;
  color: var(--text-muted);
  transition: transform var(--dur-fast) ease;
}
.chev.on {
  transform: rotate(90deg);
  color: var(--owner-shared);
}

/* 说明行：不参与 hover 高亮，作为附属信息 */
.detail-row td {
  height: auto;
  padding: var(--sp-2) var(--sp-3) var(--sp-3) calc(var(--sp-3) + 12px);
  white-space: normal;
  background: rgba(124, 58, 237, 0.05);
  border-bottom: 1px solid var(--border);
  line-height: 1.6;
}

.detail-theme {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.detail-text {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.detail-meta {
  margin-top: 4px;
  color: var(--text-muted);
  font-family: var(--font-mono);
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
