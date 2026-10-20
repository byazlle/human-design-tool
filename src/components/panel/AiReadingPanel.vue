<script setup lang="ts">
/** AI 解读阅读面板（DESIGN.md §4.13）：独立弹层，支持复制 / 保存 / 重新生成 */
import { computed } from 'vue'
import IconButton from '../base/IconButton.vue'
import { renderMarkdown } from '../../services/markdown'

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

/** AI 解读以 Markdown 层级排版渲染（先转义防注入） */
const renderedHtml = computed(() => renderMarkdown(props.content))
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

          <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过 HTML 转义 -->
          <div v-else-if="hasContent" class="text md-body" v-html="renderedHtml" />

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
  /* 桌面壳让出自绘标题栏；手机端避开系统状态栏（刘海/挖孔） */
  top: calc(var(--chrome-h) + env(safe-area-inset-top, 0px));
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
  font-size: calc(var(--fs-body) * var(--font-scale));
  line-height: 1.75;
}

/* Markdown 层级排版 */
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4) {
  margin: var(--sp-4) 0 var(--sp-2);
  line-height: 1.4;
  color: var(--text-primary);
}

.md-body :deep(h1) {
  font-size: calc(var(--fs-title, 1.25rem) * var(--font-scale));
  font-weight: 700;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.md-body :deep(h2) {
  font-size: calc(1.12rem * var(--font-scale));
  font-weight: 700;
}

.md-body :deep(h3) {
  font-size: calc(1.02rem * var(--font-scale));
  font-weight: 600;
}

.md-body :deep(h4) {
  font-size: calc(var(--fs-body) * var(--font-scale));
  font-weight: 600;
  color: var(--text-secondary);
}

.md-body :deep(p) {
  margin: 0 0 var(--sp-3);
}

.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 0 0 var(--sp-3);
  padding-left: 1.4em;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.md-body :deep(li) {
  line-height: 1.65;
}

.md-body :deep(strong) {
  color: var(--text-primary);
  font-weight: 700;
}

.md-body :deep(code) {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.md-body :deep(blockquote) {
  margin: 0 0 var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-left: 3px solid var(--owner-shared);
  background: var(--surface-2);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}

.md-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: var(--sp-4) 0;
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
