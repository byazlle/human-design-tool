<script setup lang="ts">
/**
 * 闸门 / 通道 / 中心详情面板（DESIGN.md §4.7）
 * 桌面 → 右侧常驻面板；手机 → 底部抽屉。
 * 先给离线释义（永远可用），【AI 深度解读】为按需附加。
 */
import { computed } from 'vue'
import type { BodyGraph, CenterId, Planet } from '../../types/hd'
import { CENTER_LABELS, PLANET_LABELS } from '../../types/hd'
import type { PanelSelection } from '../../stores/ui'
import { CENTER_TEXT, getChannel, getGate } from '../../services/interpretations'
import { CHANNEL_BY_KEY, GATE_CHANNELS, GATE_NAMES } from '../../engine/gateData'
import HdSidePanel from '../base/HdSidePanel.vue'
import HdDrawer from '../base/HdDrawer.vue'

const props = defineProps<{
  selection: PanelSelection | null
  open: boolean
  mobile: boolean
  chart?: BodyGraph
  aiLoading?: boolean
}>()

const emit = defineEmits<{
  close: []
  'request-ai': []
  'open-gate': [gate: number]
  'open-channel': [key: string]
}>()

const info = computed(() => {
  const sel = props.selection
  if (!sel) return { title: '', keyword: '', text: '', channels: [] as string[] }

  if (sel.kind === 'gate') {
    const gate = Number(sel.ref)
    const g = getGate(gate)
    return {
      title: g.title,
      keyword: g.keyword,
      text: g.text,
      channels: GATE_CHANNELS[gate] ?? [],
    }
  }
  if (sel.kind === 'channel') {
    const key = String(sel.ref)
    const c = getChannel(key)
    const def = CHANNEL_BY_KEY[key]
    return {
      title: c.title,
      keyword: def ? `${CENTER_LABELS[def.centers[0]]} → ${CENTER_LABELS[def.centers[1]]}` : '',
      text: c.text,
      channels: [] as string[],
    }
  }
  const id = String(sel.ref) as CenterId
  const text = CENTER_TEXT[id]
  const isDefined = props.chart?.centers.find((c) => c.id === id)?.defined
  return {
    title: CENTER_LABELS[id],
    keyword: isDefined ? '已定义' : '开放',
    text: isDefined ? text.defined : text.open,
    channels: [] as string[],
  }
})

/** 该闸门被哪些星体激活 */
const gateStars = computed(() => {
  const sel = props.selection
  if (!sel || sel.kind !== 'gate' || !props.chart) return null
  const gate = Number(sel.ref)
  const pick = (list: typeof props.chart.personality) =>
    list.filter((p) => p.gate === gate).map((p) => PLANET_LABELS[p.planet as Planet])
  const personality = pick(props.chart.personality)
  const design = pick(props.chart.design)
  if (!personality.length && !design.length) return null
  return { personality, design }
})

/** 该通道是否在本盘已定义 */
const channelDefined = computed(() => {
  const sel = props.selection
  if (!sel || sel.kind !== 'channel' || !props.chart) return null
  return props.chart.channels.some((c) => c.key === String(sel.ref))
})

const relatedChannels = computed(() =>
  info.value.channels.map((key) => {
    const def = CHANNEL_BY_KEY[key]
    return {
      key,
      label: `${key} · ${def?.nameZh ?? ''}`,
      defined: props.chart?.channels.some((c) => c.key === key) ?? false,
    }
  }),
)
</script>

<template>
  <!-- 桌面：右侧面板 -->
  <HdSidePanel v-if="!mobile" :open="open" @close="emit('close')">
    <template #header>
      <div class="head">
        <p class="t-xs">
          {{ selection?.kind === 'gate' ? '闸门 GATE' : selection?.kind === 'channel' ? '通道 CHANNEL' : '中心 CENTER' }}
          <span v-if="selection" class="src">· {{ selection.source === 'a' ? 'A 盘' : selection.source === 'b' ? 'B 盘' : selection.source === 'merged' ? '合盘' : '单盘' }}</span>
        </p>
        <h2 class="t-title">{{ info.title }}</h2>
        <p v-if="info.keyword" class="t-sm keyword">{{ info.keyword }}</p>
      </div>
    </template>

    <div class="content">
      <div v-if="gateStars" class="stars">
        <p class="t-xs">激活来源</p>
        <p v-if="gateStars.personality.length" class="t-sm">
          <span class="tag p">意识</span>{{ gateStars.personality.join('、') }}
        </p>
        <p v-if="gateStars.design.length" class="t-sm">
          <span class="tag d">无意识</span>{{ gateStars.design.join('、') }}
        </p>
      </div>

      <div v-if="channelDefined !== null" class="stars">
        <p class="t-sm">
          <span class="tag" :class="channelDefined ? 'p' : 'x'">
            {{ channelDefined ? '已定义' : '未定义' }}
          </span>
          这是本盘{{ channelDefined ? '已点亮' : '未点亮' }}的通道
        </p>
      </div>

      <div class="offline">
        <p class="t-body" style="white-space: pre-line">{{ info.text }}</p>
      </div>

      <div v-if="relatedChannels.length" class="related">
        <p class="t-xs">相关通道</p>
        <ul class="rel-list">
          <li v-for="ch in relatedChannels" :key="ch.key">
            <button type="button" class="rel" :class="{ on: ch.defined }" @click="emit('open-channel', ch.key)">
              <span class="t-mono">{{ ch.label }}</span>
              <span v-if="ch.defined" class="dot-on" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <button type="button" class="ai-btn" :disabled="aiLoading" @click="emit('request-ai')">
        <span v-if="aiLoading" class="spinner" />
        {{ aiLoading ? '解读生成中…' : 'AI 深度解读' }}
      </button>
    </template>
  </HdSidePanel>

  <!-- 手机：底部抽屉 -->
  <HdDrawer v-else :open="open" :title="info.title" @close="emit('close')">
    <div class="content">
      <p v-if="info.keyword" class="t-sm keyword">{{ info.keyword }}</p>

      <div v-if="gateStars" class="stars">
        <p v-if="gateStars.personality.length" class="t-sm">
          <span class="tag p">意识</span>{{ gateStars.personality.join('、') }}
        </p>
        <p v-if="gateStars.design.length" class="t-sm">
          <span class="tag d">无意识</span>{{ gateStars.design.join('、') }}
        </p>
      </div>

      <p class="t-body" style="white-space: pre-line">{{ info.text }}</p>

      <div v-if="relatedChannels.length" class="related">
        <p class="t-xs">相关通道</p>
        <ul class="rel-list">
          <li v-for="ch in relatedChannels" :key="ch.key">
            <button type="button" class="rel" :class="{ on: ch.defined }" @click="emit('open-channel', ch.key)">
              <span class="t-mono">{{ ch.label }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
    <template #footer>
      <button type="button" class="ai-btn" :disabled="aiLoading" @click="emit('request-ai')">
        {{ aiLoading ? '解读生成中…' : 'AI 深度解读' }}
      </button>
    </template>
  </HdDrawer>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.src {
  color: var(--text-muted);
}

.keyword {
  color: var(--text-secondary);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.stars {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 500;
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
}

.tag.p {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

.tag.d {
  border-style: dashed;
}

.tag.x {
  border-style: dashed;
  color: var(--text-muted);
}

.offline {
  color: var(--text-primary);
}

.related {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border);
}

.rel-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rel {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: 7px var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
  text-align: left;
}

.rel:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.rel.on {
  border-color: var(--action-primary);
  color: var(--text-primary);
}

.dot-on {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--action-primary);
}

.ai-btn {
  width: 100%;
  min-height: 40px;
  border-radius: var(--radius-md);
  background: var(--action-primary);
  color: var(--surface);
  font-size: calc(var(--fs-body) * var(--font-scale));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
}
:root[data-theme='dark'] .ai-btn {
  color: #16181d;
}
.ai-btn:disabled {
  opacity: 0.6;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .ai-btn {
    min-height: 44px;
  }
}
</style>
