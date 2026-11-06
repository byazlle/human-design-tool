# HD-SPEC v2.0 人类图计算与数据规范

## 0 文档信息

### 0.1 版本与状态

| 项 | 值 |
| --- | --- |
| 文档编号 / 版本 | HD-SPEC / **2.0** |
| 状态 | 已批准（主理人拍板 15 项标准；本文件负责论证与成文） |
| 日期 | 2026-11-06 |
| 适用产品 | HumanDesignTool（`D:/AIws/txgzml/rlt`，根 `package.json` 1.2.0） |
| 对应版本戳 | `ENGINE_VERSION = 1.2.0+mandala.29.875`（`src/engine/version.ts:8`）；`SCHEMA_VERSION = 2`（`:11`） |
| 变更性质 | 首次把「9 个开源实现对照结论」固化为可执行规范；**不修改任何代码** |

### 0.2 规范性引用文件

| 类别 | 引用 |
| --- | --- |
| 本项目代码 | `src/engine/{time,ephemeris,mandala,gateData,bodygraph,composite,chiron,version}.ts`；`src/types/hd.ts`；`src/services/{validate,aiClient,chironChart,crossData,interpretations,readingAngles,markdown}.ts`；`src/stores/{archive,settings,board,ui}.ts` |
| 本项目脚本/测试 | `scripts/check-mandala-anchor.mjs`；`tests/{engine,layout,ephemeris.parity,markdown,composite}.test.ts`；`desktop/main.cjs:253-519` `runSmoke()` |
| 外部实现（缩写） | **FHD**=free-human-design｜**RAVE**=adamblvck_rave-engine｜**NAT**=Unforced-Dev_natalengine｜**SHA**=CReizner_SharpAstrology.HumanDesign｜**BASE**=CReizner_SharpAstrology.Base｜**MCP**=artvitu_human-design-mcp｜**ORI**=OTH-RCODE-SPACE_origincalcu｜**GON**=Gonzih_hd-bodygraph｜**SWE**=mivion_swisseph |

### 0.3 术语与缩略语

| 术语 | 代码名 | 定义（本文口径） |
| --- | --- | --- |
| 闸门 / 爻 / 颜色 / 音调 / 基底 | `gate`/`line`/`color`/`tone`/`base` | 黄道 64→6→6→6→5 级细分（§2.11） |
| 曼陀罗 / 盘序 | Rave Mandala / `ICHING_MAP` | 64 门在黄道上的排列与起点 |
| 人格 / 设计 | `personality` / `design` | 意识（出生时刻）/ 无意识（太阳回推 88°）两流 |
| 类型 / 权威 / 定义 / 角色 | `type`/`authority`/`definition`/`profile` | §2.5–§2.7 |
| 轮回交叉 | `incarnationCross` | 角度 + 四闸门（§2.8） |
| 中心四象限 / 关系通道 | `centerQuadrant` / `relationshipChannels` | §2.12 / §2.13 |
| 扩展层 | Extension layer | 非 13 体的附加分析；本版仅凯龙回归 |
| 证据层级 | L1–L4 | 见 §2.0 |

## 1 范围与不适用范围

**1.1 范围**：① 计算规则（时间/星历/曼陀罗/判定/交叉/合盘/凯龙扩展层）；② 数据模型与持久化；③ 状态机与流程；④ 交互与异常回退；⑤ 验收与版本策略。适用排盘引擎、渲染取数、合盘、AI 编排、导入导出、桌面/安卓/Web 三端。

**1.2 不适用范围**

| 不适用项 | 说明 |
| --- | --- |
| 医疗/诊断/治疗建议、命运化预测 | 产品定位为自我观察参考框架，不得输出绝对化结论 |
| 192 交叉**授权专有名称文本** | 规范允许接入名称查表（§3.7），名称版权/授权由用户另行确认 |
| Penta（3–5 人团体盘） | 本版人数上限 2（§3.8） |
| 行运/流日（Transit）、四箭头/Variables | 不在本版范围；参考实现仅列入附录 C |
| 商业软件（Jovian/Genetic Matrix）逐例比对 | 需授权样本，未做 |

## 2 标准选定与依据

### 2.0 证据分层

| 层级 | 定义 | 采信程度 |
| --- | --- | --- |
| **L1** | 可复现外部锚点：权威公布时刻/角度，用本项目脚本可反算 | 最高，可单点定案 |
| **L2** | ≥3 家独立实现交叉一致（非同源） | 高，可定案 |
| **L3** | 单一实现做法，无第二来源 | 中，仅参考；须 L1/L2 或用户确认补强 |
| **L4** | 项目约定（纯产品/工程决策，无外部规范） | 最低，必须显式标注 |

**判定规则**：L1 与 L2 冲突以 L1 为准并记录冲突；仅 L3 标「待定（TBD）」；L4 必须标注「项目约定，非外部规范」。

### 2.1 曼陀罗偏移 = 29.875°

| 项 | 内容 |
| --- | --- |
| 取值 | `MANDALA_OFFSET = 5×5.625 + 1.75 = 29.875°`（`mandala.ts:35`；`:26-33` 锚定 Gate 41 起于 302.000°） |
| 层级与证据 | **L1+L2**。L1：`scripts/check-mandala-anchor.mjs` 实测 2026-01-22T00:54Z 太阳视黄经 **302.00016°**、反算偏移 **29.87484°**；2024-01-22T13:18Z **302.00019°**、**29.87481°**；用 29.875 两时刻均 → **Gate 41.1**，用 29.8333 均 → **Gate 60.6**。L2：5 家等价 —— 本项目 29.875（盘序自 55 起）｜NAT `humandesign.js:325` `GATE_WHEEL_OFFSET=358.25`（自 25 起）｜MCP `hd/data/gates.py:14` `HD_START_DEGREE=358.25`（自 25 起）｜ORI 经 `logic.js:1` 委托 NAT｜SHA `HumanDesignUtility.cs:13` `HdOffsetToZodiac=3.875` + `:59` `NormalizeDegrees(longitude-3.875)`（`Enums/Gates.cs:7-70` 盘序自 17 起）。三套写法互为整格旋转（+29.875 索引0=55 ≡ −1.75 索引0=25 ≡ −3.875 索引0=17）；只读脚本核验：FHD `iching_map` 与本项目 `ICHING_MAP` **逐项相同（64/64）**，NAT/MCP 序列 = 旋转 **5** 位（起点 25），SHA `Enums/Gates.cs:7-70` 枚举 = 旋转 **6** 位（起点 17） |
| 备选与排除 | 备选 29.8333（FHD `src/calc/mandala.js:27-28`：`2*line_width−color_width−tone_width+3*base_width`+5 门宽）。排除：① 使 Gate 41 起点=302.0417°，偏离 L1 锚点 0.041667°（2.5′）；② 仅见于 FHD 与 RAVE 两个目录，而两者 `src/`、`site/`、`scripts/` **去除行尾 CR 后 sha256 完全相同**（`3b5158c9…`）→ 属同一实现的两份拷贝，不构成第三来源 |
| 必须如实说明 | **参考仓库自带测试无法裁决此项**：FHD `test/` 无 Rave New Year→Gate 41 断言；NAT/MCP/SHA 测试亦无该锚点。故只能由 L1 脚本 + L2 交叉一致性共同支撑 |
| 变更影响与复现 | 若改回 29.8333：约 4.4% 爻位、0.74% 闸门变化（`CHANGELOG.md:16`），角色/交叉可能改变，`ENGINE_VERSION` 必须提升并重算存量。复现：`node scripts/check-mandala-anchor.mjs` |

### 2.2 13 体；Chiron 不参与主盘判定

| 项 | 内容 |
| --- | --- |
| 取值 | 13 体 = Sun/Earth/Moon/NorthNode/SouthNode/Mercury/Venus/Mars/Jupiter/Saturn/Uranus/Neptune/Pluto；Chiron 不参与主盘 |
| 层级与证据 | **L2**（13 体）+ **L4**（扩展层保留方式）。`types/hd.ts:20-34` `PLANETS`（13）；`bodygraph.ts:31-45` `BODY_LIST`（Earth=Sun+180、SouthNode=NorthNode+180）。佐证：FHD `src/calc/profile.js:224-238`；FHD `test/deviation-sample.test.js:40` `expect(bodyFromName('Chiron')).toBe(null); // unknown → ignored`；MCP `hd/chart.py:33-47`；GON `src/types.ts:21-35`；NAT 与 SHA 全目录检索 `Chiron` **零命中**；BASE `Enums/Planets.cs:19` `Chiron=12` 仅占星枚举且 HD 层未引用；SWE `lib/swisseph.js:39` 仅 `SE_CHIRON=15` 星历常量 |
| 备选与排除 | 「Chiron 作第 14 体」：9 家参考实现**均无**，无任何 L1/L2/L3 支持 |
| 变更影响 | 若纳入，全部门/通道/中心/判定需重算，与 9 家全面分叉。凯龙回归页须标注「扩展层 · 非 13 体」（§3.9） |

### 2.3 36 通道表

| 项 | 内容 |
| --- | --- |
| 取值 | 主流 5 家一致的 36 组无序门对 = `src/engine/gateData.ts:36-42`（`:103-114` 派生 `CHANNELS`，`:116-118` `CHANNEL_BY_KEY`） |
| 层级与证据 | **L2（强）**。FHD `src/hd/bodygraph.js:66-72`、NAT `humandesign.js:185-222`、MCP `hd/data/channels.py:23-65`、SHA `Enums/Channels.cs:7-42` —— 与本项目集合比对 `count=36 onlyRepo=[] onlyProject=[]`（完全相同） |
| 备选与排除 | ORI `systems/human-design/bodygraph.js:17-54` 有 5 对替换（独有 `1-2`/`13-30`/`24-44`/`30-45`/`55-59`，缺 `1-8`/`13-33`/`2-14`/`4-63`/`47-64`），且其 HD 逻辑 `logic.js:1` 委托 NAT，`bodygraph.js` 仅为渲染器 → 非独立实现，不采。GON `src/geometry.ts:148` 注释称 36 条、实际 `:151-218` 为 35 条（缺 `10-34`）→ 渲染路径数据缺失，不采 |
| 变更影响与复现 | 任一通道增删都改变中心/类型/定义判定，须提升 `ENGINE_VERSION`。复现：附录 C 只读比对脚本 |

### 2.4 64 门 → 9 中心映射

| 项 | 内容 |
| --- | --- |
| 取值 | 当前映射；**门 28 只属脾中心**；Root 9 门、Spleen 7 门（`gateData.ts:9-33`，`:22` Spleen 含 28、`:31-32` Root 不含 28） |
| 层级与证据 | **L2**。FHD `bodygraph.js:39-62`、NAT `humandesign.js:109-176`、SHA `Enums/Gates.cs:77-140`+`Enums/Centers.cs:22-30`（`:24` Spleen 含 Key28、`:22` Root 不含）→ 64 门比对 `diff=[]` |
| 备选与排除 | MCP `hd/data/centers.py:51-54`（Spleen 含 28）与 `:61-64`（Root 也含 28）→ 门 28 双归属、合计 65 条目，与其余 3 家及本项目不一致，不采 |
| 变更影响与复现 | 门归属决定通道→中心映射，改则类型/定义全变；须提升 `ENGINE_VERSION`。复现：只读脚本逐项断言 |

### 2.5 类型判定（骶骨单独 BFS）

| 项 | 内容 |
| --- | --- |
| 取值 | 无定义中心→Reflector；骶骨定义且骶骨→喉 BFS 通→ManifestingGenerator，不通→Generator；骶骨未定义且马达→喉→Manifestor；否则 Projector |
| 层级与证据 | **L2（语义）+ L3（路径）**。`bodygraph.ts:115-131` `decideType`、`:93-113` `reachesThroat`、`:47` `MOTOR_CENTERS=['sacral','heart','solar','root']`。佐证：FHD `bodygraph.js:141-147`、MCP `chart.py:251-266`（sacral+motorToThroat）；NAT `humandesign.js:474-489`（throat 反向 BFS）；SHA `HumanDesignChart.cs:343-396`（连通分量相等）——**5 类结果一致**，仅遍历起点/判据不同 |
| 备选与排除 | 「仅看马达直连喉咙」：无仓库采用（全部允许经其他中心中转） |
| 变更影响与复现 | 改判据改变类型分布，须提升 `ENGINE_VERSION`。复现：`npx vitest run tests/engine.test.ts` |

### 2.6 权威 7 类；G/Self 要求连喉

| 项 | 内容 |
| --- | --- |
| 取值 | 7 类：Emotional > Sacral > Splenic > Ego > SelfProjected > Mental > Lunar；**Ego 合并**（不拆 Manifested/Projected）；G 须 G→喉连通才判 SelfProjected |
| 层级与证据 | **L2**（7 类合并）+ **L4**（拆分取舍）。`types/hd.ts:102-119`；`bodygraph.ts:133-146`（`:142` `has('g') && reachesThroat(['g'])`）。「要求连喉」佐证：FHD `bodygraph.js:156-160`、SHA `HumanDesignChart.cs:414-419`（同一连通分量）。**不采用**仅 G 定义即 Self 的 NAT `humandesign.js:909`、MCP `chart.py:282-286` |
| 备选与排除 | SHA 8 值（`Enums/Authorities.cs:3-13` 拆 `EgoManifested/EgoProjected`）—— 与本项目枚举不符且 UI/AI 文案需分叉；本版按拍板合并，属 L4；若 UI 需区分，可在展示层由 `type` 派生显示文本，不改枚举 |
| 变更影响与复现 | 拆 Ego 影响 UI 与 AI 提示词，须提升 `ENGINE_VERSION`。复现：`npx vitest run tests/engine.test.ts` |

### 2.7 定义型 = 连通分量计数

| 项 | 内容 |
| --- | --- |
| 取值 | 0=NoDefinition、1=Single、2=Split、3=TripleSplit、4=QuadrupleSplit（已定义中心为节点、已定义通道为边） |
| 层级与证据 | **L2**。`bodygraph.ts:149-177`；`types/hd.ts:121-134`。佐证：FHD `bodygraph.js:192-235`（`:195` `DEFINITION_LABELS`）；NAT `humandesign.js:646-684`；MCP `chart.py:342-380`；SHA `HumanDesignUtility.cs:81-90`+`GraphService.cs:14-44` |
| 备选与排除 | 「按通道数命名」旧写法（FHD `bodygraph.js:304-308` 注释明确 `definitionCount` 为通道数历史误名）不采 |
| 变更影响与复现 | 低（纯派生）；`npx vitest run tests/engine.test.ts` |

### 2.8 轮回交叉 = 角度 + 四闸门；可接入 192 名称

| 项 | 内容 |
| --- | --- |
| 取值 | 输出「角度 + 四闸门」结构；角度 `4/1→并列`、`人格爻≥5→左角度`、其余→右角度；可选叠加 192 具名交叉，查表键 = **(人格太阳门, 角度)** |
| 层级与证据 | **L2**（角度）+ **L2**（名称表存在）+ **L4**（查表键）。实现：`bodygraph.ts:192-208`、`crossData.ts:99-121,159-182`。角度佐证：NAT `incarnation-crosses.js:22-31`（右 7 角色含 4/6、并列仅 4/1、左 4 角色）、MCP `chart.py:385-392`、SHA `Profiles.cs:55-70` `ToAngle()` —— 三家与「4/1 并列 / 人格爻≥5 左 / 其余右」对 12 角色结果一致。名称佐证：SHA `Enums/IncarnationCross.cs:4-198` 共 **192** 成员（只读统计 191 带逗号 + `:197` 末项；前缀 **64 JuxtapositionCross + 64 LeftAngleCross + 64 RightAngleCross**）；NAT `incarnation-crosses.js:4-5` 注释「192 named … 64 gates × 3 angles」+ `:35-100` 64 键×3 角度 |
| 查表方式依据 | **9 家均无「四闸门→名称」映射**：SHA 仅 `:201 ToGeneKeys`（名称→(单闸门,角度)）与 `:398 ToIncarnationCross`（(单闸门,角度)→名称）；NAT/MCP 均以人格太阳单门查表 |
| 备选与排除 | MCP `chart.py:402-420`「门号→单名」简化表（无角度维度，`:407`/`:415` 重复键）不采 |
| 变更影响与 TBD | 名称为可插拔数据，不改角度判定；**192 名称的授权文本与中文译名 TBD**；当前实现不输出名称（`bodygraph.ts:190` 注释「不臆造名称」） |

### 2.9 交点 = Meeus 47 章；南交 = 北交 + 180

| 项 | 内容 |
| --- | --- |
| 取值 | 真交点：平交点 Ω + 5 项周期改正 + 9 项章动 Δψ；SouthNode = NorthNode + 180° |
| 层级与证据 | **L2**（+180 五家一致）+ **L3**（Meeus 实现）。`ephemeris.ts:67-107` `trueNodeLongitude`、`:113-141` `nutationInLongitude`；`bodygraph.ts:36`。佐证：FHD `profile.js:85-90` `deriveOpposite`；MCP `chart.py:38` `"South Node": None,   # North Node + 180°` |
| 备选与排除 | 平交点（Mean Node）：与真交可差 ±1.7°（跨闸门），`ephemeris.ts:65` 注释明确不可混用；无参考实现以平交点为默认 |
| 误差与复现 | 与 Swiss Ephemeris True Node 差异角秒级。`npx vitest run tests/ephemeris.parity.test.ts` |

### 2.10 星历 = astronomy-engine（VSOP87）；月球不加 aberration

| 项 | 内容 |
| --- | --- |
| 取值 | `astronomy-engine` 视黄经（真黄道、当日平分点）；月球不做光行差改正 |
| 层级与证据 | **L3**（实现选择）+ **L2**（视黄经口径）。`ephemeris.ts:47-57`、`:51` `const aberration = body !== 'Moon'`、`:53` `Rotation_EQJ_ECT` |
| 备选与排除 | Swiss Ephemeris（SWE，`mivion_swisseph` 为 Node native binding）精度更高但需二进制星历与 native 依赖，与「无后端、纯前端、单文件产物」冲突；`astronomy-engine` MIT 纯 JS、角秒级，满足 0.01° |
| 变更影响与复现 | 换库全盘变化，须提升 `ENGINE_VERSION`。`npx vitest run tests/ephemeris.parity.test.ts` |

### 2.11 子结构 6/6/6/5，用精确分数

| 项 | 内容 |
| --- | --- |
| 取值 | Gate→Line→Color→Tone→Base = 6/6/6/5；**BASE = 1/192°**、TONE = 5/192°、COLOR = 5/32°、LINE = 15/16° |
| 层级与证据 | **L2**（结构）+ **L4**（用分数常量）。`mandala.ts:13-21`（`HEX=360/64`、`LINE=HEX/6`、`COLOR=LINE/6`、`TONE=COLOR/6`、`BASE=TONE/5`）。推导：360÷64÷6÷6÷6÷5 = 360/69120 = 1/192。佐证结构：FHD `calc/mandala.js:8-12`；NAT `humandesign.js:739-793`；SHA `HumanDesignUtility.cs:14-16`（5.625/0.9375/0.15625） |
| 边界与复现 | 浮点边界用分数比较；`mandala.ts:60-63` `clampInt` 兜底 1..6/1..5。`npx vitest run tests/engine.test.ts`（6 位精度断言） |

### 2.12 合盘只输出四象限 + 关系主题 + 四类通道 + 共享/独有；上限 2 人

| 项 | 内容 |
| --- | --- |
| 取值 | 输出：中心四象限、关系主题、四类关系通道、共享/独有闸门与通道；**不输出**合图类型/权威/轮回交叉；人数上限 2 |
| 层级与证据 | **L2**（四类通道/四象限）+ **L4**（不输出类型权威交叉、人数上限）。实现：`composite.ts:75-192`、`relationshipTheme.ts:29`、`CompositeView.vue:68-69,255-256`。佐证：NAT `compatibility/humandesign.js:401-404`+`:329-368`；MCP `composite.py:64-85`；SHA `Interfaces/IHumanDesignChart.cs:5-43`（合盘接口**无** Type/Authority/Cross） |
| 备选与排除 | 输出合图类型：MCP `composite.py:94-96,117-122`、NAT `:491-510`；但 SHA 接口无此字段且本项目既有注释 `types/hd.ts:269-273` 与用户口径均要求「关系场不存在你们是投射者」→ 按 L4 不输出，MCP/NAT 记录为备选 |
| 人数上限依据 | L4 约定：路由两参数槽 `router/index.ts:31`、`ArchiveHomeView.vue:62-64`、`stores/board.ts:38-42`；NAT `penta.js:71-79` 支持 2–9 人但 Penta 不在本版范围 |
| 变更影响与复现 | **当前 `composite.ts:156-158,184-190` 仍计算并填 `composite{...}`，`CompositeView.vue:208` 把 `cp.definition` 写入 AI offline → GAP-01**。`npx vitest run tests/composite.test.ts` |

### 2.13 关系通道 4 类

| 项 | 内容 |
| --- | --- |
| 取值 | electromagnetic / companionship / dominance / compromise |
| 判定（规范） | `aFull && bFull → companionship`；`aFull XOR bFull` 且对方该通道闸门数 `otherCount=0 → dominance`、`otherCount>0 → compromise`；两侧均不完整且各持一端 → `electromagnetic`；其余不分类 |
| 层级与证据 | **L2**。`composite.ts:50-73` `classifyChannel`；`types/hd.ts:225-239`。佐证：NAT `compatibility/humandesign.js:401-404` 四类定义与本规范逐字同义 |
| 备选与排除 | MCP `composite.py:64-85`（双方完整→`compromise`、单方→`dominance`、无 `companionship`）；SHA `ChannelActivationType.cs:6-42` 7 值（`Companion/FirstDominating/SecondDominating/CompromiseFirstDominating/CompromiseSecondDominating/Magnetic/None`）—— **同一情形两家命名不同**，本版按 L2（NAT+本项目），其余记录备选 |
| 复现 | `npx vitest run tests/composite.test.ts`（四类通道 + 同人拒绝） |

### 2.14 状态模型：中心两态、闸门三态

| 项 | 内容 |
| --- | --- |
| 取值 | 中心 `defined: boolean`（两态）；闸门 `in-channel`/`hanging`/`open`（三态） |
| 层级与证据 | 中心两态 = **L2**；闸门三态 = **L4 项目约定，非外部规范**。`types/hd.ts:149-152` `CenterState{id,defined}`；`:173-176` `GateActivation`+`hangingGates`；`bodygraph.ts:261-266` `hangingGates = activated.filter(g => !inChannel.has(g))`。对照：FHD `bodygraph.js:277-281`、MCP `chart.py:89-90` 两态；NAT `humandesign.js:518-533,564-571` 三态（defined/undefined/open）**不采**（与 UI 既有两态冲突）；闸门三态**9 家均无等价结构**（GON `types.ts:12` `GateColoring='design'|'personality'|'both'|'inactive'` 是渲染着色；NAT `hd-transits.js:142` 仅行运上下文） |
| 变更影响 | 若改三态中心，UI 与 AI 文案需同步；`SCHEMA_VERSION` 提升 |

### 2.15 Design 时刻 = 太阳黄经精确回推 88°，容差 0.5 秒

| 项 | 内容 |
| --- | --- |
| 取值 | Design 时刻 = 太阳视黄经比出生时少 88° 的时刻，二分法，容差 0.5 s |
| 层级与证据 | **L2**（88°+二分）+ **L4**（容差 0.5s）。`ephemeris.ts:162-198` `findPreviousSunLongitude(date,88,0.5)`；`bodygraph.ts:318`。佐证：FHD `profile.js:40-76`（88°、1 天粗扫+二分）；MCP `chart.py:181-210 find_design_date` |
| 边界与误差 | 太阳日行 ~0.9856°，88°≈89.3 天；0.5 s → 角度误差 ≈5.7e-6°（远小于 0.01°） |
| 备选与排除 | 「固定 88 天」近似（小时级误差，可跨闸门）不采。`npx vitest run tests/ephemeris.parity.test.ts` |

## 3 计算规范

> 每条：**输入 → 算法/判断 → 输出 → 边界 → 误差 → 复现**。角度 0–360°，`normalize(x)=((x%360)+360)%360`。

### 3.1 时间归一化与 DST

| 项 | 内容 |
| --- | --- |
| 输入 | `BirthInput{year,month,day,hour,minute,second?,timezone(IANA),lat,lng}`（`types/hd.ts:192-202`） |
| 前置校验 | `validateBirth`（`validate.ts:34-65`）：整数性；1900–2100；月 1–12；按月份天数；时 0–23；分/秒 0–59；`timezone` 可被 `Intl` 解析（`time.ts:26-33`） |
| 算法 | `zonedToUtc`（`time.ts:62-94`）：`base=Date.UTC(...)`；循环 3 次 `guess = base − tzOffsetMs(guess)`；回验 `formatToParts` 与输入一致性 |
| 输出 | `{date:Date(UTC), warning?:string}`；不一致→`warning='该出生时刻在当地时区不存在或存在歧义（夏令时切换），请核实'`（`:84-91`） |
| 边界/误差 | DST 空洞与回拨；1900 前 ICU 质量差（故下限 1900）；`MAX_YEAR=2100`（`:22` 注释：README 验证至 2035 留余量）。偏移精确到秒 |
| 复现 | `npx vitest run tests/engine.test.ts`（1990 中国夏令时、1972 北美、1964 欧洲样本） |

### 3.2 星历与视黄经

| 项 | 内容 |
| --- | --- |
| 输入 → 输出 | UTC `Date` + `EphemerisBody`（11 个，`ephemeris.ts:12-24`）→ 视黄经 0–360（真黄道、当日平分点） |
| 算法 | `eclipticLongitude`（`:47-57`）：`GeoVector(body,time,aberration)` → `Rotation_EQJ_ECT` → `SphereFromVector().lon` → `normalize`；NorthNode 走 `trueNodeLongitude`（`:67-107`） |
| 判断 | `aberration = body !== 'Moon'`（`:51`） |
| 边界/误差 | ΔT 以 UT 近似 TT（<70 s，对交点 <0.0001°）；章动 9 项残差 <0.3″；VSOP87 角秒级 |
| 复现 | `npx vitest run tests/ephemeris.parity.test.ts` |

### 3.3 曼陀罗映射

| 项 | 内容 |
| --- | --- |
| 输入 → 输出 | 视黄经 `lon` → `GatePosition{gate,line,color,tone,base,offsetInGate}` |
| 算法（`mandala.ts:66-86`） | `shifted=normalize(normalize(lon)+29.875)`；`index=clamp(floor(shifted/5.625),0,63)`；`gate=ICHING_MAP[index]`；`offsetInGate=shifted−index×5.625`；`line=clamp(floor(offsetInGate/0.9375)+1,1,6)`；`inLine=offsetInGate−(line−1)×0.9375`；`color=clamp(floor(inLine/(5/32))+1,1,6)`；`inColor=inLine−(color−1)×(5/32)`；`tone=clamp(floor(inColor/(5/192))+1,1,6)`；`inTone=inColor−(tone−1)×(5/192)`；`base=clamp(floor(inTone/(1/192))+1,1,5)` |
| 反查 | `gateStartLongitude(g)=normalize(indexOf(g)×5.625−29.875)`（`:89-93`） |
| 边界/误差 | 全字段 clamp；未知 gate 抛错；误差 0（浮点边界用分数） |
| L1 锚点（必须全过） | 302.000°→41.1｜296.375°→60.1｜183.875°→18.1｜358.250°→25.1 |
| 复现 | `node scripts/check-mandala-anchor.mjs` |

### 3.4 体与激活点

| 项 | 内容 |
| --- | --- |
| 输入 → 输出 | 出生 UTC + Design UTC → `StarPosition[13]`×2 流 = 26 激活点（`types/hd.ts:139-147`） |
| 算法 | `computeStream(date)`（`bodygraph.ts:55-72`）遍历 `BODY_LIST`（`:31-45`）；`Earth=normalize(Sun+180)`；`SouthNode=normalize(NorthNode+180)`；每体→§3.3 |
| 判断 | Chiron 不在 `BODY_LIST`（§2.2）；同一闸门可被多体激活（记录 `stars`） |
| 误差/复现 | 同 §3.2+§3.3；`npx vitest run tests/engine.test.ts` |

### 3.5 通道与中心

| 项 | 内容 |
| --- | --- |
| 输入 → 输出 | 26 激活点 gate 集 → `channels:ChannelActivation[]`、`centers:CenterState[9]`、`gates:GateActivation[]`、`hangingGates:number[]` |
| 算法 | 定义通道 = `CHANNELS` 两端均在激活集（`bodygraph.ts:236-241`）；定义中心 = 通道两端 `GATE_CENTER` 并集（`:243-247`）；`hangingGates` 升序（`:266`） |
| 状态 | 中心两态；闸门三态（in-channel/hanging/open，L4 约定，§2.14） |
| 边界 | 悬挂闸门不定义中心 |
| 复现 | `npx vitest run tests/engine.test.ts` |

### 3.6 类型 / 权威 / 定义 / 角色

| 项 | 内容 |
| --- | --- |
| 输入 | 定义中心集 + 定义通道 + 两流 `StarPosition` |
| 类型 | `decideType`（`bodygraph.ts:115-131`）：`size===0→Reflector`；骶骨定义→`reachesThroat(['sacral'])` 真则 MG 否则（`motorToThroat?MG:Generator`）；骶骨未定义→`motorToThroat?Manifestor:Projector`；`MOTOR_CENTERS=['sacral','heart','solar','root']`（`:47`） |
| 权威 | `decideAuthority`（`:133-146`）：`size===0→Lunar`；`solar→Emotional`；`sacral→Sacral`；`spleen→Splenic`；`heart→Ego`；`g && reachesThroat(['g'])→SelfProjected`；否则 `Mental` |
| 定义 | `decideDefinition`（`:149-177`）：BFS 连通分量 0/1/2/3/4 |
| 角色 | `profile=\`${pSun.line}/${dSun.line}\``（`:270`）；12 合法值见附录 A |
| 边界 | `strategy` 由 `STRATEGY` 表（`:179-185`，中文+英文括注） |
| 复现 | `npx vitest run tests/engine.test.ts` |

### 3.7 轮回交叉

| 项 | 内容 |
| --- | --- |
| 输入 → 输出 | `personality[]`/`design[]`/`profile` → `{angle, gates:[pSun,pEarth,dSun,dEarth], name?}` |
| 角度判断 | `profile==='4/1'→并列`；`personalitySun.line>=5→左`；否则 `右`（`bodygraph.ts:201-205`） |
| 四闸门顺序（规范） | **`[pSun, pEarth, dSun, dEarth]`**；字符串 `{angleLabel} · {pSun}/{pEarth} \| {dSun}/{dEarth}` |
| 依据 | NAT `humandesign.js:501`+`incarnation-crosses.js:105-106`（canonical `(1/2 \| 7/13)`=Personality Sun/Earth \| Design Sun/Earth）；MCP `chart.py:434` 同序 |
| 192 名称 | 查表键 `(pSun.gate, angle)`；数据 192 条（参考 SHA `IncarnationCross.cs:4-198` 结构 / NAT `incarnation-crosses.js:35-100`）；**不得自行编造名称**（`bodygraph.ts:190`） |
| 边界 / TBD | 无名称数据时输出结构、省略 `name`；不得向 UI 输出「Unknown Cross」占位。名称授权与中文译名 TBD；当前不输出名称 |
| 变更影响与复现 | **当前 `bodygraph.ts:207` 为 `pSun/dSun \| pEarth/dEarth`（与本节相反），`crossData.ts:182` 符合 → 需统一，GAP-02**。`npx vitest run tests/engine.test.ts` |

### 3.8 合盘

| 项 | 内容 |
| --- | --- |
| 输入 | `BodyGraph a`、`BodyGraph b`（同一 `Archive.id` 视为同一人） |
| 前置判断 | `a===b` → `CompositeError('SAME_PERSON')`（`composite.ts:78`）；视图 `invalidPair` 拦截 `/composite/X/X`（`CompositeView.vue:68-69`） |
| 算法 | 闸门并集（`:80-82`）→ 通道并集（`:97-108`）→ 中心（`:123-130`）→ `classifyChannel`（`:138-151`）→ `centerQuadrant`（`:160-170`）→ `relationshipTheme` |
| 输出（允许） | `merged`、`gateOwners`、`channelOwners`、`sharedChannels`、`sharedGates`、`relationshipChannels`、`centerQuadrant`、关系主题文本 |
| 输出（禁止） | 合图 `type`/`authority`/`definition`/`incarnationCross`；AI 提示词不得出现「你们是投射者/你们的权威/你们的交叉」 |
| 人数上限 | 2（L4） |
| 边界 | 「仅看共享通道」只过滤渲染，不改数据（`CompositeView.vue:255-256`） |
| 变更影响与复现 | **`composite.ts:184-190` 仍生成、`CompositeView.vue:208` 仍写入 AI offline → GAP-01**。`npx vitest run tests/composite.test.ts` |

### 3.9 凯龙扩展层

| 项 | 内容 |
| --- | --- |
| 定位 | **L4 项目约定**：扩展层、非 13 体、不参与主盘判定；页面必须标注 |
| 输入 → 输出 | `BirthInput` → `ChironReturnResult{natalChiron{longitude,gate,line}, returnUtc, age, chart}`（`services/chironChart.ts:14-23`）；`chart` 为回归时刻的**标准 13 体盘** |
| 算法 | `chironLongitude`（`chiron.ts:41-92`）：J2000 平根数 + 开普勒牛顿迭代 → 日心黄道 → 赤道 J2000 → 地心（减地球日心）→ 当日黄道 → 黄经；`findChironReturn`（`:106-136`）：出生后 45–56 年、1 天粗扫 + 二分、容差 60 s |
| 边界/误差 | 土星摄动，1900–2050 误差角分级（`chiron.ts:8-9`），边界爻位可能偏移一格 |
| 展示要求 | 顶部必须出现「扩展层 · 凯龙不属于 13 体，仅作疗愈/传承主题参考」；凯龙盘不得展示 `type/authority/incarnationCross` 作为结论（GAP-05） |
| 复现 | `npx vitest run tests/composite.test.ts`（星历与回归断言） |

## 4 数据模型规范

> 沿用现有 TS 类型；新增标注「新增（TBD）」。持久化键前缀 `hdt.`。

### 4.1 BodyGraph（单盘结果）

| 字段 | 类型 | 必填 | 说明（证据 `types/hd.ts`） |
| --- | --- | --- | --- |
| `type`/`strategy`/`authority`/`profile`/`incarnationCross`/`definition` | 见 §2 | 是 | `:165-171`；`strategy` 为策略文案 |
| `centers` | `CenterState[9]` | 是 | `:172` `{id,defined}` |
| `gates`/`channels`/`hangingGates` | `GateActivation[]`/`ChannelActivation[]`/`number[]` | 是 | `:173-176`；`hangingGates` 升序 |
| `personality`/`design` | `StarPosition[13]` | 是 | `:177-178` |
| `meta.personalityTime`/`designTime` | `string`(UTC ISO) | 是 | `:181-182` |
| `meta.personalitySun`/`designSun` | `number` | 是 | `:183-184` |
| `meta.engineVersion` | `string?` | 否 | `:186` 缺省=旧版需重算 |
| `meta.warning` | `string?` | 否 | `:188` DST 提示 |

### 4.2 Archive（档案）

| 字段 | 类型 | 必填 | 说明（`types/hd.ts` / `archive.ts`） |
| --- | --- | --- | --- |
| `id`/`name`/`createdAt` | `string` | 是 | `:205-206,218`；`name` 空→「未命名」（`archive.ts:76`）；按 `createdAt` 倒序（`:56`） |
| `gender` | `'male'\|'female'\|'other'?` | 否 | `:207` |
| `birth` | `{year…second?}` | 是 | `:208-215`，**不含 timezone** |
| `timezone`/`location` | `string`(IANA) / `{lat,lng,place}` | 是 | `:216-217`；经纬度仅档案标注、不参与计算 |
| `chart` | `BodyGraph?` | 否 | `:219` 缺失=待算 |
| `chartError` | `string?` | 否 | `:221` 有值则 `chart` 为空 |

### 4.3 CompositeResult（合盘结果）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `a`/`b` | `BodyGraph` | 是 | 原盘引用 |
| `merged` | `{centers,gates(owners),channels(owners)}` | 是 | 并集 |
| `gateOwners`/`channelOwners` | `Record<…,Ownership>` | 是 | `a`/`b`/`shared` |
| `sharedChannels`/`sharedGates` | 数组 | 是 | 双方共有 |
| `relationshipChannels` | `RelationshipChannel[]` | 是 | 4 类 |
| `centerQuadrant` | `CenterQuadrant[9]` | 是 | `both/onlyA/onlyB/open` |
| ~~`composite`~~ | ~~`{type,authority,definition,centers,strategy}`~~ | **禁止** | v2.0 移除（§2.12/§3.8）；当前仍存在（GAP-01） |

### 4.4 AiProfile（多 AI 配置，新增 TBD）

| 字段 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 是 | `createId()` | 唯一标识 |
| `name` | `string` | 是 | `"默认配置"` | 非空 |
| `baseUrl` | `string` | 是 | `""` | 允许基础地址/`/v1`/完整 `/chat/completions`（`aiClient.ts:112-117`） |
| `apiKey` | `string` | 是 | `""` | 仅本机存储、不写日志（`SettingsForm.vue:113`） |
| `model` | `string` | 是 | `""` | 模型名 |
| `timeoutMs` | `number` | 是 | `60000` | 下限 3000（`aiClient.ts:131`） |
| `cacheEnabled` | `boolean` | 是 | `true` | 缓存开关 |
| `isDefault` | `boolean` | 是 | 首条 `true` | 全局唯一 |
| `createdAt` | `string`(ISO) | 是 | — | 排序 |

存储键 `hdt.ai.profiles.v1`（新增）。迁移：首次读取若 `settings.ai` 非空且 `profiles` 不存在，则生成 1 条并置 `isDefault`。**当前为单配置 `settings.ai`（`stores/settings.ts:37`），本节为规范目标（GAP-03）**。

### 4.5 Settings

| 字段组 | 内容（默认值） | 证据 |
| --- | --- | --- |
| `ai` | `AiConfig{baseUrl,apiKey,model,timeoutMs:60000,cacheEnabled:true}` | `settings.ts:42-49` |
| `appearance` | `theme:'light'`、`fontScale:1`、`bodyGraphPalette:'default'`、`drawingEngine:'v1'`、`centerDefinedColor:'#1a1d23'`、`centerOpenColor:'#8a909c'`、`centerDefinedBold:true`、`centerOpenBold:false`、`keywordColor:'#5b616e'`、`layoutDensity:'standard'`、`graphSize:'normal'` | `:50-62` |
| `precision` | `{decimals:2}` | `:63` |

存储键 `hdt.settings.v1`（`settings.ts:6`）。

### 4.6 迁移规则与版本戳

| 规则 | 内容 | 证据 |
| --- | --- | --- |
| 版本戳写入 | 每次 `computeChart` 写 `meta.engineVersion` | `bodygraph.ts:331,350` |
| 启动对齐 | `App.vue:19-24` → `archive.syncEngineVersion()`；不一致则重算 | `archive.ts:114-124` |
| 单份重算失败 | 保留 `chartError`、`chart=undefined`，不中断批量 | `archive.ts:98-108` |
| 导出 | 剔除 `chart`、带 `schemaVersion` | `SettingsView.vue:24` |
| 导入 | 逐条 `validateBirth`、拒绝计数、通过后 `ensureChart` | `SettingsView.vue:41-90` |
| 损坏保护 | 解析失败→备份 `{key}.corrupt.{ts}`+顶部提示 | `storage.ts:15-36`、`App.vue:32-35` |
| 导入校验传参 | **TBD**：`SettingsView.vue:59` 传 `a.birth`（无 `timezone`），而 `validateBirth` 校验 `b.timezone`（`validate.ts:61-62`）→ 待确认是否改为 `{...a.birth, timezone:a.timezone}`（GAP-04） |

## 5 状态机与流程

### 5.1 档案生命周期

| 状态 | 判定 | 迁移 |
| --- | --- | --- |
| `draft` | 表单填写中（`EntryView.vue`） | 提交 → `computed` / `failed` |
| `computed` | `chart` 存在且 `engineVersion === ENGINE_VERSION` | 编辑→重算；版本不符→`stale` |
| `stale` | `chart` 存在但版本不符 | `ensureChart`/`syncEngineVersion` → `computed` |
| `failed` | `chartError` 非空、`chart` 空 | 编辑修正→重算 |
| `imported-pending` | 档案存在但 `chart` 缺失（导入） | `ensureChart` → `computed`/`failed` |
| `deleted` | 从 `archives` 移除 | 可选撤销（§5.3） |

### 5.2 AI 请求状态机

| 状态 | 触发 | 表现 | 证据 |
| --- | --- | --- | --- |
| `unconfigured` | `validateAiConfig` 非空 | 打开面板直接显示配置错误、不发请求 | `useAiReading.ts:25-30`、`aiClient.ts:104-109` |
| `idle` | `openAi` 后未发起 | 空内容+发起按钮 | `ui.ts:64-74` |
| `loading` | `run()` 调用 | 加载态、可取消 | `useAiReading.ts:32-33` |
| `success` | `explain` 返回非空 | Markdown 渲染 | `aiClient.ts:164-168` |
| `error` | `AiError`（config/network/timeout/http/format） | 显示错误+重试、不伪造 | `aiClient.ts:53-61`、`useAiReading.ts:44-48` |
| `cache-hit` | `cacheEnabled && readCache(key)` 非空 | 直接返回、不请求 | `aiClient.ts:125-128` |
| `aborted` | `AbortSignal` | 归类 timeout/cancel、提示可重试 | `aiClient.ts:130-133,171-173` |

**约束**：失败绝不写伪造内容；缓存键必须含 `model + scope + ref + hash(offline+chartSummary)`（`:65-67`）。

### 5.3 删除与撤销

| 项 | 规范 | 当前实现 |
| --- | --- | --- |
| 删除确认 | 二次确认，文案明确「不可撤销」或「5 秒内可撤销」 | `SettingsView.vue:93` `window.confirm('…此操作不可撤销。')` |
| 单条删除 | 从列表移除 | `archive.ts:162-166 remove(id)` |
| 撤销 | **TBD（新增）**：软删除+5 s 撤销条（复用 `BulkActionBar` 模式），超时物理删除 | 未实现 |
| 清空全部 | 档案+AI 缓存同时清 | `SettingsView.vue:92-98` |

## 6 交互规范

### 6.1 多 AI 配置 CRUD 与切换

| 操作 | 规范 | 校验 | 当前（GAP-03） |
| --- | --- | --- | --- |
| 列表 | 设置页「AI 配置」分组列出、标记 `默认` | — | 仅单表单 |
| 新建/编辑 | 表单（name/baseUrl/apiKey/model/timeoutMs/cacheEnabled）→ 保存即全局生效 | 四必填非空、timeout≥3000 | 单表单 |
| 删除 | 默认配置且有其他配置时禁止删除或自动指定新默认；确认弹窗 | — | 无 |
| 切换默认 | 单选、全局唯一、至少保留 1 条 | — | `settings.ai` 单例 |
| 生效判定 | `baseUrl && apiKey && model` | `settings.ts:77` | 同 |

### 6.2 配置校验规则

| 规则 | 判定 | 文案 | 证据 |
| --- | --- | --- | --- |
| 地址必填 | `baseUrl.trim()===''` | 「请先在设置页填写 AI 接口地址」 | `aiClient.ts:105` |
| Key 必填 | `apiKey.trim()===''` | 「请先在设置页填写 API Key」 | `:106` |
| 模型必填 | `model.trim()===''` | 「请先在设置页填写模型名称」 | `:107` |
| endpoint 归一化 | 已是 `/chat/completions` 保留；以 `/vN` 结尾补 `/chat/completions`；否则补 `/v1/chat/completions` | — | `:112-117` |
| 隐私 | 仅本机、不上传、不写日志 | 「仅保存在本机 localStorage，不上传、不写日志」 | `SettingsForm.vue:113` |

### 6.3 状态提示与文案

| 场景 | 文案/行为 | 证据 |
| --- | --- | --- |
| 数据读取失败 | 顶部黄条+「我知道了」+已备份提示 | `App.vue:32-35`、`storage.ts:29-34` |
| 算盘失败 | 卡片显示 `chartError` | `archive.ts:105` |
| 合盘选 3 份 | 「合盘只能选 2 份，当前已选 N 份，请先取消多余的档案」 | `ArchiveHomeView.vue:43` |
| AI 未配置/超时/网络 | 配置提示不发请求；「请求超时（N 秒），请重试或调大超时」；提示确认 CORS | `useAiReading.ts:25-30`、`aiClient.ts:172,174-177` |
| 提示通道 | `ui.notify(text,kind)`，2.6 s 自动消失 | `ui.ts:91-96` |

### 6.4 空态与加载态

| 场景 | 规范 | 证据 |
| --- | --- | --- |
| 无档案 | `EmptyState`「还没有档案」+新建+载入示例 | `ArchiveHomeView.vue:109-119` |
| 档案不足 2 份 | `EmptyState`「档案不足」 | `CompareView.vue:84-90` |
| 合盘未就绪 | 空态/骨架 | `CompositeView.vue:287` |
| 加载态 | AI loading；按钮禁用防重复提交 | `useAiReading.ts:33`、`ui.ts:75-77` |

### 6.5 异常回退

| 异常 | 回退 |
| --- | --- |
| 星历/映射异常 | `computeChart` 抛 `BirthInputError`，UI 提示，不落盘半成品 |
| 存储不可用（隐私模式）/超限 | 静默降级，不阻塞计算（`storage.ts:42-48`） |
| 损坏数据 | 备份+提示，不覆盖（`:21-35`） |
| AI 失败 | 显示错误，不写缓存、不写历史 |

### 6.6 键盘可达性与移动端

| 项 | 规范 | 依据 |
| --- | --- | --- |
| 触控目标 | ≥44 px；移动端闸门命中 ~38 px 属已知偏差，需提示「精度不足建议桌面端」 | `DESIGN.md:16`、`README.md:131` |
| 焦点/语义 | 弹层/抽屉 `role="dialog"`、关闭按钮 `aria-label="关闭"` | 冒烟选择器 |
| 键盘 | 原生 `<button>`；抽屉 Esc 关闭（**TBD：未见实现，GAP-10**） | — |
| 移动端 | ≤768 单列/底部抽屉；`/boards` 静默重定向需可见提示（**GAP-09**） | `MultiBoardView.vue:49-56` |

## 7 一致性与验收

### 7.1 单元测试要求（必须全绿）

| 测试文件 | 覆盖 | 必须包含的断言 |
| --- | --- | --- |
| `tests/engine.test.ts` | 盘序/通道/判定/时区 | 四边界锚点 41.1/60.1/18.1/25.1；两 Rave New Year→41.1；门不重叠/不越界 |
| `tests/ephemeris.parity.test.ts` | 星历口径 | 跨时区金标准（1990 中国、1972 北美、1964 欧洲） |
| `tests/composite.test.ts` | 合盘+凯龙 | 四类通道；同人抛错；四象限合计 9；凯龙回归 49–52 年 |
| `tests/layout.test.ts` | 几何 | 闸门落在所属中心内；通道裁剪长度足够 |
| `tests/markdown.test.ts` | 渲染 | 标题/加粗/列表/引用；HTML 注入被转义 |

命令：`npm test`、`npx vue-tsc --noEmit`。

### 7.2 冒烟要求

`desktop/main.cjs:253-519` `runSmoke()`，`HD_SMOKE=1` 启动，必须验证：安全 origin（`app://`）、localStorage 读写、空态、载入示例、人体图点亮、通道/闸门清单、9 中心、类型详解、星体两翼 13 行、点击未激活闸门不误亮、批量解读条、AI 未配置护栏、深色模式、合盘三栏+维度切换、设置页、新建页。退出码 0 视为通过，产物 `smoke-result.json`。

### 7.3 文档一致性检查项（GAP，须在实现迭代中闭合）

| 编号 | GAP | 现状 | 规范要求 | 证据 |
| --- | --- | --- | --- | --- |
| GAP-01 | 合盘输出类型/权威/定义 | `composite.ts:156-158,184-190` 计算并填充；`CompositeView.vue:208` 写入 AI offline | 不输出（§3.8） | `types/hd.ts:269-273` 注释亦写「关系场不存在」 |
| GAP-02 | 四闸门顺序 | `bodygraph.ts:207` 为 `pSun/dSun \| pEarth/dEarth` | 统一为 `pSun/pEarth \| dSun/dEarth`（§3.7） | `crossData.ts:182` 已符合 |
| GAP-03 | 多 AI 配置 | 单 `settings.ai` | `AiProfile` 列表（§4.4/§6.1） | `settings.ts:37` |
| GAP-04 | 导入校验传参 | `validateBirth(a.birth)` 缺 timezone | TBD 待确认 | `SettingsView.vue:59`、`validate.ts:61-62` |
| GAP-05 | 凯龙盘结论展示 | 页面未标注「非 13 体」 | 必须标注（§3.9） | `ChironView.vue:4-5` 注释仍称「独立…轮回交叉与人生角色」 |
| GAP-06 | 192 名称 | 不输出名称 | 可选接入，键 `(pSun,angle)`（§3.7） | `bodygraph.ts:190` |
| GAP-07 | 撤销删除 | 无撤销 | 软删除+5 s 撤销（§5.3） | `archive.ts:162` |
| GAP-08 | 版本号单一来源 | `tauri.conf.json:4`=1.1.0、`Cargo.toml:3`=0.1.0 | 与根 `package.json` 同步（§8） | 本项目文件 |
| GAP-09 | `/boards` 移动端静默重定向 | 无提示 | 给出可见提示 | `MultiBoardView.vue:49-56` |
| GAP-10 | 键盘 Esc 关闭抽屉 | 未见实现 | 补键盘可达性 | §6.6 |

## 8 变更记录与版本策略

### 8.1 ENGINE_VERSION 提升规则（`version.ts:4-8`）

| 触发条件 | 必须提升 | 示例 |
| --- | --- | --- |
| 星历口径（库/视黄经定义/章动项） | 是 | 换 astronomy-engine 版本或改口径 |
| 曼陀罗偏移/盘序 | 是 | 29.8333→29.875 |
| 36 通道表 / 64 门→中心 | 是 | 通道增删、门归属调整 |
| 类型/权威/定义/交叉判定 | 是 | 权威分支调整 |
| 仅文案/UI/渲染/配色 | 否 | 改中文措辞、改 CSS |

写入点：`bodygraph.ts:331,350` `meta.engineVersion`；提升后 `syncEngineVersion` 自动重算（`archive.ts:114-124`）。

### 8.2 SCHEMA_VERSION 提升规则（`version.ts:11`，当前 2）

| 触发条件 | 必须提升 |
| --- | --- |
| `Archive`/`BodyGraph`/`CompositeResult` 字段增删改 | 是 |
| localStorage 键名变化（如新增 `hdt.ai.profiles.v1`） | 是 |
| 导出 JSON 结构变化 | 是 |
| 仅计算规则变化（字段不变） | 否（用 `ENGINE_VERSION`） |

### 8.3 变更记录

| 版本 | 日期 | 变更 | 关联 |
| --- | --- | --- | --- |
| 2.0 | 2026-11-06 | 首次成文：15 项标准选定 + 9 仓库对照结论固化 + GAP-01…10 | 本文 |
| — | 2026-10-27 | （引擎）偏移 29.8333→29.875、合盘同人拦截、导入校验、`engineVersion` | `CHANGELOG.md:5-66` |

## 附录 A 数值速查表

| 量 | 值 | 公式/推导 |
| --- | --- | --- |
| 圆周 / Gate 宽度 | 360° / 5.625°=90/16 | 360/64 |
| Line / Color | 0.9375°=15/16 / 0.15625°=5/32 | HEX/6 / LINE/6 |
| Tone / Base | 5/192°≈0.0260417 / **1/192°**≈0.00520833 | COLOR/6 / TONE/5 |
| 偏移 `MANDALA_OFFSET` | 29.875° | 5×5.625+1.75 |
| Gate 41 / 60 / 18 起点 | 302.000° / 296.375° / 183.875° | 59/58/38×5.625−29.875 |
| Gate 25 / 17 / 1 起点 | 358.250° / 3.875° / 223.250° | 5/6/45×5.625−29.875 |
| Design 回溯角 / 容差 | 88° / 0.5 s | — |
| 凯龙回归窗口 / 容差 | 45–56 年 / 60 s | 周期≈50.4 年 |
| 支持年份 | 1900–2100 | `validate.ts:21-23` |
| 12 人生角色 | 1/3、1/4、2/4、2/5、3/5、3/6、4/6、4/1、5/1、5/2、6/2、6/3 | NAT `PROFILES:279-292`、SHA `Profiles.cs:4-18` |
| 角度分类 / 关系通道 / 四象限 | 4/1 并列·人格爻≥5 左·其余右；electromagnetic/companionship/dominance/compromise；both/onlyA/onlyB/open | §3.7/§2.13/§2.12 |

任意门起点命令：
```bash
node -e 'const M=[55,37,63,22,36,25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60,41,19,13,49,30];const s=g=>((M.indexOf(g)*5.625-29.875)%360+360)%360;for(const g of [41,60,18,25,17,1])console.log(g,s(g).toFixed(3))'
```

## 附录 B 术语中英对照

| 中文 | 英文 | 代码名 |
| --- | --- | --- |
| 闸门/爻/颜色/音调/基底 | Gate/Line/Color/Tone/Base | `gate`/`line`/`color`/`tone`/`base` |
| 生产者/显化生产者/显示者/投射者/反映者 | Generator / Manifesting Generator / Manifestor / Projector / Reflector | `HDType` |
| 情绪/骶骨/直觉（脾）/自我（心）/自我投射/环境（脑）/月亮权威 | Emotional / Sacral / Splenic / Ego / Self-Projected / Mental / Lunar | `Authority` |
| 无定义/单一定义/二分/三分/四分 | No Definition / Single / Split / Triple Split / Quadruple Split | `DefinitionKind` |
| 右角度/并列/左角度交叉 | Right Angle / Juxtaposition / Left Angle Cross | `CrossAngle` |
| 电磁/同伴/主导/妥协通道 | Electromagnetic / Companionship / Dominance / Compromise | `RelationshipChannelType` |
| 双方定义/仅A/仅B/双方开放 | both / onlyA / onlyB / open | `CenterQuadrant` |
| 悬挂闸门 / 人格（意识）/ 设计（无意识） | Hanging Gate / Personality / Design | `hangingGates`/`personality`/`design` |
| 扩展层 | Extension layer | — |

## 附录 C 参考实现索引（9 仓库 + 本项目）

| 议题 | 本项目 | FHD | RAVE | NAT | MCP | SHA | BASE | ORI | GON | SWE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 36 通道表 | `gateData.ts:36-42` | `src/hd/bodygraph.js:66-72` | 同 FHD | `humandesign.js:185-222` | `hd/data/channels.py:23-65` | `Enums/Channels.cs:7-42` | — | `bodygraph.js:17-54`（5 对差异） | `geometry.ts:151-218`（35 条） | — |
| 门→中心 | `gateData.ts:9-33` | `bodygraph.js:39-62` | 同 FHD | `humandesign.js:109-176` | `centers.py:20-66`（28 重复） | `Gates.cs:77-140`+`Centers.cs:22-30` | — | — | — | — |
| 盘序/偏移 | `mandala.ts:35-43` | `calc/mandala.js:15-30`（29.8333） | 同 FHD | `humandesign.js:325-353`（358.25） | `gates.py:14`（358.25） | `HumanDesignUtility.cs:13,59`（3.875） | — | 委托 NAT | — | — |
| 类型 | `bodygraph.ts:115-131` | `bodygraph.js:141-147` | 同 FHD | `humandesign.js:474-489,860-899` | `chart.py:251-266` | `HumanDesignChart.cs:343-396` | — | 委托 NAT | — | — |
| 权威 | `bodygraph.ts:133-146` | `bodygraph.js:149-163` | 同 FHD | `humandesign.js:904-912` | `chart.py:271-291` | `Authorities.cs:3-13`+`HumanDesignChart.cs:398-422` | — | 委托 NAT | — | — |
| 定义型 | `bodygraph.ts:149-177` | `bodygraph.js:192-235` | 同 FHD | `humandesign.js:646-684` | `chart.py:342-380` | `SplitDefinitions.cs:5-12`+`GraphService.cs:14-44` | — | 委托 NAT | — | — |
| 角色(12) | `bodygraph.ts:270` | `bodygraph.js:290-293` | 同 FHD | `humandesign.js:279-302` | `CROSS_ANGLE:385-392` | `Profiles.cs:4-70` | — | 委托 NAT | — | — |
| 交叉角度 | `bodygraph.ts:201-205` | — | — | `incarnation-crosses.js:22-31` | `chart.py:385-392` | `Profiles.cs:55-70` | — | 委托 NAT | — | — |
| 192 名称 | 未接入 | — | — | `incarnation-crosses.js:35-100`（64×3） | `chart.py:400-420`（简化） | `IncarnationCross.cs:4-198`（192 枚举） | — | 委托 NAT | — | — |
| 四闸门顺序 | `bodygraph.ts:207`/`crossData.ts:182` | — | — | `humandesign.js:501` | `chart.py:434` | `ToGeneKeys:201` | — | — | — | — |
| 合盘四类 / 四象限 | `composite.ts:50-73,164-170` | — | — | `compatibility/humandesign.js:401-404,329-368` | `composite.py:64-85` | `ChannelActivationType.cs:6-42`（7 值） | — | `core/compare.js`（通用） | — | — |
| 合盘 Type/Authority/Cross | 当前计算（GAP-01） | — | — | 仅 type | 仅 type | **无**（`IHumanDesignChart.cs:5-43`） | — | — | — | — |
| 人数上限 | 2（L4） | — | — | 2 + Penta 2–9 | 2 | 2 | — | — | — | — |
| 凯龙 | `chiron.ts`/`chironChart.ts`/`ChironView.vue` | `deviation-sample.test.js:40`（忽略） | 同 FHD | 零命中 | 13 体不含 | 零命中 | `Planets.cs:19` 枚举 | 委托 NAT | 13 体不含 | `SE_CHIRON=15` |
| Harmonic Gate | — | — | — | `gate-descriptions.js:10` | — | `Gates.cs:351-417` | — | — | — | — |
| 行运 | — | — | — | `hd-transits.js` | `hd/transits.py` | `HumanDesignTransitChart.cs` | — | — | — | — |

---

**文档结束。** 本文件只描述规范，不修改任何代码；凡与当前实现不符处均列入 §7.3 GAP 表，待后续迭代闭合。所有数值可由 `node scripts/check-mandala-anchor.mjs`、`npm test`、`npx vue-tsc --noEmit` 或附录 A 命令复现。
