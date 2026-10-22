<script setup lang="ts">
/**
 * 背景氛围层（性能优先版）：
 * 单层静态渐变，无 filter / 无动画 / 无混合模式，渲染成本可忽略。
 */
</script>

<template>
  <div class="backdrop" aria-hidden="true" />
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(1000px 560px at 8% -10%, var(--glow-1), transparent 55%),
    radial-gradient(820px 520px at 95% 4%, var(--glow-2), transparent 55%);
}
</style>
