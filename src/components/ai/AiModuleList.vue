<script setup lang="ts">
/**
 * 完整档的模块列表：按计划顺序渲染可折叠分项，正文用 `renderMarkdown`。
 *
 * ★ 不复用 `AiReadingPanel` 的 DOM：那个面板是「侧栏 + 五区 + 桌面冒烟契约」的容器，
 *   工作区需要的是「一列可折叠分项 + 实时进度」，两者结构不同，硬复用会让
 *   `data-zone` / `aria-label` 的静态守卫跟着一起变。
 *
 * 生成中：未完成的分项由 `progress.current` 表达（「正在生成：X」），
 * 已完成的分项随 `sections` 增长而出现——不伪造占位内容。
 */
import { computed, ref } from 'vue'
import { renderMarkdown } from '../../services/markdown'
import type { ReadingProgress } from '../../types/aiReading'
import type { FullReportSection, FullSectionKind } from '../../types/report'

const props = defineProps<{
  sections: FullReportSection[]
  /**
   * 进度只用来显示「正在生成：X」。
   * 这里取结构子集而不是整份 `ReadingProgress`：`ui.aiReading.progress` 存的是旧契约的
   * 8 字段 `AiProgress`，两者的公共部分就是 `current`，取子集才能两处都接。
   */
  progress?: Pick<ReadingProgress, 'current'> | null
  /** 生成中：让「正在生成」这一行可见 */
  running?: boolean
}>()

const KIND_LABEL: Record<FullSectionKind, string> = {
  module: '模块',
  dimension: '维度',
  gate: '闸门',
  channel: '通道',
}

const openKeys = ref<Set<string>>(new Set())

function isOpen(section: FullReportSection): boolean {
  // 默认展开：生成过程中用户想直接读；点过收起的才保留状态
  return !openKeys.value.has(section.key)
}

function toggle(section: FullReportSection): void {
  const next = new Set(openKeys.value)
  if (next.has(section.key)) next.delete(section.key)
  else next.add(section.key)
  openKeys.value = next
}

const rendered = computed(() => {
  const out: Record<string, string> = {}
  for (const s of props.sections) out[s.key] = s.content ? renderMarkdown(s.content) : ''
  return out
})

const generating = computed(() =>
  props.running && props.progress?.current ? props.progress.current : '',
)
</script>

<template>
  <div class="module-list" aria-label="分项列表">
    <section
      v-for="(section, index) in sections"
      :key="section.key"
      class="ws-card module"
    >
      <button
        type="button"
        class="module-head"
        :aria-expanded="isOpen(section)"
        @click="toggle(section)"
      >
        <span class="module-index ws-mono">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="module-title">{{ section.title }}</span>
        <span class="module-kind">{{ KIND_LABEL[section.kind] }}</span>
        <span class="module-state ws-mono">{{ section.content ? '已完成' : '未完成' }}</span>
      </button>
      <div v-if="isOpen(section)" class="module-body">
        <div
          v-if="section.content"
          class="module-prose"
          v-html="rendered[section.key]"
        />
        <p v-else class="ws-note">这一项没有产出内容（重试后仍失败，已记入跳过清单）。</p>
      </div>
    </section>

    <p v-if="generating" class="ws-card module-running ws-note">
      正在生成：{{ generating }}
    </p>
    <p v-if="!sections.length && !running" class="ws-note">还没有分项内容。</p>
  </div>
</template>

<style scoped>
.module-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.module {
  padding: 0;
  overflow: hidden;
}
.module-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  color: var(--ws-fg);
}
.module-index {
  flex: none;
  color: var(--ws-fg-3);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
.module-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(var(--fs-sm) * var(--font-scale));
}
.module-kind,
.module-state {
  flex: none;
  color: var(--ws-fg-3);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
.module-body {
  padding: 0 16px 16px;
}
.module-prose {
  color: var(--ws-fg-2);
  font-size: calc(var(--fs-body) * var(--font-scale));
  line-height: 1.75;
}
.module-prose :deep(h1),
.module-prose :deep(h2),
.module-prose :deep(h3) {
  margin: 18px 0 8px;
  color: var(--ws-fg);
  font-weight: 500;
}
.module-prose :deep(p) {
  margin: 0 0 12px;
}
.module-prose :deep(ul),
.module-prose :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}
.module-running {
  padding: 10px 16px;
}
</style>
