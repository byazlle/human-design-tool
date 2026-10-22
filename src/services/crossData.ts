/**
 * 轮回交叉数据与解读（离线、确定性）。
 *
 * 轮回交叉由四闸门构成：人格太阳/地球（显意识轴线）+ 设计太阳/地球（潜意识轴线），
 * 角度由人格太阳爻位决定：1–3 右角度（个人行程）、4/1 并列（固定命运）、5–6 左角度（换乘/业力）。
 *
 * 192 个交叉的注册专有名称属于 Jovian Archive 商业资料，为避免臆造，
 * 本项目以「角度 + 四闸门标准名」结构化命名，并以每个闸门的
 * 关键词 / 使命主题 / 高阶表现 / 低频卡点组合出完整释义。
 */

export interface GateCrossTheme {
  /** 闸门关键词（交叉释义的原子主题） */
  keyword: string
  /** 该闸门在人生使命中的主题句 */
  mission: string
  /** 活出状态（高阶） */
  high: string
  /** 未活出状态（低频卡点） */
  low: string
}

export const GATE_CROSS_THEME: Record<number, GateCrossTheme> = {
  1: { keyword: '自我表达', mission: '成为创造力的源头，把内在的表达带到世界上', high: '创意源源不断，表达独特而有感染力', low: '憋着不说，或用夸张表达换取关注' },
  2: { keyword: '方向', mission: '成为自身方向的持有者，为他人指路', high: '清楚知道自己要去哪，并自然引领他人', low: '反复问路、依赖他人给方向' },
  3: { keyword: '秩序', mission: '在混乱中建立新秩序，为事物排序', high: '能在失序中第一个给出可行结构', low: '急于否定旧秩序，却给不出替代' },
  4: { keyword: '答案', mission: '用逻辑检验与回答疑问，公式化地解决问题', high: '给出经得起推敲的答案并承认局限', low: '强行给答案，或被怀疑困住不动' },
  5: { keyword: '节奏', mission: '守住固定节律，成为可依赖的韵律', high: '以稳定的节奏带动他人，兑现承诺', low: '被打乱就焦虑，或强加节奏给别人' },
  6: { keyword: '摩擦', mission: '在亲密与界线中练习碰撞，为联结定界', high: '坦诚表达需要，把冲突变成亲密的入口', low: '用冷漠或回避代替界线' },
  7: { keyword: '领导角色', mission: '以身后之力影响众人，做被推举出的引导者', high: '在需要时自然站到前面，放权有度', low: '既想主导又怕出头，位置感混乱' },
  8: { keyword: '贡献', mission: '为有价值的创作做推广与贡献', high: '把好东西推到台前，甘当桥梁', low: '急于表现自我而非成就作品' },
  9: { keyword: '专注', mission: '聚焦细节与能量，把事情做到底', high: '长时间专注并产出高质量结果', low: '注意力涣散，或死磕不重要的细节' },
  10: { keyword: '爱自己', mission: '以自身行为示范自爱与觉醒', high: '言行一致，敢于做自己并尊重他人', low: '讨好换接纳，或用行为自证' },
  11: { keyword: '想法', mission: '储存与分享好点子，做想法的宝库', high: '点子供给他人实现，不执着于亲自落地', low: '想法堆積却不分享，或强推想法' },
  12: { keyword: '谨慎', mission: '在正确的时机与心情中说出口', high: '开口即动人，时机拿捏精准', low: '情绪化发言，或永远不敢开口' },
  13: { keyword: '倾听', mission: '聆听他人的故事并为其作证', high: '成为别人愿意托付秘密的人，能整合过去', low: '打听窥探，或被他人的故事淹没' },
  14: { keyword: '赋能', mission: '用技能与资源为方向加力', high: '把力气花在值得的方向上，滋养他人', low: '为钱而工作，力气用错方向' },
  15: { keyword: '极端', mission: '拥抱人性的极端，为群体守住节奏', high: '接纳自己与他人的迥异，活出包容', low: '行为失度，强求一致' },
  16: { keyword: '技能', mission: '热忱地反复练习，把天赋磨成技能', high: '以热情精通一事并乐于展示', low: '浅尝辄止，用热情掩盖生疏' },
  17: { keyword: '观点', mission: '形成可被检验的观点，供集体讨论', high: '提出观点但欢迎挑战，修正自如', low: '固执己见，把意见当真理' },
  18: { keyword: '修正', mission: '发现并纠正失当之处，追求更好', high: '指出问题并提供改进路径', low: '只挑剔不建设，苛责自己与他人' },
  19: { keyword: '需求', mission: '觉察彼此的需求，建立彼此支持的结构', high: '敏锐察觉需要并真诚请求支持', low: '压抑需求，或情感勒索' },
  20: { keyword: '当下', mission: '在当下把觉察说成行动', high: '该说时一针见血，行动即表达', low: '滔滔不绝填满沉默，或错过时机' },
  21: { keyword: '掌控', mission: '掌控自己的领域与资源，做诚实的掌管者', high: '管好自己的事，授权时干净利落', low: '控制欲外溢，事事插手' },
  22: { keyword: '优雅', mission: '以开放的情绪与社交恩典联结他人', high: '情绪流动自然，待人优雅真诚', low: '情绪起伏左右社交，忽冷忽热' },
  23: { keyword: '同化', mission: '把复杂洞见简化为可传播的语言', high: '把个体洞见讲成人人能懂的话', low: '表达晦涩或为独特而独特' },
  24: { keyword: '合理化', mission: '让灵感在脑海里反复酝酿直到明晰', high: '灵感沉淀为智慧，二次解读到位', low: '思绪空转，反复咀嚼同一焦虑' },
  25: { keyword: '纯真', mission: '以宇宙之爱接纳一切发生', high: '天真而完整，不因经历而变苦涩', low: '受害者叙事，觉得世界亏欠自己' },
  26: { keyword: '推销者', mission: '善用记忆与诚信去说服与交易', high: '为真正的好东西代言，诚信营销', low: '夸大其词，操纵他人购买' },
  27: { keyword: '滋养', mission: '照顾与滋养他人的身心', high: '有界限地给予，滋养而不耗竭', low: '过度付出换取被需要感' },
  28: { keyword: '挣扎', mission: '为值得的意义而战，把挣扎转化为价值', high: '为意义承受困难，愈战愈明', low: '为怕死而冒险，或逃避一切冲突' },
  29: { keyword: '承诺', mission: '对正确的事说「是」并坚持到底', high: '承诺审慎，兑现彻底', low: '什么都答应，或用「不」自我保护' },
  30: { keyword: '欲望', mission: '经验欲望的强度，学习其边界', high: '全然体验渴望而不被其驱使', low: '被欲望牵着走，期待总落空' },
  31: { keyword: '影响力', mission: '以谦逊带领，说出集体的声音', high: '被推举而领导，声音服务众人', low: '抢占话语权，或不敢发言' },
  32: { keyword: '延续', mission: '识别什么值得传给下一代', high: '有远见地保守价值，未雨绸缪', low: '恐惧失败而拒绝一切改变' },
  33: { keyword: '隐私', mission: '退隐消化经验，再以故事分享智慧', high: '懂得退出与总结，分享有分量', low: '困在过去的角色里演不放手' },
  34: { keyword: '力量', mission: '把强大能量用于自利自立', high: '精力充沛且独立，忙在自己路上', low: '瞎忙证明自己，能量被浪费' },
  35: { keyword: '改变', mission: '经验进步与变迁，取材于亲身经历', high: '拥抱变化并从中汲取智慧', low: '饥饿感永不满足，不断尝新逃避深入' },
  36: { keyword: '危机', mission: '穿过情绪的风暴走向成熟', high: '在动荡中保持觉察，化危机为经验', low: '制造戏剧化事件，情绪崩溃' },
  37: { keyword: '友谊', mission: '经营契约与亲密，维系家庭的温度', high: '以公平的付出换取持久联结', low: '讨价还价式的爱，触碰即冷战' },
  38: { keyword: '战士', mission: '为值得之事坚持抗争', high: '找准值得打的仗，意志坚定', low: '为反对而反对，处处树敌' },
  39: { keyword: '挑衅', mission: '以试探激发他人的真实情绪', high: '善意搅动，帮助他人看见自己', low: '无意戳人痛处，人际紧张' },
  40: { keyword: '独自', mission: '在独自中恢复，用劳动换取归属', high: '工作与休息分明，独自而不孤僻', low: '过度劳累换取接纳，拒绝亲密' },
  41: { keyword: '收缩', mission: '成为一切经验的种子与梦想起点', high: '让梦想落地为可行计划', low: '沉浸幻想，被匮乏感驱动' },
  42: { keyword: '成长', mission: '把事情带向完成，在周期中成熟', high: '有始有终，陪伴事物走向圆满', low: '频繁弃坑，恐惧结束' },
  43: { keyword: '洞见', mission: '听见内在独特洞见并等待对的表达时机', high: '洞见独到，时机对了才开口', low: '强推「知道」，被视为怪异' },
  44: { keyword: '警觉', mission: '凭借嗅觉识别模式与人才', high: '一眼识人断事，为团队筛选', low: '翻旧账，被直觉的偏见绑架' },
  45: { keyword: '主宰', mission: '聚集资源与人，做自然的教育者与引领者', high: '慷慨聚拢众人，共享资源', low: '霸占话语与资源，或自封为王' },
  46: { keyword: '决心', mission: '在正确的地点与时机，让身体带着爱行动', high: '出现在对的地方，顺势而为', low: '用力挤进错误的位置' },
  47: { keyword: '领悟', mission: '把混乱的过去消化为清晰的领悟', high: '把经历炼成洞见，心态豁达', low: '反刍苦难，越想越苦' },
  48: { keyword: '深度', mission: '积累深度与智慧，成为可被请教的井', high: '承认「还不够懂」却持续深挖', low: '用回避掩饰怕被看穿的恐惧' },
  49: { keyword: '原则', mission: '以原则决定接纳与拒绝，影响群体走向', high: '原则清晰，拒绝也带尊重', low: '以原则为名情绪化排斥他人' },
  50: { keyword: '价值观', mission: '守护规则与价值观，成为滋养性的守护者', high: '价值观落地为责任与照顾', low: '规则僵化，牺牲自己去守规' },
  51: { keyword: '震撼', mission: '敢于先迈一步，用震撼唤醒他人', high: '迎向未知，以勇气鼓舞他人', low: '制造惊险证明胆量，或彻底退缩' },
  52: { keyword: '静止', mission: '在专注的静定中积蓄势能', high: '静得下来，动时一击即中', low: '表面静止内里焦躁，僵在原地' },
  53: { keyword: '开始', mission: '启动新的周期，为一切按下开始键', high: '点燃起点并交给他人接力', low: '反复开新头，无法忍受推进' },
  54: { keyword: '野心', mission: '把物质世界的野心转为上升的动力', high: '踏实向上，成就自己也提携人', low: '攀附投机，为跃升不择手段' },
  55: { keyword: '丰盛', mission: '在情绪的波段里找到精神自由', high: '接纳情绪起伏，活得丰盛完整', low: '情绪低潮时自弃，囤积匮乏感' },
  56: { keyword: '刺激', mission: '用故事与体验启发他人的信仰', high: '讲出好故事，启发而不控制', low: '夸夸其谈，重复同一套说辞' },
  57: { keyword: '直觉', mission: '以身体直觉在当下保全与澄清', high: '直觉敏锐即时，行动干脆', low: '忽视直觉事后懊悔，或过度警觉' },
  58: { keyword: '活力', mission: '以生命的活力推动事物走向更好', high: '快乐地挑战与改进，能量感染人', low: '精力无处安放，挑剔一切' },
  59: { keyword: '亲密', mission: '破除屏障，建立真实的亲密', high: '敞开且守界，亲密而自由', low: '屏障紧闭，或以性换联结' },
  60: { keyword: '接受', mission: '接受限制，在限制里找到改变的杠杆', high: '承认边界，在局限中创新', low: '沉重压抑，抱怨现实' },
  61: { keyword: '神秘', mission: '连接内在真理，成为奥秘的通道', high: '安住未知，灵感与信仰自来', low: '强解不可解之事，陷入怀疑' },
  62: { keyword: '细节', mission: '组织细节，把复杂说清楚', high: '以精准表达建立可信度', low: '细节堆砌淹没重点，或不敢表态' },
  63: { keyword: '怀疑', mission: '以怀疑检验模式，逼近真相', high: '存疑但推进，验证后放行', low: '怀疑瘫痪行动，焦虑成瘾' },
  64: { keyword: '困惑', mission: '让混乱的意象自行沉淀成图景', high: '容许混沌，答案自然浮现', low: '强行理清，越理越乱' },
}

export interface CrossAngleInfo {
  key: 'right' | 'juxtaposition' | 'left'
  label: string
  en: string
  desc: string
  purpose: string
}

export const CROSS_ANGLES: Record<CrossAngleInfo['key'], CrossAngleInfo> = {
  right: {
    key: 'right',
    label: '右角度交叉',
    en: 'Right Angle Cross',
    desc: '人生主题围绕「自己」展开：你的人生剧本主要是为自己而写，他人的影响是背景而非主线。',
    purpose: '个人行程——专注活出自己的主题，不必对别人的剧本负责。',
  },
  juxtaposition: {
    key: 'juxtaposition',
    label: '并列交叉',
    en: 'Juxtaposition Cross',
    desc: '固定命运：你的人生像一条固定的窄轨，主题明确而恒定，变化较少。',
    purpose: '固定行程——把唯一那条路走深、走透，就是使命本身。',
  },
  left: {
    key: 'left',
    label: '左角度交叉',
    en: 'Left Angle Cross',
    desc: '换乘与业力：你的人生剧本天然与他人交织，重要转折多由「遇见谁」触发。',
    purpose: '人际行程——你的使命在关系与互动中展开，重要的人就是路标。',
  },
}

export interface CrossGateRole {
  role: string
  roleDesc: string
  side: 'p' | 'd'
  gate: number
  line: number
  gateName: string
  theme: GateCrossTheme
}

export interface CrossReading {
  /** 结构化标准名，如「右角度交叉 · 41/31 | 44/28」 */
  name: string
  angle: CrossAngleInfo
  gates: CrossGateRole[]
  /** 核心释义 */
  summary: string
  /** 人生使命解读 */
  mission: string
  /** 活出状态（高阶） */
  highState: string
  /** 未活出状态（低频卡点） */
  lowState: string
}

function themeOf(gate: number): GateCrossTheme {
  return (
    GATE_CROSS_THEME[gate] ?? {
      keyword: '',
      mission: '',
      high: '',
      low: '',
    }
  )
}

export function crossReadingOf(
  personality: Array<{ planet: string; gate: number; line: number }>,
  design: Array<{ planet: string; gate: number; line: number }>,
  profile: string,
): CrossReading {
  const pSun = personality.find((p) => p.planet === 'Sun')!
  const pEarth = personality.find((p) => p.planet === 'Earth')!
  const dSun = design.find((p) => p.planet === 'Sun')!
  const dEarth = design.find((p) => p.planet === 'Earth')!
  const [pl] = profile.split('/').map(Number)

  let key: CrossAngleInfo['key'] = 'right'
  if (profile === '4/1') key = 'juxtaposition'
  else if (pl >= 5) key = 'left'
  const angle = CROSS_ANGLES[key]

  const roles: CrossGateRole[] = [
    { role: '人格太阳（意识主轴）', roleDesc: '你能意识到的、这一生要活出的核心主题', side: 'p', gate: pSun.gate, line: pSun.line, gateName: themeOf(pSun.gate).keyword, theme: themeOf(pSun.gate) },
    { role: '人格地球（意识扎根）', roleDesc: '让意识主题得以落地的平衡点与环境', side: 'p', gate: pEarth.gate, line: pEarth.line, gateName: themeOf(pEarth.gate).keyword, theme: themeOf(pEarth.gate) },
    { role: '设计太阳（无意识驱力）', roleDesc: '身体替你活出的、别人先看见的深层主题', side: 'd', gate: dSun.gate, line: dSun.line, gateName: themeOf(dSun.gate).keyword, theme: themeOf(dSun.gate) },
    { role: '设计地球（无意识扎根）', roleDesc: '无意识主题的稳定支点与栖息方式', side: 'd', gate: dEarth.gate, line: dEarth.line, gateName: themeOf(dEarth.gate).keyword, theme: themeOf(dEarth.gate) },
  ]

  const name = `${angle.label} · ${pSun.gate}/${pEarth.gate} | ${dSun.gate}/${dEarth.gate}`

  const summary = [
    `你的轮回交叉是${angle.label}，由四条主题线织成：显意识一侧是「${themeOf(pSun.gate).keyword}」（人格太阳 ${pSun.gate}）落在「${themeOf(pEarth.gate).keyword}」（人格地球 ${pEarth.gate}）之上；潜意识一侧是「${themeOf(dSun.gate).keyword}」（设计太阳 ${dSun.gate}）落在「${themeOf(dEarth.gate).keyword}」（设计地球 ${dEarth.gate}）之上。`,
    angle.desc,
    `四个主题的关系是：${themeOf(pSun.gate).mission}——这需要${themeOf(pEarth.gate).keyword}式的落地方式来承载；而背后还有一双你看不见的手：${themeOf(dSun.gate).mission}，它以${themeOf(dEarth.gate).keyword}为支点。`,
  ].join('\n')

  const mission = [
    `【人生使命】你这一生的核心命题是：${themeOf(pSun.gate).mission}。`,
    `它的实现方式不是硬闯，而是把自己安放在「${themeOf(pEarth.gate).keyword}」的位置上——当环境与节奏对了，表达自然发生。`,
    `同时，你的身体层面持续在演示另一条线：${themeOf(dSun.gate).mission}。这条线不必刻意经营，但它决定了别人对你的第一印象，也是你打动世界的真正方式。`,
    `${angle.purpose}`,
  ].join('\n')

  const highState = [
    `当四条线都活出来时：`,
    `· 意识层面：${themeOf(pSun.gate).high}，并且${themeOf(pEarth.gate).high}。`,
    `· 无意识层面：${themeOf(dSun.gate).high}，以${themeOf(dEarth.gate).high}作为稳定底盘。`,
    `这是你人生第三阶段（约 50 岁后的凯龙周期）最自然的榜样状态——不必追求，只需把自己活完整。`,
  ].join('\n')

  const lowState = [
    `四条线被卡住时的典型样貌：`,
    `· ${themeOf(pSun.gate).low}（意识主轴受阻）；`,
    `· ${themeOf(pEarth.gate).low}（找不到落地点，漂着）；`,
    `· ${themeOf(dSun.gate).low}（无意识驱力被误用）；`,
    `· ${themeOf(dEarth.gate).low}（底层支点不稳，反复动荡）。`,
    `识别方法：这些状态出现时往往伴随「用力过度但没有结果」。回到策略与内在权威，是所有低频状态的共同出口。`,
  ].join('\n')

  return { name, angle, gates: roles, summary, mission, highState, lowState }
}
