<script setup lang="ts">
/** 档案卡片（自由画布）：缩略人体图 + 类型/角色 + 三个动作（DESIGN.md §4.2） */
import { computed } from 'vue'
import type { Archive } from '../../types/hd'
import { TYPE_LABELS } from '../../types/hd'
import HumanDesignBodyGraph from '../chart/HumanDesignBodyGraph.vue'

const props = defineProps<{
  archive: Archive
  selected: boolean
  active?: boolean
}>()

const emit = defineEmits<{
  open: []
  'add-to-composite': []
  close: []
  'toggle-select': []
  'drag-start': [event: PointerEvent]
}>()

const chart = computed(() => props.archive.chart)
const definedCount = computed(
  () => props.archive.chart?.centers.filter((c) => c.defined).length ?? 0,
)
</script>

<template>
  <article class="card-wrap" :class="{ selected, active }">
    <button
      type="button"
      class="check"
      :aria-pressed="selected"
      :aria-label="selected ? '取消选择' : '选择该档案'"
      @click.stop="emit('toggle-select')"
    >
      <svg v-if="selected" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5 10 17.5 19 7" />
      </svg>
    </button>

    <header class="head" @pointerdown="emit('drag-start', $event)">
      <h3 class="name ellipsis">{{ archive.name }}</h3>
      <p class="t-sm ellipsis">
        <template v-if="chart">{{ TYPE_LABELS[chart.type] }} · {{ chart.profile }}</template>
        <template v-else>未生成</template>
      </p>
      <p class="t-xs date t-mono">
        {{ archive.birth.year }}-{{ String(archive.birth.month).padStart(2, '0') }}-{{
          String(archive.birth.day).padStart(2, '0')
        }}
        {{ String(archive.birth.hour).padStart(2, '0') }}:{{
          String(archive.birth.minute).padStart(2, '0')
        }}
      </p>
    </header>

    <div class="thumb">
      <HumanDesignBodyGraph
        v-if="chart"
        :chart="chart"
        mode="single"
        compact
        :interactive="false"
      />
    </div>

    <footer class="foot">
      <button type="button" class="action primary" @click.stop="emit('open')">展开完整盘</button>
      <button type="button" class="action" @click.stop="emit('add-to-composite')">加入合盘</button>
      <button type="button" class="action close" aria-label="关闭卡片" @click.stop="emit('close')">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.card-wrap {
  position: absolute;
  width: 260px;
  height: 340px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-card);
  overflow: hidden;
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.card-wrap.selected {
  border-color: var(--action-primary);
  box-shadow: 0 0 0 1px var(--action-primary), var(--elev-card);
}

.check {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.card-wrap.selected .check {
  background: var(--action-primary);
  border-color: var(--action-primary);
}
:root[data-theme='dark'] .card-wrap.selected .check {
  color: #16181d;
}

.head {
  padding: var(--sp-3) var(--sp-3) var(--sp-2) 40px;
  cursor: grab;
  touch-action: none;
  border-bottom: 1px solid var(--border);
}
.head:active {
  cursor: grabbing;
}

.name {
  font-size: calc(var(--fs-body) * var(--font-scale));
  font-weight: 600;
}

.date {
  margin-top: 2px;
  color: var(--text-muted);
}

.thumb {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-2);
  overflow: hidden;
}

.thumb :deep(svg) {
  max-height: 100%;
  height: 100%;
  width: auto;
}

.foot {
  display: flex;
  gap: var(--sp-1);
  padding: var(--sp-2);
  border-top: 1px solid var(--border);
}

.action {
  flex: 1;
  min-height: 30px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  white-space: nowrap;
}
.action:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.action.primary {
  background: var(--action-primary);
  border-color: var(--action-primary);
  color: var(--surface);
  flex: 1.4;
}
:root[data-theme='dark'] .action.primary {
  color: #16181d;
}

.action.close {
  flex: 0 0 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
</style>
