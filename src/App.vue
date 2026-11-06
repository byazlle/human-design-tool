<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from './stores/settings'
import { useArchiveStore } from './stores/archive'
import { useUiStore } from './stores/ui'
import GlassBackdrop from './components/base/GlassBackdrop.vue'
import WindowChrome from './components/base/WindowChrome.vue'
import FloatingDock from './components/base/FloatingDock.vue'
import ErrorBoundary from './components/base/ErrorBoundary.vue'

const settings = useSettingsStore()
const archive = useArchiveStore()
const ui = useUiStore()
const route = useRoute()

const isDesktopShell = Boolean((window as unknown as { hdDesktop?: unknown }).hdDesktop)
const dataErrorDismissed = ref(false)

onMounted(() => {
  settings.init()
  // 算法版本对齐：曼陀罗偏移修正后，存量快照必须重算，否则用户会一直看到旧结果
  archive.syncEngineVersion()
  if (isDesktopShell) document.body.classList.add('shell-desktop')
})
</script>

<template>
  <GlassBackdrop />
  <WindowChrome />

  <div class="app-content">
    <div v-if="archive.loadError && !dataErrorDismissed" class="data-error" role="alert">
      <span class="t-sm">{{ archive.loadError }}</span>
      <button type="button" class="t-xs" @click="dataErrorDismissed = true">我知道了</button>
    </div>
    <ErrorBoundary>
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </ErrorBoundary>
  </div>

  <FloatingDock />

  <Transition name="toast">
    <div v-if="ui.toast" class="toast" :class="ui.toast.kind" role="status">
      <span class="toast-text">{{ ui.toast.text }}</span>
      <button
        v-if="ui.toast.action"
        type="button"
        class="toast-action"
        @click="ui.runToastAction()"
      >
        {{ ui.toast.action.label }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.app-content {
  position: relative;
  z-index: 1;
  height: 100%;
}

.data-error {
  position: sticky;
  top: 0;
  z-index: var(--z-toolbar);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-4);
  background: rgba(217, 119, 6, 0.12);
  border-bottom: 1px solid rgba(217, 119, 6, 0.4);
  color: var(--text-primary);
}

.data-error button {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  color: var(--text-secondary);
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(32px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  max-width: min(92vw, 520px);
  padding: 10px 18px;
  border-radius: var(--radius-pill);
  background: var(--glass-bg-float);
  border: 1px solid var(--glass-border);
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

.toast-text {
  min-width: 0;
}

.toast-action {
  flex: none;
  margin-left: var(--sp-2);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid currentColor;
  color: inherit;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  background: transparent;
  cursor: pointer;
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
