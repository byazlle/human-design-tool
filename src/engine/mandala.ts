/**
 * 曼陀罗（Rave Mandala）映射：黄道经度 → 闸门 / 爻 / 颜色 / 音调 / 基底。
 *
 * 关键事实（易错点）：人类图的 64 闸门并非「闸门 1 起于白羊 0°」。
 * 标准 Jovian 盘序以闸门 55 起始，并带一个固定偏移（5 个闸门宽度 + 1.7083°），
 * 使 0° 白羊落在闸门 25 的区间内、闸门 41 起于约 2.04° 水瓶（Rave New Year）。
 * 本文件偏移量由 rave-engine / free-human-design 的权威实现推导，并已用其做交叉验证。
 */

/** 单个闸门跨度 5.625° */
export const HEX = 360 / 64
/** 爻跨度 0.9375° */
export const LINE = HEX / 6
/** 颜色跨度 0.15625° */
export const COLOR = LINE / 6
/** 音调跨度 0.0260416…° */
export const TONE = COLOR / 6
/** 基底跨度（每个音调分 5 份） */
export const BASE = TONE / 5

/**
 * 盘序偏移（度）。
 * = 5 个闸门宽度 + (2 爻 - 1 色 - 1 音 + 3 基底)
 * = 28.125 + 1.7083333… = 29.8333333…
 */
export const MANDALA_OFFSET =
  5 * HEX + (2 * LINE - 1 * COLOR - 1 * TONE + 3 * BASE)

/** 盘序：索引 0（偏移后 0°）对应闸门 55，顺时针排列 */
export const ICHING_MAP: number[] = [
  55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8,
  20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29,
  59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14,
  34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30,
]

export interface GatePosition {
  gate: number
  line: number
  color: number
  tone: number
  base: number
  /** 闸门内的相对偏移（0–5.625°），用于调试 */
  offsetInGate: number
}

export function normalizeDegrees(deg: number): number {
  const out = deg % 360
  return out < 0 ? out + 360 : out
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, v))
}

/** 黄道经度（0–360）→ 闸门 + 爻 + 颜色 + 音调 + 基底 */
export function mapLongitude(longitude: number): GatePosition {
  const shifted = normalizeDegrees(normalizeDegrees(longitude) + MANDALA_OFFSET)
  let index = Math.floor(shifted / HEX)
  if (index >= 64) index = 63
  if (index < 0) index = 0
  const gate = ICHING_MAP[index]

  const offsetInGate = shifted - index * HEX
  const line = clampInt(Math.floor(offsetInGate / LINE) + 1, 1, 6)

  const inLine = offsetInGate - (line - 1) * LINE
  const color = clampInt(Math.floor(inLine / COLOR) + 1, 1, 6)

  const inColor = inLine - (color - 1) * COLOR
  const tone = clampInt(Math.floor(inColor / TONE) + 1, 1, 6)

  const inTone = inColor - (tone - 1) * TONE
  const base = clampInt(Math.floor(inTone / BASE) + 1, 1, 5)

  return { gate, line, color, tone, base, offsetInGate }
}

/** 反查：某闸门的起始黄道经度（含偏移），用于测试与轮盘可视化 */
export function gateStartLongitude(gate: number): number {
  const index = ICHING_MAP.indexOf(gate)
  if (index < 0) throw new Error(`未知闸门 ${gate}`)
  return normalizeDegrees(index * HEX - MANDALA_OFFSET)
}
