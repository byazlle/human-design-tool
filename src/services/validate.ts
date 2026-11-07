/**
 * 出生信息校验（运行时）。
 *
 * 为什么需要：UI 层（EntryView）已有一份校验，但导入备份、手工 URL、
 * 未来的分享链接都会绕过 UI 直接进计算层。而 `Date.UTC(1990, 12, 32, 25)`
 * 不会报错，会静默滚动成 1991-02-01 02:00 —— 产出"合法但错误"的盘。
 * 因此校验必须下沉到被调用方。
 */
import { isValidTimeZone } from '../engine/time'

export interface BirthLike {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
  timezone: string
}

export const MIN_YEAR = 1900
/** 星历与闸门数据的可靠区间上限（README 声明验证至 2035，留出余量） */
export const MAX_YEAR = 2100

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 返回错误信息数组；空数组 = 合法 */
export function validateBirth(b: Partial<BirthLike> | null | undefined): string[] {
  if (!b) return ['出生信息缺失']
  const errs: string[] = []

  for (const k of ['year', 'month', 'day', 'hour', 'minute'] as const) {
    if (!isInt(b[k])) errs.push(`${k} 必须是整数`)
  }
  if (b.second !== undefined && !isInt(b.second)) errs.push('second 必须是整数')
  if (errs.length) return errs

  const year = b.year as number
  const month = b.month as number
  const day = b.day as number
  const hour = b.hour as number
  const minute = b.minute as number
  const second = b.second ?? 0

  if (year < MIN_YEAR || year > MAX_YEAR) errs.push(`出生年份需在 ${MIN_YEAR}–${MAX_YEAR} 之间`)
  if (month < 1 || month > 12) errs.push('出生月份需在 1–12 之间')
  if (month >= 1 && month <= 12) {
    const max = daysInMonth(year, month)
    if (day < 1 || day > max) errs.push(`出生日期不合法（${year} 年 ${month} 月共 ${max} 天）`)
  }
  if (hour < 0 || hour > 23) errs.push('出生小时需在 0–23 之间')
  if (minute < 0 || minute > 59) errs.push('出生分钟需在 0–59 之间')
  if (second < 0 || second > 59) errs.push('出生秒需在 0–59 之间')

  if (!b.timezone || typeof b.timezone !== 'string') errs.push('时区缺失')
  else if (!isValidTimeZone(b.timezone)) errs.push(`无法识别的时区：${b.timezone}`)

  return errs
}

export class BirthInputError extends Error {
  constructor(readonly issues: string[]) {
    super(`出生信息不合法：${issues.join('；')}`)
    this.name = 'BirthInputError'
  }
}
