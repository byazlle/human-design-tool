<script setup lang="ts">
/**
 * 自定义页面布局编辑器（#4）：设置页内直接拖拽 / 改尺寸 / 缩放 / 锁定 / 显隐 / 预设 / 重置。
 * 手机端固定退化为单列流，这里只保留说明与重置，不提供拖拽画布。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  LAYOUT_MODULE_KEYS,
  LAYOUT_MODULE_LABELS,
  ZOOM_MAX,
  ZOOM_MIN,
  usePageLayoutStore,
  type LayoutBox,
  type LayoutModuleKey,
  type LayoutPreset,
} from '../../stores/pageLayout'
import { useBreakpoint } from '../../composables/useBreakpoint'
import HdButton from '../base/HdButton.vue'

const layout = usePageLayoutStore()
const { isMobile } = useBreakpoint()
const plane = ref<HTMLElement | null>(null)
const selected = ref<LayoutModuleKey>('chart')

const PRESETS: Array<{ value: Exclude<LayoutPreset, 'custom'>; label: string; hint: string }> = [
  { value: 'single', label: '单列', hint: '保持现有视觉，模块按固定顺序纵向排列' },
  { value: 'double', label: '双列', hint: '两列瀑布式排布，图表与信息并排' },
  { value: 'triple', label: '三列', hint: '三列紧凑排布，适合宽屏' },
]

const currentPreset = computed(() =>
  layout.preset === 'custom' ? '自定义（已手动调整）' :
    (PRESETS.find((p) => p.value === layout.preset)?.label ?? '单列'),
)

interface DragState {
  key: LayoutModuleKey
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origin: LayoutBox
}

let drag: DragState | null = null

function onPointerDown(key: LayoutModuleKey, mode: 'move' | 'resize', event: PointerEvent) {
  if (layout.boxes[key].locked) return
  event.preventDefault()
  selected.value = key
  drag = {
    key,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    origin: { ...layout.boxes[key] },
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return
  const width = plane.value?.clientWidth || 840
  const dxPct = ((event.clientX - drag.startX) / width) * 100
  const dy = event.clientY - drag.startY
  const patch =
    drag.mode === 'move'
      ? { x: drag.origin.x + dxPct, y: drag.origin.y + dy }
      : { w: drag.origin.w + dxPct, h: drag.origin.h + dy }
  // 拖拽过程中不写盘，pointerup 时统一 persist
  layout.updateBox(drag.key, patch, width, false)
}

function onPointerUp() {
  if (drag) layout.persist()
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

onBeforeUnmount(onPointerUp)

function onZoom(event: Event) {
  layout.setZoom(Number((event.target as HTMLInputElement).value))
}

function onBoxScale(event: Event) {
  layout.setBoxScale(selected.value, Number((event.target as HTMLInputElement).value))
}

function report(ok: boolean) {
  if (!ok) window.alert('布局保存失败：本地存储不可用或空间已满。')
}

function applyPreset(value: Exclude<LayoutPreset, 'custom'>) {
  report(layout.setPreset(value))
}
</script>

<template>
  <div class="editor">
    <div class="preset-row">
      <button
        v-for="p in PRESETS"
        :key="p.value"
        type="button"
        class="preset"
        :class="{ on: layout.preset === p.value }"
        :title="p.hint"
        @click="applyPreset(p.value)"
      >
        {{ p.label }}
      </button>
      <span class="t-xs t-muted">当前：{{ currentPreset }}</span>
    </div>

    <p class="t-xs t-muted intro">
      拖动模块标题栏可移动，拖右下角可改尺寸；位置与尺寸按 8px 网格吸附。
      手动调整后自动切换为「自定义」布局。手机端固定退化为单列流，自定义坐标不生效。
    </p>

    <template v-if="!isMobile">
      <div class="range-row">
        <span class="t-xs range-label">整体缩放</span>
        <input
          type="range"
          :min="ZOOM_MIN"
          :max="ZOOM_MAX"
          step="0.05"
          :value="layout.zoom"
          aria-label="整体缩放"
          @input="onZoom"
        />
        <span class="t-xs t-mono">{{ layout.zoom.toFixed(2) }}×</span>
      </div>

      <div class="range-row">
        <span class="t-xs range-label">「{{ LAYOUT_MODULE_LABELS[selected] }}」内容缩放</span>
        <input
          type="range"
          :min="ZOOM_MIN"
          :max="ZOOM_MAX"
          step="0.05"
          :value="layout.boxes[selected].scale"
          aria-label="选中模块内容缩放"
          @input="onBoxScale"
        />
        <span class="t-xs t-mono">{{ layout.boxes[selected].scale.toFixed(2) }}×</span>
      </div>

      <div class="editor-scroll">
        <div ref="plane" class="editor-plane" :style="{ height: `${Math.max(layout.canvasHeight, 320)}px` }">
          <div
            v-for="key in LAYOUT_MODULE_KEYS"
            :key="key"
            class="editor-box"
            :class="{
              on: selected === key,
              hidden: !layout.boxes[key].visible,
              locked: layout.boxes[key].locked,
            }"
            :style="{
              left: `${layout.boxes[key].x}%`,
              top: `${layout.boxes[key].y}px`,
              width: `${layout.boxes[key].w}%`,
              height: `${layout.boxes[key].h}px`,
            }"
            @pointerdown="onPointerDown(key, 'move', $event)"
          >
            <div class="eb-head">
              <strong class="t-xs">{{ LAYOUT_MODULE_LABELS[key] }}</strong>
              <span class="eb-tools">
                <button
                  type="button"
                  class="eb-btn"
                  :aria-label="layout.boxes[key].visible ? '隐藏模块' : '显示模块'"
                  @pointerdown.stop
                  @click.stop="report(layout.toggleVisible(key))"
                >
                  {{ layout.boxes[key].visible ? '隐藏' : '显示' }}
                </button>
                <button
                  type="button"
                  class="eb-btn"
                  :aria-label="layout.boxes[key].locked ? '解锁模块' : '锁定模块'"
                  @pointerdown.stop
                  @click.stop="report(layout.toggleLock(key))"
                >
                  {{ layout.boxes[key].locked ? '解锁' : '锁定' }}
                </button>
              </span>
            </div>
            <span class="eb-meta t-xs t-muted">
              {{ layout.boxes[key].w.toFixed(0) }}% × {{ layout.boxes[key].h }}px · {{ layout.boxes[key].scale.toFixed(2) }}×
            </span>
            <span
              class="eb-resize"
              aria-label="拖动改变尺寸"
              @pointerdown.stop="onPointerDown(key, 'resize', $event)"
            />
          </div>
        </div>
      </div>
    </template>

    <p v-else class="t-xs mobile-note">
      【手机端】页面固定按单列流展示，自定义坐标与缩放不生效；如需调整模块顺序与尺寸，请在电脑端设置。
    </p>

    <div class="editor-actions">
      <HdButton size="sm" variant="ghost" @click="report(layout.reset())">重置为默认单列</HdButton>
      <span class="t-xs t-muted">配置保存在本机，所有盘面共用一份</span>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.preset-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.preset {
  min-height: 30px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.preset.on {
  border-color: var(--action-primary);
  color: var(--text-primary);
  background: rgba(124, 58, 237, 0.1);
}

.intro,
.mobile-note {
  line-height: 1.6;
  margin: 0;
}

.mobile-note {
  padding: var(--sp-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.range-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.range-label {
  width: 150px;
  flex: none;
  color: var(--text-secondary);
}

.range-row input[type='range'] {
  flex: 1;
  min-width: 120px;
  accent-color: var(--owner-shared);
}

.editor-scroll {
  max-height: 560px;
  overflow: auto;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  padding: var(--sp-2);
}

.editor-plane {
  position: relative;
  width: 100%;
}

.editor-box {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: grab;
  touch-action: none;
  user-select: none;
  overflow: hidden;
}

.editor-box:active {
  cursor: grabbing;
}

.editor-box.on {
  border-color: var(--action-primary);
  box-shadow: 0 0 0 1px var(--action-primary) inset;
}

.editor-box.hidden {
  opacity: 0.5;
  background: repeating-linear-gradient(45deg, var(--surface), var(--surface) 8px, var(--surface-2) 8px, var(--surface-2) 16px);
}

.editor-box.locked {
  cursor: not-allowed;
  border-style: dashed;
}

.eb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
}

.eb-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eb-tools {
  display: inline-flex;
  gap: 3px;
  flex: none;
}

.eb-btn {
  min-height: 20px;
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  background: var(--surface-2);
}

.eb-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.eb-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--owner-shared) 50%);
  border-bottom-right-radius: var(--radius-sm);
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .range-label {
    width: 100%;
  }
}
</style>
