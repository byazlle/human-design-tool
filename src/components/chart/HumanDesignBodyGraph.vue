<script setup lang="ts">
/**
 * 人体图 SVG 渲染组件（图表渲染统一规则，用户规格 #11）：
 * - 九中心：任一完整通道接入 → 有定义，填充专属彩色；否则白底黑描边
 * - 闸门：
 *     · 潜意识（设计侧，出生前 ~88 天行星激活）→ 蓝色圆形背景 + 白色数字
 *     · 显意识（个性侧，出生时刻行星激活）→ 不加蓝底圈，仅黑色数字
 *     · 两侧同时激活 → 按设计侧显示（蓝底白字）
 * - 通道：
 *     · 两端均为潜意识闸门 → 纯红实线（完整通道）
 *     · 两端均为显意识闸门 → 纯黑实线（完整通道）
 *     · 一端潜意识一端显意识 → 红黑条纹实线（完整通道）
 *     · 仅一端激活（悬挂闸门）→ 该闸门到通道中点的红/黑分段虚线，不构成完整通道
 *     · 两端均未激活 → 不绘制线条
 * - 合盘模式保留归属色（A 蓝 / B 橙 / 共享紫）
 */
import { computed } from 'vue'
import type { BodyGraph, CenterId, Ownership, UiFilter } from '../../types/hd'
import {
  CENTER_SHAPES,
  CHANNEL_LINES,
  GATE_POINTS,
  VIEW_BOX,
  GATE_R,
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
    /** 是否显示中心名称 */
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

/** 意识（Personality）激活的闸门集合 */
const personalityGates = computed(() => {
  const s = new Set<number>()
  for (const p of props.chart.personality) s.add(p.gate)
  return s
})

/** 无意识（Design）激活的闸门集合 */
const designGates = computed(() => {
  const s = new Set<number>()
  for (const p of props.chart.design) s.add(p.gate)
  return s
})

/* ── 中心样式 ─────────────────────────────────────────── */

/** 每个中心的固定专属彩色（有定义时使用；互不相同） */
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
  if (definedCenters.value.has(id)) return CENTER_COLORS[id]
  return '#ffffff'
}

/* ── 闸门样式 ─────────────────────────────────────────── */

/** 是否"点亮"：只由真实激活决定，高亮不参与 */
function gateLit(gate: number): boolean {
  if (!activated.value.has(gate)) return false
  if (sharedOnly.value) return props.gateOwners[gate] === 'shared'
  return true
}

/** 是否在"仅共享"视图下被隐藏 */
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

/** 是否按设计侧渲染（蓝底白字）：设计侧激活即算，双激活同 */
function gateIsDesign(gate: number): boolean {
  return designGates.value.has(gate)
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
  if (props.mode === 'composite' && gateLit(gate)) return 'rgba(13, 30, 74, 0.55)'
  return gateIsDesign(gate) ? 'rgba(13, 30, 74, 0.55)' : 'transparent'
}

function gateStrokeWidth(gate: number): number {
  if (highlightGates.value.has(gate) && gateLit(gate)) return 3.2
  return gateIsDesign(gate) || (props.mode === 'composite' && gateLit(gate)) ? 1.4 : 0
}

/* ── 通道样式 ─────────────────────────────────────────── */

type Consciousness = 'p' | 'd' | 'mixed'

/**
 * 通道意识属性（统一规则 #11）：
 * 两端均为潜意识（设计）→ 红；两端均为显意识（个性）→ 黑；混合 → 条纹。
 */
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

/** 悬挂闸门半段线颜色：设计侧红、个性侧黑、双激活取黑（显意识主导标注） */
function gateConsciousness(gate: number): Consciousness {
  const p = personalityGates.value.has(gate)
  const d = designGates.value.has(gate)
  if (p && d) return 'p'
  return d ? 'd' : 'p'
}

/** 完整通道线色：'d'（潜意识）→ 红；'p'（显意识）→ 黑；混合 → 红黑条纹 pattern */
function channelColor(g0: number, g1: number): string {
  const c = channelConsciousness(g0, g1)
  if (c === 'd') return '#e02020'
  if (c === 'p') return '#111318'
  return 'url(#hd-stripe)'
}

function halfColor(gate: number): string {
  const c = gateConsciousness(gate)
  if (c === 'd') return '#e02020'
  return '#111318'
}

function channelStroke(key: string): string {
  const line = CHANNEL_LINES.find((l) => l.key === key)
  if (!line) return 'var(--hd-single-accent)'
  if (props.mode === 'composite') return ownerVar(props.channelOwners[key])
  return channelColor(line.gates[0], line.gates[1])
}

/** 线宽：完整彩线 9，悬挂虚线 7 */
function channelWidth(key: string): number {
  if (highlightChannels.value.has(key)) return 12
  return definedChannels.value.has(key) ? 9 : 7
}

function channelOpacity(key: string): number {
  const defined = definedChannels.value.has(key)
  if (highlightChannels.value.size && !highlightChannels.value.has(key)) return defined ? 0.34 : 0.5
  return 1
}

/** 单端激活的半段线：从闸门画到通道中点 */
const halfSegments = computed(() => {
  const out: Array<{
    key: string
    x1: number
    y1: number
    x2: number
    y2: number
    stroke: string
  }> = []
  if (sharedOnly.value) return out
  for (const line of CHANNEL_LINES) {
    const [g0, g1] = line.gates
    const a0 = activated.value.has(g0)
    const a1 = activated.value.has(g1)
    if (a0 === a1) continue // 双端激活 → 完整线；双端未激活 → 只有白底
    const gate = a0 ? g0 : g1
    const from = GATE_POINTS[gate]
    out.push({
      key: `half-${line.key}`,
      x1: from.x,
      y1: from.y,
      x2: (line.x1 + line.x2) / 2,
      y2: (line.y1 + line.y2) / 2,
      stroke: props.mode === 'composite' ? ownerVar(props.gateOwners[gate]) : halfColor(gate),
    })
  }
  return out
})

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

/** 已定义中心：可点击（用于 AI 解读）；未定义中心不响应点击，避免误导 */
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
      <!-- 红黑相间条纹（兼具显意识与潜意识的通道） -->
      <pattern
        id="hd-stripe"
        width="11"
        height="11"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <rect width="11" height="11" fill="#111318" />
        <rect width="5.5" height="11" fill="#e02020" />
      </pattern>
      <!-- 中心投影：轻微立体感 -->
      <filter id="hd-center-shadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="2.4" stdDeviation="2.6" flood-color="#101828" flood-opacity="0.16" />
      </filter>
      <filter id="hd-gate-shadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1.4" stdDeviation="1.4" flood-color="#101828" flood-opacity="0.3" />
      </filter>
    </defs>

    <!-- 通道（统一规则 #11：两端未激活不绘制） -->
    <g class="channels">
      <!-- 悬挂闸门：仅单端激活 → 该闸门到通道中点的红/黑分段虚线 -->
      <line
        v-for="seg in halfSegments"
        :key="seg.key"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="seg.stroke"
        :stroke-width="7"
        stroke-linecap="round"
        stroke-dasharray="10 8"
        class="is-overlay"
      />

      <!-- 完整彩色通道：两端均激活 -->
      <line
        v-for="line in CHANNEL_LINES.filter((l) => definedChannels.has(l.key))"
        :key="`d-${line.key}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :stroke="channelStroke(line.key)"
        :stroke-width="channelWidth(line.key)"
        :opacity="channelVisible(line.key) ? 1 : 0"
        :class="{
          'is-defined': true,
          'is-clickable': interactive,
          'is-dim': highlightChannels.size > 0 && !highlightChannels.has(line.key),
        }"
        stroke-linecap="round"
        @click="onChannel(line.key)"
      />
    </g>

    <!-- 九中心 -->
    <g class="centers">
      <polygon
        v-for="shape in CENTER_SHAPES"
        :key="shape.id"
        :points="polygonPoints(shape.id)"
        :fill="centerFill(shape.id)"
        :stroke="highlightCenters.has(shape.id) ? 'var(--status-warning)' : '#111318'"
        :stroke-width="highlightCenters.has(shape.id) ? 4 : 2.2"
        stroke-linejoin="round"
        filter="url(#hd-center-shadow)"
        :class="{
          'is-clickable': centerClickable(shape.id),
          'is-lit': definedCenters.has(shape.id),
        }"
        @click="onCenter(shape.id)"
      />
    </g>

    <!-- 闸门：激活=深蓝实心 + 白字；未激活=空心圆 + 黑字（位置固定） -->
    <g class="gates">
      <g
        v-for="point in GATE_POINTS"
        :key="point.gate"
        :opacity="gateHidden(point.gate) ? 0.18 : 1"
      >
        <!-- 潜意识（设计侧）：蓝底白字；显意识（个性侧）：无底圈纯黑字 -->
        <circle
          v-if="gateLit(point.gate) && (gateIsDesign(point.gate) || mode === 'composite')"
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
          :y="point.y + 4.2"
          text-anchor="middle"
          :fill="gateTextFill(point.gate)"
          :font-size="gateLit(point.gate) ? 13 : 12"
          :font-weight="gateLit(point.gate) ? 700 : 600"
          font-family="var(--font-mono)"
          :pointer-events="gateLit(point.gate) && !gateIsDesign(point.gate) && mode === 'single' ? 'auto' : 'none'"
          :class="{ 'is-clickable': gateLit(point.gate) && !gateIsDesign(point.gate) }"
          @click="gateLit(point.gate) && !gateIsDesign(point.gate) && onGate(point.gate)"
        >
          {{ point.gate }}
        </text>

        <!-- 命中区：比可视圆更大，方便触屏与鼠标 -->
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
  overflow: visible;
  touch-action: manipulation;
}

.centers polygon {
  transition:
    fill var(--dur-base) ease,
    stroke var(--dur-base) ease,
    stroke-width var(--dur-base) ease;
}

.is-clickable {
  cursor: pointer;
}

.centers polygon.is-clickable:hover {
  stroke: var(--owner-shared);
  stroke-width: 3.4;
}

.gates circle.is-active {
  transition:
    fill var(--dur-fast) ease,
    stroke-width var(--dur-fast) ease,
    transform var(--dur-fast) var(--ease-spring);
  transform-box: fill-box;
  transform-origin: center;
}

.gates circle.is-idle {
  transition:
    fill var(--dur-fast) ease,
    stroke var(--dur-fast) ease,
    stroke-width var(--dur-fast) ease;
}

.gates g:hover circle.is-clickable {
  stroke-width: 3;
  transform: scale(1.08);
}

.gates text.is-clickable {
  cursor: pointer;
}

.channels line {
  transition:
    opacity var(--dur-fast) ease,
    stroke-width var(--dur-fast) ease;
}

.channels line.is-overlay {
  pointer-events: none;
}

.channels line.is-clickable:hover {
  stroke-width: 10;
}

.channels line.is-dim {
  opacity: 0.26 !important;
}

.gates text,
.center-labels text {
  user-select: none;
}
</style>
