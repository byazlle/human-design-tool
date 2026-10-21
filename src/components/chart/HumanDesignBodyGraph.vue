<script setup lang="ts">
/**
 * 人体图渲染（支持多版本绘图程序，规则统一）：
 *
 * 绘图程序（可在设置中切换，立即生效）：
 *   - v1 底图对齐版：青色底板 + 人体剪影 + 白色通道管 + 白中心黑描边
 *   - v2 Free Human Design 版：参考实现布局与渐变配色（八角星 G、紧凑比例）
 *
 * 数据层规则（两版一致）：
 *   - 通道：双潜意识=红实线；双显意识=黑实线；一潜一显=红黑条纹；
 *           仅单端=红/黑分段虚线（悬挂，不构成完整通道）；两端未激活=不叠加彩色
 *   - 闸门：潜意识（设计侧）=蓝底白字；显意识（个性侧）=无底圈黑字
 *   - 中心：任一完整通道接入→有定义（专属色/专属渐变）；否则白底黑描边
 */
import { computed } from 'vue'
import type { BodyGraph, CenterId, Ownership, UiFilter } from '../../types/hd'
import { layoutOf, polygonOf, type DrawingEngine } from './layouts'
import { SILHOUETTE_PATH } from './bodyGraphLayout'

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
    /** 绘图程序版本 */
    engine?: DrawingEngine
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
    engine: 'v1',
  },
)

const emit = defineEmits<{
  'gate-click': [gate: number, source: 'a' | 'b' | 'merged' | 'single']
  'channel-click': [key: string, source: 'a' | 'b' | 'merged' | 'single']
  'center-click': [id: CenterId, source: 'a' | 'b' | 'merged' | 'single']
}>()

type Source = 'a' | 'b' | 'merged' | 'single'
const sourceOf = (): Source => (props.mode === 'single' ? 'single' : 'merged')

const layout = computed(() => layoutOf(props.engine))
const isV1 = computed(() => layout.value.plate === 'cyan')

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

/** 版本一：每中心固定专属色 */
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
  if (!definedCenters.value.has(id)) return '#ffffff'
  const c = layout.value.centers.find((x) => x.id === id)
  if (c?.gradient?.length) return `url(#hd-cg-${id})`
  return CENTER_COLORS[id]
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
  if (highlightGates.value.has(gate) && gateLit(gate)) return 3.6
  return gateHasCircle(gate) ? 1.8 : 0
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
/**
 * 悬挂闸门的意识归属（决定半段虚线的颜色）：
 * 仅设计侧 → 红；仅个性侧 → 黑；两侧同时激活 → 红黑交替（mixed）
 */
function gateConsciousness(gate: number): Consciousness {
  const p = personalityGates.value.has(gate)
  const d = designGates.value.has(gate)
  if (p && d) return 'mixed'
  return d ? 'd' : 'p'
}
function colorOf(c: Consciousness): string {
  if (c === 'd') return '#e02020'
  if (c === 'p') return '#111318'
  return 'url(#hd-stripe)'
}
function channelStroke(key: string): string {
  const line = layout.value.channels.find((l) => l.key === key)
  if (!line) return 'var(--hd-single-accent)'
  if (props.mode === 'composite') return ownerVar(props.channelOwners[key])
  return colorOf(channelConsciousness(line.gates[0], line.gates[1]))
}

const visibleChannels = computed(() => layout.value.channels.filter((l) => !l.internal))

/** 通道折线点（无 reroute 时为两端点） */
function routeOf(l: { x1: number; y1: number; x2: number; y2: number; points?: Array<[number, number]> }) {
  return l.points && l.points.length >= 2 ? l.points : ([[l.x1, l.y1], [l.x2, l.y2]] as Array<[number, number]>)
}

function polyStr(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ')
}

const fullChannels = computed(() =>
  visibleChannels.value
    .filter((l) => definedChannels.value.has(l.key))
    .map((l) => {
      const pts = routeOf(l).map((p) => [p[0], p[1]] as [number, number])
      const a = layout.value.gates.find((g) => g.gate === l.gates[0])!
      const b = layout.value.gates.find((g) => g.gate === l.gates[1])!
      const t = 0.12
      // 两端向中心内延伸，贴近数字
      pts[0] = [pts[0][0] + (a.x - pts[0][0]) * t, pts[0][1] + (a.y - pts[0][1]) * t]
      const last = pts.length - 1
      pts[last] = [pts[last][0] + (b.x - pts[last][0]) * t, pts[last][1] + (b.y - pts[last][1]) * t]
      return { key: l.key, points: polyStr(pts), stroke: channelStroke(l.key) }
    }),
)

const hangingChannels = computed(() => {
  const out: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; stroke: string }> = []
  if (sharedOnly.value) return out
  for (const l of visibleChannels.value) {
    const [g0, g1] = l.gates
    const a0 = activated.value.has(g0)
    const a1 = activated.value.has(g1)
    if (a0 === a1) continue
    const gate = a0 ? g0 : g1
    const p = layout.value.gates.find((g) => g.gate === gate)!
    const isStart = gate === g0
    const route = routeOf(l)
    const bx = isStart ? route[0][0] : route[route.length - 1][0]
    const by = isStart ? route[0][1] : route[route.length - 1][1]
    const ox = isStart ? route[1][0] : route[route.length - 2][0]
    const oy = isStart ? route[1][1] : route[route.length - 2][1]
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
  return highlightChannels.value.has(key) ? layout.value.chW + 4 : layout.value.chW
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
    :class="[`engine-${layout.id}`, { compact }]"
    :viewBox="layout.viewBox.str"
    role="img"
    aria-label="人类图人体图"
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <linearGradient id="hd-plate" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" stop-color="var(--hd-plate-top)" />
        <stop offset="55%" stop-color="var(--hd-plate-mid)" />
        <stop offset="100%" stop-color="var(--hd-plate-bottom)" />
      </linearGradient>

      <!-- 版本二：每中心专属渐变（有定义时填充） -->
      <template v-if="!isV1">
        <linearGradient
          v-for="c in layout.centers.filter((x) => x.gradient)"
          :id="`hd-cg-${c.id}`"
          :key="`cg-${c.id}`"
          x1="0"
          y1="0"
          x2="0.4"
          y2="1"
        >
          <stop
            v-for="([off, color], i) in c.gradient!"
            :key="i"
            :offset="`${off}%`"
            :stop-color="color"
          />
        </linearGradient>
      </template>

      <pattern
        id="hd-stripe"
        :width="isV1 ? 16 : 12"
        :height="isV1 ? 16 : 12"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <rect :width="isV1 ? 16 : 12" :height="isV1 ? 16 : 12" fill="#111318" />
        <rect :width="isV1 ? 8 : 6" :height="isV1 ? 16 : 12" fill="#e02020" />
      </pattern>
      <filter id="hd-gate-shadow" x="-70%" y="-70%" width="240%" height="240%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#0b2530" flood-opacity="0.3" />
      </filter>
      <filter id="hd-center-shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0b2530" flood-opacity="0.16" />
      </filter>
    </defs>

    <!-- 底板（仅版本一）：青色渐变 + 人体剪影 -->
    <g v-if="isV1" class="plate">
      <rect
        :x="layout.viewBox.x"
        :y="layout.viewBox.y"
        :width="layout.viewBox.w"
        :height="layout.viewBox.h"
        fill="url(#hd-plate)"
      />
      <path :d="SILHOUETTE_PATH" class="silhouette" fill="var(--hd-plate-figure)" opacity="0.55" />
    </g>

    <!-- 通道底板线槽（两版都画，颜色按版本区分） -->
    <g class="tubes">
      <template v-for="line in visibleChannels" :key="`t-${line.key}`">
        <polyline
          :points="polyStr(routeOf(line))"
          fill="none"
          :stroke="isV1 ? 'var(--hd-tube-edge)' : 'var(--hd-tube-edge-v2)'"
          :stroke-width="layout.tubeW + 4"
          :opacity="channelVisible(line.key) ? 0.85 : 0.12"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <polyline
          :points="polyStr(routeOf(line))"
          fill="none"
          :stroke="isV1 ? 'var(--hd-tube)' : 'var(--hd-tube-v2)'"
          :stroke-width="layout.tubeW"
          :opacity="channelVisible(line.key) ? 1 : 0.14"
          :class="{ 'is-clickable': interactive }"
          stroke-linecap="round"
          stroke-linejoin="round"
          @click="onChannel(line.key)"
        />
      </template>
    </g>

    <!-- 九中心 -->
    <g class="centers">
      <polygon
        v-for="shape in layout.centers"
        :key="shape.id"
        :points="polygonOf(layout, shape.id)"
        :fill="centerFill(shape.id)"
        :stroke="highlightCenters.has(shape.id) ? 'var(--status-warning)' : '#0d1216'"
        :stroke-width="highlightCenters.has(shape.id) ? 5 : 3"
        stroke-linejoin="round"
        filter="url(#hd-center-shadow)"
        :class="{ 'is-clickable': centerClickable(shape.id), 'is-lit': definedCenters.has(shape.id) }"
        @click="onCenter(shape.id)"
      />
    </g>

    <!-- 悬挂通道：红/黑分段虚线 -->
    <g class="channels hanging">
      <line
        v-for="seg in hangingChannels"
        :key="seg.key"
        :x1="seg.x1"
        :y1="seg.y1"
        :x2="seg.x2"
        :y2="seg.y2"
        :stroke="seg.stroke"
        :stroke-width="layout.chW - 2"
        stroke-dasharray="14 12"
        stroke-linecap="butt"
        opacity="0.95"
      />
    </g>

    <!-- 完整通道 -->
    <g class="channels full">
      <polyline
        v-for="seg in fullChannels"
        :key="seg.key"
        :points="seg.points"
        fill="none"
        :stroke="seg.stroke"
        :stroke-width="channelWidth(seg.key)"
        :opacity="channelVisible(seg.key) ? 1 : 0"
        :class="{ 'is-clickable': interactive }"
        stroke-linecap="round"
        stroke-linejoin="round"
        @click="onChannel(seg.key)"
      />
    </g>

    <!-- 闸门 -->
    <g class="gates">
      <g
        v-for="point in layout.gates"
        :key="point.gate"
        :opacity="gateHidden(point.gate) ? 0.18 : 1"
      >
        <circle
          v-if="gateHasCircle(point.gate)"
          :cx="point.x"
          :cy="point.y"
          :r="layout.gateR"
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
          :y="point.y + layout.gateFont * 0.34"
          text-anchor="middle"
          :fill="gateTextFill(point.gate)"
          :font-size="layout.gateFont"
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
          :r="layout.gateR + 8"
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

/* 版本二：中心描边更细，贴合参考实现 */
.engine-v2 .centers polygon {
  stroke-width: 2.2;
}
</style>
