<script setup lang="ts">
withDefaults(
  defineProps<{ open: boolean; title?: string; maxHeight?: string }>(),
  { title: '', maxHeight: '80vh' },
)
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('close')" />
    </Transition>
    <Transition name="up">
      <section v-if="open" class="drawer" :style="{ maxHeight }" role="dialog" aria-modal="true">
        <div class="grabber" />
        <header class="head">
          <h2 class="t-title">{{ title }}</h2>
          <button type="button" class="close" aria-label="收起" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </header>
        <div class="body safe-bottom">
          <slot />
        </div>
        <div v-if="$slots.footer" class="foot safe-bottom">
          <slot name="footer" />
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(10, 12, 20, 0.28);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  z-index: var(--z-drawer-mask);
}

.drawer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur-strong)) saturate(190%);
  -webkit-backdrop-filter: blur(var(--glass-blur-strong)) saturate(190%);
  border-top: 1px solid var(--glass-border);
  border-radius: 22px 22px 0 0;
  box-shadow: var(--glass-shadow-float);
  z-index: var(--z-drawer);
  padding-top: var(--sp-2);
}

.grabber {
  width: 36px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  opacity: 0.7;
  margin: 0 auto var(--sp-2);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-4) var(--sp-2);
}

.close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.body {
  overflow-y: auto;
  padding: var(--sp-2) var(--sp-4) var(--sp-4);
  -webkit-overflow-scrolling: touch;
}

.foot {
  border-top: 1px solid var(--border);
  padding: var(--sp-3) var(--sp-4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.up-enter-active {
  transition: transform 380ms var(--ease-spring);
}
.up-leave-active {
  transition: transform 200ms ease;
}
.up-enter-from,
.up-leave-to {
  transform: translateY(100%);
}
</style>
