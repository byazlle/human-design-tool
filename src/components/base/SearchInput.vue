<script setup lang="ts">
withDefaults(defineProps<{ modelValue: string; placeholder?: string }>(), {
  placeholder: '按人名搜索档案',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="search">
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <input
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      aria-label="搜索档案"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: 36px;
  padding: 0 var(--sp-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  min-width: 180px;
}

.search:focus-within {
  border-color: var(--border-strong);
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
}

input::-webkit-search-cancel-button {
  cursor: pointer;
}
</style>
