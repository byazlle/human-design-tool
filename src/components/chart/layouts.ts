/**
 * 绘图程序版式注册表（v2.2 起单一版式 v1）。
 *
 * 版式二（衍生自 adamblvck/free-human-design）已按用户 Q5.3 移除，
 * `bodyGraphLayoutV2.ts` 与 Tauri 残留目录一并删除。
 * 保留 `layoutOf()` 与 `DrawingEngine` 是为了让 7 个视图调用点无需改动。
 */
import type { CenterId } from '../../types/hd'
import * as V1 from './bodyGraphLayout'

/** 保留类型名以兼容既有调用点；当前恒为 v1 */
export type DrawingEngine = 'v1'

export interface LayoutCenter {
  id: CenterId
  polygon: Array<[number, number]>
  cx: number
  cy: number
  /** 有定义时的渐变 stops（v1 为空 → 用纯色） */
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
  /** 折线走线（有则优先于两端点；20-57 枢纽辐条使用） */
  points?: Array<[number, number]>
  /** 枢纽辐条：任一原始通道被激活即着色 */
  spokeOf?: string[]
  /** 枢纽辐条标记：终点固定在枢纽 M，不做末端内延伸 */
  hub?: boolean
}

export interface LayoutPreset {
  id: DrawingEngine
  label: string
  note: string
  /** 底板类型：cyan=青色底图板（含剪影与白色线槽） */
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
  label: '底图对齐版',
  note: '严格按人类图底图 1:1 实测坐标绘制；青色底板、白色通道管、九中心专属色',
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

export function layoutOf(_engine: DrawingEngine | string | undefined): LayoutPreset {
  return v1
}

export function polygonOf(layout: LayoutPreset, id: CenterId): string {
  const c = layout.centers.find((x) => x.id === id)
  return c ? c.polygon.map(([x, y]) => `${x},${y}`).join(' ') : ''
}
