/**
 * 档案画布排布算法（#7）：与 Vue 组件解耦的纯函数，便于回归测试。
 *
 * 背景：旧实现用「数组下标」算坐标，而用户拖动过的坐标保存在 localStorage、
 * 与下标无关；新增档案（尤其插到数组前面时）会拿到 (24,24)，与第一个卡片重叠。
 * 现在改为：保留所有已有坐标，为每张新卡片找第一个不与任何已有卡片相交的网格空位。
 */
export const CARD_W = 260
export const CARD_H = 340
export const GAP_X = 32
export const GAP_Y = 32
export const GRID_COLS = 4
export const GRID_ORIGIN = 24

export interface CanvasPoint {
  x: number
  y: number
}

/** 第 i 个网格位（4 列，逐行往下） */
export function gridSlot(i: number): CanvasPoint {
  return {
    x: GRID_ORIGIN + (i % GRID_COLS) * (CARD_W + GAP_X),
    y: GRID_ORIGIN + Math.floor(i / GRID_COLS) * (CARD_H + GAP_Y),
  }
}

/** 两卡片是否相交（用半个 GAP 作余量，避免边缘贴在一起） */
export function cardsOverlap(a: CanvasPoint, b: CanvasPoint): boolean {
  return (
    Math.abs(a.x - b.x) < CARD_W + GAP_X / 2 &&
    Math.abs(a.y - b.y) < CARD_H + GAP_Y / 2
  )
}

/**
 * 返回新的位置表：清理已删除档案的坐标、原样保留仍在册档案的坐标、
 * 为新增档案找第一个空闲格位。不修改入参（组件再同步到 reactive 对象）。
 */
export function ensureCanvasLayout(
  positions: Record<string, CanvasPoint>,
  ids: string[],
): Record<string, CanvasPoint> {
  const idSet = new Set(ids)
  const next: Record<string, CanvasPoint> = {}
  for (const [id, p] of Object.entries(positions)) {
    if (idSet.has(id)) next[id] = { x: p.x, y: p.y }
  }
  const occupied = Object.values(next)
  for (const id of ids) {
    if (next[id]) continue
    let i = 0
    let candidate = gridSlot(i)
    while (i < 10000 && occupied.some((p) => cardsOverlap(candidate, p))) {
      i += 1
      candidate = gridSlot(i)
    }
    next[id] = candidate
    occupied.push(candidate)
  }
  return next
}
