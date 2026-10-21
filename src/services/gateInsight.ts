/**
 * 64 闸门补充洞察（用户需求 #10）：
 * trait — 含义与特质趋势；growth — 成长方向；grounding — 扎根力；drive — 驱动力。
 * 内容为通用人类图释义的精炼版，供闸门详情与 AI 组合解读引用。
 */
export interface GateInsight {
  trait: string
  growth: string
  grounding: string
  drive: string
}

export const GATE_INSIGHT: Record<number, GateInsight> = {
  1: { trait: '创意表达：自我创造的起点', growth: '让表达服务于整体，而非证明自己', grounding: '独自创作时最安稳', drive: '把内在图景变成可见之物' },
  2: { trait: '接纳之 gate：高我指引方向', growth: '信任内在罗盘，不强行规划', grounding: '静坐与自然中恢复方向感', drive: '被托付方向后的行动力' },
  3: { trait: '秩序之初：在混乱中建立新序', growth: '接受试错，秩序是磨出来的', grounding: '动手整理具体事物', drive: '突破旧结构、开创新局' },
  4: { trait: '年轻愚者：答案式思维/解题', growth: '承认有些事无解，答案会自己来', grounding: '把疑问写下来再放手', drive: '逻辑求解的冲动' },
  5: { trait: '固定节律：等待与模式', growth: '尊重自己的节奏，不迁就他人时刻表', grounding: '规律作息是能量底座', drive: '维持秩序与仪式感' },
  6: { trait: '冲突之 gate：亲密中的摩擦与界限', growth: '在情绪浪里不站队，观察即可', grounding: '给身体留出独处缓冲', drive: '守护亲密中的真实' },
  7: { trait: '领导角色：背后的影响力', growth: '等被授权再引领，不做突出者', grounding: '在组织中找到位置感', drive: '引导集体方向的欲望' },
  8: { trait: '贡献：个体风格的展示', growth: '先做出成果，再让人看见', grounding: '用作品锚定自我', drive: '让人看见独特贡献' },
  9: { trait: '专注：聚焦细节的能量', growth: '一次只盯一件事', grounding: '清单与番茄钟是助力', drive: '把事做到位的不耐烦' },
  10: { trait: '自我行为：爱自己 / 行为觉醒', growth: '对自己的行为负责，而非完美', grounding: '身体练习带来归属', drive: '活出真实样子的冲动' },
  11: { trait: '想法之 gate：点子仓库', growth: '点子不必都实现，分享即是价值', grounding: '记录灵感清单', drive: '寻找新刺激与可能性' },
  12: { trait: '谨慎：言语的斟酌', growth: '心情对的时候开口，力量最大', grounding: '情绪浪谷不发重要言', drive: '表达内在状态的冲动' },
  13: { trait: '倾听者：人生的见证者', growth: '听比说更有力量，秘密自会来', grounding: '写日记整理经验', drive: '想知道「这一切意味着什么」' },
  14: { trait: '掌握技能：资源与力量', growth: '把能量投给真正滋养你的事', grounding: '管理好时间与财务', drive: '让才华变现、赋能他人' },
  15: { trait: '极端：爱与人性的广度', growth: '接纳自己的节奏忽快忽慢', grounding: '跟随自然的呼吸节律', drive: '体验人生全部光谱' },
  16: { trait: '技能：热情与试验', growth: '精通来自反复投入同一件事', grounding: '刻意练习是根基', drive: '掌握新技能的兴奋' },
  17: { trait: '追随的观点：形成见解', growth: '意见是假设，等被验证', grounding: '先表达再被反驳可磨观点', drive: '想让世界更有逻辑' },
  18: { trait: '纠正：看见可改进之处', growth: '先指出模式，而非挑人毛病', grounding: '把挑剔转化为系统优化', drive: '让事物趋于完善的冲动' },
  19: { trait: '想要：需求与资源', growth: '承认需求不丢人，敏感是雷达', grounding: '触摸自然与身体接触', drive: '争取资源守护所爱' },
  20: { trait: '当下：此刻的行动与表达', growth: '该出手时出手，话在当下说', grounding: '正念呼吸回到此刻', drive: '立即行动的冲动' },
  21: { trait: '控制：善用资源的猎人', growth: '管好自己的领地，不控制他人', grounding: '亲自管理钱与事务', drive: '掌控自己生活的欲望' },
  22: { trait: '开放：情绪优雅 / 社交恩典', growth: '情绪浪尖上的表达最动人', grounding: '艺术与音乐稳定情绪', drive: '创造美好体验' },
  23: { trait: '同化：个体知道的表达', growth: '把洞见说成简单的话', grounding: '等被问到再解释', drive: '把「我知道」说出来' },
  24: { trait: ' rational化：回顾与顿悟', growth: '让思维转完圈，答案自己浮现', grounding: '冥想让脑内复盘安静', drive: '追问「为什么」' },
  25: { trait: '天真：宇宙之爱 / 需要被爱', growth: '天真不是幼稚，是纯粹的信任', grounding: '无条件的小善行', drive: '普遍之爱的流动' },
  26: { trait: '推销员：诚信与操纵之间', growth: '只为自己真正信的东西代言', grounding: '守住诚信底线', drive: '让价值被看见的欲望' },
  27: { trait: '照顾：滋养与责任', growth: '先自养再养人，界限清晰', grounding: '做饭、照料植物等滋养仪式', drive: '保护与喂养的冲动' },
  28: { trait: '挣扎：寻找意义 / 不平则鸣', growth: '为值得的事挣扎，意义自现', grounding: '身体冒险与极限运动', drive: '为意义赌一把' },
  29: { trait: '说好：承诺与投入', growth: '只对真正回应的事说「是」', grounding: '信守小承诺积累信用', drive: '全心投入的燃烧感' },
  30: { trait: '欲望之 gate：感受的强度', growth: '欲望是燃料，不是路线图', grounding: '承认渴望，再决定投入', drive: '体验人生浓烈之处' },
  31: { trait: '领导：民主的发声', growth: '为集体发声，而非自己站上前', grounding: '在群体中练习表达', drive: '组织与引领的影响欲' },
  32: { trait: '连续：谨慎 / 价值观传承', growth: '识别什么值得长期保留', grounding: '维护传统与信用', drive: '让好的东西延续' },
  33: { trait: '隐私：退出与咀嚼经验', growth: ' retreat 是为了带着智慧回来', grounding: '独处空间是必需品', drive: '把经历变成故事' },
  34: { trait: '力量：独立与忙碌能量', growth: '把力量用在自己的事上', grounding: '规律运动泄洪能量', drive: '自力更生、大干一场' },
  35: { trait: '改变：进步与「都要」', growth: '体验≠拥有，选值得的深入', grounding: '定期盘点真正的渴望', drive: '追逐新鲜体验' },
  36: { trait: '危机：情绪的暗流 / 成熟', growth: '危机是情绪成熟的课堂', grounding: '浪中等待，浪过再判断', drive: '渴望体验的强度' },
  37: { trait: '家庭：友谊与婚姻的契约', growth: '为关系付出也接受照顾', grounding: '家庭仪式创造归属', drive: '守护群体的黏合' },
  38: { trait: '对抗：为意义而战', growth: '战斗前问：这值得吗', grounding: '格斗类运动泄压', drive: '不肯认输的倔劲' },
  39: { trait: '挑衅：拨动情绪的 probing', growth: '别人的情绪反弹是信息，不是攻击', grounding: '承认自己的敏感触发', drive: '试探精神与情感边界' },
  40: { trait: '独处：意志与工作回报', growth: '工作有边界，休息是权利', grounding: '独处充电是刚需', drive: '以付出换取尊重' },
  41: { trait: '收缩：幻想的种子', growth: '所有体验始于一个念头', grounding: '写下来，给幻想一个出口', drive: '对体验的原始渴望' },
  42: { trait: '增长：完成 cycles', growth: '有始有终，别开太多头', grounding: '完成一个再开下一个', drive: '把事推向完成' },
  43: { trait: '洞见：内在知道 / 独特觉知', growth: '等对的词与对的时机', grounding: '静默中听内在声音', drive: '表达独特理解的冲动' },
  44: { trait: '警觉：嗅觉与模式记忆', growth: '信任鼻子里的「不对劲」', grounding: '整理过去释放嗅觉', drive: '识别人才与模式' },
  45: { trait: '聚集者：资源的 王 / 统领', growth: '为群体发声时最有力', grounding: '掌管空间的秩序感', drive: '「这是我的地盘」的担当' },
  46: { trait: '决心：身体之爱 / 在对的地方', growth: '出现在对的地点，努力交给身体', grounding: '身体觉知练习', drive: '对幸运与时机的敏觉' },
  47: { trait: '压迫：心智的领悟', growth: '困惑是领悟的前身', grounding: '不强迫自己立刻想通', drive: '把经历变成理解' },
  48: { trait: '深度：井 / 解决问题的深度', growth: '承认「还没准备好」也是深度', grounding: '持续钻研一个领域', drive: '成为可靠专家' },
  49: { trait: '原则：革命与接纳', growth: '按自己的原则接纳或拒绝', grounding: '明确底线减少内耗', drive: '守护信念的决绝' },
  50: { trait: '价值：规则与守护', growth: '负责任不等于扛起一切', grounding: '明确自己的价值观清单', drive: '守护群体规则的直觉' },
  51: { trait: '震撼：勇气的顿悟', growth: '主动走进让你害怕的领域', grounding: '定期挑战舒适区', drive: '打破平庸的冲击欲' },
  52: { trait: '静止：专注的静止', growth: '静下来，才知道值得专注什么', grounding: '静坐与断网时段', drive: '深度聚焦的定力' },
  53: { trait: '开始：新的 cycles', growth: '新开始是压力驱动，选对的起点', grounding: '接受循环有起有落', drive: '启动新阶段的冲动' },
  54: { trait: '雄心：物质的攀升', growth: '野心与脚踏实地配对', grounding: '把大目标拆成台阶', drive: '向上流动的动力' },
  55: { trait: '精神：情绪的 Spirit / 自由', growth: '情绪波里藏着诗,不评判浪', grounding: '艺术表达释放情绪', drive: '寻找灵魂自由的共鸣' },
  56: { trait: '刺激：讲述者的故事', growth: '故事是给人生的礼物，不必都是道理', grounding: '收集与讲述真实经历', drive: '分享体验的欲望' },
  57: { trait: '直觉清晰：温和的直觉', growth: '直觉是第一反应，别让脑子盖过它', grounding: '信任身体的第一信号', drive: '此刻求生的敏锐' },
  58: { trait: '活力：快乐的折腾', growth: '为热爱的事较真,是 Joy', grounding: '身体活动是最强充电', drive: '让生活更好的冲动' },
  59: { trait: '性/亲密：打破隔阂', growth: '亲密需要屏障先被看见', grounding: '身体接触与深度对话', drive: '渴望融合与繁殖' },
  60: { trait: '接受：限制 / 祖先的传承', growth: '接受限制是转化的起点', grounding: '在限制内做到极致', drive: '跨越旧格局' },
  61: { trait: '内在真理：神秘 / 感知压力', growth: '不知道也是真相的一部分', grounding: '冥想与灵性修习', drive: '追问终极真相' },
  62: { trait: '细节：组织事实', growth: '细节是语言的力量，不是负担', grounding: '整理信息带来平静', drive: '把复杂讲清楚' },
  63: { trait: '怀疑：逻辑的追问', growth: '怀疑催生验证，验证产出真理', grounding: '给疑问设截止时间', drive: '探究模式与原因' },
  64: { trait: '混淆之前：图像的解析', growth: '让图像自己完成拼图', grounding: '睡前复盘,梦境消化', drive: '理清经验的意义' },
}

export function gateInsightOf(gate: number): GateInsight {
  return (
    GATE_INSIGHT[gate] ?? {
      trait: '闸门释义',
      growth: '觉察它的运作',
      grounding: '稳定练习',
      drive: '内在冲动',
    }
  )
}
