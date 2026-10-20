/**
 * 星历层：给定 UTC 时刻，返回 12 个天体的视黄经（地心、真黄道、当日平分点）。
 *
 * 使用 astronomy-engine（MIT，精度约角秒级，足够人类图 0.01° 需求）。
 * 统一采用「视黄经 of date」：与 Swiss Ephemeris 的默认输出口径一致。
 */
import * as Astronomy from 'astronomy-engine'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export type EphemerisBody =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'NorthNode'

const GEO_BODIES: Record<
  Exclude<EphemerisBody, 'NorthNode'>,
  Astronomy.Body
> = {
  Sun: Astronomy.Body.Sun,
  Moon: Astronomy.Body.Moon,
  Mercury: Astronomy.Body.Mercury,
  Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars,
  Jupiter: Astronomy.Body.Jupiter,
  Saturn: Astronomy.Body.Saturn,
  Uranus: Astronomy.Body.Uranus,
  Neptune: Astronomy.Body.Neptune,
  Pluto: Astronomy.Body.Pluto,
}

function normalize(deg: number): number {
  const out = deg % 360
  return out < 0 ? out + 360 : out
}

/** 视黄经（真黄道、当日平分点），度，0–360 */
export function eclipticLongitude(body: EphemerisBody, date: Date): number {
  const time = Astronomy.MakeTime(date)
  if (body === 'NorthNode') return trueNodeLongitude(date)
  // 月亮为地心天体：视位置只含光时与章动，不含恒星光行差（由 ECT 旋转带入章动）
  const aberration = body !== 'Moon'
  const vector = Astronomy.GeoVector(GEO_BODIES[body], time, aberration)
  const rotation = Astronomy.Rotation_EQJ_ECT(time)
  const eclipticVector = Astronomy.RotateVector(rotation, vector)
  const sph = Astronomy.SphereFromVector(eclipticVector)
  return normalize(sph.lon)
}

/**
 * 真交点（True Node）黄经。
 *
 * 采用 Meeus《Astronomical Algorithms》第 47 章的标准解析式：
 * 平交点 Ω + 5 项周期改正（Chapront），即「瞬时月球轨道升交点」的通行近似，
 * 与 Swiss Ephemeris 的 True Node 差异在角分量级（≪ 0.01°）。
 * 这是主流人类图软件采用的口径（平均交点与真交点可差 ±1.7°，会跨闸门，不可混用）。
 */
export function trueNodeLongitude(date: Date): number {
  const jdUT = julianDayUT(date)
  // ΔT：以 UT 近似 TT（差 < 70 s，对交点影响 < 0.0001°，可忽略）
  const T = (jdUT - 2451545.0) / 36525

  const D = norm360(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T ** 3) / 545868 - (T ** 4) / 113065000,
  )
  const M = norm360(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T ** 3) / 24490000,
  )
  const Mp = norm360(
    134.9633964 +
      477198.8675055 * T +
      0.0087414 * T * T +
      (T ** 3) / 69699 -
      (T ** 4) / 14712000,
  )
  const F = norm360(
    93.272095 +
      483202.0175233 * T -
      0.0036539 * T * T -
      (T ** 3) / 3526000 +
      (T ** 4) / 863310000,
  )
  // 平交点（升交点）
  const omega = norm360(
    125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T ** 3) / 467441 - (T ** 4) / 60616000,
  )

  const rad = Math.PI / 180
  const correction =
    -1.4979 * Math.sin(2 * (D - F) * rad) -
    0.15 * Math.sin(M * rad) -
    0.1226 * Math.sin(2 * D * rad) +
    0.1176 * Math.sin(2 * F * rad) -
    0.0801 * Math.sin(2 * (Mp - F) * rad)

  // 与行星统一为「视黄经」口径：叠加章动 Δψ
  return norm360(omega + correction + nutationInLongitude(T, D, M, Mp, F, omega))
}

/**
 * 章动（黄经方向 Δψ），单位：度。
 * Meeus 表 22.A 的主要 9 项，残差 < 0.3″（= 8e-5°），对闸门/爻判定无影响。
 */
function nutationInLongitude(
  T: number,
  D: number,
  M: number,
  Mp: number,
  F: number,
  omega: number,
): number {
  const rad = Math.PI / 180
  const terms: Array<[number, number, number, number, number, number, number]> = [
    // D, M, M', F, Ω, A, B   （Δψ 系数，单位 0.0001″）
    [0, 0, 0, 0, 1, -171996, -174.2],
    [-2, 0, 0, 2, 2, -13187, -1.6],
    [0, 0, 0, 2, 2, -2274, -0.2],
    [0, 0, 0, 0, 2, 2062, 0.2],
    [0, 1, 0, 0, 0, 1426, -3.4],
    [0, 0, 1, 0, 0, 712, 0.1],
    [-2, 1, 0, 2, 2, -517, 1.2],
    [0, 0, 0, 2, 1, -386, -0.4],
    [0, 0, 1, 2, 2, -301, 0],
  ]
  let sum = 0
  for (const [d, m, mp, f, om, a, b] of terms) {
    const arg = (d * D + m * M + mp * Mp + f * F + om * omega) * rad
    sum += (a + b * T) * Math.sin(arg)
  }
  // 0.0001″ → 度
  return (sum / 10000) / 3600
}

function norm360(deg: number): number {
  const out = deg % 360
  return out < 0 ? out + 360 : out
}

/** 朱利安日（UT） */
export function julianDayUT(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

/** 太阳视黄经（度） */
export function sunLongitude(date: Date): number {
  return eclipticLongitude('Sun', date)
}

/**
 * 寻找「太阳黄经比参考时刻少 delta 度」的历史时刻（人类图的 Design 时刻）。
 * 用先粗后细的二分法求解：太阳每日约前进 1°，88° 约对应 88 天前。
 */
export function findPreviousSunLongitude(
  date: Date,
  deltaDegrees: number,
  toleranceSeconds = 0.5,
): Date {
  const target = normalize(sunLongitude(date) - deltaDegrees)

  /** 以角度差（-180,180] 表示 */
  const diff = (d: Date) => {
    const a = sunLongitude(d)
    let x = a - target
    while (x > 180) x -= 360
    while (x <= -180) x += 360
    return x
  }

  let high = date.getTime()
  let low = high - 86400000
  let guard = 0
  while (diff(new Date(low)) > 0 && guard < 370) {
    low -= 86400000
    guard += 1
  }
  if (diff(new Date(low)) > 0) {
    throw new Error('无法定位 Design 时刻（太阳黄经回推失败）')
  }

  const tol = (toleranceSeconds / 86400) * 86400000
  let iterations = 0
  while (high - low > tol && iterations < 60) {
    const mid = (low + high) / 2
    if (diff(new Date(mid)) > 0) high = mid
    else low = mid
    iterations += 1
  }
  return new Date((low + high) / 2)
}

/** 简便工具：弧度 <-> 角度 */
export const toDeg = (rad: number) => rad * R2D
export const toRad = (deg: number) => deg * D2R
