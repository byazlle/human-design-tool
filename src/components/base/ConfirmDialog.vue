<script setup lang="ts">
/** 通用二次确认对话框：Esc / 遮罩取消；打开时焦点落在「取消」上 */
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    desc?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
  }>(),
  { confirmText: '确定', cancelText: '取消', danger: false },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const titleId = useId()
const cancelBtn = ref<HTMLButtonElement | null>(null)

function onKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    cancelBtn.value?.focus()
  },
)

if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('cancel')" />
    </Transition>
    <Transition name="pop">
      <section
        v-if="open"
        class="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <h2 :id="titleId" class="t-title">{{ title }}</h2>
        <p v-if="desc" class="t-sm desc">{{ desc }}</p>
        <div class="actions">
          <button ref="cancelBtn" type="button" class="btn" @click="emit('cancel')">
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn primary"
            :class="{ danger }"
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  z-index: var(--z-dialog);
}

.dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 420px);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-dialog);
  z-index: calc(var(--z-dialog) + 1);
}

.desc {
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-line;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  margin-top: var(--sp-1);
}

.btn {
  min-height: 36px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
}

.btn.primary {
  background: var(--action-primary);
  border-color: var(--action-primary);
  color: var(--surface);
}

.btn.primary.danger {
  background: var(--status-error);
  border-color: var(--status-error);
  color: #fff;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
  transform: translate(-50%, -46%) scale(0.97);
}
</style>
