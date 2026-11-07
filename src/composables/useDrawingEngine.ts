/**
 * 当前绘图程序版本（v2.2 起恒为 v1）。
 * 版式二已按用户 Q5.3 移除；保留该 composable 让 7 个视图调用点无需改动。
 */
import { computed } from 'vue'
import type { DrawingEngine } from '../components/chart/layouts'

export function useDrawingEngine() {
  return computed<DrawingEngine>(() => 'v1')
}
