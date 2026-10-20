<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
  disabled?: boolean
  /** 紧凑样式（用于工具栏） */
  compact?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function toggle(current: boolean) {
  emit('update:modelValue', !current)
}
</script>

<template>
  <label class="hd-toggle" :class="{ disabled, compact }">
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      class="track"
      :class="{ on: modelValue }"
      @click="toggle(modelValue)"
    >
      <span class="dot" />
    </button>
    <span class="label">{{ label }}</span>
  </label>
</template>

<style scoped>
.hd-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  cursor: pointer;
  user-select: none;
}

.track {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  transition: background-color 140ms ease;
  flex: none;
}

.track.on {
  background: var(--action-primary);
}

.dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 140ms ease;
}

:root[data-theme='dark'] .dot {
  background: #16181d;
}

.track.on .dot {
  transform: translateX(20px);
}

.label {
  font-size: calc(var(--fs-body) * var(--font-scale));
  color: var(--text-primary);
}

.compact .label {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.disabled {
  opacity: 0.45;
  pointer-events: none;
}

.track:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
