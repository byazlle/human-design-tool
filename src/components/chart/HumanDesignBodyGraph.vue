<script setup lang="ts">
/**
 * 人体图 SVG 渲染组件（正统排布 + 卡通化描边）
 * - 只负责渲染，不做任何计算
 * - 单盘：激活闸门/通道用 --hd-single-accent
 * - 合盘：按 gateOwners / channelOwners 上色（A 蓝 / B 橙 / 共享紫）
 *
 * 状态约定（关键）：
 * - 已激活闸门：内部填实色（深色或归属色），数字为白色 —— 表示"点亮"
 * - 未激活闸门：内部保持底色，外侧套一圈描边圈，数字为次级色 —— 只做存在标识
 * - highlight 只改变描边颜色，绝不把未激活闸门伪装成已激活（修复误亮问题）
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

function gateFill(gate: number): string {
  if (props.mode === 'composite' && gateLit(gate)) return ownerVar(props.gateOwners[gate])
  // 单盘：用比中心更亮一档的颜色，保证圆点在深色中心上仍能看出边界
  return 'var(--hd-gate-lit-fill)'
}

function gateTextFill(gate: number): string {
  return gateLit(gate) ? '#ffffff' : 'var(--text-secondary)'
}

function gateStroke(gate: number): string {
  // 高亮只对「已激活」的闸门生效：未激活闸门被点开时仅有释义，不产生点亮错觉
  if (highlightGates.value.has(gate) && gateLit(gate)) return 'var(--status-warning)'
  return gateLit(gate) ? 'rgba(255,255,255,0.9)' : 'var(--hd-gate-ring)'
}

function gateStrokeWidth(gate: number): number {
  if (highlightGates.value.has(gate) && gateLit(gate)) return 3.4
  return gateLit(gate) ? 2.2 : 1.6
}

function channelStroke(key: string): string {
  const isDefined = definedChannels.value.has(key)
  if (!isDefined) return 'var(--hd-channel)'
  if (props.mode === 'composite') return ownerVar(props.channelOwners[key])
  return 'var(--hd-single-accent)'
}

/** 线条加粗：已定义 7，未定义 3.2，高亮 9 */
function channelWidth(key: string): number {
  if (highlightChannels.value.has(key)) return 13
  return definedChannels.value.has(key) ? 10 : 2.8
}

function channelOpacity(key: string): number {
  const defined = definedChannels.value.has(key)
  if (highlightChannels.value.size && !highlightChannels.value.has(key)) return defined ? 0.34 : 0.16
  return defined ? 1 : 0.42
}

function channelDash(key: string): string {
  return definedChannels.value.has(key) ? 'none' : '7 7'
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
      <!-- 卡通化：中心填充用极轻的斜向渐变，避免纯色死板 -->
      <linearGradient id="hd-defined-fill" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="var(--hd-center-defined-top)" />
        <stop offset="100%" stop-color="var(--hd-center-defined-bottom)" />
      </linearGradient>
      <linearGradient id="hd-undef-fill" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="var(--hd-center-undef-top)" />
        <stop offset="100%" stop-color="var(--hd-center-undef-bottom)" />
      </linearGradient>
      <!-- 中心投影：让图形"立起来"，卡通感更强 -->
      <filter id="hd-center-shadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="3" stdDeviation="3.2" flood-color="#101828" flood-opacity="0.2" />
      </filter>
      <filter id="hd-gate-shadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#101828" flood-opacity="0.34" />
      </filter>
    </defs>

    <!-- 通道：先画未定义（底噪），再画已定义（主体），保证已定义永远在上层 -->
    <g class="channels">
      <line
        v-for="line in CHANNEL_LINES.filter((l) => !definedChannels.has(l.key))"
        :key="`u-${line.key}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :stroke="'var(--hd-channel)'"
        :stroke-width="3.2"
        :stroke-dasharray="'9 9'"
        :opacity="channelVisible(line.key) ? 0.32 : 0"
        stroke-linecap="round"
      />
      <line
        v-for="line in CHANNEL_LINES.filter((l) => definedChannels.has(l.key))"
        :key="`o-${line.key}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        stroke="var(--hd-channel-halo)"
        :stroke-width="channelWidth(line.key) + 4.5"
        :opacity="channelVisible(line.key) ? 0.95 : 0"
        stroke-linecap="round"
      />
      <line
        v-for="line in CHANNEL_LINES.filter((l) => definedChannels.has(l.key))"
        :key="`d-${line.key}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :stroke="channelStroke(line.key)"
        :stroke-width="channelWidth(line.key)"
        :opacity="channelVisible(line.key) ? channelOpacity(line.key) : 0"
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
        :fill="
          definedCenters.has(shape.id) ? 'var(--hd-center-defined)' : 'var(--hd-center-undef)'
        "
        :stroke="
          highlightCenters.has(shape.id)
            ? 'var(--status-warning)'
            : 'var(--hd-center-defined)'
        "
        :stroke-width="highlightCenters.has(shape.id) ? 4 : 3.2"
        :stroke-dasharray="definedCenters.has(shape.id) ? 'none' : '0'"
        stroke-linejoin="round"
        filter="url(#hd-center-shadow)"
        :class="{
          'is-clickable': centerClickable(shape.id),
          'is-lit': definedCenters.has(shape.id),
        }"
        @click="onCenter(shape.id)"
      />
    </g>

    <!-- 闸门：激活=实心深色，未激活=底色 + 外圈标识 -->
    <g class="gates">
      <g
        v-for="point in GATE_POINTS"
        :key="point.gate"
        :opacity="gateHidden(point.gate) ? 0.18 : 1"
      >
        <!-- 未激活：外侧描边圈 + 内部保持底色（不填黑） -->
        <circle
          v-if="!gateLit(point.gate)"
          :cx="point.x"
          :cy="point.y"
          :r="GATE_R"
          fill="var(--hd-gate-idle-bg)"
          :stroke="gateStroke(point.gate)"
          :stroke-width="gateStrokeWidth(point.gate)"
          :stroke-dasharray="highlightGates.has(point.gate) ? 'none' : '0'"
          :class="{ 'is-clickable': interactive, 'is-idle': true }"
          @click="onGate(point.gate)"
        />
        <!-- 激活：实心点亮 -->
        <circle
          v-else
          :cx="point.x"
          :cy="point.y"
          :r="GATE_R"
          :fill="gateFill(point.gate)"
          :stroke="gateStroke(point.gate)"
          :stroke-width="gateStrokeWidth(point.gate)"
          filter="url(#hd-gate-shadow)"
          class="is-active"
          :class="{ 'is-clickable': interactive, 'is-highlight': highlightGates.has(point.gate) }"
          @click="onGate(point.gate)"
        />

        <text
          v-if="!compact"
          :x="point.x"
          :y="point.y + 4.2"
          text-anchor="middle"
          :fill="gateTextFill(point.gate)"
          :font-size="gateLit(point.gate) ? 13 : 12"
          :font-weight="gateLit(point.gate) ? 700 : 500"
          font-family="var(--font-mono)"
          pointer-events="none"
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
  stroke-width: 3.2;
  transform: scale(1.08);
}

.gates circle.is-highlight {
  stroke: var(--status-warning);
  stroke-width: 3.4;
}

.channels line {
  transition:
    opacity var(--dur-fast) ease,
    stroke-width var(--dur-fast) ease;
}

.channels line.is-clickable:hover {
  opacity: 1;
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
