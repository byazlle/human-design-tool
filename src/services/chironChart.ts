/**
 * 凯龙回归图服务：出生信息 → 凯龙回归时刻 → 独立凯龙盘。
 *
 * 凯龙周期约 49–51 年，代表人生第三阶段（疗愈 / 传承 / 榜样）。
 * 凯龙图是独立周期盘，不替换本命盘：拥有独立的行星落点、闸门、
 * 通道、九中心、轮回交叉与人生角色。
 */
import type { BirthInput, BodyGraph } from '../types/hd'
import { computeChartFromUtc } from '../engine/bodygraph'
import { chironLongitude, findChironReturn } from '../engine/chiron'
import { mapLongitude } from '../engine/mandala'
import { zonedToUtc } from '../engine/time'

export interface ChironReturnResult {
  /** 出生时刻凯龙落点 */
  natalChiron: { longitude: number; gate: number; line: number }
  /** 回归时刻（UTC ISO） */
  returnUtc: string
  /** 回归时年龄（周岁，1 位小数） */
  age: number
  /** 回归时刻的完整凯龙盘 */
  chart: BodyGraph
}

export function computeChironReturn(input: BirthInput): ChironReturnResult | null {
  const { date: birthUtc } = zonedToUtc(
    input.year,
    input.month,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
    input.timezone,
  )

  const natalLon = chironLongitude(birthUtc)
  const natalPos = mapLongitude(natalLon)

  const returnDate = findChironReturn(birthUtc)
  if (!returnDate) return null

  const chart = computeChartFromUtc(returnDate)
  const age = (returnDate.getTime() - birthUtc.getTime()) / (365.25 * 86400000)

  return {
    natalChiron: { longitude: natalLon, gate: natalPos.gate, line: natalPos.line },
    returnUtc: returnDate.toISOString(),
    age: Math.round(age * 10) / 10,
    chart,
  }
}
