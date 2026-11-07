<script setup lang="ts">
/**
 * 页面布局画布（#4）：把 7 个模块按全局配置摆放。
 * - 单列预设 / 手机端：流式单列（不应用坐标），保持 v2.1.0 视觉；
 * - 双列 / 三列 / 自定义：桌面绝对定位，可拖拽、改尺寸、缩放、锁定、显隐。
 */
import { computed } from 'vue'
import {
  usePageLayoutStore,
  type LayoutModuleKey,
} from '../../stores/pageLayout'

const props = withDefaults(defineProps<{ mobile?: boolean }>(), { mobile: false })
const layout = usePageLayoutStore()

const flow = computed(() => props.mobile || layout.preset === 'single')
const keys = computed(() => layout.visibleKeys)

const canvasStyle = computed<Record<string, string>>(() => ({
  height: flow.value ? 'auto' : `${layout.canvasHeight}px`,
  zoom: props.mobile ? '1' : String(flow.value ? 1 : layout.zoom),
}))

function boxStyle(key: LayoutModuleKey): Record<string, string> {
  const b = layout.boxes[key]
  return {
    left: `${b.x}%`,
    top: `${b.y}px`,
    width: `${b.w}%`,
    height: `${b.h}px`,
  }
}

function innerStyle(key: LayoutModuleKey): Record<string, string> {
  return { zoom: String(layout.boxes[key].scale) }
}
</script>

<template>
  <div class="layout-canvas" :class="{ flow, custom: !flow }" :style="canvasStyle">
    <template v-for="key in keys" :key="key">
      <div v-if="flow" class="flow-item">
        <div :style="innerStyle(key)"><slot :name="key" /></div>
      </div>
      <div v-else class="layout-box" :style="boxStyle(key)">
        <div class="box-inner" :style="innerStyle(key)"><slot :name="key" /></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.layout-canvas {
  width: 100%;
  position: relative;
  box-sizing: border-box;
  min-width: 0;
}

.layout-canvas.flow {
  display: flex;
  flex-direction: column;
  gap: var(--layout-gap, var(--sp-4));
}

.flow-item {
  min-width: 0;
}

.layout-canvas.custom {
  display: block;
}

.layout-box {
  position: absolute;
  box-sizing: border-box;
  min-width: 0;
  overflow: auto;
  border-radius: var(--radius-md);
}

.box-inner {
  min-width: 0;
}
</style>
