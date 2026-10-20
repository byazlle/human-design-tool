<script setup lang="ts">
/** 全局工具栏（DESIGN.md §4.1）：固定顶部 56px，左标题/操作，右搜索/设置 */
import IconButton from './IconButton.vue'
import SearchInput from './SearchInput.vue'
import { useSettingsStore } from '../../stores/settings'

withDefaults(
  defineProps<{
    title?: string
    showSearch?: boolean
    searchValue?: string
    backLabel?: string
  }>(),
  { title: '', showSearch: false, searchValue: '', backLabel: '' },
)

const emit = defineEmits<{
  new: []
  settings: []
  help: []
  back: []
  'update:searchValue': [value: string]
}>()

const settings = useSettingsStore()
</script>

<template>
  <header class="toolbar">
    <div class="left">
      <button v-if="backLabel" type="button" class="back" :aria-label="backLabel" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        <span class="back-text">{{ backLabel }}</span>
      </button>
      <h1 v-if="title" class="title ellipsis">{{ title }}</h1>
      <slot name="left" />
    </div>

    <div class="right">
      <div v-if="showSearch" class="search-slot">
        <SearchInput
          :model-value="searchValue"
          @update:model-value="emit('update:searchValue', $event)"
        />
      </div>
      <slot name="right" />
      <IconButton label="新建档案" icon="plus" @click="emit('new')" />
      <IconButton
        :label="settings.isDark ? '切换到浅色' : '切换到深色'"
        :icon="settings.isDark ? 'sun' : 'moon'"
        @click="settings.toggleTheme()"
      />
      <IconButton label="设置" icon="settings" @click="emit('settings')" />
      <IconButton label="使用说明" icon="help" @click="emit('help')" />
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  position: sticky;
  top: 0;
  z-index: var(--z-toolbar);
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 0 var(--sp-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.left {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}

.title {
  font-size: calc(var(--fs-display) * var(--font-scale));
  font-weight: 600;
  white-space: nowrap;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 var(--sp-2) 0 4px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}
.back:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.right {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}

@media (max-width: 768px) {
  .toolbar {
    padding: 0 var(--sp-3);
    height: 52px;
  }
  .search-slot {
    display: none;
  }
  .back-text {
    display: none;
  }
}
</style>
