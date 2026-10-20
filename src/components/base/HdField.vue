<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    modelValue: string | number
    type?: 'text' | 'password' | 'number' | 'date' | 'time' | 'search'
    placeholder?: string
    error?: string
    hint?: string
    required?: boolean
    disabled?: boolean
    inputmode?: 'text' | 'numeric' | 'decimal'
    maxlength?: number
    autocomplete?: string
  }>(),
  { type: 'text', error: '', hint: '', required: false, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <label class="hd-field">
    <span class="label">
      {{ label }}
      <span v-if="required" class="req">*</span>
    </span>
    <span class="control" :class="{ invalid: !!error }">
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :inputmode="inputmode"
        :maxlength="maxlength"
        :autocomplete="autocomplete"
        @input="onInput"
      />
      <slot name="suffix" />
    </span>
    <span v-if="error" class="msg-error t-sm">{{ error }}</span>
    <span v-else-if="hint" class="t-xs">{{ hint }}</span>
  </label>
</template>

<style scoped>
.hd-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.req {
  color: var(--action-danger);
  margin-left: 2px;
}

.control {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: border-color 120ms ease;
}

.control:focus-within {
  border-color: var(--border-strong);
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.control.invalid {
  border-color: var(--status-error);
}

input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: calc(var(--fs-body) * var(--font-scale));
}

input::placeholder {
  color: var(--text-muted);
}

input:disabled {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .control {
    height: 44px;
  }
}
</style>
