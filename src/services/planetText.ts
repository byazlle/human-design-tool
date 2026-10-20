/**
 * 星体含义：解释星体表里每一行「代表什么」。
 * 人类图中每个星体都落在某个闸门上，携带一股特定的能量主题；
 * 意识面（Personality）与无意识面（Design）的表达方式不同。
 */
import type { Planet } from '../types/hd'

export interface PlanetMeaning {
  name: string
  theme: string
  conscious: string
  unconscious: string
}

export const PLANET_TEXT: Record<Planet, PlanetMeaning> = {
  Sun: {
    name: '太阳',
    theme: '核心自我：约 70% 的生命能量集中于此',
    conscious: '你清楚知道的「我是谁」，也是最容易被别人认出的特质',
    unconscious: '身体自然散发的那一面，常被旁人先看见',
  },
  Earth: {
    name: '地球',
    theme: '扎根与平衡：太阳的对位，让你不至于飘走',
    conscious: '你需要什么才能安定下来、把能量落地',
    unconscious: '身体层面真正需要的支撑，往往是无声的需求',
  },
  Moon: {
    name: '月亮',
    theme: '驱动力：把能量推出去的那股力道',
    conscious: '你主动追着走的方向，也是情绪的背景音',
    unconscious: '不自觉被推动的方向，来自身体记忆',
  },
  NorthNode: {
    name: '北交点',
    theme: '成长方向：不熟悉但值得走的那条路',
    conscious: '你有意识想发展的方向，走起来会有点笨拙',
    unconscious: '环境反复把你推去的方向，常在你没注意时发生',
  },
  SouthNode: {
    name: '南交点',
    theme: '舒适区：已经会了、容易退回的地方',
    conscious: '随手就能做到、但容易过度依赖的模式',
    unconscious: '一紧张就会自动退回的老习惯',
  },
  Mercury: {
    name: '水星',
    theme: '沟通方式：你怎么想、怎么说',
    conscious: '表达与思考的固定风格，别人能从你的话里听出来',
    unconscious: '别人觉得你「总是这样讲话」的那部分',
  },
  Venus: {
    name: '金星',
    theme: '价值观与吸引力：你看重什么、被什么吸引',
    conscious: '你明确喜欢与珍视的东西，也是关系里的审美倾向',
    unconscious: '你不自觉靠近的人与物，藏着真正的价值排序',
  },
  Mars: {
    name: '火星',
    theme: '行动与冲劲：你怎么出手、怎么用力',
    conscious: '你有意识的行动方式，也包括尚未成熟的冲动',
    unconscious: '压力下自动出现的反应，常比自己以为的更直接',
  },
  Jupiter: {
    name: '木星',
    theme: '扩张与机遇：你的祝福与成长空间',
    conscious: '你愿意投入、容易获得回报的方向',
    unconscious: '别人愿意给你机会的地方，你可能没当回事',
  },
  Saturn: {
    name: '土星',
    theme: '课题与纪律：需要时间磨出来的成熟',
    conscious: '你知道自己必须认真面对的责任与限制',
    unconscious: '反复出现的卡点，往往是同一种功课',
  },
  Uranus: {
    name: '天王星',
    theme: '突变与革新：打破常规的那一下',
    conscious: '你想改变的、想与众不同之处',
    unconscious: '环境里突然发生的变化，常从这里被触发',
  },
  Neptune: {
    name: '海王星',
    theme: '灵性与消融：模糊边界、也带来灵感',
    conscious: '你愿意相信、愿意奉献的方向',
    unconscious: '容易看不清、容易理想化的区域',
  },
  Pluto: {
    name: '冥王星',
    theme: '深层转化：压力下的重生能力',
    conscious: '你愿意为之彻底改变的事',
    unconscious: '反复被推到极限、然后重建的领域',
  },
}

export function getPlanet(planet: Planet): { name: string; theme: string; detail: string } {
  const t = PLANET_TEXT[planet]
  return {
    name: t.name,
    theme: t.theme,
    detail: `意识面：${t.conscious}；无意识面：${t.unconscious}。`,
  }
}
