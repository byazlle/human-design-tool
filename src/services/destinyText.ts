/**
 * 星体轨迹解读（用户需求 #7，离线模板版）：
 * 基于本命盘关键星体（意识/无意识太阳、南北交点）生成
 * 「未来形势 / 发展轨迹 / 人生轨迹 / 前世姻缘」四类主题文字。
 * 所有内容为确定性模板，不依赖 AI；AI 角度版可在同主题下进一步生成。
 */
import type { BodyGraph } from '../types/hd'

function starOf(chart: BodyGraph, planet: string) {
  return chart.personality.find((p) => p.planet === planet)
}
function designStarOf(chart: BodyGraph, planet: string) {
  return chart.design.find((p) => p.planet === planet)
}

export interface DestinyReading {
  key: string
  title: string
  desc: string
  text: string
}

export function destinyReadings(chart: BodyGraph): DestinyReading[] {
  const pSun = starOf(chart, 'Sun')
  const dSun = designStarOf(chart, 'Sun')
  const pNorth = starOf(chart, 'NorthNode')
  const pSouth = starOf(chart, 'SouthNode')
  const pSunText = pSun ? `${pSun.gate}.${pSun.line}` : '—'
  const dSunText = dSun ? `${dSun.gate}.${dSun.line}` : '—'
  const northText = pNorth ? `${pNorth.gate}.${pNorth.line}` : '—'
  const southText = pSouth ? `${pSouth.gate}.${pSouth.line}` : '—'

  return [
    {
      key: 'forecast',
      title: '未来形势',
      desc: '基于意识太阳所在闸门的能量主题，推演未来 1–3 年的气候',
      text:
        `你的显意识太阳落在 ${pSunText}，这是当前人生阶段最活跃的能量主题。` +
        `它描述的不是「会发生什么事」，而是「你会用什么状态去经历事情」。` +
        `未来 1–3 年，围绕这个闸门的核心课题（成长、表达、决策方式）会反复出现：` +
        `同样的情境会换着面孔回来，直到你用属于自己类型的方式回应它。` +
        `建议把注意力放在「我如何回应」而不是「接下来会发生什么」——后者不由你决定，前者才是你的杠杆。`,
    },
    {
      key: 'trajectory',
      title: '发展轨迹',
      desc: '意识与无意识太阳的相互作用，说明成长如何层层展开',
      text:
        `意识太阳 ${pSunText} 是你能看见的自己；无意识太阳 ${dSunText} 是身体替你活出的部分。` +
        `两者的主题像两条旋律线：意识侧的课题越练越熟，无意识侧的特质会被身边的人先认出来。` +
        `发展轨迹通常是——先在意识侧刻意练习（可能笨拙），中年在两侧主题上找到配合方式，` +
        `后期无意识侧的深度反而成为你最被依赖的能力。`,
    },
    {
      key: 'lifePath',
      title: '人生轨迹',
      desc: '南北交点描绘从舒适区走向成长区的方向',
      text:
        `南交点 ${southText} 代表你已经熟练、容易退回的旧模式；北交点 ${northText} 是此生被反复推向的新方向。` +
        `人生轨迹不是直线前进：你会周期性地退回南交的舒适区休整，再被环境推向北交。` +
        `判断方向是否正确的一个简单信号——北交方向的事起初让你笨拙却隐隐兴奋，南交方向的事熟练却让你空虚。` +
        `越是人生转折点，越值得朝北交的陌生处多走一步。`,
    },
    {
      key: 'karma',
      title: '前世姻缘',
      desc: '设计侧继承的情感与关系主题（温和、非宿命）',
      text:
        `设计侧承载着从家族与更深处继承来的主题。无意识太阳 ${dSunText} 描述了你不假思索就会上演的关系剧本：` +
        `你容易被什么吸引、在亲密里自动扮演的角色、以及那个反复出现的情感功课。` +
        `所谓「前世姻缘」，更准确的说法是——你带着一套先于这次人生的情感模式而来；` +
        `它解释了「为什么总遇到相似的人」，而改变剧本的钥匙在于意识到它的存在。` +
        `当你能说出「我又在演这一幕了」，剧本就开始松动了。`,
    },
  ]
}
