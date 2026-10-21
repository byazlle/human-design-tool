/**
 * 绘图程序注册表：多版本一键切换。
 * - v1「底图对齐版」：按用户底图 1:1 实测（青色底板）
 * - v2「Free Human Design 版」：采用 adamblvck/free-human-design 的布局与渐变配色
 */
import type { CenterId } from '../../types/hd'
import * as V1 from './bodyGraphLayout'
import * as V2 from './bodyGraphLayoutV2'

export type DrawingEngine = 'v1' | 'v2'

export interface LayoutCenter {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  /** 有定义时的渐变 stops（v2 使用；v1 为空 → 用纯色） */
  gradient?: Array<[number, string]>
}

export interface LayoutGate {
  gate: number
  center: CenterId
  x: number
  y: number
}

export interface LayoutChannel {
  key: string
  gates: [number, number]
  centers: [CenterId, CenterId]
  x1: number
  y1: number
  x2: number
  y2: number
  internal: boolean
}

export interface LayoutPreset {
  id: DrawingEngine
  label: string
  note: string
  /** 底板类型：cyan=青色底图板（含剪影与白色线槽）；none=直接落在页面背景上 */
  plate: 'cyan' | 'none'
  viewBox: { x: number; y: number; w: number; h: number; str: string }
  gateR: number
  gateFont: number
  tubeW: number
  chW: number
  centers: LayoutCenter[]
  gates: LayoutGate[]
  channels: LayoutChannel[]
}

const v1: LayoutPreset = {
  id: 'v1',
  label: '版式一 · 底图对齐',
  note: '严格按你提供的人类图底图 1:1 实测坐标绘制；青色底板、白色通道管、九中心专属色',
  plate: 'cyan',
  viewBox: V1.VIEW_BOX,
  gateR: V1.GATE_R,
  gateFont: V1.GATE_FONT,
  tubeW: V1.TUBE_W,
  chW: V1.CH_W,
  centers: (Object.values(V1.CENTER_SHAPES) as Array<V1.CenterShape>).map((s) => ({
    id: s.id,
    polygon: s.polygon,
    cx: s.cx,
    cy: s.cy,
  })),
  gates: Object.values(V1.GATE_POINTS).map((g) => ({
    gate: g.gate,
    center: g.center,
    x: g.x,
    y: g.y,
  })),
  channels: V1.CHANNEL_LINES.map((c) => ({ ...c })),
}

const v2: LayoutPreset = {
  id: 'v2',
  label: '版式二 · Free Human Design',
  note: '采用 adamblvck/free-human-design 的布局（八角星 G 中心、渐变中心色、紧凑比例）',
  plate: 'none',
  viewBox: V2.VIEW_BOX_V2,
  gateR: V2.GATE_R_V2,
  gateFont: V2.GATE_FONT_V2,
  tubeW: V2.TUBE_W_V2,
  chW: V2.CH_W_V2,
  centers: (Object.values(V2.CENTER_SHAPES_V2) as Array<V2.CenterShapeV2>).map((s) => ({
    id: s.id,
    polygon: s.polygon,
    cx: s.cx,
    cy: s.cy,
    gradient: s.gradient,
  })),
  gates: Object.values(V2.GATE_POINTS_V2).map((g) => ({
    gate: g.gate,
    center: g.center,
    x: g.x,
    y: g.y,
  })),
  channels: V2.CHANNEL_LINES_V2.map((c) => ({ ...c })),
}

export const LAYOUT_PRESETS: Record<DrawingEngine, LayoutPreset> = { v1, v2 }

export const DRAWING_ENGINES: Array<{ id: DrawingEngine; label: string; note: string }> = [
  { id: 'v1', label: v1.label, note: v1.note },
  { id: 'v2', label: v2.label, note: v2.note },
]

export function layoutOf(engine: DrawingEngine | string | undefined): LayoutPreset {
  return engine === 'v2' ? v2 : v1
}

export function polygonOf(layout: LayoutPreset, id: CenterId): string {
  const c = layout.centers.find((x) => x.id === id)
  return c ? c.polygon.map(([x, y]) => `${x},${y}`).join(' ') : ''
}
