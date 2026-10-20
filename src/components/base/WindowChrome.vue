<script setup lang="ts">
/**
 * 桌面壳自绘标题栏。
 * 仅当 preload 注入 window.hdDesktop 时渲染；网页/安卓下整块不出现。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface DesktopBridge {
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onState: (handler: (state: { maximized: boolean }) => void) => () => void
  }
}

const bridge = (window as unknown as { hdDesktop?: DesktopBridge }).hdDesktop
const maximized = ref(false)
let dispose: (() => void) | null = null

onMounted(async () => {
  if (!bridge) return
  maximized.value = await bridge.window.isMaximized()
  dispose = bridge.window.onState((state) => {
    maximized.value = Boolean(state.maximized)
  })
})

onBeforeUnmount(() => {
  if (dispose) dispose()
})

function minimize() {
  bridge?.window.minimize()
}
function toggle() {
  bridge?.window.toggleMaximize()
}
function close() {
  bridge?.window.close()
}
</script>

<template>
  <div v-if="bridge" class="chrome">
    <div class="brand" @dblclick="toggle">
      <svg class="mark" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.75" />
        <circle cx="12" cy="12" r="3.4" fill="currentColor" />
      </svg>
      <span class="name">人类图排盘</span>
    </div>

    <div class="spacer" @dblclick="toggle" />

    <div class="actions">
      <button type="button" class="wbtn" aria-label="最小化" @click="minimize">
        <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 6h8" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button type="button" class="wbtn" :aria-label="maximized ? '还原' : '最大化'" @click="toggle">
        <svg v-if="!maximized" viewBox="0 0 12 12" width="10" height="10">
          <rect x="2.2" y="2.2" width="7.6" height="7.6" fill="none" stroke="currentColor" stroke-width="1.2" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 12 12" width="10" height="10">
          <rect x="2.2" y="3.6" width="6.2" height="6.2" fill="none" stroke="currentColor" stroke-width="1.1" rx="1" />
          <path d="M4.4 3.4V2.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-.8" fill="none" stroke="currentColor" stroke-width="1.1" />
        </svg>
      </button>
      <button type="button" class="wbtn danger" aria-label="关闭" @click="close">
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chrome {
  position: fixed;
  inset: 0 0 auto 0;
  height: 34px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding-left: var(--sp-3);
  background: var(--glass-bg-soft);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  border-bottom: 1px solid var(--glass-border);
  -webkit-app-region: drag;
  user-select: none;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  -webkit-app-region: drag;
}
.mark {
  color: var(--owner-shared);
}
.name {
  font-size: calc(var(--fs-xs) * var(--font-scale));
  letter-spacing: 0.04em;
  font-weight: 600;
}

.spacer {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}

.actions {
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;
}

.wbtn {
  width: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease;
}
.wbtn:hover {
  background: rgba(16, 24, 40, 0.07);
  color: var(--text-primary);
}
:root[data-theme='dark'] .wbtn:hover {
  background: rgba(255, 255, 255, 0.09);
}
.wbtn.danger:hover {
  background: #e5484d;
  color: #fff;
}

@media (max-width: 640px) {
  .name {
    display: none;
  }
}
</style>
