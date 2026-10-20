<script setup lang="ts">
/** AI 解读阅读面板（DESIGN.md §4.13）：独立弹层，支持复制 / 保存 / 重新生成 */
import { computed } from 'vue'
import IconButton from '../base/IconButton.vue'

const props = defineProps<{
  open: boolean
  title: string
  content: string
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  copy: []
  save: []
  regenerate: []
}>()

const hasContent = computed(() => props.content.trim().length > 0)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('close')" />
    </Transition>
    <Transition name="rise">
      <section v-if="open" class="panel" role="dialog" aria-modal="true" :aria-label="title">
        <header class="head">
          <div class="grow">
            <p class="t-xs">AI READING</p>
            <h2 class="t-title">{{ title }}</h2>
          </div>
          <div class="actions">
            <IconButton label="复制内容" icon="copy" size="sm" :disabled="!hasContent" @click="emit('copy')" />
            <IconButton label="保存到本地记录" icon="save" size="sm" :disabled="!hasContent" @click="emit('save')" />
            <IconButton label="重新生成" icon="refresh" size="sm" :disabled="loading" @click="emit('regenerate')" />
            <IconButton label="关闭" icon="close" size="sm" @click="emit('close')" />
          </div>
        </header>

        <div class="body">
          <div v-if="loading" class="skeleton-block">
            <div class="skeleton" style="height: 16px; width: 60%" />
            <div class="skeleton" style="height: 12px; width: 92%" />
            <div class="skeleton" style="height: 12px; width: 88%" />
            <div class="skeleton" style="height: 12px; width: 76%" />
            <div class="skeleton" style="height: 12px; width: 90%" />
            <p class="t-sm loading-text">正在请求 AI 解读，请稍候…</p>
          </div>

          <div v-else-if="error" class="error-state">
            <p class="t-body msg-error">{{ error }}</p>
            <p class="t-sm t-muted">
              AI 解读为「预留配置」功能，需在设置页填写接口地址、API Key 与模型名；失败不会生成任何伪造内容。
            </p>
            <button type="button" class="retry" @click="emit('regenerate')">重试</button>
          </div>

          <div v-else-if="hasContent" class="text">{{ content }}</div>

          <p v-else class="t-sm t-muted">暂无内容。</p>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: var(--z-dialog);
}

.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 520px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  box-shadow: var(--elev-dialog);
  z-index: calc(var(--z-dialog) + 1);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-bottom: 1px solid var(--border);
}

.actions {
  display: flex;
  gap: 2px;
  flex: none;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-4);
}

.text {
  white-space: pre-wrap;
  font-size: calc(var(--fs-body) * var(--font-scale));
  line-height: 1.75;
}

.skeleton-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.loading-text {
  margin-top: var(--sp-2);
  color: var(--text-muted);
}

.error-state {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  align-items: flex-start;
}

.retry {
  min-height: 36px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.rise-enter-active,
.rise-leave-active {
  transition: transform 180ms ease;
}
.rise-enter-from,
.rise-leave-to {
  transform: translateX(24px);
}

@media (max-width: 768px) {
  .panel {
    width: 100%;
    max-width: 100%;
  }
  .rise-enter-from,
  .rise-leave-to {
    transform: translateY(24px);
  }
}
</style>
