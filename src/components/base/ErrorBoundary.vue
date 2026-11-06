<script setup lang="ts">
/** 路由级错误边界：捕获子组件渲染/生命周期异常，避免整页白屏 */
import { onErrorCaptured, ref } from 'vue'
import { useRouter } from 'vue-router'

const error = ref<Error | null>(null)
const router = useRouter()

onErrorCaptured((err) => {
  // 控制台保留完整堆栈，界面上只展示摘要
  console.error('[ErrorBoundary]', err)
  error.value = err instanceof Error ? err : new Error(String(err))
  // 阻止继续向上冒泡（否则会触发全局未捕获错误）
  return false
})

function retry() {
  error.value = null
}

function goHome() {
  error.value = null
  router.push('/')
}
</script>

<template>
  <div v-if="error" class="boundary" role="alert">
    <h2 class="t-title">页面出现异常</h2>
    <p class="t-sm err">{{ error.message || '未知错误' }}</p>
    <div class="actions">
      <button type="button" class="btn primary" @click="retry">重试</button>
      <button type="button" class="btn" @click="goHome">返回首页</button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.boundary {
  max-width: 560px;
  margin: var(--sp-8) auto;
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-panel);
}

.err {
  color: var(--status-error);
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 220px;
  overflow: auto;
}

.actions {
  display: flex;
  gap: var(--sp-2);
}

.btn {
  min-height: 38px;
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
:root[data-theme='dark'] .btn.primary {
  color: #16181d;
}
</style>
