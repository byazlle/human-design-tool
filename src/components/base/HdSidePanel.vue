<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; width?: number }>(), { width: 360 })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <aside v-if="open" class="side-panel" :style="{ width: `${width}px` }" role="complementary">
    <header class="head">
      <slot name="header" />
      <button type="button" class="close" aria-label="关闭面板" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
    <div class="body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="foot">
      <slot name="footer" />
    </footer>
  </aside>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  flex: none;
  height: 100%;
  background: var(--glass-bg);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border-left: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  z-index: var(--z-panel);
  animation: slide-in 320ms var(--ease-out);
}

@keyframes slide-in {
  from {
    transform: translateX(26px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-bottom: 1px solid var(--border);
}

.close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.close:hover {
  background: rgba(124, 58, 237, 0.1);
  color: var(--text-primary);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-4);
}

.foot {
  border-top: 1px solid var(--border);
  padding: var(--sp-3) var(--sp-4);
}
</style>
