<script setup lang="ts">
/** 合盘顶部操作条：三大开关 + 生成整套 AI 爱情解读（DESIGN.md §5.3） */
import type { UiFilter } from '../../types/hd'
import HdToggle from '../base/HdToggle.vue'
import HdButton from '../base/HdButton.vue'

defineProps<{ filters: UiFilter; aiLoading?: boolean; sharedCount: number }>()

const emit = defineEmits<{
  'update:filter': [key: keyof UiFilter, value: boolean]
  'request-ai': []
}>()
</script>

<template>
  <div class="bar">
    <div class="toggles">
      <HdToggle
        compact
        label="显示小度数"
        :model-value="filters.showDecimals"
        @update:model-value="emit('update:filter', 'showDecimals', $event)"
      />
      <HdToggle
        compact
        label="color-tone-base"
        :model-value="filters.showColorToneBase"
        @update:model-value="emit('update:filter', 'showColorToneBase', $event)"
      />
      <HdToggle
        compact
        label="仅看共享通道"
        :model-value="filters.sharedOnly"
        @update:model-value="emit('update:filter', 'sharedOnly', $event)"
      />
    </div>

    <div class="right">
      <span class="t-sm t-muted hint">
        共享通道 {{ sharedCount }} 条{{ filters.sharedOnly ? '（当前仅显示共享）' : '' }}
      </span>
      <HdButton :loading="aiLoading" @click="emit('request-ai')">生成整套合盘 AI 爱情解读</HdButton>
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
  padding: var(--sp-3) 0;
}

.toggles {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  flex-wrap: wrap;
}

.right {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.hint {
  white-space: nowrap;
}
</style>
