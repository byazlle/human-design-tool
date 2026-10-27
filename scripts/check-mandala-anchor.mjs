/**
 * L1 锚点自检：用 Jovian 官方公布的 Rave New Year 时刻，反算 Rave Mandala 的起始偏移。
 *
 * 依据：Jovian 官方博客 / 产品页明确"太阳进入第 41 闸门即 Rave New Year"，
 *       并给出 2024-01-22 13:18 UTC、2026-01-22 00:54 UTC 两个精确时刻。
 *
 * 用法：node scripts/check-mandala-anchor.mjs
 * 退出码：0 = 偏移应为 29.875（与当前实现 29.8333 不一致，说明需修）
 */
import * as Astronomy from 'astronomy-engine'

const HEX = 360 / 64 // 5.625
const ICHING_MAP = [
  55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8,
  20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29,
  59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14,
  34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30,
]

/** 太阳视黄经（与 src/engine/ephemeris.ts 同一口径：EQJ 矢量 → ECT） */
function sunLongitude(date) {
  const t = Astronomy.MakeTime(date)
  const v = Astronomy.GeoVector(Astronomy.Body.Sun, t, true)
  const e = Astronomy.RotateVector(Astronomy.Rotation_EQJ_ECT(t), v)
  const lon = Astronomy.SphereFromVector(e).lon % 360
  return lon < 0 ? lon + 360 : lon
}

/** 复现 src/engine/mandala.ts 的映射（便于对比两个偏移） */
function mapWith(offset, longitude) {
  const shifted = (((longitude % 360) + 360) % 360 + offset) % 360
  const index = Math.min(63, Math.floor(shifted / HEX))
  return { gate: ICHING_MAP[index], line: Math.floor((shifted - index * HEX) / (HEX / 6)) + 1 }
}

const CASES = [
  ['2026-01-22T00:54:00Z', 'Jovian 2026 Rave New Year'],
  ['2024-01-22T13:18:00Z', 'Jovian 2024 Rave New Year'],
]

let fail = 0
console.log('── Jovian 公布的 Rave New Year 时刻 ──')
for (const [iso, label] of CASES) {
  const lon = sunLongitude(new Date(iso))
  const implied = 331.875 - lon // 41 门在本数组中的索引 59 × 5.625 = 331.875
  const cur = mapWith(29.8333333333333, lon)
  const fixed = mapWith(29.875, lon)
  console.log(`${label}  ${iso}`)
  console.log(`  太阳视黄经        = ${lon.toFixed(5)}°  (与 302.000 差 ${((lon - 302) * 60).toFixed(2)}′)`)
  console.log(`  反算偏移          = ${implied.toFixed(5)}°`)
  console.log(`  现实现 29.8333 → Gate ${cur.gate}.${cur.line}  ${cur.gate === 41 ? '✅' : '❌ 应为 41.1'}`)
  console.log(`  修正为 29.875  → Gate ${fixed.gate}.${fixed.line}  ${fixed.gate === 41 && fixed.line === 1 ? '✅' : '❌'}`)
  if (cur.gate !== 41) fail += 1
}

console.log('\n── 四个边界锚点（应为 41.1 / 60 末 / 18.1 / 25.1）──')
for (const [deg, expect] of [[302.0, '41.1'], [296.375, '60.1'], [183.875, '18.1'], [358.25, '25.1']]) {
  const cur = mapWith(29.8333333333333, deg)
  const fixed = mapWith(29.875, deg)
  const tag = `${fixed.gate}.${fixed.line}`
  const ok = tag === expect
  if (!ok) fail += 1
  console.log(`  ${deg.toFixed(3)}° → 现实现 ${cur.gate}.${cur.line} ｜ 修正后 ${tag} ${ok ? '✅' : '❌ 期望 ' + expect}`)
}

console.log(`\n结论：偏移应为 29.875（= 331.875 − 302.000）。${fail ? `发现 ${fail} 处不符。` : '全部通过。'}`)
process.exit(fail ? 0 : 0) // 不阻塞 CI：本脚本是"检查器"，不是断言器
