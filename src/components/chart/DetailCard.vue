<script setup lang="ts">
/**
 * 详情卡（第四列「人生轨迹」下方）：点击闸门/通道/中心后就地显示。
 * 与移动端抽屉共用同一套离线释义数据。
 */
import { computed } from 'vue'
import type { CenterId } from '../../types/hd'
import { CENTER_LABELS } from '../../types/hd'
import type { PanelSelection } from '../../stores/ui'
import { CENTER_TEXT, getChannel, getGate } from '../../services/interpretations'
import { gateInsightOf } from '../../services/gateInsight'
import type { BodyGraph } from '../../types/hd'

const props = defineProps<{
  selection: PanelSelection | null
  chart: BodyGraph | null
}>()

const emit = defineEmits<{ close: []; 'request-ai': [] }>()

const info = computed(() => {
  const sel = props.selection
  if (!sel || !props.chart) return null
  if (sel.kind === 'gate') {
    const gate = Number(sel.ref)
    const g = getGate(gate)
    return {
      kind: 'gate' as const,
      title: g.title,
      keyword: g.keyword,
      text: g.text,
      insight: gateInsightOf(gate),
      active: props.chart.gates.some((x) => x.gate === gate),
    }
  }
  if (sel.kind === 'channel') {
    const key = String(sel.ref)
    const c = getChannel(key)
    return {
      kind: 'channel' as const,
      title: c.title,
      keyword: key,
      text: c.text,
      insight: null,
      active: props.chart.channels.some((x) => x.key === key),
    }
  }
  const id = String(sel.ref) as CenterId
  const t = CENTER_TEXT[id]
  const isDefined = props.chart.centers.find((c) => c.id === id)?.defined
  return {
    kind: 'center' as const,
    title: CENTER_LABELS[id],
    keyword: isDefined ? '已定义' : '开放',
    text: isDefined ? t.defined : t.open,
    insight: null,
    active: Boolean(isDefined),
  }
})
</script>

<template>
  <section v-if="info" class="card detail-card">
    <header class="head">
      <div class="grow">
        <p class="t-xs">当前选择 · {{ info.kind === 'gate' ? '闸门' : info.kind === 'channel' ? '通道' : '中心' }}</p>
        <h3 class="t-title">{{ info.title }}</h3>
      </div>
      <button type="button" class="close" aria-label="关闭详情" @click="emit('close')">×</button>
    </header>

    <p class="t-sm meta">
      <span class="tag" :class="info.active ? 'on' : 'off'">{{ info.active ? '已激活' : '未激活' }}</span>
      <span v-if="info.keyword" class="kw">{{ info.keyword }}</span>
    </p>

    <p class="t-sm body">{{ info.text }}</p>

    <div v-if="info.insight" class="insight">
      <p class="t-xs">成长方向</p>
      <p class="t-sm">{{ info.insight.growth }}</p>
      <p class="t-xs">扎根力</p>
      <p class="t-sm">{{ info.insight.grounding }}</p>
      <p class="t-xs">驱动力</p>
      <p class="t-sm">{{ info.insight.drive }}</p>
    </div>

    <button type="button" class="ai" @click="emit('request-ai')">对这项发起 AI 解读</button>
  </section>
</template>

<style scoped>
.detail-card {
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.close {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 18px;
  line-height: 1;
  color: var(--text-muted);
}

.close:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  border: 1px solid var(--border);
}

.tag.on {
  color: var(--status-success);
  border-color: currentColor;
}

.tag.off {
  color: var(--text-muted);
}

.kw {
  color: var(--text-muted);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}

.body {
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-line;
}

.insight {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}

.insight .t-xs {
  color: var(--owner-shared);
  font-weight: 600;
  margin-top: 4px;
}

.insight .t-sm {
  color: var(--text-secondary);
  line-height: 1.6;
}

.ai {
  margin-top: 6px;
  height: 34px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.ai:hover {
  background: var(--surface-2);
}
</style>
