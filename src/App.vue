<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import GlassBackdrop from './components/base/GlassBackdrop.vue'
import WindowChrome from './components/base/WindowChrome.vue'
import FloatingDock from './components/base/FloatingDock.vue'

const settings = useSettingsStore()
const ui = useUiStore()
const route = useRoute()

const isDesktopShell = Boolean((window as unknown as { hdDesktop?: unknown }).hdDesktop)

onMounted(() => {
  settings.init()
  if (isDesktopShell) document.body.classList.add('shell-desktop')
})
</script>

<template>
  <GlassBackdrop />
  <WindowChrome />

  <div class="app-content">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </div>

  <FloatingDock />

  <Transition name="toast">
    <div v-if="ui.toast" class="toast" :class="ui.toast.kind" role="status">
      {{ ui.toast.text }}
    </div>
  </Transition>
</template>

<style scoped>
.app-content {
  position: relative;
  z-index: 1;
  height: 100%;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(32px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  max-width: min(92vw, 520px);
  padding: 10px 18px;
  border-radius: var(--radius-pill);
  background: var(--glass-bg-float);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  color: var(--text-primary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  box-shadow: var(--glass-shadow-float);
  z-index: var(--z-toast);
  text-align: center;
}

.toast.error {
  background: var(--status-error);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.toast.success {
  background: var(--status-success);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.toast-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.toast-leave-active {
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 14px) scale(0.94);
}
</style>
