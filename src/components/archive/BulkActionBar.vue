<script setup lang="ts">
/** 批量操作条：选中 ≥1 出现；选中 2 时高亮「生成合盘」（DESIGN.md §4.3） */
const props = defineProps<{ count: number }>()
const emit = defineEmits<{ open: []; composite: []; clear: [] }>()
</script>

<template>
  <Transition name="pop">
    <div v-if="count > 0" class="bulk">
      <span class="t-sm count">已选 {{ count }} 份</span>
      <button type="button" class="btn" @click="emit('open')">并排打开</button>
      <button
        type="button"
        class="btn"
        :class="{ accent: count === 2 }"
        :disabled="count !== 2"
        :title="count !== 2 ? '请选择恰好 2 份档案生成合盘' : '生成合盘'"
        @click="emit('composite')"
      >
        生成合盘
      </button>
      <button type="button" class="btn ghost" @click="emit('clear')">清空</button>
    </div>
  </Transition>
</template>

<style scoped>
.bulk {
  position: sticky;
  bottom: var(--sp-4);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  margin: 0 auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  box-shadow: var(--elev-panel);
  z-index: var(--z-toolbar);
}

.count {
  color: var(--text-secondary);
  padding-left: var(--sp-1);
}

.btn {
  min-height: 32px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
  white-space: nowrap;
}

.btn.accent {
  background: var(--action-primary);
  border-color: var(--action-primary);
  color: var(--surface);
}
:root[data-theme='dark'] .btn.accent {
  color: #16181d;
}

.btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.btn.ghost {
  border-color: transparent;
  color: var(--text-muted);
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
