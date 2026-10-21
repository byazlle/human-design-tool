/** 当前绘图程序版本（跟随设置，切换后所有图表立即重绘） */
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import type { DrawingEngine } from '../components/chart/layouts'

export function useDrawingEngine() {
  const settings = useSettingsStore()
  return computed<DrawingEngine>(() => settings.appearance.drawingEngine)
}
