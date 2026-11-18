<script setup lang="ts">
/**
 * AI 最小化胶囊（v3.5.0）
 *
 * 工作区的跨页锚点：离开 /ai 后，即使解读仍在后台执行，这里也保留状态与返回路径。
 * 它只读取单例状态，不持有请求、不在卸载时取消——请求生命周期归 useAiReading。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui'
import { useAiReading } from '../../composables/useAiReading'
import { useAiStatus } from '../../composables/useAiStatus'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const { state: aiState } = useAiReading()
const status = useAiStatus()

const panelVisible = computed(() => aiState.value.open && !ui.aiPanelSuspended)
const visible = computed(() => route.path !== '/ai' && !panelVisible.value)

const loading = computed(() => aiState.value.loading)
const dotState = computed(() => {
  if (loading.value) return 'running'
  if (aiState.value.error) return 'error'
  if (aiState.value.content.trim()) return 'done'
  return 'idle'
})
const label = computed(() => {
  if (loading.value) return status.snapshot.value.label
  if (aiState.value.error) return '解读失败'
  if (aiState.value.content.trim()) return '查看解读'
  return 'AI 解读'
})
const active = computed(
  () => loading.value || Boolean(aiState.value.content.trim()) || Boolean(aiState.value.error),
)

function open() {
  ui.enterAiWorkspace(route.fullPath)
  void router.push('/ai')
}
</script>

<template>
  <Transition name="ws-dock">
    <button
      v-if="visible"
      type="button"
      class="ws-dock ws-glass"
      :class="{ 'is-active': active }"
      :aria-label="active ? `${label}，打开 AI 工作区` : '打开 AI 工作区'"
      @click="open"
    >
      <span class="ws-dot" :data-state="dotState" />
      <span class="ws-dock-label">{{ label }}</span>
    </button>
  </Transition>
</template>

<style scoped>
.ws-dock {
  position: fixed;
  right: calc(16px + env(safe-area-inset-right, 0px));
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: var(--z-toolbar);
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: var(--ws-line);
  border-radius: var(--ws-radius-sm);
  color: var(--ws-fg-2);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  box-shadow: var(--ws-shadow-float);
  transition:
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease,
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}
.ws-dock:hover {
  color: var(--ws-fg);
  border-color: var(--border-strong);
}
.ws-dock:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.ws-dock.is-active {
  color: var(--ws-fg);
}
.ws-dock-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-dock-enter-active,
.ws-dock-leave-active {
  transition:
    opacity var(--dur-base) ease,
    transform var(--dur-base) ease;
}
.ws-dock-enter-from,
.ws-dock-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 640px) {
  .ws-dock-label {
    max-width: 116px;
  }
}
</style>
