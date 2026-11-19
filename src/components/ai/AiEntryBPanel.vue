<script setup lang="ts">
/**
 * 入口 B｜AI 综合解读：维度白名单 + 方向。
 *
 * 只回传 `dims` / `angleKey` / `custom` 三个原始值，**不构造 `ReadingDirection`**——
 * 方向结构（含 desc / prompt）由计划器按 `angleKey` 解析，避免同一份文案在这里再写一遍。
 */
import { computed } from 'vue'
import { READING_DIMENSIONS, type ReadingDimKey } from '../../services/chartFacts'
import { READING_ANGLES } from '../../services/readingAngles'

const props = defineProps<{
  dims: ReadingDimKey[]
  angleKey: string
  custom: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:dims': [ReadingDimKey[]]
  'update:angleKey': [string]
  'update:custom': [string]
}>()

/** 固定顺序（READING_DIMENSIONS 顺序），去重后回传 */
const selected = computed(() => READING_DIMENSIONS.filter((d) => props.dims.includes(d.key)).map((d) => d.key))
const allOn = computed(() => selected.value.length === READING_DIMENSIONS.length)

function toggleDim(key: ReadingDimKey): void {
  if (props.disabled) return
  const next = selected.value.includes(key)
    ? selected.value.filter((k) => k !== key)
    : [...selected.value, key]
  // 回传时按 READING_DIMENSIONS 顺序归一，点击顺序不影响 ref
  emit(
    'update:dims',
    READING_DIMENSIONS.filter((d) => next.includes(d.key)).map((d) => d.key),
  )
}

function toggleAll(): void {
  if (props.disabled) return
  emit('update:dims', allOn.value ? [] : READING_DIMENSIONS.map((d) => d.key))
}

function chooseAngle(key: string): void {
  if (props.disabled) return
  emit('update:angleKey', key)
  if (key !== 'custom') emit('update:custom', '')
}
</script>

<template>
  <div class="entry-b">
    <div class="field-head">
      <span class="ws-label">维度（只写勾选的）</span>
      <button type="button" class="ws-chip" :disabled="disabled" @click="toggleAll">
        {{ allOn ? '清空' : '全选' }}
      </button>
    </div>
    <div class="ws-chips">
      <button
        v-for="d in READING_DIMENSIONS"
        :key="d.key"
        type="button"
        class="ws-chip"
        :aria-pressed="selected.includes(d.key)"
        :disabled="disabled"
        :title="d.desc"
        @click="toggleDim(d.key)"
      >
        {{ d.label }}
      </button>
    </div>

    <span class="ws-label">方向</span>
    <div class="ws-chips">
      <button
        v-for="a in READING_ANGLES"
        :key="a.key"
        type="button"
        class="ws-chip"
        :aria-pressed="angleKey === a.key"
        :disabled="disabled"
        :title="a.desc"
        @click="chooseAngle(a.key)"
      >
        {{ a.label }}
      </button>
      <button
        type="button"
        class="ws-chip"
        :aria-pressed="angleKey === 'custom'"
        :disabled="disabled"
        @click="chooseAngle('custom')"
      >
        自定义
      </button>
    </div>
    <input
      v-if="angleKey === 'custom'"
      class="ws-control ws-input"
      type="text"
      maxlength="60"
      placeholder="自定义方向（如：换工作的时机）"
      :value="custom"
      :disabled="disabled"
      @input="emit('update:custom', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="!selected.length" class="ws-note">至少勾选一个维度才能生成。</p>
  </div>
</template>

<style scoped>
.entry-b {
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
