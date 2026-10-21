<script setup lang="ts">
/**
 * 人体图渲染（底板 + 数据两层，规则严格对齐用户规格）：
 *
 * 底板层（复刻用户提供的模板底图）：
 *   - 青色渐变背景（浅色）/ 深青渐变（深色）
 *   - 人体淡剪影
 *   - 白色通道管（带浅色描边）——底板上的「线槽」
 *   - 九中心白色填充 + 黑色描边
 *
 * 数据层：
 *   - 通道：两端均潜意识=纯红实线；两端均显意识=纯黑实线；一端各一=红黑条纹实线；
 *           仅一端激活=红/黑分段虚线（悬挂，不构成完整通道）；两端未激活=不叠加彩色
 *   - 闸门：潜意识（设计侧）=蓝底白字；显意识（个性侧）=无底圈黑字
 *   - 中心：任一完整通道接入→填充专属色；否则白底黑描边
 */
import { computed } from 'vue'
import type { BodyGraph, CenterId, Ownership, UiFilter } from '../../types/hd'
import {
  CENTER_SHAPES,
  CHANNEL_LINES,
  GATE_POINTS,
  VIEW_BOX,
  GATE_R,
  GATE_FONT,
  TUBE_W,
  CH_W,
  SILHOUETTE_PATH,
  polygonPoints,
} from './bodyGraphLayout'

const props = withDefaults(
  defineProps<{
    chart: BodyGraph
    mode?: 'single' | 'composite'
    gateOwners?: Record<number, Ownership>
    channelOwners?: Record<string, Ownership>
    filter?: UiFilter
    highlight?: { gates?: number[]; channels?: string[]; centers?: CenterId[] }
    interactive?: boolean
    compact?: boolean
    showCenterLabels?: boolean
  }>(),
  {
    mode: 'single',
    gateOwners: () => ({}),
    channelOwners: () => ({}),
    filter: () => ({ showDecimals: true, showColorToneBase: true, sharedOnly: false }),
    highlight: () => ({}),
    interactive: true,
    compact: false,
    showCenterLabels: true,
  },
)

const emit = defineEmits<{
  'gate-click': [gate: number, source: 'a' | 'b' | 'merged' | 'single']
  'channel-click': [key: string, source: 'a' | 'b' | 'merged' | 'single']
  'center-click': [id: CenterId, source: 'a' | 'b' | 'merged' | 'single']
}>()

type Source = 'a' | 'b' | 'merged' | 'single'
const sourceOf = (): Source => (props.mode === 'single' ? 'single' : 'merged')

const activated = computed(() => new Set(props.chart.gates.map((g) => g.gate)))
const definedChannels = computed(() => new Set(props.chart.channels.map((c) => c.key)))
const definedCenters = computed(
  () => new Set(props.chart.centers.filter((c) => c.defined).map((c) => c.id)),
)
const highlightGates = computed(() => new Set(props.highlight?.gates ?? []))
const highlightChannels = computed(() => new Set(props.highlight?.channels ?? []))
const highlightCenters = computed(() => new Set(props.highlight?.centers ?? []))
const sharedOnly = computed(() => props.mode === 'composite' && props.filter.sharedOnly)

const personalityGates = computed(() => {
  const s = new Set<number>()
  for (const p of props.chart.personality) s.add(p.gate)
  return s
})
const designGates = computed(() => {
  const s = new Set<number>()
  for (const p of props.chart.design) s.add(p.gate)
  return s
})

/* ── 中心 ─────────────────────────────────────────────── */

const CENTER_COLORS: Record<CenterId, string> = {
  head: '#9b7bf5',
  ajna: '#3fa7e8',
  throat: '#45b7c8',
  g: '#4caf78',
  heart: '#e8973c',
  spleen: '#e2654e',
  sacral: '#eec83f',
  solar: '#e668a7',
  root: '#7a6ff0',
}

function centerFill(id: CenterId): string {
  return definedCenters.value.has(id) ? CENTER_COLORS[id] : '#ffffff'
}

/* ── 闸门 ─────────────────────────────────────────────── */

function gateLit(gate: number): boolean {
  if (!activated.value.has(gate)) return false
  if (sharedOnly.value) return props.gateOwners[gate] === 'shared'
  return true
}
function gateHidden(gate: number): boolean {
  if (!sharedOnly.value) return false
  return props.gateOwners[gate] !== 'shared'
}
function channelVisible(key: string): boolean {
  if (sharedOnly.value) return props.channelOwners[key] === 'shared'
  return true
}
function ownerVar(o: Ownership | undefined): string {
  if (o === 'a') return 'var(--owner-a)'
  if (o === 'b') return 'var(--owner-b)'
  if (o === 'shared') return 'var(--owner-shared)'
  return 'var(--hd-single-accent)'
}

/** 潜意识（设计侧）：蓝底白字 */
function gateIsDesign(gate: number): boolean {
  return designGates.value.has(gate)
}
function gateHasCircle(gate: number): boolean {
  return gateLit(gate) && (gateIsDesign(gate) || props.mode === 'composite')
}
function gateFill(gate: number): string {
  if (props.mode === 'composite' && gateLit(gate)) return ownerVar(props.gateOwners[gate])
  return '#2b6cd4'
}
function gateTextFill(gate: number): string {
  if (props.mode === 'composite' && gateLit(gate)) return '#ffffff'
  return gateIsDesign(gate) ? '#ffffff' : '#111318'
}
function gateStroke(gate: number): string {
  if (highlightGates.value.has(gate) && gateLit(gate)) return 'var(--status-warning)'
  return gateHasCircle(gate) ? 'rgba(255, 255, 255, 0.85)' : 'transparent'
}
function gateStrokeWidth(gate: number): number {
  if (highlightGates.value.has(gate) && gateLit(gate)) return 4
  return gateHasCircle(gate) ? 2 : 0
}

/* ── 通道 ─────────────────────────────────────────────── */

type Consciousness = 'p' | 'd' | 'mixed'

function channelConsciousness(g0: number, g1: number): Consciousness {
  const p = personalityGates.value
  const d = designGates.value
  const allD = d.has(g0) && d.has(g1)
  const allP = p.has(g0) && p.has(g1)
  if (allD && allP) return 'mixed'
  if (allD) return 'd'
  if (allP) return 'p'
  return 'mixed'
}
function gateConsciousness(gate: number): Consciousness {
  const p = personalityGates.value.has(gate)
  const d = designGates.value.has(gate)
  if (p && d) return 'p'
  return d ? 'd' : 'p'
}
function colorOf(c: Consciousness): string {
  if (c === 'd') return '#e02020'
  if (c === 'p') return '#111318'
  return 'url(#hd-stripe)'
}
function channelStroke(key: string): string {
  const line = CHANNEL_LINES.find((l) => l.key === key)
  if (!line) return 'var(--hd-single-accent)'
  if (props.mode === 'composite') return ownerVar(props.channelOwners[key])
  return colorOf(channelConsciousness(line.gates[0], line.gates[1]))
}

/** 完整通道：两端均激活时绘制，彩线向中心内延伸一小段接到数字 */
const fullChannels = computed(() =>
  CHANNEL_LINES.filter((l) => definedChannels.value.has(l.key)).map((l) => {
    const a = GATE_POINTS[l.gates[0]]
    const b = GATE_POINTS[l.gates[1]]
    const t = 0.12
    return {
      key: l.key,
      x1: l.x1 + (a.x - l.x1) * t,
      y1: l.y1 + (a.y - l.y1) * t,
      x2: l.x2 + (b.x - l.x2) * t,
      y2: l.y2 + (b.y - l.y2) * t,
      stroke: channelStroke(l.key),
    }
  }),
)

/** 悬挂闸门：该闸门向外 45% 长度的红/黑分段虚线 */
const hangingChannels = computed(() => {
  const out: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; stroke: string }> = []
  if (sharedOnly.value) return out
  for (const l of CHANNEL_LINES) {
    const [g0, g1] = l.gates
    const a0 = activated.value.has(g0)
    const a1 = activated.value.has(g1)
    if (a0 === a1) continue
    const gate = a0 ? g0 : g1
    const p = GATE_POINTS[gate]
    const isStart = gate === g0
    const bx = isStart ? l.x1 : l.x2
    const by = isStart ? l.y1 : l.y2
    const ox = isStart ? l.x2 : l.x1
    const oy = isStart ? l.y2 : l.y1
    const t = 0.12
    const sx = bx + (p.x - bx) * t
    const sy = by + (p.y - by) * t
    out.push({
      key: `hang-${l.key}`,
      x1: sx,
      y1: sy,
      x2: sx + (ox - sx) * 0.45,
      y2: sy + (oy - sy) * 0.45,
      stroke:
        props.mode === 'composite'
          ? ownerVar(props.gateOwners[gate])
          : colorOf(gateConsciousness(gate)),
    })
  }
  return out
})

function channelWidth(key: string): number {
  if (highlightChannels.value.has(key)) return CH_W + 4
  return CH_W
}

function onGate(gate: number) {
  if (!props.interactive) return
  emit('gate-click', gate, sourceOf())
}
function onChannel(key: string) {
  if (!props.interactive) return
  emit('channel-click', key, sourceOf())
}
function onCenter(id: CenterId) {
  if (!props.interactive) return
  emit('center-click', id, sourceOf())
}
function centerClickable(id: CenterId): boolean {
  return props.interactive && definedCenters.value.has(id)
}
</script>

<template>
  <svg
    class="hd-graph"
    :class="{ compact }"
    :viewBox="VIEW_BOX.str"
    role="img"
    aria-label="人类图人体图"
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <!-- 底板：浅色=青色，深色=深青 -->
      <linearGradient id="hd-plate" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" stop-color="var(--hd-plate-top)" />
        <stop offset="55%" stop-color="var(--hd-plate-mid)" />
        <stop offset="100%" stop-color="var(--hd-plate-bottom)" />
      </linearGradient>
      <!-- 红黑相间条纹（一端潜意识一端显意识） -->
      <pattern
        id="hd-stripe"
        width="16"
        height="16"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <rect width="16" height="16" fill="#111318" />
        <rect width="8" height="16" fill="#e02020" />
      </pattern>
      <filter id="hd-gate-shadow" x="-70%" y="-70%" width="240%" height="240%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#0b2530" flood-opacity="0.3" />
      </filter>
      <filter id="hd-center-shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0b2530" flood-opacity="0.16" />
      </filter>
    </defs>

    <!-- ① 底板：青色背景 + 人体剪影 -->
    <g class="plate">
      <rect
        :x="VIEW_BOX.x"
        :y="VIEW_BOX.y"
        :width="VIEW_BOX.w"
        :height="VIEW_BOX.h"
        fill="url(#hd-plate)"
      />
      <path :d="SILHOUETTE_PATH" class="silhouette" fill="var(--hd-plate-figure)" opacity="0.55" />
    </g>

    <!-- ② 白色通道管（底板线槽，36 条恒定存在） -->
    <g class="tubes">
      <template v-for="line in CHANNEL_LINES" :key="`t-${line.key}`">
        <line
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          stroke="var(--hd-tube-edge)"
          :stroke-width="TUBE_W + 4"
          :opacity="channelVisible(line.key) ? 0.85 : 0.12"
          stroke-linecap="round"
        />
        <line
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          stroke="var(--hd-tube)"
          :stroke-width="TUBE_W"
          :opacity="channelVisible(line.key) ? 1 : 0.14"
          :class="{ 'is-clickable': interactive }"
          stroke-linecap="round"
          @click="onChannel(line.key)"
        />
      </template>
    </g>

    <!-- ③ 九中心：白底黑描边，有定义填专属色 -->
    <g class="centers">
      <polygon
        v-for="shape in CENTER_SHAPES"
        :key="shape.id"
        :points="polygonPoints(shape.id)"
        :fill="centerFill(shape.id)"
        :stroke="highlightCenters.has(shape.id) ? 'var(--status-warning)' : '#0d1216'"
        :stroke-width="highlightCenters.has(shape.id) ? 5 : 3"
        stroke-linejoin="round"
        filter="url(#hd-center-shadow)"
        :class="{ 'is-clickable': centerClickable(shape.id), 'is-lit': definedCenters.has(shape.id) }"
        @click="onCenter(shape.id)"
      />
    </g>

    <!-- ④ 悬挂通道：红/黑分段虚线（不构成完整通道） -->
    <g class="channels hanging">
      <line
        v-for="seg in hangingChannels"
        :key="seg.key"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="seg.stroke"
        :stroke-width="CH_W - 2"
        stroke-dasharray="14 12"
        stroke-linecap="butt"
        opacity="0.95"
      />
    </g>

    <!-- ⑤ 完整通道：红实线 / 黑实线 / 红黑条纹 -->
    <g class="channels full">
      <line
        v-for="seg in fullChannels"
        :key="seg.key"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="seg.stroke"
        :stroke-width="channelWidth(seg.key)"
        :opacity="channelVisible(seg.key) ? 1 : 0"
        :class="{ 'is-clickable': interactive }"
        stroke-linecap="round"
        @click="onChannel(seg.key)"
      />
    </g>

    <!-- ⑥ 闸门：设计侧蓝底白字；个性侧无圈黑字 -->
    <g class="gates">
      <g
        v-for="point in GATE_POINTS"
        :key="point.gate"
        :opacity="gateHidden(point.gate) ? 0.18 : 1"
      >
        <circle
          v-if="gateHasCircle(point.gate)"
          :cx="point.x"
          :cy="point.y"
          :r="GATE_R"
          :fill="gateFill(point.gate)"
          :stroke="gateStroke(point.gate)"
          :stroke-width="gateStrokeWidth(point.gate)"
          filter="url(#hd-gate-shadow)"
          class="is-clickable is-active"
          @click="onGate(point.gate)"
        />
        <text
          v-if="!compact"
          :x="point.x"
          :y="point.y + GATE_FONT * 0.34"
          text-anchor="middle"
          :fill="gateTextFill(point.gate)"
          :font-size="GATE_FONT"
          :font-weight="gateLit(point.gate) ? 700 : 600"
          font-family="var(--font-mono)"
          :pointer-events="gateLit(point.gate) && !gateHasCircle(point.gate) ? 'auto' : 'none'"
          :class="{ 'is-clickable': gateLit(point.gate) && !gateHasCircle(point.gate) }"
          @click="gateLit(point.gate) && !gateHasCircle(point.gate) && onGate(point.gate)"
        >
          {{ point.gate }}
        </text>
        <circle
          v-if="interactive"
          :cx="point.x"
          :cy="point.y"
          :r="GATE_R + 8"
          fill="transparent"
          class="hit"
          @click="onGate(point.gate)"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.hd-graph {
  width: 100%;
  height: auto;
  display: block;
  touch-action: manipulation;
}

.silhouette {
  transition: fill var(--dur-base) ease;
}

.centers polygon {
  transition:
    fill var(--dur-base) ease,
    stroke var(--dur-base) ease;
}

.is-clickable {
  cursor: pointer;
}

.centers polygon.is-clickable:hover {
  stroke: var(--owner-shared);
}

.tubes line.is-clickable:hover {
  stroke: var(--owner-shared);
}

.channels line {
  transition: opacity var(--dur-fast) ease;
}

.gates text.is-clickable {
  cursor: pointer;
}

.gates text {
  user-select: none;
}
</style>
