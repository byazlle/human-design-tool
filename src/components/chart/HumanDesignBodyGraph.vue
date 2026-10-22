<script setup lang="ts">
/**
 * 人体图渲染（支持多版本绘图程序，规则统一）：
 *
 * 绘图程序（可在设置中切换，立即生效）：
 *   - v1 底图对齐版：青色底板 + 人体剪影 + 白色通道管 + 白中心黑描边
 *   - v2 Free Human Design 版：参考实现布局与渐变配色（八角星 G、紧凑比例）
 *
 * 数据层规则（两版一致）：
 *   - 通道：显意识 = 纯黑实线；潜意识 = 纯红实线；两侧意识并存 = 红黑交替
 *     斑马线分段实线；取消一切虚线与混色叠涂
 *   - 悬挂闸门：按意识归属取色的实线短段（无虚线）
 *   - 闸门：激活即高亮——显意识黑底白字、潜意识红底白字、两侧同激黑底红环；
 *     未激活闸门保持白底灰字，开/合对比明显；数字统一放大
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

/* ── 闸门（统一高亮：黑=显意识，红=潜意识，黑底红环=两侧同激） ── */

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
function gateIsPersonality(gate: number): boolean {
  return personalityGates.value.has(gate)
}
/** 激活闸门一律渲染高亮圆点（显/潜/双意识统一） */
function gateHasCircle(gate: number): boolean {
  return gateLit(gate)
}
function gateFill(gate: number): string {
  if (props.mode === 'composite' && gateLit(gate)) return ownerVar(props.gateOwners[gate])
  if (gateIsDesign(gate) && gateIsPersonality(gate)) return 'var(--hd-line-p)'
  return gateIsDesign(gate) ? 'var(--hd-line-d)' : 'var(--hd-line-p)'
}
function gateTextFill(gate: number): string {
  if (props.mode === 'composite' && gateLit(gate)) return '#ffffff'
  return gateHasCircle(gate) ? '#ffffff' : '#111318'
}
function gateStroke(gate: number): string {
  if (highlightGates.value.has(gate) && gateLit(gate)) return 'var(--status-warning)'
  // 双意识同激：黑底加红环，一眼可辨
  if (gateLit(gate) && gateIsDesign(gate) && gateIsPersonality(gate)) return 'var(--hd-line-d)'
  return gateHasCircle(gate) ? 'rgba(255, 255, 255, 0.9)' : 'transparent'
}
function gateStrokeWidth(gate: number): number {
  if (highlightGates.value.has(gate) && gateLit(gate)) return 3.6
  if (gateLit(gate) && gateIsDesign(gate) && gateIsPersonality(gate)) return 3.2
  return gateHasCircle(gate) ? 1.6 : 0
}

/* ── 通道（纯色 / 斑马线，无虚线无叠涂） ─────────────── */

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
/** 悬挂闸门的意识归属：仅设计侧 → 红；仅个性侧 → 黑；两侧同激 → 斑马线 */
function gateConsciousness(gate: number): Consciousness {
  const p = personalityGates.value.has(gate)
  const d = designGates.value.has(gate)
  if (p && d) return 'mixed'
  return d ? 'd' : 'p'
}
function colorOf(c: Consciousness): string {
  if (c === 'd') return 'var(--hd-line-d)'
  return 'var(--hd-line-p)'
}

const visibleChannels = computed(() => layout.value.channels.filter((l) => !l.internal))

/** 通道折线点（无 reroute 时为两端点） */
function routeOf(l: { x1: number; y1: number; x2: number; y2: number; points?: Array<[number, number]> }) {
  return l.points && l.points.length >= 2 ? l.points : ([[l.x1, l.y1], [l.x2, l.y2]] as Array<[number, number]>)
}

function polyStr(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ')
}

/** 沿折线按段长切分（返回每小段的起止点），用于红黑交替斑马线 */
function splitAlong(pts: Array<[number, number]>, segLen: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = []
  let carry = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 1e-6) continue
    let s = -carry // 该边内已消费的长度
    while (s < len) {
      const e = Math.min(s + segLen, len)
      const t1 = Math.max(0, s) / len
      const t2 = e / len
      out.push([ax + (bx - ax) * t1, ay + (by - ay) * t1, ax + (bx - ax) * t2, ay + (by - ay) * t2])
      s = e
    }
    carry = (s - len)
  }
  return out
}

/** 折线总长 */
function pathLength(pts: Array<[number, number]>): number {
  let total = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  return total
}

interface SegPiece {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
}

/** 斑马线：红黑交替的实线分段 */
function zebraPieces(
  baseKey: string,
  pts: Array<[number, number]>,
  consciousness: Consciousness,
  width: number,
): SegPiece[] {
  if (consciousness !== 'mixed') {
    const stroke = colorOf(consciousness)
    return [
      {
        key: baseKey,
        x1: pts[0][0],
        y1: pts[0][1],
        x2: pts[pts.length - 1][0],
        y2: pts[pts.length - 1][1],
        stroke,
      },
    ]
  }
  const segLen = Math.max(width * 1.7, 10)
  return splitAlong(pts, segLen).map(([x1, y1, x2, y2], i) => ({
    key: `${baseKey}-z${i}`,
    x1,
    y1,
    x2,
    y2,
    stroke: i % 2 === 0 ? 'var(--hd-line-d)' : 'var(--hd-line-p)',
  }))
}

const fullChannels = computed(() => {
  const out: Array<{ key: string; pieces: SegPiece[]; width: number }> = []
  for (const l of visibleChannels.value) {
    if (!definedChannels.value.has(l.key)) continue
    if (!channelVisible(l.key)) continue
    const pts = routeOf(l).map((p) => [p[0], p[1]] as [number, number])
    const a = layout.value.gates.find((g) => g.gate === l.gates[0])!
    const b = layout.value.gates.find((g) => g.gate === l.gates[1])!
    const t = 0.12
    // 两端向中心内延伸，贴近数字
    pts[0] = [pts[0][0] + (a.x - pts[0][0]) * t, pts[0][1] + (a.y - pts[0][1]) * t]
    const last = pts.length - 1
    pts[last] = [pts[last][0] + (b.x - pts[last][0]) * t, pts[last][1] + (b.y - pts[last][1]) * t]
    const consciousness =
      props.mode === 'composite' ? 'mixed' : channelConsciousness(l.gates[0], l.gates[1])
    let pieces: SegPiece[]
    if (props.mode === 'composite') {
      pieces = [
        {
          key: l.key,
          x1: pts[0][0],
          y1: pts[0][1],
          x2: pts[pts.length - 1][0],
          y2: pts[pts.length - 1][1],
          stroke: ownerVar(props.channelOwners[l.key]),
        },
      ]
    } else {
      pieces = zebraPieces(l.key, pts, consciousness, layout.value.chW)
    }
    out.push({ key: l.key, pieces, width: channelWidth(l.key) })
  }
  return out
})

const hangingChannels = computed(() => {
  const out: Array<{ key: string; pieces: SegPiece[]; width: number }> = []
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
    const ex = sx + (ox - sx) * 0.45
    const ey = sy + (oy - sy) * 0.45
    const stroke =
      props.mode === 'composite'
        ? ownerVar(props.gateOwners[gate])
        : colorOf(gateConsciousness(gate))
    out.push({
      key: `hang-${l.key}`,
      width: layout.value.chW - 2,
      pieces: [{ key: `hang-${l.key}`, x1: sx, y1: sy, x2: ex, y2: ey, stroke }],
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

    <!-- 通道底板线槽（只画空白管：激活通道由彩色实线/斑马线整段覆盖，不再叠涂） -->
    <g class="tubes">
      <template v-for="line in visibleChannels" :key="`t-${line.key}`">
        <polyline
          v-if="!definedChannels.has(line.key) || !channelVisible(line.key)"
          :points="polyStr(routeOf(line))"
          fill="none"
          :stroke="isV1 ? 'var(--hd-tube-edge)' : 'var(--hd-tube-edge-v2)'"
          :stroke-width="layout.tubeW + 4"
          :opacity="channelVisible(line.key) ? 0.85 : 0.12"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <polyline
          v-if="!definedChannels.has(line.key) || !channelVisible(line.key)"
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

    <!-- 悬挂通道：实线短段（无虚线） -->
    <g class="channels hanging">
      <template v-for="seg in hangingChannels" :key="seg.key">
        <line
          v-for="piece in seg.pieces"
          :key="piece.key"
          :x1="piece.x1"
          :y1="piece.y1"
          :x2="piece.x2"
          :y2="piece.y2"
          :stroke="piece.stroke"
          :stroke-width="seg.width"
          stroke-linecap="butt"
          opacity="0.95"
        />
      </template>
    </g>

    <!-- 完整通道：纯色实线 / 红黑斑马线分段 -->
    <g class="channels full">
      <template v-for="seg in fullChannels" :key="seg.key">
        <line
          v-for="piece in seg.pieces"
          :key="piece.key"
          :x1="piece.x1"
          :y1="piece.y1"
          :x2="piece.x2"
          :y2="piece.y2"
          :stroke="piece.stroke"
          :stroke-width="seg.width"
          :class="{ 'is-clickable': interactive }"
          stroke-linecap="butt"
          @click="onChannel(seg.key)"
        />
      </template>
    </g>

    <!-- 闸门：激活即高亮（黑=显意识 / 红=潜意识 / 黑底红环=双意识） -->
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
