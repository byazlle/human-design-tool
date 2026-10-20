/**
 * 时间归一化：IANA 时区 + 本地民用时 → UTC 瞬时。
 * 使用平台 Intl（ICU）的历史时区/夏令时数据，不依赖任何外部库。
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    dtfCache.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    getFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** 某 UTC 瞬时在指定时区的偏移（毫秒，东八区为 +28800000） */
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = getFormatter(timeZone).formatToParts(new Date(utcMs))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  // 消除毫秒误差（瞬时可能带毫秒）
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

export interface ZonedResult {
  date: Date
  /** 该本地时间在时区中不存在（夏令时跳变）或不唯一（回拨），提示用户核实 */
  warning?: string
}

/**
 * 本地民用时（年/月/日/时/分/秒）→ UTC。
 * 采用两次迭代收敛偏移，兼容历史夏令时规则。
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): ZonedResult {
  const base = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = base
  for (let i = 0; i < 3; i += 1) {
    const offset = tzOffsetMs(guess, timeZone)
    const next = base - offset
    if (next === guess) break
    guess = next
  }

  // 回验：把 UTC 再格式化回本地，检查是否与输入一致（识别夏令时空洞/重复）
  const parts = getFormatter(timeZone).formatToParts(new Date(guess))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const warning =
    get('year') === year &&
    get('month') === month &&
    get('day') === day &&
    get('hour') === hour &&
    get('minute') === minute
      ? undefined
      : '该出生时刻在当地时区不存在或存在歧义（夏令时切换），请核实'

  return { date: new Date(guess), warning }
}

/** ISO → 展示用字符串（保留到分钟） */
export function formatUtc(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

/** 给定 UTC 瞬时，返回该时区的本地时间字符串 */
export function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
