<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    disabled?: boolean
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', disabled: false, loading: false, block: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    class="hd-btn"
    :class="[`v-${variant}`, `s-${size}`, { block, loading }]"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.hd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 40px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  font-size: calc(var(--fs-body) * var(--font-scale));
  font-weight: 500;
  white-space: nowrap;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    opacity 120ms ease;
}

.s-sm {
  min-height: 32px;
  padding: 0 var(--sp-3);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.block {
  width: 100%;
}

.v-primary {
  background: var(--action-primary);
  color: var(--surface);
}
:root[data-theme='dark'] .v-primary {
  color: #16181d;
}
.v-primary:hover:not(:disabled) {
  background: var(--action-primary-hover);
}

.v-ghost {
  background: var(--action-ghost-bg);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
}
.v-ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.v-danger {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--action-danger);
}
.v-danger:hover:not(:disabled) {
  border-color: var(--action-danger);
  background: rgba(217, 45, 32, 0.06);
}

.hd-btn:disabled {
  opacity: 0.45;
  pointer-events: none;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .hd-btn {
    min-height: 44px;
  }
  .s-sm {
    min-height: 40px;
  }
}
</style>
