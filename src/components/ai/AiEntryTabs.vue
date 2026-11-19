<script setup lang="ts">
/**
 * 入口切换（三入口工作区顶部）：全盘 A / 综合 B / 勾选 C。
 *
 * 只负责「选哪个入口」，不持有任何业务状态——勾选内容、方向、档位都在父视图里。
 * 键盘左右可切（`role="tablist"` 的既有语义），运行中通过 `disabled` 整体禁用。
 */
import type { AiEntry } from '../../types/aiReading'

const props = defineProps<{
  modelValue: AiEntry
  /** 运行中禁止切换：避免参数与在途请求不一致 */
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [AiEntry] }>()

const TABS: Array<{ value: AiEntry; label: string; hint: string }> = [
  { value: 'full', label: '全盘 AI 解读', hint: '固定 6 模块：类型策略权威 → 通道 → 闸门 → 中心定义回路交叉 → 五方向 → 最终综合' },
  { value: 'composite', label: 'AI 综合解读', hint: '自选维度 + 自选方向，只写勾选的维度' },
  { value: 'selection', label: '勾选解读', hint: '在盘面上勾选通道 / 闸门，逐条解读 + 关联汇总' },
]

function select(value: AiEntry): void {
  if (props.disabled || value === props.modelValue) return
  emit('update:modelValue', value)
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return
  const index = TABS.findIndex((t) => t.value === props.modelValue)
  if (index < 0) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    select(TABS[(index + 1) % TABS.length].value)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    select(TABS[(index - 1 + TABS.length) % TABS.length].value)
  }
}
</script>

<template>
  <div class="entry-tabs" role="tablist" aria-label="解读入口" @keydown="onKeydown">
    <button
      v-for="tab in TABS"
      :key="tab.value"
      type="button"
      role="tab"
      class="ws-chip entry-tab"
      :aria-selected="modelValue === tab.value"
      :aria-pressed="modelValue === tab.value"
      :tabindex="modelValue === tab.value ? 0 : -1"
      :disabled="disabled"
      :title="tab.hint"
      @click="select(tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.entry-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-left: -10px;
}
.entry-tab {
  padding: 6px 12px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
}
</style>
