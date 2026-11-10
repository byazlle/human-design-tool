<script setup lang="ts">
/**
 * 四类关系通道（专业合图动力学）：
 * 电磁（吸引）/ 同伴（同频）/ 主导（单向输出）/ 妥协（迁就卡点）
 */
import type { Ownership, RelationshipChannel, RelationshipChannelType } from '../../types/hd'
import { CHANNEL_BY_KEY } from '../../engine/gateData'

const props = defineProps<{
  channels: RelationshipChannel[]
  nameA: string
  nameB: string
}>()

const emit = defineEmits<{ 'channel-click': [key: string] }>()

const TYPE_META: Record<RelationshipChannelType, { label: string; desc: string; cls: string }> = {
  electromagnetic: {
    label: '电磁通道',
    desc: '两人各持一端、互补成通道——互相强烈吸引，合在一起才完整',
    cls: 'em',
  },
  companionship: {
    label: '同伴通道',
    desc: '两人各自自带同一条完整通道——高度同频，天生理解彼此',
    cls: 'co',
  },
  dominance: {
    label: '主导通道',
    desc: '一方独占完整通道——能量单向输出，另一方自然跟随',
    cls: 'do',
  },
  compromise: {
    label: '妥协通道',
    desc: '一方完整、另一方只挂一个闸门——关系中的迁就与卡点',
    cls: 'cm',
  },
}

const ORDER: RelationshipChannelType[] = ['electromagnetic', 'companionship', 'dominance', 'compromise']

function grouped(type: RelationshipChannelType): RelationshipChannel[] {
  return props.channels.filter((c) => c.type === type)
}

function titleOf(key: string): string {
  const def = CHANNEL_BY_KEY[key]
  return def ? `${key} ${def.nameZh}` : key
}

function ownerLabel(o: Ownership): string {
  if (o === 'a') return props.nameA
  if (o === 'b') return props.nameB
  return '双方'
}

function holderLabel(c: RelationshipChannel): string {
  if (c.type !== 'dominance' && c.type !== 'compromise') return ''
  return c.holder === 'a' ? `完整方：${props.nameA}` : `完整方：${props.nameB}`
}
</script>

<template>
  <div class="rel">
    <p class="t-xs rel-tip">
      关系动力学：两人相遇后按闸门归属自动识别的四种通道（点击可看通道详情）
    </p>

    <section v-for="t in ORDER" :key="t" class="rel-group" :class="TYPE_META[t].cls">
      <header class="rg-head">
        <strong>{{ TYPE_META[t].label }}</strong>
        <span class="count t-xs">{{ grouped(t).length }} 条</span>
      </header>
      <p class="t-xs rg-desc">{{ TYPE_META[t].desc }}</p>

      <ul v-if="grouped(t).length" class="rg-list">
        <li v-for="c in grouped(t)" :key="c.key">
          <button type="button" class="rg-item" @click="emit('channel-click', c.key)">
            <span class="t-mono key">{{ c.key }}</span>
            <span class="grow ellipsis name">{{ titleOf(c.key) }}</span>
            <span class="t-xs owner">{{ holderLabel(c) || `${ownerLabel(c.gateOwners[0])} × ${ownerLabel(c.gateOwners[1])}` }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="t-xs none">无</p>
    </section>
  </div>
</template>

<style scoped>
.rel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.rel-tip {
  color: var(--text-muted);
}

.rel-group {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  border-left-width: 3px;
  background: var(--surface-2);
}

.rel-group.em {
  border-left-color: #d92d63;
}
.rel-group.co {
  border-left-color: #2563eb;
}
.rel-group.do {
  border-left-color: #ea7317;
}
.rel-group.cm {
  border-left-color: #7c3aed;
}

.rg-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}

.rg-head strong {
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.rg-desc {
  color: var(--text-muted);
  margin: 2px 0 6px;
}

.rg-list {
  display: flex;
  flex-direction: column;
}

.rg-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 4px 0;
  text-align: left;
  border-bottom: 1px dashed var(--border);
}

.rg-item:last-child {
  border-bottom: none;
}

.key {
  flex: none;
  min-width: 40px;
  font-weight: 700;
  color: var(--text-primary);
}

.name {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.owner {
  flex: none;
  color: var(--text-muted);
}

.none {
  color: var(--text-muted);
}
</style>
