<script setup lang="ts">
/**
 * 最高并发数字段（v4.0.0 单旋钮）。
 *
 * 范围常量从 `services/aiConcurrency` 引入，**不写字面量**——上限将来若再调，
 * 只要改一处，UI 提示与校验文案自动跟随。
 */
import {
  AI_MAX_CONCURRENCY_MAX,
  AI_MAX_CONCURRENCY_MIN,
} from '../../services/aiConcurrency'

const props = defineProps<{
  modelValue: number
  /** 行内错误文案（保存被拒时由父组件回传） */
  error?: string | null
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [number] }>()

const HINT = `${AI_MAX_CONCURRENCY_MIN}–${AI_MAX_CONCURRENCY_MAX}；每秒发起 1 个，达到上限后完成一个补一个`

function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value
  const n = Number(raw)
  // 空串 / 非数字按 NaN 回传：由父组件用 validateMaxConcurrency 判定并提示，
  // 这里不静默改成某个「看起来合理」的值（避免用户以为自己填对了）。
  emit('update:modelValue', raw.trim() === '' ? Number.NaN : n)
}
</script>

<template>
  <div class="concurrency-field">
    <label class="ws-label" :for="`concurrency-${label ?? 'default'}`">
      {{ label ?? '最高并发数' }}
    </label>
    <input
      :id="`concurrency-${label ?? 'default'}`"
      class="ws-control ws-input concurrency-input"
      type="number"
      inputmode="numeric"
      :min="AI_MAX_CONCURRENCY_MIN"
      :max="AI_MAX_CONCURRENCY_MAX"
      step="1"
      :value="Number.isFinite(modelValue) ? modelValue : ''"
      :disabled="disabled"
      :aria-invalid="Boolean(error)"
      @input="onInput"
    />
    <p class="ws-note">{{ HINT }}</p>
    <p v-if="error" class="concurrency-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.concurrency-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.concurrency-input {
  width: 96px;
}
.concurrency-error {
  margin: 0;
  color: var(--danger, #c0392b);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
</style>
