<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'

const settings = useSettingsStore()
const ui = useUiStore()

onMounted(() => settings.init())
</script>

<template>
  <RouterView />

  <Transition name="toast">
    <div v-if="ui.toast" class="toast" :class="ui.toast.kind" role="status">
      {{ ui.toast.text }}
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  max-width: min(92vw, 520px);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-pill);
  background: var(--action-primary);
  color: var(--surface);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  box-shadow: var(--elev-panel);
  z-index: var(--z-toast);
  text-align: center;
}
:root[data-theme='dark'] .toast {
  color: #16181d;
}

.toast.error {
  background: var(--status-error);
  color: #fff;
}

.toast.success {
  background: var(--status-success);
  color: #fff;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
