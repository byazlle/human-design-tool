<script setup lang="ts">
/**
 * 悬浮操作坞：右下角玻璃球，点击弹出竖直胶囊菜单。
 * 移动端不渲染（底部已有导航，避免遮挡）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../../stores/settings'

const router = useRouter()
const settings = useSettingsStore()

const open = ref(false)
const showTop = ref(false)
const root = ref<HTMLElement | null>(null)

interface DockItem {
  key: string
  label: string
  run: () => void
  icon: string
}

function go(path: string) {
  open.value = false
  router.push(path)
}

const items: DockItem[] = [
  { key: 'new', label: '新建档案', icon: 'plus', run: () => go('/new') },
  { key: 'archive', label: '档案库', icon: 'grid', run: () => go('/') },
  {
    key: 'theme',
    label: '切换主题',
    icon: 'theme',
    run: () => settings.toggleTheme(),
  },
  { key: 'settings', label: '设置', icon: 'settings', run: () => go('/settings') },
]

function onTop() {
  open.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function onDocClick(event: MouseEvent) {
  if (!root.value) return
  if (!root.value.contains(event.target as Node)) open.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

function onScroll() {
  showTop.value = window.scrollY > 320
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div ref="root" class="dock">
    <Transition name="pop">
      <div v-if="open" class="menu" role="menu">
        <button
          v-for="(item, index) in items"
          :key="item.key"
          type="button"
          class="menu-item"
          role="menuitem"
          :style="{ '--i': index }"
          @click="item.run()"
        >
          <span class="ico" aria-hidden="true">
            <svg v-if="item.icon === 'plus'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <svg v-else-if="item.icon === 'grid'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>
            <svg v-else-if="item.icon === 'theme'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" /></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06A2 2 0 1 1 4.05 17l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.03H2.8a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.88l-.06-.06A2 2 0 1 1 7 4.05l.06.06a1.7 1.7 0 0 0 1.88.34h.08A1.7 1.7 0 0 0 10 2.9V2.8a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06A2 2 0 1 1 19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88v.08c.24.62.84 1.04 1.5 1.04h.11a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.5 1.04z" /></svg>
          </span>
          <span class="label">{{ item.label }}</span>
        </button>
        <hr class="sep" />
      </div>
    </Transition>

    <Transition name="pop">
      <button v-if="showTop" type="button" class="top" aria-label="回到顶部" @click="onTop">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </Transition>

    <button
      type="button"
      class="fab"
      :class="{ active: open }"
      :aria-expanded="open"
      aria-label="快捷操作"
      @click.stop="open = !open"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path class="bar h" d="M4 12h16" />
        <path class="bar v" d="M12 4v16" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.dock {
  position: fixed;
  right: var(--sp-5);
  bottom: var(--sp-5);
  z-index: var(--z-drawer);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-2);
  pointer-events: none;
}
.dock > * {
  pointer-events: auto;
}

.fab,
.top {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  color: var(--text-primary);
  background: var(--glass-bg-float);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  box-shadow: var(--glass-shadow-float);
  transition:
    transform var(--dur-base) var(--ease-spring),
    box-shadow var(--dur-base) var(--ease-out),
    background var(--dur-base) ease;
}
.fab:hover,
.top:hover {
  transform: translateY(-3px) scale(1.05);
}
.fab:active,
.top:active {
  transform: scale(0.94);
}

.fab .bar {
  transition: transform var(--dur-base) var(--ease-spring);
  transform-origin: 12px 12px;
}
.fab.active .v {
  transform: rotate(90deg) scaleY(0.001);
}
.fab.active .h {
  transform: rotate(135deg);
}
.fab.active {
  background: var(--action-primary);
  color: var(--surface);
}

.top {
  width: 40px;
  height: 40px;
  color: var(--text-secondary);
}

/* 菜单：从底部球体弹出，逐项 stagger */
.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  min-width: 158px;
  border-radius: 20px;
  background: var(--glass-bg-float);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(30px) saturate(190%);
  -webkit-backdrop-filter: blur(30px) saturate(190%);
  box-shadow: var(--glass-shadow-float);
  transform-origin: bottom right;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 12px 0 8px;
  border-radius: 14px;
  color: var(--text-primary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  transition:
    background var(--dur-fast) ease,
    transform var(--dur-fast) var(--ease-out);
}
.menu-item:hover {
  background: rgba(124, 58, 237, 0.12);
  transform: translateX(-2px);
}
.menu-item .ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: rgba(124, 58, 237, 0.14);
  color: var(--owner-shared);
}
.sep {
  height: 1px;
  border: 0;
  margin: 2px 6px;
  background: var(--border);
  opacity: 0.6;
}

/* 弹入动画（spring 回弹 + 子项延迟） */
.pop-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-slow) var(--ease-spring);
}
.pop-leave-active {
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.86);
}

@media (max-width: 768px) {
  .dock {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fab,
  .top,
  .menu-item {
    transition: none;
  }
}
</style>
