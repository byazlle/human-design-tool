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
  position: relative;
  overflow: hidden;
  transition:
    background-color var(--dur-fast) ease,
    border-color var(--dur-fast) ease,
    box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out),
    opacity var(--dur-fast) ease;
}

.hd-btn:active:not(:disabled) {
  transform: scale(0.97);
}

/* 主按钮的液态高光：悬停时一道斜向反光扫过 */
.v-primary::after {
  content: '';
  position: absolute;
  top: -30%;
  bottom: -30%;
  left: 0;
  width: 42%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
  transform: translateX(-140%) skewX(-16deg);
  pointer-events: none;
}
.v-primary:hover:not(:disabled)::after {
  animation: btn-sheen 720ms var(--ease-out);
}
@keyframes btn-sheen {
  to {
    transform: translateX(360%) skewX(-16deg);
  }
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
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
}
.v-ghost:hover:not(:disabled) {
  background: var(--glass-bg-float);
  box-shadow: 0 6px 18px -10px rgba(16, 24, 40, 0.35);
  transform: translateY(-1px);
}

.v-danger {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--action-danger);
}
.v-danger:hover:not(:disabled) {
  border-color: var(--action-danger);
  background: rgba(217, 45, 32, 0.08);
  transform: translateY(-1px);
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
