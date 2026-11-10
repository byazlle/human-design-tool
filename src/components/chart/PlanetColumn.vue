<script setup lang="ts">
/**
 * 星体数据列（潜意识 / 显意识）
 * 设计要点：
 *   - 顶部一行标题 + 侧别标识点，副标题说明激活时刻
 *   - 单列竖排 13 行星：行星符号 + 中文名 + 闸门.爻（右对齐等宽数字）
 *   - 可折叠；行可点选（与闸门联动）
 *   - 窄屏下由父级改为静态排布，不遮挡盘面
 */
import { computed, ref } from 'vue'
import type { Planet, StarPosition } from '../../types/hd'
import { PLANET_LABELS } from '../../types/hd'

const props = withDefaults(
  defineProps<{
    stars: StarPosition[]
    side: 'design' | 'personality'
    collapsible?: boolean
    compact?: boolean
    selected?: Set<string>
  }>(),
  { collapsible: true, compact: false, selected: () => new Set<string>() },
)

const emit = defineEmits<{ 'star-toggle': [planet: Planet] }>()

const open = ref(true)

const isDesign = computed(() => props.side === 'design')
const title = computed(() => (isDesign.value ? '潜意识' : '显意识'))
const sub = computed(() => (isDesign.value ? '设计侧 · 出生前约 88 天' : '个性侧 · 出生时刻'))

const GLYPHS: Record<Planet, string> = {
  Sun: '☉',
  Earth: '⊕',
  Moon: '☽',
  NorthNode: 'Ω',
  SouthNode: '☋',
  Mercury: '☿',
  Venus: '♀',
  Mars: '♂',
  Jupiter: '♃',
  Saturn: '♄',
  Uranus: '♅',
  Neptune: '♆',
  Pluto: '♇',
}

function keyOf(p: StarPosition): string {
  return `${props.side}:${p.planet}`
}
</script>

<template>
  <section class="planet-col" :class="[side, { compact }]">
    <header class="head" @click="collapsible && (open = !open)">
      <span class="dot" aria-hidden="true" />
      <span class="title">{{ title }}</span>
      <span v-if="collapsible" class="chev" :class="{ on: open }">▾</span>
      <span class="sub">{{ sub }}</span>
    </header>

    <ul v-show="open" class="rows">
      <li
        v-for="s in stars"
        :key="keyOf(s)"
        class="row"
        :class="{ sel: selected.has(keyOf(s)) }"
        @click="emit('star-toggle', s.planet)"
      >
        <span class="glyph" aria-hidden="true">{{ GLYPHS[s.planet] }}</span>
        <span class="name">{{ PLANET_LABELS[s.planet] }}</span>
        <span class="gate">{{ s.gate }}.{{ s.line }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.planet-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  box-shadow: 0 8px 22px -18px rgba(8, 30, 40, 0.5);
}

.head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    'dot title chev'
    'dot sub chev';
  column-gap: 7px;
  align-items: center;
  padding: 8px 10px 7px;
  cursor: pointer;
  user-select: none;
  background: var(--glass-bg-soft);
  border-bottom: 1px solid var(--glass-border);
}

.dot {
  grid-area: dot;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e02020;
  box-shadow: 0 0 0 3px rgba(224, 32, 32, 0.14);
}

.personality .dot {
  background: #111318;
  box-shadow: 0 0 0 3px rgba(17, 19, 24, 0.16);
}

:root[data-theme='dark'] .personality .dot {
  background: #e8edf2;
  box-shadow: 0 0 0 3px rgba(232, 237, 242, 0.16);
}

.title {
  grid-area: title;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.sub {
  grid-area: sub;
  font-size: calc(0.66rem * var(--font-scale));
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chev {
  grid-area: chev;
  color: var(--text-muted);
  font-size: 12px;
  transition: transform var(--dur-fast) ease;
}

.chev.on {
  transform: rotate(180deg);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 4px 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 7px;
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}

.row:hover {
  background: rgba(124, 58, 237, 0.1);
}

.row.sel {
  background: rgba(124, 58, 237, 0.18);
}

.glyph {
  text-align: center;
  font-size: calc(0.72rem * var(--font-scale));
  color: var(--owner-shared);
  opacity: 0.85;
}

.name {
  font-size: calc(0.7rem * var(--font-scale));
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gate {
  font-family: var(--font-mono);
  font-size: calc(0.72rem * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.compact .row {
  padding: 2px 5px;
}
</style>
