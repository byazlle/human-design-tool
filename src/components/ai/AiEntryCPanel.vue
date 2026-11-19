<script setup lang="ts">
/**
 * 入口 C｜勾选解读：通道 chips + 闸门 chips + 三个可选开关。
 *
 * `gates` / `channels` 是「这张盘上可勾的项」（由父视图从 chart 取出），
 * 组件自己不做盘面计算，只把点击翻译成 `SelectionPick` 回传。
 */
import { computed } from 'vue'
import { CHANNEL_BY_KEY, GATE_NAMES } from '../../engine/gateData'
import type { SelectionPick } from '../../types/aiReading'

const props = defineProps<{
  selection: SelectionPick
  /** 该盘已激活的闸门号（升序） */
  gates: number[]
  /** 该盘已成型通道 key（升序） */
  channels: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:selection': [SelectionPick] }>()

const channelSet = computed(() => new Set(props.selection.channels))
const gateSet = computed(() => new Set(props.selection.gates))

function channelLabel(key: string): string {
  const name = CHANNEL_BY_KEY[key]?.nameZh
  return name ? `通道 ${key} · ${name}` : `通道 ${key}`
}

function gateLabel(gate: number): string {
  const name = GATE_NAMES[gate]?.zh
  return name ? `闸门 ${gate} · ${name}` : `闸门 ${gate}`
}

function patch(next: Partial<SelectionPick>): void {
  emit('update:selection', { ...props.selection, ...next })
}

function toggleChannel(key: string): void {
  if (props.disabled) return
  const has = channelSet.value.has(key)
  const channels = has
    ? props.selection.channels.filter((k) => k !== key)
    : [...props.selection.channels, key]
  // 保持升序：ref 与缓存键必须与点击顺序无关
  patch({ channels: [...new Set(channels)].sort(compareChannel) })
}

function toggleGate(gate: number): void {
  if (props.disabled) return
  const has = gateSet.value.has(gate)
  const gates = has
    ? props.selection.gates.filter((g) => g !== gate)
    : [...props.selection.gates, gate]
  patch({ gates: [...new Set(gates)].sort((a, b) => a - b) })
}

function compareChannel(a: string, b: string): number {
  const [a1, a2] = a.split('-').map(Number)
  const [b1, b2] = b.split('-').map(Number)
  return a1 - b1 || a2 - b2
}

const allOn = computed(
  () =>
    props.channels.length + props.gates.length > 0 &&
    props.selection.channels.length === props.channels.length &&
    props.selection.gates.length === props.gates.length,
)

function toggleAll(): void {
  if (props.disabled) return
  if (allOn.value) {
    patch({ channels: [], gates: [] })
    return
  }
  patch({
    channels: [...props.channels].sort(compareChannel),
    gates: [...props.gates].sort((a, b) => a - b),
  })
}

const total = computed(
  () =>
    props.selection.channels.length +
    props.selection.gates.length +
    (props.selection.definition ? 1 : 0) +
    (props.selection.circuit ? 1 : 0) +
    (props.selection.cross ? 1 : 0),
)
</script>

<template>
  <div class="entry-c">
    <div class="field-head">
      <span class="ws-label">勾选条目</span>
      <button type="button" class="ws-chip" :disabled="disabled || !channels.length && !gates.length" @click="toggleAll">
        {{ allOn ? '清空' : '全选' }}
      </button>
    </div>

    <span class="ws-label">通道（{{ channels.length }}）</span>
    <div v-if="channels.length" class="ws-chips">
      <button
        v-for="key in channels"
        :key="key"
        type="button"
        class="ws-chip"
        :aria-pressed="channelSet.has(key)"
        :disabled="disabled"
        @click="toggleChannel(key)"
      >
        {{ channelLabel(key) }}
      </button>
    </div>
    <p v-else class="ws-note">这张盘没有已成型通道。</p>

    <span class="ws-label">闸门（{{ gates.length }}）</span>
    <div v-if="gates.length" class="ws-chips">
      <button
        v-for="gate in gates"
        :key="gate"
        type="button"
        class="ws-chip"
        :aria-pressed="gateSet.has(gate)"
        :disabled="disabled"
        @click="toggleGate(gate)"
      >
        {{ gateLabel(gate) }}
      </button>
    </div>
    <p v-else class="ws-note">这张盘没有已激活闸门。</p>

    <span class="ws-label">可选模块</span>
    <div class="ws-chips">
      <button
        type="button"
        class="ws-chip"
        :aria-pressed="selection.definition"
        :disabled="disabled"
        @click="patch({ definition: !selection.definition })"
      >
        定义状态
      </button>
      <button
        type="button"
        class="ws-chip"
        :aria-pressed="selection.circuit"
        :disabled="disabled"
        @click="patch({ circuit: !selection.circuit })"
      >
        回路分布
      </button>
      <button
        type="button"
        class="ws-chip"
        :aria-pressed="selection.cross"
        :disabled="disabled"
        @click="patch({ cross: !selection.cross })"
      >
        轮回交叉
      </button>
    </div>

    <p class="ws-note">
      已选 {{ selection.channels.length }} 通 + {{ selection.gates.length }} 闸（合计 {{ total }} 项）
    </p>
  </div>
</template>

<style scoped>
.entry-c {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
