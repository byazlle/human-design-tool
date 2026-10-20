/**
 * 身份证解析与校验（GB 11643-1999，18 位）。
 *
 * 隐私原则：本模块只返回派生字段（出生日期 / 地区码 / 性别），
 * 不保留、不输出、不落盘原始号码。调用方在展示时需要脱敏。
 */
import { resolveRegion, type ResolvedRegion } from '../data/regions'

export type IdErrorCode = 'E1001' | 'E1002' | 'E1003' | 'E2001'

export interface IdParseResult {
  ok: boolean
  code?: IdErrorCode
  message?: string
  birth?: { year: number; month: number; day: number }
  gender?: 'male' | 'female'
  regionCode?: string
  region?: ResolvedRegion
}

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const CHECK_MAP = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

export function isValidIdChecksum(id: string): boolean {
  if (id.length !== 18) return false
  let sum = 0
  for (let i = 0; i < 17; i += 1) {
    const d = id.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    sum += d * WEIGHTS[i]
  }
  return CHECK_MAP[sum % 11] === id[17].toUpperCase()
}

export function parseIdCard(raw: string): IdParseResult {
  const id = (raw || '').replace(/\s/g, '').toUpperCase()
  if (id.length !== 18) {
    return { ok: false, code: 'E1001', message: '请输入 18 位居民身份证号码' }
  }
  if (!/^\d{17}[\dX]$/.test(id)) {
    return { ok: false, code: 'E1001', message: '身份证号码格式不正确（前 17 位为数字）' }
  }
  if (!isValidIdChecksum(id)) {
    return { ok: false, code: 'E1002', message: '身份证校验失败，请核对号码是否输错' }
  }

  const year = Number(id.slice(6, 10))
  const month = Number(id.slice(10, 12))
  const day = Number(id.slice(12, 14))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    return { ok: false, code: 'E2001', message: '身份证中的出生日期不合法' }
  }
  if (year < 1900 || year > new Date().getUTCFullYear()) {
    return { ok: false, code: 'E2001', message: '身份证中的出生年份超出可计算范围' }
  }

  const regionCode = id.slice(0, 6)
  const region = resolveRegion(regionCode) ?? undefined
  const genderDigit = Number(id[16])

  return {
    ok: true,
    code: region ? undefined : 'E1003',
    message: region
      ? region.approximate
        ? `已识别为「${region.name}」，未能精确到城市，请确认出生地`
        : undefined
      : '无法识别该地区码，请手动填写出生地',
    birth: { year, month, day },
    gender: genderDigit % 2 === 1 ? 'male' : 'female',
    regionCode,
    region,
  }
}

/** 脱敏展示：前 6 位 + ******** + 末位 */
export function maskId(id: string): string {
  const clean = (id || '').trim()
  if (clean.length < 8) return '********'
  return `${clean.slice(0, 6)}********${clean.slice(-1)}`
}
