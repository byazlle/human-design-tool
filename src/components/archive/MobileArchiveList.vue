<script setup lang="ts">
/** 手机档案列表：竖向行 + 勾选 + 选中 2 份可生成合盘（DESIGN.md §8） */
import type { Archive } from '../../types/hd'
import { TYPE_LABELS } from '../../types/hd'
import HumanDesignBodyGraph from '../chart/HumanDesignBodyGraph.vue'

defineProps<{ archives: Archive[]; selectedIds: string[] }>()

const emit = defineEmits<{
  open: [id: string]
  remove: [id: string]
  'toggle-select': [id: string]
}>()
</script>

<template>
  <ul class="list">
    <li v-for="archive in archives" :key="archive.id" class="row">
      <button
        type="button"
        class="check"
        :class="{ on: selectedIds.includes(archive.id) }"
        :aria-pressed="selectedIds.includes(archive.id)"
        :aria-label="selectedIds.includes(archive.id) ? '取消选择' : '选择该档案'"
        @click.stop="emit('toggle-select', archive.id)"
      >
        <svg v-if="selectedIds.includes(archive.id)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </button>

      <button type="button" class="main" @click="emit('open', archive.id)">
        <span class="thumb">
          <HumanDesignBodyGraph
            v-if="archive.chart"
            :chart="archive.chart"
            mode="single"
            compact
            :interactive="false"
          />
        </span>
        <span class="info">
          <span class="name ellipsis">{{ archive.name }}</span>
          <span class="t-sm ellipsis">
            <template v-if="archive.chart">
              {{ TYPE_LABELS[archive.chart.type] }} · {{ archive.chart.profile }}
            </template>
            <span v-else-if="archive.chartError" class="fail-badge" :title="archive.chartError">
              重算失败
            </span>
            <template v-else>未生成</template>
          </span>
          <span class="t-xs t-mono">
            {{ archive.birth.year }}-{{ String(archive.birth.month).padStart(2, '0') }}-{{
              String(archive.birth.day).padStart(2, '0')
            }}
            {{ String(archive.birth.hour).padStart(2, '0') }}:{{
              String(archive.birth.minute).padStart(2, '0')
            }}
          </span>
        </span>
      </button>

      <button
        type="button"
        class="remove"
        aria-label="删除该档案"
        title="删除该档案"
        @click.stop="emit('remove', archive.id)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
        </svg>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-2);
}

.check {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--surface);
}

.check.on {
  background: var(--action-primary);
  border-color: var(--action-primary);
  color: var(--surface);
}
:root[data-theme='dark'] .check.on {
  color: #16181d;
}

.main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
  text-align: left;
}

.thumb {
  flex: none;
  width: 54px;
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  overflow: hidden;
  padding: 2px;
}

.thumb :deep(svg) {
  height: 100%;
  width: auto;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: calc(var(--fs-body) * var(--font-scale));
  font-weight: 600;
}

/* 重算失败角标（U-15） */
.fail-badge {
  display: inline-block;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--status-error);
  color: #fff;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  line-height: 1.6;
}

.remove {
  flex: none;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  color: var(--status-error);
}

.remove:hover {
  border-color: var(--status-error);
  background: var(--surface-2);
}
</style>
