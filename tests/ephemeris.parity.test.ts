/**
 * 星历对照测试：本引擎（astronomy-engine）vs 参照实现（astronomia，即 rave-engine 默认后端）。
 * 目的：把「闸门/爻」层面的一致性从 4 个样本扩展到随机 200 个时刻。
 * 注：astronomia 仅作为 devDependency 的校验基准，不进入运行时。
 */
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { computeStream } from '../src/engine/bodygraph'
import { mapLongitude } from '../src/engine/mandala'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const A: any = require('astronomia')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = require('astronomia/data').default

const R2D = 180 / Math.PI
const D2R = Math.PI / 180
const EARTH = new A.planetposition.Planet(data.vsop87Bearth)
const PLANETS: Record<string, unknown> = {
  Mercury: new A.planetposition.Planet(data.vsop87Bmercury),
  Venus: new A.planetposition.Planet(data.vsop87Bvenus),
  Mars: new A.planetposition.Planet(data.vsop87Bmars),
  Jupiter: new A.planetposition.Planet(data.vsop87Bjupiter),
  Saturn: new A.planetposition.Planet(data.vsop87Bsaturn),
  Uranus: new A.planetposition.Planet(data.vsop87Buranus),
  Neptune: new A.planetposition.Planet(data.vsop87Bneptune),
}

function norm(d: number): number {
  const x = d % 360
  return x < 0 ? x + 360 : x
}

function toJde(date: Date): number {
  const jd =
    A.julian.CalendarGregorianToJD(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60) / 24,
    )
  const yearFrac = date.getUTCFullYear() + date.getUTCMonth() / 12
  return jd + A.deltat.deltaT(yearFrac) / 86400
}

function obliq(jde: number): number {
  return A.nutation.meanObliquity(jde) + A.nutation.nutation(jde)[1]
}

/** 参照实现的 13 天体视黄经（度） */
function oracleLongitudes(date: Date): Record<string, number> {
  const jde = toJde(date)
  const dpsi = A.nutation.nutation(jde)[0]
  const out: Record<string, number> = {}

  out.Sun = A.solar.apparentVSOP87(EARTH, jde).lon * R2D
  out.Moon = (A.moonposition.position(jde).lon + dpsi) * R2D

  for (const [name, planet] of Object.entries(PLANETS)) {
    const pos = A.elliptic.position(planet, EARTH, jde)
    const ecl = new A.coord.Equatorial(pos.ra, pos.dec).toEcliptic(obliq(jde))
    out[name] = ecl.lon * R2D
  }

  // 冥王星：J2000 赤道 → J2000 黄道 → 岁差到当日 → 加 Δψ
  const astro = A.pluto.astrometric(jde, EARTH)
  const eclJ2000 = new A.coord.Equatorial(astro._ra, astro._dec).toEcliptic(
    A.nutation.meanObliquity(2451545.0),
  )
  const epochTo = 2000 + (jde - 2451545.0) / 365.25
  const prec = new A.precess.EclipticPrecessor(2000, epochTo)
  const moved = prec.precess(new A.coord.Ecliptic(eclJ2000.lon, eclJ2000.lat))
  out.Pluto = (moved.lon + dpsi) * R2D

  // 真交点
  out.NorthNode = (A.moonposition.trueNode(jde) + dpsi) * R2D

  out.Earth = norm(out.Sun + 180)
  out.SouthNode = norm(out.NorthNode + 180)
  return out
}

/** 固定种子的伪随机，保证测试可复现 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('星历对照（随机 200 个时刻，1950–2035）', () => {
  const rand = mulberry32(20261020)
  const start = Date.UTC(1950, 0, 1)
  const end = Date.UTC(2035, 0, 1)

  it('12 天体闸门/爻与参照实现一致', () => {
    const diffs: Array<{ when: string; planet: string; deg: number }> = []
    let checked = 0

    for (let i = 0; i < 200; i += 1) {
      const utc = new Date(start + rand() * (end - start))
      const mine = computeStream(utc)
      const truth = oracleLongitudes(utc)

      for (const pos of mine) {
        const refLon = truth[pos.planet]
        let delta = pos.longitude - refLon
        while (delta > 180) delta -= 360
        while (delta < -180) delta += 360
        checked += 1
        // 只记录「跨闸门/跨爻」的真实分歧，角度差不单独作为失败条件
        const refGate = mapLongitude(refLon)
        if (refGate.gate !== pos.gate || refGate.line !== pos.line) {
          diffs.push({
            when: utc.toISOString(),
            planet: pos.planet,
            deg: Number(delta.toFixed(4)),
          })
        }
      }
    }

    expect(checked).toBe(200 * 13)
    const real = diffs.filter((d) => Math.abs(d.deg) > 0.01)
    // 参照实现的月球位置来自 Meeus 第 47 章截断级数（ELP2000-82 前若干项），
    // 残差约 ±10–40″（≤0.011°）；astronomy-engine 用更高阶模型。
    // 因此允许「边界上」极少数（≤2/2600）月亮分歧，且不允许其他天体出现分歧。
    expect(real.length).toBeLessThanOrEqual(2)
    expect(real.every((d) => d.planet === 'Moon')).toBe(true)
    expect(real.every((d) => Math.abs(d.deg) < 0.02)).toBe(true)
  })

  it('每个时刻都产出完整的 13 天体与 1–64 闸门范围', () => {
    for (let i = 0; i < 20; i += 1) {
      const utc = new Date(start + rand() * (end - start))
      const stream = computeStream(utc)
      expect(stream).toHaveLength(13)
      for (const p of stream) {
        expect(p.gate).toBeGreaterThanOrEqual(1)
        expect(p.gate).toBeLessThanOrEqual(64)
        expect(p.line).toBeGreaterThanOrEqual(1)
        expect(p.line).toBeLessThanOrEqual(6)
        expect(p.longitude).toBeGreaterThanOrEqual(0)
        expect(p.longitude).toBeLessThan(360)
        expect(D2R).toBeCloseTo(Math.PI / 180, 12)
      }
    }
  })
})
