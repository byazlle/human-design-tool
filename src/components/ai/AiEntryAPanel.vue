<script setup lang="ts">
/**
 * 入口 A｜全盘 AI 解读：说明面板（无业务状态）。
 *
 * 只陈述「会按这 6 个模块、这个顺序写」，以及「完整档 6 次请求 / 精简·详细档 1 次请求」。
 * 请求数由计划器决定（`planReading`），这里展示的是固定口径，不参与编排计算。
 */
const MODULES = [
  { id: '①', title: '类型 · 策略 · 内在权威' },
  { id: '②', title: '全部通道通解' },
  { id: '③', title: '全部闸门通解' },
  { id: '④', title: '中心 · 定义 · 回路 · 轮回交叉' },
  { id: '⑤', title: '人生轨迹 / 发展轨迹 / 未来形势 / 扎根力 / 成长方向' },
  { id: '⑥', title: '最终综合' },
] as const
</script>

<template>
  <div class="entry-a">
    <p class="ws-note">
      六个模块顺序固定、不可调换；②③ 各自在一次请求内逐项覆盖，不合并、不跳过。
    </p>
    <ol class="module-list">
      <li v-for="m in MODULES" :key="m.id">
        <span class="ws-mono">{{ m.id }}</span>
        <span>{{ m.title }}</span>
      </li>
    </ol>
    <p class="ws-note">
      完整档 <strong>6 次请求</strong>（①–⑤ 各 1 次 + ⑥ 融合最后单独 1 次）；
      精简 / 详细档 <strong>1 次请求</strong>，六模块在同一篇里按序写完。
    </p>
  </div>
</template>

<style scoped>
.entry-a {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.module-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ws-fg-2);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
.module-list li {
  display: flex;
  gap: 8px;
  line-height: 1.5;
}
.module-list .ws-mono {
  flex: none;
  color: var(--ws-fg-3);
}
</style>
