<script setup lang="ts">
/**
 * 星体数据竖排列（参照鼎心样图：盘面两侧竖排、上下依次排列）。
 * - side = 'design'（潜意识/无意识，左）| 'personality'（显意识/意识，右）
 * - 单列竖排，可折叠/展开
 * - 点击行星行 → 选中/取消（与闸门选择联动，供 AI 组合解读）
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
    /** 当前已选中的行星（key = planet，同一列内唯一） */
    selected?: Set<string>
  }>(),
  { collapsible: true, compact: false, selected: () => new Set<string>() },
)

const emit = defineEmits<{ 'star-toggle': [planet: Planet] }>()

const open = ref(true)

const title = computed(() => (props.side === 'design' ? '潜意识（设计侧）' : '显意识（个性侧）'))
const sub = computed(() => (props.side === 'design' ? '出生前约 88 天' : '出生时刻'))

/** 行星符号（与星盘表一致） */
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

function onRow(p: StarPosition) {
  emit('star-toggle', p.planet)
}
</script>

<template>
  <section class="planet-col" :class="{ compact }">
    <header v-if="collapsible" class="head" @click="open = !open">
      <span class="t-sm title">{{ title }}</span>
      <span class="t-xs sub">{{ sub }}</span>
      <span class="chev" :class="{ on: open }">▾</span>
    </header>
    <header v-else class="head static">
      <span class="t-sm title">{{ title }}</span>
      <span class="t-xs sub">{{ sub }}</span>
    </header>

    <ul v-show="open" class="rows">
      <li
        v-for="s in stars"
        :key="keyOf(s)"
        class="row"
        :class="{ sel: selected.has(keyOf(s)) }"
        @click="onRow(s)"
      >
        <span class="glyph" aria-hidden="true">{{ GLYPHS[s.planet] }}</span>
        <span class="name">{{ PLANET_LABELS[s.planet] }}</span>
        <span class="gate mono">{{ s.gate }}.{{ s.line }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.planet-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.head.static {
  cursor: default;
}

.title {
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.sub {
  color: var(--text-muted);
  white-space: nowrap;
}

.chev {
  margin-left: auto;
  color: var(--text-muted);
  transition: transform var(--dur-fast) ease;
}

.chev.on {
  transform: rotate(180deg);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) ease;
}

.row:hover {
  background: rgba(124, 58, 237, 0.08);
}

.row.sel {
  background: rgba(124, 58, 237, 0.16);
}

.glyph {
  width: 18px;
  text-align: center;
  color: var(--owner-shared);
  flex: none;
}

.name {
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  white-space: nowrap;
}

.gate {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
}

.compact .row {
  padding: 2px 6px;
}
</style>
