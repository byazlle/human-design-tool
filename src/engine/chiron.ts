/**
 * 凯龙（2060 Chiron）星历与凯龙回归计算。
 *
 * 算法：J2000 轨道根数 + 开普勒方程传播（日心）→ 地心视黄经（与 ephemeris.ts
 * 其余天体同一「视黄经 of date」口径：EQJ 矢量差 → Rotation_EQJ_ECT）。
 *
 * 轨道根数来源：JPL Small-Body Database 公布的 2060 Chiron J2000 平根数。
 * 凯龙轨道受土星摄动，长时间线性传播在 1900–2050 年内误差约在角分级；
 * 对闸门级（5.625°/格）判定足够，个别边界情况爻位可能偏移一格。
 */
import * as Astronomy from 'astronomy-engine'
import { julianDayUT } from './ephemeris'

const ELEMENTS = {
  /** J2000.0（JD 2451545.0 TDB） */
  epochJd: 2451545.0,
  /** 半长轴（AU） */
  a: 13.6539187,
  /** 偏心率 */
  e: 0.3816897,
  /** 轨道倾角（度） */
  i: 6.9305412,
  /** 升交点黄经 Ω（度） */
  om: 209.2981577,
  /** 近日点幅角 ω（度） */
  w: 339.4408628,
  /** J2000 平近点角 M（度） */
  m0: 126.8392498,
  /** 平运动（度/日） */
  n: 0.01954510816,
}

const D2R = Math.PI / 180

function norm360(deg: number): number {
  const out = deg % 360
  return out < 0 ? out + 360 : out
}

/** 凯龙地心视黄经（度，0–360，视黄经 of date 口径） */
export function chironLongitude(date: Date): number {
  const time = Astronomy.MakeTime(date)
  const jd = julianDayUT(date)
  const dDays = jd - ELEMENTS.epochJd

  const mRad = norm360(ELEMENTS.m0 + ELEMENTS.n * dDays) * D2R
  const e = ELEMENTS.e

  // 开普勒方程牛顿迭代
  let ecc = mRad
  for (let k = 0; k < 30; k += 1) {
    const f = ecc - e * Math.sin(ecc) - mRad
    const fp = 1 - e * Math.cos(ecc)
    const delta = f / fp
    ecc -= delta
    if (Math.abs(delta) < 1e-12) break
  }
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(ecc / 2), Math.sqrt(1 - e) * Math.cos(ecc / 2))
  const r = ELEMENTS.a * (1 - e * Math.cos(ecc))

  const u = nu + ELEMENTS.w * D2R
  const om = ELEMENTS.om * D2R
  const inc = ELEMENTS.i * D2R

  const cosU = Math.cos(u)
  const sinU = Math.sin(u)
  const cosOm = Math.cos(om)
  const sinOm = Math.sin(om)
  const cosI = Math.cos(inc)
  const sinI = Math.sin(inc)

  // 日心黄道 J2000 坐标（AU）
  const xh = r * (cosOm * cosU - sinOm * sinU * cosI)
  const yh = r * (sinOm * cosU + cosOm * sinU * cosI)
  const zh = r * sinU * sinI

  // 黄道 J2000 → 赤道 J2000
  const rotEclEq = Astronomy.Rotation_ECL_EQJ()
  const chEq = Astronomy.RotateVector(rotEclEq, new Astronomy.Vector(xh, yh, zh, time))

  // 地心 = 凯龙日心 − 地球日心（同为 EQJ AU）
  const earth = Astronomy.HelioVector(Astronomy.Body.Earth, time)
  const gx = chEq.x - earth.x
  const gy = chEq.y - earth.y
  const gz = chEq.z - earth.z

  // 赤道 J2000 → 当日黄道（与其他天体口径一致）
  const rotEqEct = Astronomy.Rotation_EQJ_ECT(time)
  const ecl = Astronomy.RotateVector(rotEqEct, new Astronomy.Vector(gx, gy, gz, time))
  const sph = Astronomy.SphereFromVector(ecl)
  return norm360(sph.lon)
}

function wrapDiff(lon: number, target: number): number {
  let x = lon - target
  while (x > 180) x -= 360
  while (x <= -180) x += 360
  return x
}

/**
 * 求解凯龙回归时刻：凯龙再次回到出生时刻黄经的第一次精确回归。
 * 搜索区间：出生后 45–56 年（凯龙周期约 50.4 年）。
 * 返回 null 表示未找到（理论上不会发生）。
 */
export function findChironReturn(birthUtc: Date, toleranceMs = 60_000): Date | null {
  const natal = chironLongitude(birthUtc)
  const YEAR = 365.25 * 86400000
  const start = birthUtc.getTime() + 45 * YEAR
  const end = birthUtc.getTime() + 56 * YEAR
  const step = 86400000 // 1 天粗扫

  let prev = start
  let prevDiff = wrapDiff(chironLongitude(new Date(prev)), natal)
  for (let t = start + step; t <= end; t += step) {
    const curDiff = wrapDiff(chironLongitude(new Date(t)), natal)
    if (prevDiff === 0 || prevDiff * curDiff < 0) {
      // 二分细化
      let lo = prev
      let hi = t
      while (hi - lo > toleranceMs) {
        const mid = (lo + hi) / 2
        const midDiff = wrapDiff(chironLongitude(new Date(mid)), natal)
        if (prevDiff * midDiff <= 0) hi = mid
        else {
          lo = mid
          prevDiff = midDiff
        }
      }
      return new Date((lo + hi) / 2)
    }
    prev = t
    prevDiff = curDiff
  }
  return null
}
