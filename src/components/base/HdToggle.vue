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
  background: rgba(88, 100, 122, 0.4);
  border: 1px solid transparent;
  box-shadow: inset 0 1px 3px rgba(16, 24, 40, 0.22);
  transition:
    background-color var(--dur-base) ease,
    box-shadow var(--dur-base) var(--ease-out);
  flex: none;
}

.track.on {
  background: var(--action-primary);
  box-shadow: 0 2px 10px -4px rgba(16, 24, 40, 0.6);
  border-color: transparent;
}

.dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 260ms var(--ease-spring);
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
