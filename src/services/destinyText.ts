/**
 * 星体与人生轨迹解读（离线、确定性的分层文本）
 *
 * 内容依据人类图通行解释整理（南北交点＝人生主轴；南交＝前半生/熟悉天赋，
 * 北交＝后半生/进化方向；约 38–44 岁为转向期；太阳/地球构成框架，其余星体增添风味），
 * 并结合闸门洞察（gateInsight）给出具体落点。
 *
 * 输出为「标题 + 多段分层内容」，不再是一段长文，便于阅读与 AI 二次生成。
 */
import type { BodyGraph, Planet } from '../types/hd'
import { CENTER_LABELS } from '../types/hd'
import { GATE_CENTER } from '../engine/gateData'
import { gateInsightOf } from './gateInsight'

export interface DestinySection {
  h: string
  p: string
}

export interface DestinyReading {
  key: string
  title: string
  desc: string
  sections: DestinySection[]
}

function star(chart: BodyGraph, planet: Planet, side: 'p' | 'd') {
  const list = side === 'p' ? chart.personality : chart.design
  return list.find((x) => x.planet === planet)
}

function label(gate: number | undefined, line: number | undefined): string {
  if (!gate) return '—'
  return `${gate}.${line ?? 1}`
}

function gateText(gate: number | undefined): string {
  if (!gate) return '—'
  const ins = gateInsightOf(gate)
  const center = GATE_CENTER[gate]
  return `${ins.trait}${center ? `（${CENTER_LABELS[center]}）` : ''}`
}

export function destinyReadings(chart: BodyGraph): DestinyReading[] {
  const pSun = star(chart, 'Sun', 'p')
  const dSun = star(chart, 'Sun', 'd')
  const pEarth = star(chart, 'Earth', 'p')
  const pNorth = star(chart, 'NorthNode', 'p')
  const pSouth = star(chart, 'SouthNode', 'p')

  const north = label(pNorth?.gate, pNorth?.line)
  const south = label(pSouth?.gate, pSouth?.line)
  const pSunTxt = label(pSun?.gate, pSun?.line)
  const dSunTxt = label(dSun?.gate, dSun?.line)
  const earthTxt = label(pEarth?.gate, pEarth?.line)

  const northTheme = gateText(pNorth?.gate)
  const southTheme = gateText(pSouth?.gate)
  const sunTheme = gateText(pSun?.gate)
  const designTheme = gateText(dSun?.gate)

  const northGrowth = gateInsightOf(pNorth?.gate ?? 0).growth
  const southGrowth = gateInsightOf(pSouth?.gate ?? 0).growth

  const definedCount = chart.centers.filter((c) => c.defined).length
  const channelCount = chart.channels.length
  const hanging = chart.hangingGates.length

  return [
    {
      key: 'lifePath',
      title: '人生轨迹',
      desc: '南北交点给出的生命主轴：从熟悉的天赋走向要学习的方向',
      sections: [
        {
          h: '一句话主轴',
          p: `南交 ${south}（${southTheme}）是你带在身上的旧地图；北交 ${north}（${northTheme}）是这张地图没有、却要你亲手补上的空白。前半生靠南交活得顺，后半生靠北交活得像自己。`,
        },
        {
          h: '前半生 · 南交点的舒适区（约 0–38 岁）',
          p: `南交 ${south} 代表已经练熟、几乎自动运行的能力。它在早年给你安全感与立足点，也容易变成「一遇压力就退回」的惯性。这一阶段的任务不是否定它，而是把它用出水平——${southGrowth}。`,
        },
        {
          h: '转向期 · 约 38–44 岁',
          p: `这一段时间常有「原本能忍的忽然忍不了」的体感：旧有的成就感开始失效，新方向还看不清。它不是危机，而是南北交的换轨信号。可行做法是减少对南交模式的依赖（少接同类型的事），同时给北交方向留出小剂量试验——${northGrowth}。`,
        },
        {
          h: '后半生 · 北交点的进化方向（约 44 岁之后）',
          p: `北交 ${north}（${northTheme}）起初会显得笨拙，这恰恰是它对你有价值的原因。判断是否走对：北交的事让你紧张却隐隐兴奋，做完有扩张感；南交的事熟练却容易空。中期看成果，长期看「你是否变成了更完整的自己」。`,
        },
        {
          h: '意识与无意识的配合',
          p: `意识太阳 ${pSunTxt}（${sunTheme}）是你能主动调的频道；无意识太阳 ${dSunTxt}（${designTheme}）是身体替你活出来、别人先看见的部分。地球 ${earthTxt} 提醒你落地方式——它决定你在什么环境里最稳。三者对齐时，行动不需要意志硬撑。`,
        },
        {
          h: '结构支撑',
          p: `本盘有 ${definedCount} 个中心被定义、${channelCount} 条完整通道、${hanging} 个悬挂闸门。定义的中心是你稳定的输出口，开放的中心是容易被他人期待牵走的地方；把重要决定放回定义中心与内在权威，人生轨迹会明显变直。`,
        },
        {
          h: '可执行的三件事',
          p: '① 每年做一件「北交方向」的小事，不求成果，只求接触；② 记录三次「我又退回南交模式」的具体场景，找出触发点；③ 每季度回看：这一年我是在重复熟悉，还是在靠近陌生的方向。',
        },
      ],
    },
    {
      key: 'trajectory',
      title: '发展轨迹',
      desc: '意识与无意识的双线如何层层展开，以及通道/中心提供的支撑',
      sections: [
        {
          h: '双线结构',
          p: `意识线（太阳 ${pSunTxt}）是你能描述的自我叙事；无意识线（设计太阳 ${dSunTxt}）是身体层面的既定节奏。两条线的主题往往互补：意识侧越用力，无意识侧越容易在放松时显形。`,
        },
        {
          h: '早期 · 借力',
          p: `早年通常靠意识侧的主题获得认可（${sunTheme}）。这时容易误以为「这就是我」，把外在反馈当成自我定义。`,
        },
        {
          h: '中期 · 拉扯',
          p: `当意识侧的做法开始消耗，无意识侧的主题（${designTheme}）会以身体信号出现：疲惫、抗拒、突然的吸引力。这不是叛逆，是另一半自己在要求出场。`,
        },
        {
          h: '后期 · 整合',
          p: `成熟的标志不是二选一，而是让两侧同时工作：用意识侧组织生活，用无意识侧提供质地。${
            definedCount >= 5
              ? '本盘定义中心较多，整合的物质基础较好，重点是别用意志力硬扛节奏。'
              : '本盘定义中心较少，适合借环境与他人的稳定结构来承载自己的节奏。'
          }`,
        },
      ],
    },
    {
      key: 'forecast',
      title: '未来形势',
      desc: '按近期 / 中期 / 长期三段观察，不做绝对化预测',
      sections: [
        {
          h: '近期（0–12 个月）',
          p: `主题仍围绕意识太阳 ${pSunTxt}（${sunTheme}）展开：同类情境会换着面孔出现，考验的是回应方式而不是运气。${
            channelCount
              ? `已有的 ${channelCount} 条通道是现成的发力点，优先在它们对应的领域出手。`
              : '本盘暂无完整通道，适合先积累、少下重注。'
          }`,
        },
        {
          h: '中期（1–3 年）',
          p: `北交 ${north} 的吸引力会变强，可能出现「想换轨但不确定」的阶段。建议用项目制试水：给新方向 3 个月、可承受的成本，再用结果说话。`,
        },
        {
          h: '长期（3 年以上）',
          p: '长期走势取决于是否把北交方向变成日常结构（固定的时间、固定的合作者、固定的产出形式）。结构一旦建立，运势的波动会明显变小。',
        },
        {
          h: '心态建议',
          p: `把注意力放在「我如何回应」而不是「接下来会发生什么」——后者不由你决定，前者才是杠杆。${
            hanging > 0
              ? `盘中有 ${hanging} 个悬挂闸门，它们是潜在入口：遇到能补上另一端的人或机会，往往就是转折点。`
              : ''
          }`,
        },
      ],
    },
    {
      key: 'karma',
      title: '前世姻缘',
      desc: '设计侧继承的情感剧本：看见它，才有改写它的余地',
      sections: [
        {
          h: '继承而来的剧本',
          p: `设计侧（无意识）承载着先于这一生的模式。设计太阳 ${dSunTxt}（${designTheme}）描述了你不假思索就会上演的关系戏码：被什么吸引、在亲密里自动扮演谁、以及那个反复出现的情感功课。`,
        },
        {
          h: '「前世」的更准确说法',
          p: '所谓前世姻缘，落到体验上就是：你带着一套没经过这一生验证的情感反应而来。它解释了「为什么总遇到相似的人」，也解释了为什么明知不合适却仍被吸引。',
        },
        {
          h: '南北交与关系',
          p: `南交 ${south} 的熟悉感容易被误读成「命中注定」；北交 ${north} 的陌生感则常被误判为「不对的人」。一个实用的分辨：让你不断回到旧模式的关系，多半是南交的引力；让你笨拙但逐渐扩大的关系，才靠近北交。`,
        },
        {
          h: '改写的三个动作',
          p: '① 命名：用一句话说出「我又在演哪一幕」；② 停一拍：在自动反应前给自己 10 秒；③ 换台词：把最熟练的那句反应，换成一句真实的当下感受。剧本不会一次改写，但每次觉察都会松动一点。',
        },
        {
          h: '温和提醒',
          p: '这里描述的是倾向，不是判决。任何模式都可以被看见、被练习替换；把「前世」当作理解自己的语言，而不是限制自己的理由。',
        },
      ],
    },
  ]
}
