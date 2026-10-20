<script setup lang="ts">
/**
 * 人体图 SVG 渲染组件（DESIGN.md §4.5）
 * - 只负责渲染，不做任何计算
 * - 单盘：激活闸门/通道用 --hd-single-accent
 * - 合盘：按 gateOwners / channelOwners 上色（A 蓝 / B 橙 / 共享紫）
 */
import { computed } from 'vue'
import type { BodyGraph, CenterId, Ownership, UiFilter } from '../../types/hd'
import { CENTER_SHAPES, CHANNEL_LINES, GATE_POINTS, VIEW_BOX, GATE_R } from './bodyGraphLayout'

const props = withDefaults(
  defineProps<{
    chart: BodyGraph
    mode?: 'single' | 'composite'
    gateOwners?: Record<number, Ownership>
    channelOwners?: Record<string, Ownership>
    filter?: UiFilter
    highlight?: { gates?: number[]; channels?: string[] }
    interactive?: boolean
    compact?: boolean
  }>(),
  {
    mode: 'single',
    gateOwners: () => ({}),
    channelOwners: () => ({}),
    filter: () => ({ showDecimals: true, showColorToneBase: true, sharedOnly: false }),
    highlight: () => ({}),
    interactive: true,
    compact: false,
  },
)

const emit = defineEmits<{
  'gate-click': [gate: number, source: 'a' | 'b' | 'merged' | 'single']
  'channel-click': [key: string, source: 'a' | 'b' | 'merged' | 'single']
  'center-click': [id: CenterId, source: 'a' | 'b' | 'merged' | 'single']
}>()

type Source = 'a' | 'b' | 'merged' | 'single'

const sourceOf = (): Source => {
  if (props.mode === 'single') return 'single'
  return 'merged'
}

const activated = computed(() => new Set(props.chart.gates.map((g) => g.gate)))
const definedChannels = computed(() => new Set(props.chart.channels.map((c) => c.key)))
const definedCenters = computed(
  () => new Set(props.chart.centers.filter((c) => c.defined).map((c) => c.id)),
)
const highlightGates = computed(() => new Set(props.highlight?.gates ?? []))
const highlightChannels = computed(() => new Set(props.highlight?.channels ?? []))

const sharedOnly = computed(() => props.mode === 'composite' && props.filter.sharedOnly)

function gateVisible(gate: number): boolean {
  if (!activated.value.has(gate) && !highlightGates.value.has(gate)) return false
  if (sharedOnly.value) return props.gateOwners[gate] === 'shared'
  return true
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

function gateFill(gate: number): string {
  if (!gateVisible(gate)) return 'var(--hd-gate-bg)'
  if (props.mode === 'composite') return ownerVar(props.gateOwners[gate])
  return 'var(--hd-single-accent)'
}

function channelStroke(key: string): string {
  const isDefined = definedChannels.value.has(key)
  if (!isDefined) return 'var(--hd-channel)'
  if (props.mode === 'composite') return ownerVar(props.channelOwners[key])
  return 'var(--hd-single-accent)'
}

function channelWidth(key: string): number {
  const isDefined = definedChannels.value.has(key)
  if (highlightChannels.value.has(key)) return 5
  return isDefined ? 4 : 2
}

function channelOpacity(key: string): number {
  if (highlightChannels.value.size && !highlightChannels.value.has(key)) return 0.35
  return definedChannels.value.has(key) ? 1 : 0.22
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

function pointsOf(id: CenterId): string {
  return CENTER_SHAPES[id].polygon.map(([x, y]) => `${x},${y}`).join(' ')
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
    <!-- 通道 -->
    <g class="channels">
      <line
        v-for="line in CHANNEL_LINES"
        :key="line.key"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :stroke="channelStroke(line.key)"
        :stroke-width="channelWidth(line.key)"
        :opacity="channelVisible(line.key) ? channelOpacity(line.key) : 0"
        :class="{
          'is-defined': definedChannels.has(line.key),
          'is-clickable': interactive && definedChannels.has(line.key),
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
        :points="pointsOf(shape.id)"
        :fill="
          definedCenters.has(shape.id) ? 'var(--hd-center-defined)' : 'var(--hd-center-undef)'
        "
        :stroke="definedCenters.has(shape.id) ? 'var(--hd-center-defined)' : 'var(--border-strong)'"
        stroke-width="2"
        stroke-linejoin="round"
        :class="{ 'is-clickable': interactive }"
        @click="onCenter(shape.id)"
      />
    </g>

    <!-- 闸门：激活画圆点，未激活只留编号（传统人体图惯例，避免 64 个白点糊成一片） -->
    <g class="gates">
      <g
        v-for="point in GATE_POINTS"
        :key="point.gate"
      >
        <template v-if="gateVisible(point.gate)">
          <circle
            :cx="point.x"
            :cy="point.y"
            :r="GATE_R"
            :fill="gateFill(point.gate)"
            :stroke="
              definedCenters.has(point.center) ? 'rgba(255,255,255,0.85)' : 'var(--hd-gate-stroke)'
            "
            stroke-width="1.6"
            class="is-active"
            :class="{ 'is-clickable': interactive, 'is-highlight': highlightGates.has(point.gate) }"
            @click="onGate(point.gate)"
          />
          <text
            v-if="!compact"
            :x="point.x"
            :y="point.y + 4.6"
            text-anchor="middle"
            fill="#ffffff"
            font-size="14"
            font-weight="600"
            font-family="var(--font-mono)"
            pointer-events="none"
          >
            {{ point.gate }}
          </text>
        </template>
        <text
          v-else-if="!compact"
          :x="point.x"
          :y="point.y + 4"
          text-anchor="middle"
          :fill="
            definedCenters.has(point.center)
              ? 'rgba(255,255,255,0.78)'
              : 'var(--text-muted)'
          "
          font-size="12"
          font-family="var(--font-mono)"
          pointer-events="none"
        >
          {{ point.gate }}
        </text>
        <!-- 触摸/点击命中区（独立于可视半径） -->
        <circle
          v-if="interactive"
          :cx="point.x"
          :cy="point.y"
          r="18"
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
  transition: fill 120ms ease;
}

.is-clickable {
  cursor: pointer;
}

.gates circle.is-active {
  transition:
    fill 120ms ease,
    stroke-width 120ms ease;
}

.gates g:hover circle.is-clickable,
.gates g:focus-within circle.is-clickable {
  stroke-width: 3;
}

.gates circle.is-highlight {
  stroke: var(--status-warning);
  stroke-width: 3;
}

.hit:hover + * {
  opacity: 0.9;
}

.channels line {
  transition:
    opacity 120ms ease,
    stroke-width 120ms ease;
}

.channels line.is-clickable:hover {
  opacity: 1;
  stroke-width: 6;
}

.gates text {
  user-select: none;
}
</style>
