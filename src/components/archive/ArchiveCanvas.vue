<script setup lang="ts">
/** 桌面自由画布：绝对定位卡片 + 拖拽 + 缩放（DESIGN.md §4.2 / §5） */
import { computed, reactive, ref, watch } from 'vue'
import type { Archive } from '../../types/hd'
import ArchiveCard from './ArchiveCard.vue'
import { loadJson, saveJson } from '../../utils/storage'

const props = withDefaults(
  defineProps<{ archives: Archive[]; selectedIds: string[]; zoom?: number }>(),
  { zoom: 1 },
)

const emit = defineEmits<{
  open: [id: string]
  'add-to-composite': [id: string]
  close: [id: string]
  'toggle-select': [id: string]
}>()

const POS_KEY = 'hdt.canvas.v1'
const CARD_W = 260
const CARD_H = 340
const GAP_X = 32
const GAP_Y = 32

const positions = reactive<Record<string, { x: number; y: number }>>(
  loadJson<Record<string, { x: number; y: number }>>(POS_KEY, {}),
)

const canvas = ref<HTMLElement | null>(null)

/** 新出现的档案自动排布（按列优先，避免与已有卡片重叠） */
function ensureLayout() {
  const cols = 4
  props.archives.forEach((a, index) => {
    if (!positions[a.id]) {
      positions[a.id] = {
        x: 24 + (index % cols) * (CARD_W + GAP_X),
        y: 24 + Math.floor(index / cols) * (CARD_H + GAP_Y),
      }
    }
  })
  const ids = new Set(props.archives.map((a) => a.id))
  Object.keys(positions).forEach((id) => {
    if (!ids.has(id)) delete positions[id]
  })
  saveJson(POS_KEY, { ...positions })
}

watch(() => props.archives.map((a) => a.id).join('|'), ensureLayout, { immediate: true })

const canvasHeight = computed(() => {
  const maxY = Object.values(positions).reduce((m, p) => Math.max(m, p.y + CARD_H), CARD_H)
  return maxY + 120
})

interface DragState {
  id: string
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}
const drag = ref<DragState | null>(null)

function onDragStart(id: string, event: PointerEvent) {
  event.preventDefault()
  const pos = positions[id] ?? { x: 0, y: 0 }
  drag.value = {
    id,
    startX: event.clientX,
    startY: event.clientY,
    originX: pos.x,
    originY: pos.y,
    moved: false,
  }
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
}

function onDragMove(event: PointerEvent) {
  const d = drag.value
  if (!d) return
  const dx = (event.clientX - d.startX) / props.zoom
  const dy = (event.clientY - d.startY) / props.zoom
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true
  positions[d.id] = {
    x: Math.max(0, d.originX + dx),
    y: Math.max(0, d.originY + dy),
  }
}

function onDragEnd() {
  if (drag.value) saveJson(POS_KEY, { ...positions })
  drag.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
}
</script>

<template>
  <div ref="canvas" class="canvas" :style="{ height: `${canvasHeight * zoom}px` }">
    <div
      class="plane"
      :style="{ transform: `scale(${zoom})`, transformOrigin: '0 0' }"
    >
      <ArchiveCard
        v-for="archive in archives"
        :key="archive.id"
        :archive="archive"
        :selected="selectedIds.includes(archive.id)"
        :style="{
          left: `${positions[archive.id]?.x ?? 0}px`,
          top: `${positions[archive.id]?.y ?? 0}px`,
        }"
        @open="emit('open', archive.id)"
        @add-to-composite="emit('add-to-composite', archive.id)"
        @close="emit('close', archive.id)"
        @toggle-select="emit('toggle-select', archive.id)"
        @drag-start="onDragStart(archive.id, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.canvas {
  position: relative;
  width: 100%;
  overflow: auto;
  padding: var(--sp-2);
}

.plane {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 140ms ease;
}
</style>
