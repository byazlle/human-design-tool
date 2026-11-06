/**
 * 关系主题（离线）：把合盘已有的结构性事实组织成可读结论。
 *
 * 设计原则：
 * - **不新增任何人类图理论**。只做既有事实的陈述与组织：
 *   中心四象限、四类关系通道、双方人生角色、合起来的中心定义数量。
 * - 规范 §3.8：合盘不输出类型 / 权威 / 定义型 / 轮回交叉等个体气场结论，
 *   因此本文件只陈述关系结构，不对"你们是什么类型"下判断。
 * - 不使用决定论句式（"一定会/必然/就是"），统一用"倾向于/更容易/在这块"。
 * - 未配置 AI 的用户也能在合盘页读到结论，AI 只做"加深"而非唯一来源。
 */
import type { CompositeResult } from '../types/hd'
import { CENTER_LABELS } from '../types/hd'

export interface ThemeBlock {
  h: string
  p: string
}

const REL_TYPE_LABEL: Record<string, string> = {
  electromagnetic: '电磁（互补吸引）',
  companionship: '同伴（双方都自带）',
  dominance: '主导（单方输出）',
  compromise: '妥协（一方完整、一方单端）',
}

function centerNames(list: CompositeResult['centerQuadrant']): string {
  return list.map((c) => CENTER_LABELS[c.id]).join('、')
}

export function relationshipTheme(result: CompositeResult): ThemeBlock[] {
  const blocks: ThemeBlock[] = []
  const both = result.centerQuadrant.filter((c) => c.state === 'both')
  const onlyA = result.centerQuadrant.filter((c) => c.state === 'onlyA')
  const onlyB = result.centerQuadrant.filter((c) => c.state === 'onlyB')
  const open = result.centerQuadrant.filter((c) => c.state === 'open')

  const a = result.a
  const b = result.b
  const definedCount = result.merged.centers.filter((c) => c.defined).length

  // 1. 结构概览
  blocks.push({
    h: '结构概览',
    p: `两人的人生角色组合是 ${a.profile} × ${b.profile}。两人的能量叠加后，共 ${definedCount} 个中心被定义。这个数字说明的是"合起来有多完整"，不构成对任何一方的个体判定。`,
  })

  // 2. 影响方向（最具解释力的一段）
  if (onlyA.length && onlyB.length) {
    blocks.push({
      h: '影响力是双向的',
      p: `在${centerNames(onlyA)}上，A 是稳定的那一方，B 在这里更容易被 A 的状态牵动；反过来在${centerNames(onlyB)}上，A 更容易被 B 牵动。这种"各让一半"的结构，通常相处起来比较平衡，但两处都需要各自留出不被打扰的空间。`,
    })
  } else if (onlyA.length) {
    blocks.push({
      h: '影响力偏向一侧',
      p: `在${centerNames(onlyA)}上，A 稳定、B 开放。长期相处时，B 在这些领域容易持续受到 A 的影响（包括好的影响与不自觉的迁就）。对 B 来说，识别"这是我的判断还是被带出来的"会更重要。`,
    })
  } else if (onlyB.length) {
    blocks.push({
      h: '影响力偏向另一侧',
      p: `在${centerNames(onlyB)}上，B 稳定、A 开放。A 在这些领域更容易被 B 的状态牵动。对 A 来说，识别"这是我的判断还是被带出来的"会更重要。`,
    })
  } else {
    blocks.push({
      h: '影响力结构',
      p: '两人在九中心上的定义分布几乎一致，既没有明显的单向影响，也少了互补的张力。好处是彼此容易理解，代价是容易一起卡在同一个盲区里。',
    })
  }

  // 3. 共鸣区
  if (both.length) {
    blocks.push({
      h: '共鸣区（双方都定义）',
      p: `${centerNames(both)}——这些领域两人都稳定，也都各有主见。它们既是"你懂我"的基础，也是最容易各说各话的地方：谁都说服不了谁，靠协商比靠说服有效。`,
    })
  }

  // 4. 共同放大区
  if (open.length) {
    blocks.push({
      h: '共同放大区（双方都开放）',
      p: `${centerNames(open)}——两人都没有稳定的参照，在一起时容易相互放大，也容易一起被环境带走。这是关系里最需要外部参照（可信的第三方、明确规则、定期复盘）的区域。`,
    })
  }

  // 5. 连接方式
  const counts: Record<string, number> = {}
  for (const c of result.relationshipChannels) counts[c.type] = (counts[c.type] ?? 0) + 1
  const parts = Object.entries(counts)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${REL_TYPE_LABEL[k] ?? k} ${v} 条`)
  if (parts.length) {
    blocks.push({
      h: '两人是怎么连上的',
      p: `连接通道共 ${result.relationshipChannels.length} 条：${parts.join('；')}。电磁通道多，说明吸引力主要来自"你有我没有"的互补；同伴通道多，说明两人在同一件事上都很稳，共鸣强但缺少新鲜刺激；主导与妥协多，则意味着一方在持续供给、另一方在适应。`,
    })
  } else {
    blocks.push({
      h: '连接方式',
      p: '两人之间没有形成完整通道，连接主要发生在闸门层面：吸引力偏弱、边界清晰，适合各自独立、按需协作的关系形态。',
    })
  }

  return blocks
}
