/**
 * 星体与人生轨迹解读（离线、确定性的分层文本）
 *
 * 内容依据人类图通行解释整理（南北交点＝人生主轴；南交＝前半生/熟悉天赋，
 * 北交＝后半生/进化方向；约 38–44 岁为转向期；太阳/地球构成框架，其余星体增添风味），
 * 并结合闸门洞察（gateInsight）给出具体落点。
 *
 * 输出为「标题 + 多段分层内容」，不再是一段长文，便于阅读与 AI 二次生成。
 *
 * v3.8.0 可懂性改写（L2 打回后第 2 版）：正文一律白话，去掉编号与术语当主语，
 * 编号与中心名只在 UI 的闸门详情展示，不进正文。每句≤45字并带场景锚点。
 * 规则见 tests/readability.test.ts。
 */
import type { BodyGraph, Planet } from '../types/hd'
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

export function destinyReadings(chart: BodyGraph): DestinyReading[] {
  const pSun = star(chart, 'Sun', 'p')
  const dSun = star(chart, 'Sun', 'd')
  const pEarth = star(chart, 'Earth', 'p')
  const pNorth = star(chart, 'NorthNode', 'p')
  const pSouth = star(chart, 'SouthNode', 'p')

  // 具体闸门编号与中心名不进正文，只取白话落点
  const southTrait = gateInsightOf(pSouth?.gate ?? 0).trait
  const northTrait = gateInsightOf(pNorth?.gate ?? 0).trait
  const sunTrait = gateInsightOf(pSun?.gate ?? 0).trait
  const designTrait = gateInsightOf(dSun?.gate ?? 0).trait
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
          p: `你身上有一套早就练熟的老办法。${southTrait}。还有一件事你得自己慢慢补上。${northTrait}。前半生靠老的顺手，后半生得靠新的。`,
        },
        {
          h: '前半生 · 熟悉区（约 0–38 岁）',
          p: `这套老办法是你早就练熟的本事。早年被问到这类事，你总能接住，心里踏实。它也容易变成一遇压力就退回的习惯。别否定它，把它用出水平就好——${southGrowth}。`,
        },
        {
          h: '转向期 · 约 38–44 岁',
          p: `这段时间常有种感觉：原本能忍的，忽然忍不了了。旧的成就感开始失效，新方向还看不清。别慌，这是换轨的信号，不是危机。下次少接同类事，给新方向留点试验——${northGrowth}。`,
        },
        {
          h: '后半生 · 要补的那一课（约 44 岁之后）',
          p: `你要补的那一课起初会显得笨拙，这恰恰是它值钱的地方。${northTrait}。怎么判断走对了？下次做这类事会紧张却隐隐兴奋，做完有伸展感。老办法熟练却容易空。长期看，你是不是活得更完整了。`,
        },
        {
          h: '嘴上说的你 与 身体先动的你',
          p: `你嘴上能说清的那个自己，是一面。${sunTrait}。你身体先活出来、别人先看见的，是另一面。${designTrait}。你要落地的环境也重要：下次换个地方，感受哪里最稳。两面合上时，做事不用硬撑。`,
        },
        {
          h: '你稳的地方 与 容易被带动的地方',
          p: '你身上有的地方稳、有的地方容易被人带动。下次遇到重要决定，先放回你自己最稳、最有把握的地方。容易被别人期待牵走的地方，分清就好，会顺很多。',
        },
        {
          h: '可执行的三件事',
          p: '① 每年做一件新方向的小事，不求成果，只求接触；② 记下来三次「我又退回老习惯」的场景，找出触发点；③ 每季度回看：这一年是在重复熟悉的，还是靠近陌生的。',
        },
      ],
    },
    {
      key: 'trajectory',
      title: '发展轨迹',
      desc: '嘴上说的那一面和身体先动的那一面如何层层展开',
      sections: [
        {
          h: '两条线',
          p: `你嘴上说的那个自己，和身体先动的那个自己，常常是两回事。${sunTrait}。${designTrait}。两面其实互补：你越是用脑子使劲，身体越爱在放松时自己冒出来。`,
        },
        {
          h: '早期 · 借力',
          p: '早年你靠脑子那套本事拿到认可。被问到你是谁，你容易照着别人的说法回答。',
        },
        {
          h: '中期 · 拉扯',
          p: `当脑子里那套办法开始让你累，身体这面会先出声：疲惫、抗拒、突然被什么吸引。${designTrait}。这不是叛逆，是另一面想出场了。下次累了别硬撑，听听身体。`,
        },
        {
          h: '后期 · 两面合作',
          p: `成熟不是二选一，是两面一起用：脑子那面安排生活，身体那面给出底气。${
            definedCount >= 5
              ? '你本来就稳的地方多，别用意志力硬扛节奏就好。'
              : '你本来就稳的地方少，借身边靠谱的人和结构来撑节奏更省力。'
          }下次把决定放在让你放松的地方试试。`,
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
          p: `接下来一年，主题还是围绕你拿手的那件事转。${sunTrait}。同类情形会换着脸出现，下次考验的是你怎么回应，不是运气。${
            channelCount
              ? '你已经有了现成的发力点，先在熟的领域出手。'
              : '你暂时还没打通的路，先积累，少下重注。'
          }`,
        },
        {
          h: '中期（1–3 年）',
          p: '一到三年，你要补的那一课吸引力会变强，你可能想换轨又拿不准。先记下来这个念头，用小项目试水：给新方向 3 个月和能承受的成本，再看结果说话。',
        },
        {
          h: '长期（3 年以上）',
          p: '三五年后看的是：你有没有把新方向变成日常——固定的时间、伙伴和产出。每周固定下来，波动自然就小了。',
        },
        {
          h: '心态建议',
          p: `把心思放在我怎么回应上，别老想着接下来会发生什么。后者你管不了，前者才是你能使劲的地方。${
            hanging > 0
              ? '你身边还有些没接上的机会：下次遇到能补上的人或事，往往就是转机。'
              : ''
          }下次问自己：这件事我能回应什么？`,
        },
      ],
    },
    {
      key: 'marriage',
      title: '姻缘情况',
      desc: '这一世的关系习惯：看见它，才有调整的余地',
      sections: [
        {
          h: '关系从哪里起步',
          p: `你一进关系就会不自觉上演一套固定戏码。你身体先动的那一面就是起点。被问到喜欢什么样的人、一进关系切成什么状态，都写在上面。这不是谁安排的剧本，是你反复回到的老反应。`,
        },
        {
          h: '亲密里你自动扮演的角色',
          p: '同一套反应在关系里只演一个角色：有人自动照顾人，有人等被照顾，有人当和事佬。角色没好坏，代价是它太自动——你以为在选择，其实只是习惯。下次争执时留意你最先做的事、道歉时最顺口的那句、关系变近时先退的那一步。',
        },
        {
          h: '熟悉的 与 陌生的关系',
          p: '你习惯的那套，容易让人觉得就是对的人。陌生的那类，又常被当成不对。分辨有个笨办法：下次问自己，这段关系让我回到老习惯，还是让我笨拙却在长大？敢于在陌生但不消耗的人身边多待一会儿，关系就稳了。',
        },
        {
          h: '可调整的三个动作',
          p: '① 命名：开口用一句话说出我又在演哪个角色；② 停一拍：反应上来前给自己 10 秒；③ 换台词：把最顺的那句反应，换成当下的真实感受。这三步不会一次改掉老习惯，但每次留意都会松一点。这里说的是倾向，不是判决。任何老习惯都能被看见、被换掉。把它当成认识自己的话，别当成限制自己的框。',
        },
      ],
    },
  ]
}
