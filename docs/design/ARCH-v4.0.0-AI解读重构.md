# ARCH v4.0.0 — AI 解读重构（三入口 · 双配置维度 · 128000 token · 滑动窗口）

> 架构师：高见远｜目标版本：4.0.0｜语言：简体中文
> 输入：主理人确认口径（已锁定，不得再推断）＋ 现有代码事实（v3.5.0 仓库基线）
> 不引入新依赖、不写后端、不改 `src/engine/*` 星历与曼陀罗口径（29.875 / 302.000）。
> 合盘 / 双盘仍不得输出合图类型 / 权威 / 定义 / 轮回交叉。桌面冒烟契约（`AiReadingPanel.vue`）零改动。

---

## 0. 一页速览（给实现者的地图）

```
                 ┌──────────────────────── AiWorkspaceView.vue ────────────────────────┐
                 │  入口 A｜全盘 AI 解读    入口 B｜AI 综合解读    入口 C｜勾选解读     │
                 └───────────────┬──────────────────┬──────────────────┬─────────────┘
                                 │  ReadingRequest（entry/detail/style/chart/dims/direction）
                                 ▼
                      services/aiReadingPlan.ts        ← 纯函数：请求 → 计划（任务清单 + 融合）
                                 │  ReadingPlan{tasks[], fusion, singleShot}
                                 ▼
                      services/aiReadingRunner.ts      ← 编排：单次 or 滑动窗口 + 融合 + 进度
                        │                    │
                        │                    └──► services/aiScheduler.ts（滑动窗口，唯一执行点）
                        ▼                                    │
            services/aiPrompt.ts（五段拼装）                  │ 每个任务
                        │                                    ▼
                        └──────────────────────► services/aiClient.ts explain()
                                                            │  ├─ aiTokenFallback.ts（max_tokens 阶梯降级）
                                                            │  └─ aiTransport.ts（既有，不改）
                                                            ▼
                                                 services/aiEvidence.ts（依据/白名单检测，仅告警）
```

**四句话讲清重构：**

1. **「一次生成 vs 多次请求」是运行策略，不是提示词分支。** 三入口共用同一个 `planReading()`：`detail !== 'full'` 恒返回 **单任务**（一次传入全部资料、单次生成），`detail === 'full'` 才拆模块 + 末位融合。
2. **提示词从「四套整篇」改为「五段拼装」。** 基础契约 + 入口契约 + 档位契约 + 风格段 + 范围段；3 档 × 3 入口 × 2 风格 = 18 种组合全部可枚举、可单测、`cacheKey` 全互斥。
3. **token 上限整体删除。** 请求体恒传 `max_tokens: 128000`；越界 400/422 由 `explain()` 内部阶梯降级（只降本条、不共享状态），`finish_reason='length'` 续写保留。
4. **并发收敛为一个旋钮。** 删除「AI 并发数」「并发上限」「多步编排方式」，只留「最高并发数 N（1–99）」，由一个滑动窗口调度器解释：起速每秒 1 个直到在跑 N，落定即补，串行 = N=1。

---

## 1. 架构总览

### 1.1 分层与职责

| 层 | 模块 | 职责 | 依赖方向 |
|---|---|---|---|
| 视图层 | `views/AiWorkspaceView.vue`、`components/ai/AiEntry*Panel.vue` | 收集三入口参数，渲染进度/分项/正文，不改提示词、不拼事实块 | ↓ |
| 编排层 | `services/aiReadingPlan.ts`、`services/aiReadingRunner.ts` | 请求 → 任务清单；执行、合并、进度、取消 | ↓ |
| 调度层 | `services/aiScheduler.ts` | 滑动窗口：起速、上限、落定即补、重试、取消 | ↓ |
| 提示词层 | `services/aiPrompt.ts`、`services/aiEvidence.ts` | 五段拼装、user 四段拼装、回复后检测 | ↓ |
| 请求层 | `services/aiClient.ts`、`services/aiTokenFallback.ts`、`services/aiTransport.ts` | 单次请求、缓存、续写、降级链、HTTP | ↓ |
| 事实层 | `services/chartFacts.ts`、`readingAngles.ts`、`destinyText.ts`、`interpretations.ts` | 盘面事实块（唯一来源）、方向文案、离线章节 | ↓ |
| 状态层 | `stores/settings.ts`、`stores/ui.ts`、`stores/readings.ts` | 设置项与迁移、单槽位解读状态、解读档案 | — |

**不变式（硬约束）：**

- 【I-A】事实块**只由** `chartFacts.ts` / `aiFullReading.baseFacts` 产出，视图层不得自拼，否则缓存键与批量生成漂移。
- 【I-B】`aiScheduler.ts` 是全库**唯一**发起并发请求的地方；`aiFullReading.ts` / `aiBatchReading.ts` 的旧批处理循环一律改为调用它。
- 【I-C】提示词正文只能在 `aiPrompt.ts`（代码）与 `docs/spec/AI-PROMPT-v3.0.md`（文档）两处，逐字一致，由测试锁定。
- 【I-D】`explain()` 不认识「入口」，只认识 `scope / detail / style / ref`；入口语义全部在 `aiPrompt.ts` 的 `ENTRY` 段落里。

### 1.2 关键困难点与选型（无新增依赖）

| 困难点 | 选型 | 理由 |
|---|---|---|
| 18 种提示词组合不可维护 | 段落常量 + 纯函数拼装（不引入模板引擎） | 与既有 `audiencePromptOf` 同构，零依赖，逐段可单测、可比对文档 |
| 「一次 vs 多次」两套语义 | `planReading()` 单一收口，返回 `singleShot` | 入口层不再写 `if (mode === 'full')` 分支，三入口共用一条执行路径 |
| 每秒起速 + 稳态满载 | 自研滑动窗口（≈90 行） | `Promise.all` 是定批、`p-limit` 是纯限流，两者都不表达「起速节奏」；新依赖也被禁止 |
| 128000 越界静默失败 | 阶梯降级 + 局部变量 | 降级状态必须**不跨请求**，否则一条失败会连锁污染全部并发 |
| 「每条结论有依据」可校验 | 提示词硬条款 + 回复后启发式检测（仅告警） | 与既有防幻觉 `validateAiReplyFacts` 同一治理哲学：可测、不阻断 |

### 1.3 为什么删掉 `aiStepMode`

新调度器里「串行」精确等价于 `maxConcurrency === 1`。保留 `AiStepMode` 会让用户面对两个互相覆盖的旋钮（选「串行」+ 填 8 该听谁的？），必然产生歧义与回归争议。因此：

- **设置层**删除 `aiStepMode` 字段，由 `aiMaxConcurrency` 推导：`stepMode = aiMaxConcurrency === 1 ? 'serial' : 'parallel'`。
- **编排器签名**保留 `stepMode?: AiStepMode`（可省略），仅用于展示文案与兼容既有调用点，不再单独持久化。

---

## 2. 提示词分层与拼接

### 2.1 五段结构与顺序

`systemPromptOf()` 从「按档位四选一」改为「五段按序拼装」：

```ts
export interface SystemPromptContext {
  entry: AiEntry                 // 'full' | 'composite' | 'selection'
  detail: AiDetailMode           // 'concise' | 'detailed' | 'full'
  style: AiStyle                 // 'plain' | 'pro'
  scope?: AiScope                // 细分范围，决定是否追加「范围段」
}

export function systemPromptOf(ctx: SystemPromptContext): string
```

| 序 | 段 | 常量 | 什么时候拼 | 内容要点 |
|---|---|---|---|---|
| 1 | 基础契约 | `PROMPT_CORE` | 恒拼 | 事实来源与边界（只许用【盘面事实】【离线释义】）、与事实块的分工（不复述）、禁止编造结构、合盘禁个体结论、Markdown 输出、结尾边界提示 |
| 2 | 入口契约 | `PROMPT_ENTRY_FULL` / `_COMPOSITE` / `_SELECTION` | 恒拼（按 entry 三选一） | A：6 模块固定顺序与各自输出契约；B：**输出白名单**（只写勾选维度）+ 方向注入；C：逐条 + 关联汇总两阶段 |
| 3 | 档位契约 | `PROMPT_DETAIL_CONCISE` / `_DETAILED` / `_FULL` | 恒拼（按 detail 三选一） | 精简：零断言、只描述倾向；详细：5000–10000 字（≤20000）+ **依据前置铁律**；完整：无字数上限、按分项各自成文、不写全盘收束语 |
| 4 | 风格段 | `PROMPT_STYLE_PLAIN` / `PROMPT_STYLE_PRO` | 恒拼（按 style 二选一） | 零基础：大白话 + 实例 + 剔除玄学措辞；专业：使用并**清晰阐释**术语（与旧 pro「不必解释」相反） |
| 5 | 范围段 | `PROMPT_SCOPE_FUSION` / `_ITEM` / `_OVERVIEW` | 仅特定 scope 拼 | 融合：只做整合与新判断、不逐项复述；分项：只写这一项；通解：一次覆盖全部条目、逐项一个三级标题、不得合并跳过 |

最终：`system = [CORE, ENTRY, DETAIL, STYLE, SCOPE?].filter(Boolean).join('\n\n')`

**顺序理由：**从「全局不可违背」→「入口职责」→「本档强度」→「表达方式」→「本次范围」，越靠后越具体、越贴近 user prompt 的注意力位置；同时让 STYLE 能覆盖 DETAIL 的默认表述（如 DETAIL 说「可用专业词」，STYLE=零基础说「必须解释」），冲突有唯一裁决方向。

### 2.2 组合矩阵（18 种，全部进缓存键）

| entry ＼ detail+style | concise·plain | concise·pro | detailed·plain | detailed·pro | full·plain | full·pro |
|---|---|---|---|---|---|---|
| A 全盘 | 单次 · 6 模块 6 节 | 同左 | 单次 · 6 模块长文 | 同左 | 6 请求（5 并发 + 融合） | 同左 |
| B 综合 | 单次 · 白名单小节 | 同左 | 单次 · 白名单长文 | 同左 | N 维度请求 + 融合 | 同左 |
| C 勾选 | 单次 · 逐条 + 汇总 | 同左 | 单次 · 逐条长文 + 汇总 | 同左 | 逐条请求 + 可选模块 + 汇总 | 同左 |

> 注意：`full` 行由 `planReading()` 决定请求切分，system prompt 的 DETAIL 段只描述**每一篇**怎么写，不再描述「你正在参与多轮编排」这类编排细节（旧 `PROMPT_SYSTEM_FULL` 的写法会让单次档也误以为自己在多轮里）。

### 2.3 详细版「依据前置」硬规则（可执行 · 可校验）

**提示词条款草稿（`PROMPT_DETAIL_DETAILED` 必须逐字包含）：**

```text
【依据前置铁律（详细版强制，逐条生效）】
1. 每一条结论都必须写成「依据 → 结论」，不得先给结论再补依据。
2. 依据按优先级取用，取到即止：
   ① 对应通道：写出通道 key 与两端闸门，例「通道 20-34（喉咙↔G）」；
   ② 无对应通道时取闸门：例「闸门 57 单独激活（脾中心）」；
   ③ 无对应闸门时取中心：例「骶骨中心已定义」；
   ④ 三者都取不到的结构，不得作为结论依据，该结论必须删除。
3. 依据只能来自【盘面事实】或【离线释义】；引用盘外通道 / 闸门即为违规。
4. 句式模板（二选一）：「因为〔依据〕，所以〔结论〕」／「〔结论〕——依据：〔依据〕」。
5. 同一自然段内多条结论共用同一依据时，段首写一次「本段依据：〔依据〕」，其余用「同上依据」承接；
   跨自然段不得省依据。
6. 禁止用「行业惯例」「一般来说」「大多数人都」代替依据。
```

**回复后检测（新增 `services/aiEvidence.ts`，只告警、不阻断、不改写内容）：**

```ts
export interface EvidenceCoverage {
  /** 被判定为「结论块」的段落数 */
  total: number
  /** 其中含合法依据的段落数 */
  withEvidence: number
  /** 缺依据的段落首句（截断 40 字），供 UI 提示与调试日志 */
  missing: string[]
}
export function checkEvidenceCoverage(reply: string, facts: string): EvidenceCoverage

/** 入口 B 的维度白名单检测：未勾选维度不得成为小标题 / 独立段 */
export interface DimLeak { dim: ReadingDimKey; heading: string }
export function checkDimensionWhitelist(
  reply: string,
  dims: ReadingDimKey[],
): DimLeak[]

/** 入口 A ②③ 的条目覆盖检测：每条通道 / 闸门必须各有标题 */
export interface ItemCoverage { expected: string[]; missing: string[] }
export function checkItemCoverage(reply: string, expectedKeys: string[]): ItemCoverage
```

判定口径（写死，供测试锁定）：

- 「结论块」= 非标题行、去空白后 ≥ 24 字的自然段（Markdown 中以空行或单换行分段后逐块判断）。
- 「含依据」= 该段命中以下任一项：事实块中出现过的通道 key（`\d{1,2}-\d{1,2}`）、`闸门 N`（N 在事实块白名单内）、任一中心名（9 个 `CENTER_LABELS`）、或字面量「依据」。
- 只在 `detail ∈ {detailed, full}` 时执行；`concise` 档不检测（该档明确禁止事实断言，无依据可查，见 §2.4）。

### 2.4 精简档「不做事实性断言」的可执行化

旧 `PROMPT_SYSTEM_CONCISE` 允许「按这套体系你更容易…」这类倾向判断，但没有明令禁止断言。新档位契约必须逐字包含：

```text
【精简档：只描述倾向，不做事实性断言】
1. 只描述「日常行为倾向」与「可观察的场景」，不判定成因、不判定好坏、不判定命定。
2. 禁止出现断言句式：「你就是」「你必定」「这说明你」「根本原因是」「你的天赋是」。
3. 允许的句式：「按这套体系，你更容易…」「你可以留意是否…」「不少人在这张盘里会…」。
4. 本档不要求写依据与对应通道（因为不做断言）；但也不得出现【盘面事实】以外的结构。
```

> 这条设计刻意让「依据铁律」与「精简档」互斥：**有断言就必须有依据，没依据就不许断言**。两档同时要求会出现自相矛盾的提示词。

### 2.5 风格段（两条硬要求）

`PROMPT_STYLE_PLAIN`（零基础版）必须逐字包含：

```text
【表达风格：零基础大白话】
1. 全程口语，每 200 字至少给一个具体例子或生活场景。
2. 剔除玄学化表述：禁止把「能量 / 频率 / 磁场 / 共振 / 天命 / 业力 / 高维」当作解释词；
   一旦必须提到某个术语，先用一句大白话说清它对应的生活现象，再把原词放括号。
3. 剔除假翻译式模糊表述：禁止「在能量层面上」「从更高视角看」「某种意义上是」这类既不具体也不可验证的句子。
4. 一句话能说清就不用两句；句子短，少用并列名词长串。
5. 不降低结论精确度：判断照给，只是换成能听懂的话。
```

`PROMPT_STYLE_PRO`（专业版，**与旧 aiAudience='pro' 语义相反**）必须逐字包含：

```text
【表达风格：专业术语体系】
1. 使用通行术语（类型 / 策略 / 内在权威 / 中心有颜色与空白 / 闸门 / 通道 / 定义型 / 轮回交叉 / 人生角色）。
2. 每个术语**第一次出现时必须阐释**：先给一句定义，再给「在本盘的具体取值」。
   例：「你的内在权威是骶骨权威——定义是『身体的即时回应先于头脑分析』；在本盘它作用于骶骨中心已定义、喉咙未定义的组合上，因此…」
3. 表述严谨、可追溯：允许深奥，但每句都要能落回本盘结构，不许用术语堆砌掩盖空话。
4. 英文原词只在第一次出现时括注一次（Generator / Projector…），之后用中文。
```

> **必须显式提醒实现者**：这正是与 v3.5.0 相反的地方。旧的 `PROMPT_SYSTEM_AUDIENCE_PRO` 写的是「读者已熟悉术语…不必逐个展开解释」，新要求是「使用并清晰阐释」。任何从旧文件复制该段落的做法都会反向违约。

### 2.6 `buildUserPrompt` 四段顺序（保持不变，仅扩充【用户选择】）

测试已锁定「【盘面事实】→【用户选择】→【离线释义】→【本次任务】」四段顺序与各出现一次，**必须保留**。仅扩充【用户选择】行的字段：

```
【用户选择】入口：{A 全盘｜B 综合｜C 勾选}｜范围：{scope · ref}｜维度：{勾选维度或「不适用」}｜角度：{方向}｜档位：{精简/详细/完整}｜风格：{零基础/专业}
```

禁止在【用户选择】里放档案名（标题携带档案名，会让同一张盘的手动生成与批量生成产生不同 prompt → 缓存键分裂；这条在 `aiBatchReading.ts` 已有注释，重构不得违反）。

---

## 3. 三入口任务清单

### 3.1 决策：`planReading()` 单点收口

```ts
export function planReading(req: ReadingRequest): ReadingPlan
```

| detail | 返回 | 请求数 |
|---|---|---|
| `concise` / `detailed` | `singleShot = true`，`tasks = [唯一任务]`，`fusion = null` | **恒 1** |
| `full` | `singleShot = false`，`tasks = 模块清单`，`fusion = 末位任务` | A 型 6、B 型 N+1、C 型 k+m+r+1 |

这条规则直接落实「精简、详细档三个入口都是一次性传入全部资料、单次生成，不拆任务、不二次生成」。

### 3.2 入口 A｜全盘 AI 解读（6 模块，顺序不可调换）

| # | 模块 | 单次档（精简/详细） | 完整档 scope / ref | kind | offline 事实块内容 |
|---|---|---|---|---|---|
| ① | 通解：类型、策略、内在权威 | 二级标题 1 | `full-module` / `A1-core` | `module` | 类型 + 策略 + 内在权威（含离线释义首句）+ 定义型 + 人生角色 + 已定义/开放中心清单 |
| ② | 通解：全部通道（**一次请求**） | 二级标题 2 | `full-all-channels` / `A2-channels` | `module` | 全部已激活通道：`key 名称（中心A↔中心B）：首句释义`，逐行；回路分布（`circuitryBrief`）；每条通道两端闸门的激活星体 |
| ③ | 通解：全部闸门（**一次请求**） | 二级标题 3 | `full-all-gates` / `A3-gates` | `module` | 全部已激活闸门：`闸门 N 名称（所属中心｜已定义/开放）：特质 / 成长 / 扎根 / 驱动`，逐行；标注哪些是悬挂闸门及对端是否激活 |
| ④ | 通解：中心状态、定义、回路分布、轮回交叉 | 二级标题 4 | `full-module` / `A4-centers` | `module` | 九中心逐项定义状态 + 离线释义首句；定义型（几分定义）；回路分布；轮回交叉四闸门（人格太阳/地球、设计太阳/地球）+ 交叉名 |
| ⑤ | 结合人生轨迹、发展轨迹、未来形势、扎根力、成长方向（**5 方向 1 模块**） | 二级标题 5（下含 5 个三级标题） | `full-trajectory` / `A5-trajectory` | `module` | 南北交点闸门；四太阳/地球闸门；人生角色；与扎根/成长相关的已定义与开放中心；5 个方向的 prompt 文案（`trajectory/development/forecast/grounding/growth`） |
| ⑥ | 最终输出全款 AI 综合解读（**融合，最后单独执行**） | 二级标题 6 | `full-fusion` / `A6-fusion` | `summary` | ①–⑤ 各自**前 800 字**要点 + 未完成分项清单 + 「完整分项已在报告中」声明 |

**②③ 的「一次通解全部」契约（`PROMPT_SCOPE_OVERVIEW` 逐字包含）：**

```text
【通解范围契约】
1. 本次请求一次性给出全部条目（通道或闸门），不是逐条请求。
2. 必须逐项覆盖：每一条通道 / 每一个闸门各占一个三级标题，标题内含编号与名称。
3. 禁止合并同类项跳过（例如「其余闸门都类似」）；禁止只挑「重点」写。
4. 每条 3–6 句：先说它在一般人身上的常态，再说在这张盘里的差异化表现，最后给一个可观察的场景。
5. 条目之间不要互相引用序号（「如上所述第 3 条」），保证任意一条被单独阅读时也成立。
```

> 一次请求覆盖约 10 条通道 / 26 个闸门，配合 `max_tokens=128000` 完全够用；若模型限额低导致触顶，由续写兜底（续写上下文里已有前文，不会重写）。

**⑤ 为什么是 1 个模块而不是 5 个：**需求把「人生轨迹/发展轨迹/未来形势/扎根力/成长方向」并列在同一条（第⑤条）里，且第⑥条才是「最终融合」。若把 ⑤ 拆 5 个请求，请求总数从 6 变 10，模块顺序的「固定 6 模块」表述就失去对应物。故 ⑤ 保持 1 请求 5 小节，用 `checkItemCoverage` 校验 5 个三级标题是否齐全（缺则 warn）。若验证期发现 ⑤ 明显偏薄，只需在 `aiReadingPlan.ts` 加一个 `A5_SPLIT = true` 开关展开为 5 个任务，不影响其他层。

### 3.3 入口 B｜AI 综合解读（子模式一：自选维度 + 自选方向）

| detail | 任务清单 | 说明 |
|---|---|---|
| 精简 / 详细（**单次**） | 1 个任务：`scope='unified'`、`ref = unifiedScopeRef(dims, angleKey, customDirection)` | 一次传入**全部勾选维度**的事实块 + 方向，要求「每个勾选维度一个小节 + 末尾一句整体关联」 |
| 完整（**多请求**） | `dims.length` 个分项（`scope='full-dimension'`，`ref='B-dim:<dim>'`）+ 1 个融合（`scope='full-fusion'`、`ref='B-fusion'`） | 每个分项只写一个维度，各自带方向；融合按白名单整合 |

**「未勾选维度绝不出现」的可执行化（`PROMPT_ENTRY_COMPOSITE` 逐字包含）：**

```text
【输出白名单（本入口硬约束）】
本次用户只勾选了这些维度：{DIMS}。
1. 只允许出现下列维度的小节：{DIMS}。未勾选的维度不得成为二级/三级标题，不得单独成段。
2. 若解释某个已勾选维度必须提到未勾选维度，只能作为一句附带修饰，不得展开成段、不得作为结论主体。
3. 不要「为了完整性」补齐未勾选维度；不要写「其他维度暂略」这类占位句。
4. 结尾不要输出总览表、不要复述全部维度清单。
```

`{DIMS}` 由 `planReading()` 渲染为中文标签串（如「已激活通道、内在权威、轮回交叉」），同一份串既写进 system 白名单段，也写进 user 的【用户选择】，两处必须一致。

**方向注入：**沿用 `chartFacts.directionPrompt(label, prompt, custom)`——自定义方向优先于内置角度。入口 B 不提供「不限方向」（与 C 的区别就在这里）。

### 3.4 入口 C｜勾选解读（子模式二：逐条 + 关联汇总）

勾选对象：闸门 / 通道 / 定义状态（三者至少一项），可选 回路分布、轮回交叉；方向可选、可不选。

| detail | 任务清单（顺序固定） |
|---|---|
| 精简 / 详细（**单次**） | 1 个任务 `scope='selection-one'`、`ref='C-one:<签名>'`：一次传入全部勾选项事实块，输出 = 每个勾选项一个三级标题（逐条）+ 末尾「关联汇总」二级标题 |
| 完整（**多请求**） | ① 逐条：`channel:<key>` ×k（`scope='full-channel'`）→ ② 逐条：`gate:<n>` ×m（`scope='full-gate'`）→ ③ 可选模块：`definition`（`full-module/C-definition`）、`circuit`（`full-module/C-circuit`）、`cross`（`full-module/C-cross`）→ ④ 汇总：`selection-fusion`（`full-fusion`、`ref='C-relation'`） |

- 逐条任务的 offline 复用 `aiFullReading.gateFacts / channelFacts`（含整盘事实块），保证「必须结合整张盘面」有料可依。
- 汇总任务输入 = 每条**前 200 字**要点 + 勾选清单 + 「只汇总勾选项彼此之间的关系，不引入未勾选结构」；要求至少点名 3 组「跨条目联动」。
- 汇总**必须**在全部逐条任务落定后单独执行（含失败跳过项），与入口 A ⑥ 同一机制。
- 方向：内置角度或自定义文案，逐条与汇总各注入一次；「不限方向」= 注入通用收束句而非角度 prompt。

### 3.5 融合输入的压缩口径

| 场景 | 每项截断 | 依据 |
|---|---|---|
| 入口 A ⑥（5 项） | 800 字 | 只有 5 项，可负担 4000 字输入 |
| 入口 B 融合（≤8 项） | 400 字 | 维度多时防上下文膨胀 |
| 入口 C 汇总（可达 30+ 项） | 200 字 | 条目最多，只取要点 |

`FUSION_EXCERPT_CHARS` 由单一常量改为 `fusionExcerptChars(entry): number`；融合输入的**结构**沿用 `buildFusionInput`（标题 + 要点 + 「未完成分项…请勿据此推断」），只把截断长度参数化。

---

## 4. 滑动窗口调度器

### 4.1 接口

```ts
export interface SlideTask<T> {
  key: string
  label: string
  run: (signal: AbortSignal) => Promise<T>
}

export interface SlideResult<T> {
  key: string
  label: string
  ok: boolean
  value?: T
  error?: string
  attempts: number
  startedAt: number
  endedAt: number
}

export interface SlideProgress {
  done: number       // 含失败项
  total: number
  inFlight: number
  queued: number
  /** 最近一次落定项的名称，供状态区展示 */
  current: string
}

export interface SlideOptions<T> {
  /** 最高并发数 N，1–99 */
  maxConcurrency: number
  /** 起速间隔，默认 1000ms */
  startIntervalMs?: number
  /** 单任务失败重试次数，默认 1（即最多 2 次尝试） */
  retry?: number
  signal?: AbortSignal
  onStart?: (task: SlideTask<T>, inFlight: number) => void
  onSettled?: (result: SlideResult<T>, progress: SlideProgress) => void
  onProgress?: (progress: SlideProgress) => void
}

export function runSlidingWindow<T>(
  tasks: SlideTask<T>[],
  options: SlideOptions<T>,
): Promise<SlideResult<T>[]>
```

### 4.2 不变量（每条都要有对应单测）

| ID | 不变量 |
|---|---|
| I1 起速 | 前 `N` 个任务按 `startIntervalMs` 节流启动：第 1 个在 `t=0` 立即发起，第 2 个在 `t=1s`，第 3 个在 `t=2s`…（`N=3` 时共 2 秒完成起速） |
| I2 上限 | `inFlight ≤ N` 恒成立 |
| I3 满载即补 | 一旦「已启动数 `startedCount ≥ N`」（起速结束，等价于首次出现 `inFlight === N`），进入稳态：任一任务落定（`onSettled` 已回调、结果已可展示）后**立即**补发下一个，不再受 `gap` 节流 |
| I4 顺序 | 返回数组按**任务原始顺序**；实时展示顺序 = 落定顺序 |
| I5 重试 | 单任务失败重试 `retry` 次（默认 1），重试**复用同一并发槽**，不额外占位、不改变 `inFlight`、不更新时间戳 |
| I6 取消 | `signal.abort` 后不再启动新任务；在跑任务的 `run(signal)` 收到 abort；**已落定结果全部保留**；最终抛 `AiError('已取消','cancelled')` |
| I7 进度 | 每次启动/落定都发一次 `onProgress`；`done` 计入失败项，`done + queued + inFlight === total` 恒成立 |
| I8 串行 | `N === 1` 时 `gap = 0`（**不套用起速间隔**，否则串行会莫名多出每任务 1 秒空档）；`rampDone` 在首个任务启动后即为真 |
| I9 空集 | `tasks.length === 0` 直接返回 `[]`，不启动定时器 |
| I10 定时器清理 | 任何返回/抛出路径都必须 `clearTimeout`，不残留定时器（防 vitest 挂住） |

> **I1/I3 的语义来源与唯一裁决口径：**用户确认「若设为 3，则每秒发起 1 个请求，直到在跑 3 个；之后任一请求完成（结果已展示）立即补发下一个，始终维持最多 3 个在跑」。
> 「起速」只在**前 N 个任务**上生效，判据统一写成 **`startedCount >= N`**（而不是「`inFlight === N` 出现过」）：前者在任务很快返回时也能正常结束起速，后者会让快任务永远卡在起速阶段。二者在「任务耗时长于 `gap`」时完全等价，因此不改变用户语义，只消除快任务的自锁。
> **已知副作用（必须在 UI 说明）：**`N=99` 时起速需要 98 秒才满载；任务本身很快时（< 1s）起速阶段仍按 1/s 走，这段时间内串行（N=1）反而更快。这是「每秒 1 个」语义的直接后果，不是缺陷；UI 用「起速中（每秒 1 个）· 已启动 M / N」明示。

### 4.3 伪代码

```
async function runSlidingWindow(tasks, o):
  N        <- clamp(o.maxConcurrency, 1, 99)
  gap      <- (N === 1) ? 0 : (o.startIntervalMs ?? 1000)
  retry    <- o.retry ?? 1
  next     <- 0                  # 下一个待启动的下标
  startedCount <- 0              # 已启动总数（决定起速是否结束）
  inFlight <- 0
  done     <- 0
  results  <- new Array(tasks.length)
  lastLaunchAt <- -Infinity
  rampDone <- (gap === 0)        # N=1 直接视为已结束起速
  timer    <- null
  pumping  <- false

  # 单次任务：成功/失败都归一成 outcome，不向上抛（取消除外）
  async function attempt(task, index):
    for tries in 0..retry:
      if o.signal?.aborted: return CANCELLED
      try:  v <- await task.run(o.signal)
            return { ok: true, value: v, attempts: tries + 1 }
      catch err:
        if isCancelled(err, o.signal): return CANCELLED
        last <- err
    return { ok: false, error: errText(last), attempts: retry + 1 }

  async function launch(index):
    task <- tasks[index]
    startedCount += 1
    if startedCount >= N: rampDone <- true      # ★ 起速结束的唯一判据
    inFlight += 1
    lastLaunchAt <- now()
    o.onStart?.(task, inFlight)
    emitProgress()
    t0 <- now()
    outcome <- await attempt(task, index)       # 失败不抛
    inFlight -= 1
    if outcome === CANCELLED: return
    done += 1
    results[index] <- { key, label, ok, value, error, attempts,
                        startedAt: t0, endedAt: now() }
    o.onSettled?.(results[index], progress())   # ★ 先展示，再补发（I3）
    pump()                                      # ★ 立即补发，不等 tick

  function pump():
    if o.signal?.aborted: return
    if pumping: return                          # 防重入：同一 tick 只跑一次 pump
    pumping <- true
    queueMicrotask(() =>
      pumping <- false
      while inFlight < N and next < tasks.length:
        if not rampDone:
          wait <- gap - (now() - lastLaunchAt)
          if wait > 0:
            timer <- setTimeout(() => { timer <- null; pump() }, wait)
            return                              # ★ 起速节流：本次 pump 结束
        i <- next; next += 1
        void launch(i)                          # 不 await → 并发
      if next >= tasks.length and inFlight === 0: settleAll()
    )

  pump()
  await allSettledPromise()
  clearTimeout(timer)
  if o.signal?.aborted: throw cancelledError(o.signal)
  return results
```

**实现要点（易踩坑）：**

1. **`pump()` 必须防重入**：多个任务在同一 microtask 内连续落定时，`onSettled → pump()` 会被连续调用多次；不加 `pumping` 标志会在同一 while 里把 `next` 推过 N，导致 `inFlight > N`。
2. **起速判据用 `startedCount >= N`**，不要用「`inFlight === N` 出现过」：任务比 `gap` 快时后者永远不成立，会自锁在 1/s；前者在慢任务下与用户语义完全等价。
3. **起速期的计时基准是 `lastLaunchAt`**，重试**不**更新时间戳（否则失败重试会把节流节奏打乱）。
4. **`onSettled` 必须严格早于 `pump()`**：这是「结果已展示 → 立即补发」的顺序要求，测试要用全局单调 seq 断言 `settled.seq < nextStart.seq`。
5. **只保留一个 `setTimeout`**：每次 `pump` 进入节流分支前先 `clearTimeout(timer)`，避免多个唤醒叠加造成突发。
6. **取消不 new 一套路径**：所有 await 点都在 `isCancelled` 时提前返回，由外层统一抛一次 `AiError('cancelled')`，避免 `Promise.all` 式多 rejection。
7. **不要把 `withRetry` 包进 `task.run`**：调度器自己重试（`retry=1`），叠加会变成 4 次（见风险 R13）。

### 4.4 与既有编排器的关系

| 既有 | 重构后 |
|---|---|
| `aiFullReading.runFullReading` 的 `Promise.all(batch)` 分批循环 | 删除批处理循环，改为 `runSlidingWindow(tasks, { maxConcurrency })`；事实块构造（`baseFacts/gateFacts/channelFacts/buildFusionInput/splitFusion`）**保留不动** |
| `aiFullReading` 的「失败项串行重跑」 | 由调度器 I5 承担（重试在同一槽内），不再需要第二遍串行重跑 |
| `aiBatchReading.runBatchReading` 的 `resolveSchedule` 分批 | 改为 `runSlidingWindow`；`buildBatchTasks` 保留；`BatchReport.scheduleInfo` 改为 `{ total, maxConcurrency, startedAt }` |
| `aiConcurrency.resolveSchedule` | **保留**（`aiBatchReading`/旧测试仍用），但不再由 UI 参数驱动；新增 `clampMaxConcurrency` / `validateMaxConcurrency`（1–99） |

---

## 5. 设置迁移规则

### 5.1 字段变更总表

| 旧字段（v3.5.0） | 新字段（v4.0.0） | 处置 |
|---|---|---|
| `aiConcurrency`（1–128，默认 3） | `aiMaxConcurrency`（1–99，默认 3） | **迁移来源** |
| `aiConcurrencyLimit`（1–128，默认 64） | — | **删除** |
| `aiTokenBudget`（0–100000） | — | **删除**（token 上限整体取消，请求恒 128000） |
| `aiStepMode`（serial/parallel） | — | **删除**（由 `aiMaxConcurrency` 推导：1→serial，>1→parallel） |
| `aiAudience`（pro/plain） | `aiStyle`（pro/plain） | **改名不改值**，语义反转见 §2.5 |
| `aiDetailMode` | `aiDetailMode` | 不变 |

`AiDetailMode` 的**取值不变**（`concise`/`detailed`/`full`），避免解读档案（`readings`）里的 `mode` 字段全量迁移。

### 5.2 `aiMaxConcurrency` 归一函数（加载期宽松归一）

```ts
export const AI_MAX_CONCURRENCY_MIN = 1
export const AI_MAX_CONCURRENCY_MAX = 99
export const DEFAULT_AI_MAX_CONCURRENCY = 3

export interface MaxConcurrencyMigration {
  value: number
  /** 存量值被收敛过：供一次性可见提示消费 */
  adjusted: boolean
  /** 被忽略的旧字段快照，仅用于生成提示文案 */
  legacy: { concurrency?: number; limit?: number }
}

export function normalizeMaxConcurrency(saved: {
  aiMaxConcurrency?: unknown
  aiConcurrency?: unknown
  aiConcurrencyLimit?: unknown
}): MaxConcurrencyMigration
```

**优先级与理由：**

1. `aiMaxConcurrency` 存在且为 1–99 整数 → 直接采用。
2. 存在但非法（非整数 / 越界 / 类型不符）→ clamp 到 `[1,99]` 取整，`adjusted = true`。
3. 缺失 → 取旧 `aiConcurrency`：合法整数且 1–128 → `Math.min(99, Math.max(1, c))`；若 `c > 99` 则 `adjusted = true`。
4. 旧 `aiConcurrency` 也缺失/非法 → 默认 `3`。**绝不**用 `aiConcurrencyLimit` 作为迁移源。

> **为什么不迁移 `aiConcurrencyLimit`：**旧语义里它是「技术闸门」（默认 64，几乎无人修改），不是用户意图表达；旧 `aiConcurrency`（默认 3）才是用户主动设定的「我想要几个并发」。把 64 迁成新语义会变成真实的 64 并发打向中转站，是灾难性误伤。旧约束 `1 ≤ c ≤ l` 保证 `c` 一定是用户看过并认可的值。

### 5.3 一次性可见提示（不静默丢意图）

复用既有 `takeConcurrencyMigrationNotice()` 机制（模块级变量 + 消费即清 + 不进 `SettingsState`、不持久化）：

| 触发条件 | 提示文案 |
|---|---|
| `adjusted === true` | 「检测到旧的并发配置，已调整为合法值：最高并发数 {value}，请确认后保存」 |
| `legacy.limit` 存在且 `≠ 64` | 「并发参数已合并为「最高并发数」；原「并发上限 {limit}」不再单独生效」 |
| `aiTokenBudget` 存在且 `> 0` | 「解读 token 上限已取消，不再限制输出长度；旧设置 {budget} 不再生效」 |
| `aiStepMode === 'serial'` 且迁移后 `value > 1` | 「多步编排方式已合并为「最高并发数」；如需串行请把最高并发数设为 1」 |

四条同时命中时合并成一条多行提示（一个 info toast），避免刷屏。

### 5.4 保存期严格校验

```ts
export function validateMaxConcurrency(raw: number): string | null
// 合法返回 null；否则返回行内文案：`最高并发数需为 1–99 的整数`
```

`stores/settings.setAiMaxConcurrency(v)`：先校验，失败**不写 store、不 persist、原值不变**（沿用既有条件①的写入闸门语义）；成功则赋值 + `persist()`。加载期宽松归一与保存期严格拒绝两套语义**不得混用**（既有 ARCH §11.2.2 口径）。

### 5.5 `persist()` 与存档键

- `hdt.settings.v1` 键名**不变**（避免整库备份/导入格式变更），只做字段级兼容：写入时**不再包含** 4 个已删字段，新增 `aiMaxConcurrency` / `aiStyle`。
- 旧备份导入时，这 4 个字段被当作未知字段忽略（`loadJson` 天然容忍），迁移逻辑在 `state()` 里统一执行。
- `aiStyle` 归一：`saved.aiStyle ?? saved.aiAudience`，只认 `'plain'` / `'pro'`，其余回落 `'pro'`。

---

## 6. 缓存键与版本

### 6.1 新缓存键组成

```
hdt.ai.cache.v2 : p4.0 : {ENGINE_VERSION} : {baseUrl} : {model} : {configTag}
                : {entry} : {scope} : {detail} : {style} : {ref} : {hash(offline + chartSummary)}
```

```ts
export function cacheKey(cfg: AiConfig, args: AiExplainArgs): string {
  const mode = resolveDetailMode(args.scope, args.detailMode)
  return [
    CACHE_PREFIX,                        // 'hdt.ai.cache.v2'
    `p${PROMPT_VERSION}`,                // 'p4.0'
    ENGINE_VERSION,
    cfg.baseUrl.trim(),
    cfg.model.trim(),
    hash(cfg.apiKey.trim()).slice(0, 8),
    args.entry,                          // ★ 新增：A/B/C 互不串档
    args.scope,
    mode,
    resolveStyle(args.style),            // ★ 替代 resolveAudience
    args.ref ?? '',
    hash(args.offline + (args.chartSummary ?? '')),
  ].join(':')
}
```

- `tokenBudget` 已不存在，**不**入键（旧口径「预算不进键」自然作废）。
- `entry` 必须入键：入口 B 与入口 C 可能产出相同 `scope/ref/dims`（例如都选了同一条通道），但提示词契约不同 → 不入键会串档。

### 6.2 `PROMPT_VERSION 3.4 → 4.0` 与旧缓存

1. `PROMPT_VERSION = '4.0'`（提示词 100% 重写，主版本号升级）。
2. `CACHE_PREFIX` 从 `hdt.ai.cache.v1` 升到 `hdt.ai.cache.v2`：双保险，且让 `clearAiCache()` 能分代清理。
3. 新增 `migrateAiCacheV1()`：扫描并删除所有 `hdt.ai.cache.v1*` 键，在 `settings.init()` 里调用一次（幂等）。**不清会影响 localStorage 配额**，且旧键永远不会再命中。
4. UI 提示（首次进入 AI 工作区，一次性）：「提示词已升级到 v4.0，旧缓存已清理；历史解读仍保留在「最近解读」中，可直接打开，不必重新生成。」
5. `docs/spec/AI-PROMPT-v3.0.md` 为新的逐字规范（v2.0 归档保留，加「已废弃，见 v3.0」头注）。

---

## 7. 数据结构定义（TypeScript 草案）

### 7.1 `src/types/aiReading.ts`（新增）

```ts
import type { AiDetailMode, BodyGraph } from './hd'
import type { ReadingDimKey } from '../services/chartFacts'

/** 三个 AI 入口（软件级，不是完整版内部子模式） */
export type AiEntry = 'full' | 'composite' | 'selection'

/** 表达风格（替代旧 AiAudience；值不变、语义反转见 ARCH §2.5） */
export type AiStyle = 'plain' | 'pro'

/** 请求范围标识（进缓存键；新增值只追加，不改既有） */
export type AiScope =
  | 'unified'              // 入口 B 单次
  | 'selection-one'        // 入口 C 单次（逐条 + 关联汇总在一篇里）
  | 'full-module'          // 入口 A ①④、入口 C 可选模块
  | 'full-all-channels'    // 入口 A ②（一次通解全部通道）
  | 'full-all-gates'       // 入口 A ③（一次通解全部闸门）
  | 'full-trajectory'      // 入口 A ⑤（5 方向 1 模块）
  | 'full-dimension'       // 入口 B 完整档分项 / 关系场维度
  | 'full-gate'            // 逐闸门
  | 'full-channel'         // 逐通道
  | 'full-fusion'          // A⑥ / B 融合 / C 汇总 / 关系场整合
  | 'single' | 'gate' | 'channel' | 'center' | 'chiron' | 'composite-*'  // 既有单点入口保留

/** 入口 C 的勾选对象 */
export interface SelectionPick {
  channels: string[]        // 通道 key，如 '20-34'
  gates: number[]           // 闸门号
  definition: boolean       // 勾选「定义状态」
  circuit: boolean          // 勾选「回路分布」
  cross: boolean            // 勾选「轮回交叉」
}

/** 解读方向：内置角度 或 用户自定义（自定义优先） */
export interface ReadingDirection {
  key: string               // READING_ANGLES 的 key，或 'custom'
  label: string
  prompt: string
  custom: string            // 非空时优先于 label/prompt
}

/** 一次解读请求（视图 → 计划器 的唯一入参） */
export interface ReadingRequest {
  entry: AiEntry
  detail: AiDetailMode
  style: AiStyle
  chart: BodyGraph
  /** 盘面摘要；缺省由 chartSummaryOf(chart) 生成，合盘由调用方注入 */
  chartSummary?: string
  /** 入口 B：勾选维度（按 READING_DIMENSIONS 顺序，不按点击顺序） */
  dims?: ReadingDimKey[]
  /** 入口 C：勾选对象 */
  selection?: SelectionPick
  /** 方向（A ⑥ 用 fusionAngle，C 可省略表示「不限方向」） */
  direction?: ReadingDirection
  /** 档案名：只用于标题，绝不进 prompt */
  archiveName: string
}

/** 计划里的一项任务 */
export interface ReadingTask {
  key: string
  title: string
  scope: AiScope
  ref: string
  /** 【离线释义】正文（事实块 + 方向 + 收束指令） */
  offline: string
  /** 报告分节类型 */
  kind: 'module' | 'gate' | 'channel' | 'dimension' | 'summary'
}

/** 请求 → 计划（纯函数，可单测） */
export interface ReadingPlan {
  entry: AiEntry
  detail: AiDetailMode
  /** true = 一次请求内按小节组织；false = 多请求 + 融合 */
  singleShot: boolean
  tasks: ReadingTask[]
  /** 末位融合任务；singleShot 时为 null */
  fusion: ReadingTask | null
  /** 报告标题（含档位与入口，供 UI 与导出页眉） */
  title: string
}

/** 运行期进度（扩展现有 AiProgress，保持其 8 字段不变，见 §10 测试约束） */
export interface ReadingProgress {
  done: number
  total: number
  current: string
  phase: string
  elapsedMs: number
  etaMs: number | null
  skipped: string[]
  failed: string[]
  /** 新增：当前在跑数 / 上限，供状态区展示起速过程 */
  inFlight: number
  maxConcurrency: number
}
```

### 7.2 `aiClient.ts` 的入参变更

```ts
export interface AiExplainArgs {
  cfg: AiConfig
  entry: AiEntry                 // ★ 新增
  scope: AiScope | string
  ref?: string
  offline: string
  chartSummary?: string
  detailMode?: AiDetailMode
  style?: AiStyle                // ★ 替代 audience
  /** 方向标签，注入【用户选择】 */
  angle?: string
  /** 入口 B 的白名单维度（渲染进 system 白名单段 + user【用户选择】） */
  dims?: ReadingDimKey[]
  signal?: AbortSignal
  onStage?: (event: AiStageEvent) => void
  onStream?: AiStreamEvents
  // tokenBudget 已删除
}
```

> `audience?: AiAudience` 作为**过渡别名**保留一个版本（内部 `resolveStyle(args.style ?? args.audience)`），让 `aiBatchReading.ts` 等调用点在 T02 迁移期间不立即爆红；T05 收尾时删除别名。

### 7.3 降级链

```ts
// src/services/aiTokenFallback.ts
/** 请求体统一上限 */
export const MAX_TOKENS_CEILING = 128000

/** 阶梯：逐级重试一次；末位 undefined = 不带该字段 */
export const MAX_TOKENS_LADDER: ReadonlyArray<number | undefined> =
  [128000, 64000, 32000, 16000, 8192, undefined]

export type MaxTokensStep = number | undefined

/** 是否为「max_tokens 越界」类拒绝（只认 400/422 + 明确的越界措辞） */
export function isMaxTokensRejection(status: number, bodyText: string): boolean

/** 下一档；已是末位返回 null（停止降级） */
export function nextMaxTokensStep(current: MaxTokensStep): MaxTokensStep | null

/** 统计降级次数，供日志与 UI 提示（不持久化、不跨请求） */
export interface FallbackTrace {
  tried: MaxTokensStep[]
  finalStep: MaxTokensStep
  degraded: boolean
}
```

**识别口径（必须写死，防误判）：**

```
isMaxTokensRejection(status, body) =
  (status === 400 || status === 422)
  && /max[_\s-]?tokens?|max_output_tokens|maximum context|context length|too many tokens|token limit|上下文长度|超出.*(上限|限制)/i.test(body)
  && !/invalid[_\s-]?api[_\s-]?key|unauthorized|model[_\s-]?not[_\s-]?found|insufficient[_\s-]?quota/i.test(body)
```

- body 为空 / 无越界措辞 → **不降级**（否则 Key 错误会被重试 6 次，把 401 变成 6 倍等待）。
- 降级状态只存在于 `explain()` 的栈内局部变量；**不写模块级、不缓存、不共享**，保证「只对本条请求降级、不污染其他并发任务」。
- 每一档仍是完整的一次 `aiHttpRequest`（含续写轮），超时预算 `deadline` 复用同一次解读的总超时，不因降级而重置。

### 7.4 报告结构扩展

```ts
// src/types/report.ts
export type FullSectionKind = 'module' | 'gate' | 'channel' | 'dimension'

export interface FullReport {
  title: string
  /** ★ 新增：本报告来自哪个入口，供导出页眉与「最近解读」筛选 */
  entry: AiEntry
  sections: FullReportSection[]
  fusion: string
  summary: string
  totalChars: number
  skipped: string[]
  generatedAt: string
}
```

> `AiProgress` 的 8 字段**保持不动**（QA-F2 用正则数 8 个字段）。新字段 `inFlight / maxConcurrency` 放在独立的 `ReadingProgress`，由 `useAiStatus` 消费，不进 `AiProgress`。

---

## 8. 文件改动清单

### 8.1 新增

| 文件 | 职责（一句话） |
|---|---|
| `src/types/aiReading.ts` | 三入口 / 六 scope / 请求 / 计划 / 进度的类型契约 |
| `src/services/aiPrompt.ts` | 五段提示词常量 + `systemPromptOf(ctx)` + `buildUserPrompt` 四段拼装 |
| `src/services/aiReadingPlan.ts` | 纯函数 `planReading(req)`：三入口 × 三档 → 任务清单 + 融合 + 标题 |
| `src/services/aiScheduler.ts` | 滑动窗口调度器（唯一并发执行点，含起速/补发/重试/取消） |
| `src/services/aiReadingRunner.ts` | 编排：计划 → 单次或调度 → 合并 → 进度/取消（取代 `runFullReading` 的执行部分） |
| `src/services/aiTokenFallback.ts` | `MAX_TOKENS_CEILING` / 阶梯 / `isMaxTokensRejection` / `nextMaxTokensStep` |
| `src/services/aiEvidence.ts` | 依据覆盖 / 维度白名单 / 条目覆盖三项检测（仅告警） |
| `src/components/ai/AiEntryTabs.vue` | 三入口切换（`role="tablist"`，键盘可达） |
| `src/components/ai/AiEntryAPanel.vue` | 入口 A 的 6 模块预览 + 启动（无维度勾选） |
| `src/components/ai/AiEntryBPanel.vue` | 入口 B 的维度 + 方向选择 |
| `src/components/ai/AiEntryCPanel.vue` | 入口 C 的闸门 / 通道 / 定义勾选 + 可选回路·交叉 |
| `src/components/ai/AiModuleList.vue` | 分项列表（标题 + 状态 + 折叠正文），A/B/C 完整档共用 |
| `src/components/ai/AiConcurrencyField.vue` | 「最高并发数 1–99」单字段控件（设置页与工作区共用） |
| `docs/spec/AI-PROMPT-v3.0.md` | 新提示词逐字规范（六段正文的 code block，测试逐字比对） |
| `docs/design/AI-v4.0.0-sequence-diagram.mermaid` | 入口 A 完整档调用序列 |
| `docs/design/AI-v4.0.0-class-diagram.mermaid` | 新增模块类图 |

### 8.2 修改

| 文件 | 改动要点 |
|---|---|
| `src/services/aiClient.ts` | 删四套正文与 `PROMPT_SYSTEM_AUDIENCE_*`、`applyTokenBudget`/`MIN_TOKEN_BUDGET`/`tokenBudget`；`PROMPT_VERSION='4.0'`；`explain()` 接 `aiPrompt` + 降级链 + `entry/style`；`cacheKey` 新组成；`clearAiCache` 带 v1 清理；`resolveRequestParams` 恒 128000 |
| `src/services/chartFacts.ts` | 新增 `buildChannelsOverviewFacts`（A②）、`buildGatesOverviewFacts`（A③）、`buildCentersCircuitFacts`（A④）、`buildTrajectoryFacts`（A⑤）、`selectionScopeRef`（C）；`buildUnifiedFacts` 保持顺序不变 |
| `src/services/readingAngles.ts` | 删除 `karma`→新增 `marriage`（姻缘情况）+ 新增 `development`（发展轨迹）；`angleOf` 保留 `'karma' → 'marriage'` 的只读兼容映射；新增 `MODULE_A5_DIRECTIONS` 常量 |
| `src/services/destinyText.ts` | `key:'karma'` 整章改写为「本世姻缘情况」（本世角度：关系模式、亲密需求、承诺方式、可观察信号），删除「前世 / 继承剧本」表述 |
| `src/services/aiConcurrency.ts` | 删除 `normalizeConcurrencyPair`/`validateConcurrencyPair`/`DEFAULT_AI_CONCURRENCY_LIMIT`；新增 `AI_MAX_CONCURRENCY_MIN/MAX`、`clampMaxConcurrency`、`validateMaxConcurrency`；`resolveSchedule` 保留 |
| `src/services/aiFullReading.ts` | 保留 `baseFacts/gateFacts/channelFacts/buildFusionInput/splitFusion/isRelationshipChart`；删除 `runFullReading` 的批处理循环与其对 `aiConcurrency*` 的依赖，改为委托 `aiReadingRunner` |
| `src/services/aiBatchReading.ts` | `runBatchReading` 改用 `runSlidingWindow`；删除 `tokenBudget`/`audience` 参数（改 `style`）；`BatchReport.scheduleInfo` 结构简化 |
| `src/services/aiRelationshipReading.ts` | 事实块与任务构造保留；`fusionAngle` 与 `full-fusion` 契约对齐（合盘禁个体结论条款移到 `PROMPT_CORE`，此处只保事实块） |
| `src/composables/useAiReading.ts` | `run()` 入参改为 `ReadingRequest`；`full` 分支改为调 `aiReadingRunner`；流式 hooks 与 `activeController` 语义不变 |
| `src/composables/useAiStatus.ts` | 分项阶段文案改为「最高并发数 N · 在跑 X / 总 T」；`terminalHint` 保留（QA-B3b 依赖） |
| `src/stores/settings.ts` | 删 4 字段、新增 `aiMaxConcurrency`/`aiStyle`；`normalizeMaxConcurrency` + 四类一次性提示；`init()` 调 `migrateAiCacheV1()` |
| `src/stores/ui.ts` | `aiReading` 增 `entry` / `dims` / `selection` 快照字段（供面板回显）；`setAiReport` 增 `entry` |
| `src/stores/readings.ts` | 记录 meta：`audience` → `style`，增 `entry`（旧记录缺失时按 `mode` 推断） |
| `src/views/AiWorkspaceView.vue` | 单入口 → 三入口 Tabs + 三个 Panel + `AiModuleList`；正文/进度/导出/最近解读保留 |
| `src/views/SingleChartView.vue` 等 5 个盘面视图 | 侧栏「AI 解读」的 `run()` 调用点改为传 `entry:'composite'` + 默认维度（保持既有行为等价） |
| `src/components/settings/SettingsForm.vue` | 删除「面向人群」「token 上限」「多步编排方式」「并发设置（双参数）」四块；新增「表达风格」两块文案 + 「最高并发数」单字段；详细度文案按新口径重写 |
| `src/types/hd.ts` | `AiAudience` → 标记 `@deprecated`，新增 `AiStyle`（值相同）；`AiStepMode` 保留但注明「不再持久化」 |
| `src/types/report.ts` | `FullSectionKind` 增 `'module'`；`FullReport` 增 `entry` |
| `docs/spec/AI-PROMPT-v2.0.md` | 顶部加废弃头注，指向 v3.0 |
| `docs/AI-WORKSPACE.md` | 三入口说明、并发语义、token 口径 |
| `docs/ARCHITECTURE.md` | §4.12 / §11 相关段落同步 |

### 8.3 「前世姻缘」清理清单（全库三处，必须同时改）

| 位置 | 现状 | 改为 |
|---|---|---|
| `readingAngles.ts` | `key:'karma'`, `label:'前世姻缘'`, prompt 里「继承而来的关系模式」 | `key:'marriage'`, `label:'姻缘情况'`, desc「本世的关系模式、亲密需求与承诺方式」, prompt「请聚焦姻缘情况：从设计侧（无意识）激活的闸门与通道出发，说明这个人在**这一生**的关系里容易被什么吸引、在亲密中自动扮演谁、承诺方式有什么特点，并给可观察的信号与可执行的调整。禁止使用『前世 / 宿命 / 注定』这类表述。」 |
| `destinyText.ts` | 整章 `key:'karma'` / `title:'前世姻缘'`，含「继承剧本」「所谓前世姻缘…」 | 整章改 `key:'marriage'` / `title:'姻缘情况'` / `desc:'本世的关系模式：看见它，才有调整的余地'`；四个 section 改「本世的关系起点（设计太阳）」「亲密里自动扮演的角色」「南北交与关系（南交熟悉感 vs 北交陌生感）」「可调整的三个动作」；删除全部「前世 / 继承 / 剧本 / 命中注定」措辞，保留「倾向而非判决」的温和收束 |
| `aiClient.ts` | `PROMPT_SYSTEM_FULL` 的「维度类分项」清单里含「前世姻缘」 | 随四套正文整体删除；新写的 `PROMPT_ENTRY_*` / `PROMPT_DETAIL_*` / `PROMPT_STYLE_*` 六段中**不得出现**「前世」二字 |

> 验收口径：`grep -r "前世" src/ docs/spec/AI-PROMPT-v3.0.md` 必须 0 命中（`docs/spec/AI-PROMPT-v2.0.md` 归档文件除外，由废弃头注说明）。

### 8.4 不删除但要「清空语义」的

| 文件 | 说明 |
|---|---|
| `src/services/aiTransport.ts` | 完全不动（含原生出网 / 流式解析） |
| `src/services/aiAttempt.ts` | `withRetry` 保留给 `aiBatchReading`/`aiClient` 内部；调度器自带重试，避免双重重试（**注意**：调度器调用 `task.run` 时必须传**未包 withRetry** 的裸调用，否则会 2×2=4 次） |
| `src/components/panel/AiReadingPanel.vue` | **零改动**（桌面冒烟契约：`data-zone A–E`、`aria-label="关闭"`、恰 3 处 `emit('cancel')`） |
| `src/components/panel/AiComposer.vue` | 保留但不再被工作区引用（v3.5.0 遗留）；若确认无引用可在 T04 删除，需先全库 grep |

---

## 9. 任务列表（有序 · 含依赖）

> 硬性上限 5 个任务；每个任务 ≥3 个文件；第一个任务是基础设施。T01 之后 T02 与 T04 可并行（T04 只依赖类型契约）。

### T01｜基础设施 + 提示词层 + 请求层　P0
**依赖：** 无
**文件：**
- 新增：`src/types/aiReading.ts`、`src/services/aiPrompt.ts`、`src/services/aiTokenFallback.ts`、`src/services/aiEvidence.ts`
- 修改：`src/services/aiClient.ts`、`src/types/hd.ts`、`src/types/report.ts`、`docs/spec/AI-PROMPT-v3.0.md`

**验收：**
1. `systemPromptOf({entry,detail,style,scope})` 六段拼装顺序正确，18 组合字符串两两不同。
2. `PROMPT_VERSION === '4.0'`；`cacheKey` 含 `entry` 与 `style` 段；前缀为 `hdt.ai.cache.v2`。
3. `resolveRequestParams(...)` 恒返回 `maxTokens === 128000`；`applyTokenBudget`/`MIN_TOKEN_BUDGET` 已删除。
4. `explain()` 遇到 400/422 + 越界措辞时按阶梯降级，且 `401`/`invalid_api_key` **不**触发降级。
5. `AI-PROMPT-v3.0.md` 里六段代码块与代码常量逐字一致。

### T02｜编排层：计划器 + 滑动窗口 + Runner + 事实块　P0
**依赖：** T01
**文件：**
- 新增：`src/services/aiReadingPlan.ts`、`src/services/aiScheduler.ts`、`src/services/aiReadingRunner.ts`
- 修改：`src/services/chartFacts.ts`、`src/services/readingAngles.ts`、`src/services/destinyText.ts`、`src/services/aiFullReading.ts`、`src/services/aiBatchReading.ts`、`src/services/aiConcurrency.ts`、`src/services/aiRelationshipReading.ts`

**验收：**
1. `planReading()` 三入口 × 三档的任务清单与 §3 表格逐项一致（请求数：精简/详细恒 1；A 完整 6；B 完整 N+1；C 完整 k+m+r+1）。
2. 调度器 I1–I10 全部被单测覆盖（fake timers 精确断言 `t=0/1000/2000` 的启动时刻与落定后立即补发）。
3. 入口 A ②③ 的 offline 分别只含「全部通道」「全部闸门」事实，无逐条请求。
4. `readingAngles` 已无 `前世姻缘`；`angleOf('karma')` 回落 `marriage`；`destinyText` 无「前世」字样。
5. `aiBatchReading` / `aiFullReading` 不再出现定批循环，全部走 `runSlidingWindow`。

### T03｜状态层：设置迁移 + 编排接线　P0
**依赖：** T01、T02
**文件：**
- 修改：`src/stores/settings.ts`、`src/stores/ui.ts`、`src/stores/readings.ts`、`src/composables/useAiReading.ts`、`src/composables/useAiStatus.ts`

**验收：**
1. `state()` 三个 return 分支均产出 `aiMaxConcurrency`（默认 3）与 `aiStyle`（默认 pro），4 个旧字段不再出现在 state。
2. `localStorage` 里 `aiConcurrency: 8, aiConcurrencyLimit: 64` 加载后 → `aiMaxConcurrency === 8`，并投递一次合并提示。
3. `aiConcurrency: 128` → `99` 且 `adjusted === true`；`aiConcurrency` 缺失 → `3`。
4. `setAiMaxConcurrency(0/100/3.5/'abc')` 全部 `false` 且不写 store、不改 localStorage；`setAiMaxConcurrency(1)` 使 `stepMode` 推导为 `serial`。
5. `useAiReading.run()` 接受 `ReadingRequest`，单次档只发 1 次 `explain`，完整档走 runner 且 `activeController`/取消语义不变。

### T04｜UI：三入口工作区 + 设置页　P1
**依赖：** T01（只需类型契约）
**文件：**
- 新增：`src/components/ai/AiEntryTabs.vue`、`AiEntryAPanel.vue`、`AiEntryBPanel.vue`、`AiEntryCPanel.vue`、`AiModuleList.vue`、`AiConcurrencyField.vue`
- 修改：`src/views/AiWorkspaceView.vue`、`src/components/settings/SettingsForm.vue`、`src/views/SingleChartView.vue`（+ 其余 4 个盘面视图的调用点）

**验收：**
1. 三入口切换后各自参数区互斥渲染，切换不丢已填参数（本地 reactive 保留）。
2. 入口 B 未勾任何维度 / 入口 C 未勾任何对象时，「生成解读」禁用并有说明文案。
3. 完整档生成时 `AiModuleList` 实时出现分项（按时长顺序）且最终按模块顺序重排。
4. 设置页：无「面向人群」旧文案（改为「表达风格」且 pro 的说明含「阐释术语」）、无 token 上限输入、无「并发上限 / AI 并发数 / 多步编排方式」、只有「最高并发数（1–99）」。
5. **`AiReadingPanel.vue` 一个字符都不改**（`data-zone A–E`、`aria-label="关闭"`、恰 3 处 `emit('cancel')` 静态断言必须仍通过）。

### T05｜测试改造 + 文档同步　P0
**依赖：** T02、T03、T04
**文件：**
- 新增：`tests/aiScheduler.test.ts`、`tests/aiReadingPlan.test.ts`、`tests/aiTokenFallback.test.ts`、`tests/aiEvidence.test.ts`、`tests/settings.migration.test.ts`、`tests/aiPromptLayers.test.ts`
- 修改：`tests/ai-prompt.test.ts`、`tests/ai-v250.test.ts`、`tests/aiClientContinuation.test.ts`、`tests/aiConcurrency.test.ts`、`tests/aiConcurrency.acceptance.test.ts`、`tests/aiFullReading.test.ts`、`tests/aiBatchReading.test.ts`、`tests/readings.test.ts`、`tests/aiStage.test.ts`、`tests/aiRelationshipReading.test.ts`、`docs/AI-WORKSPACE.md`、`docs/ARCHITECTURE.md`、`docs/spec/AI-PROMPT-v2.0.md`（废弃头注）

**验收：** §10 的「必须改」全部改完、「必须保留」全部仍绿、`npm run typecheck` 与 `npm run test` 全绿。

---

## 10. 风险表

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| R1 | `max_tokens: 128000` 只是「请求上限」，多数模型真实输出上限 8k/16k | 完整档长文仍会 `finish_reason='length'` | 保留续写（`MAX_CONTINUATIONS=2` 不变，最少能拿 ~24k tokens/条）；**不**把「未触顶」写进缓存判断之外；若验证期发现 A⑥ 融合经常 truncated，再评估提到 4（改动只在 `aiClient.ts` 一行） |
| R2 | 降级阶梯误判（把 401 / 余额不足当越界） | Key 错误被重试 6 次，用户等待 ×6 | 识别函数要求 **400/422 + 明确越界措辞 + 显式排除鉴权/余额措辞**；body 为空一律不降级（§7.3） |
| R3 | 起速语义副作用：N=99 时要 99 秒才满载 | 用户以为卡住 | UI 必须同时显示「在跑 X / 上限 N」「已启动 M / 总 T」「起速中（每秒 1 个）」三种信息；设置页 hint 明示「较大值需要较长时间才能满载」 |
| R4 | ②③「一次通解全部」时模型偷懒合并条目 | 漏解读闸门 / 通道 | `PROMPT_SCOPE_OVERVIEW` 硬条款 + `checkItemCoverage` 告警 + 报告分项标题渲染（用户可一眼看出漏了哪条） |
| R5 | 「依据铁律」让详细版变啰嗦、可读性下降 | 用户抱怨「像审计报告」 | 铁律只在 `detailed`/`full` 生效；提供段首共享依据（条款 5）降低重复；精简档明确无依据（§2.4） |
| R6 | 专业版风格反转（旧「不必解释」→ 新「必须阐释」）漏改 | 直接违反需求 | `PROMPT_STYLE_PRO` 第一条即写「第一次出现必须阐释」，并在 §2.5 红字提醒；`tests/aiPromptLayers.test.ts` 断言旧文案 `读者已熟悉人类图术语` **不得出现** |
| R7 | 删除 `aiStepMode` 引发大范围测试改动 | 工期 | T05 统一处理；编排器签名保留 `stepMode?` 可选参数，把改动集中到设置层 |
| R8 | 缓存前缀升 v2 → 全量冷启动 | 用户首次生成变慢 / 耗额度 | `migrateAiCacheV1` 清旧键 + 一次性 UI 说明；「最近解读」记录不受影响可直接打开 |
| R9 | 三入口 UI 改动误伤 `AiReadingPanel.vue` 冒烟契约 | 桌面冒烟测试红 | T04 验收第 5 条硬性要求 + QA-B4 静态断言作为守卫；新 UI 全部放在 `views/` 与 `components/ai/`，不碰 `components/panel/` |
| R10 | 调度器 `pump()` 重入导致超发（>N） | 打爆中转站限流 | `pumpScheduled` 标志 + `queueMicrotask`；I2/I8 单测用「同步连续落定 10 个」构造最坏场景 |
| R11 | 入口 C 完整档勾选过多（如 40 项）→ 请求数爆炸 | 额度与时长失控 | UI 在入口 C 显示预计请求数（`planReading(req).tasks.length + 1`）并在 > 20 时二次确认 |
| R12 | 旧解读档案里 `ref` 含 `karma` 角度键 | 打开旧记录时角度回落成「综合解读」 | `angleOf` 保留 `karma → marriage` 映射；`readings` 记录不改写（历史保真） |
| R13 | `aiAttempt.withRetry` 与调度器重试叠加 | 单任务实际重试 4 次 | 调度器入参 `run` 必须是裸 `explain` 调用；`aiReadingRunner` 显式不使用 `withRetry`（代码注释 + 单测断言 `attempts ≤ 2`） |

---

## 11. 测试改动清单

### 11.1 必须改（断言与新口径冲突）

| 文件 | 具体改动 |
|---|---|
| `tests/ai-prompt.test.ts` | ① 「四套全文与规范文档逐字一致」→ 改为「六段分别与 `AI-PROMPT-v3.0.md` 对应代码块逐字一致」；② `expect(PROMPT_VERSION).toBe('3.4')` → `'4.0'`；③ `systemPromptOf('concise')` 等 5 处签名断言改为对象入参；④ 采样参数断言（1500/6000/8000/4000/4500）→ 全部改为 `128000`；⑤ 合盘/凯龙 temperature 断言保留（0.60 / 0.55 不变）；⑥ 新增「旧 pro 文案不得出现」「`读者已熟悉人类图术语` 已删除」；⑦ 缓存键断言新增 `entry`/`style` 段与 `hdt.ai.cache.v2` 前缀 |
| `tests/ai-v250.test.ts` | 整个「① 单份 token 总预算」describe 删除，替换为「token 上限已移除：任何 scope/档位 `maxTokens === 128000`，`applyTokenBudget`/`MIN_TOKEN_BUDGET` 不再导出」；`audience:'plain'` → `style:'plain'`；`normalizeTokenBudget`/`MAX_TOKEN_BUDGET` 断言删除 |
| `tests/aiClientContinuation.test.ts` | `maxTokens >= 8000/4000` → `=== 128000`；**续写机制断言（`finish_reason='length'` 三轮拼接、触顶标 `truncated=true`、触顶不写缓存）全部保留** |
| `tests/aiConcurrency.test.ts` | 双参数对（`normalizeConcurrencyPair`/`validateConcurrencyPair`/`DEFAULT_AI_CONCURRENCY_LIMIT`）相关 describe 全部删除，替换为 `clampMaxConcurrency` / `validateMaxConcurrency`（1–99） |
| `tests/aiConcurrency.acceptance.test.ts` | QA-A（一次性并发/批次=1）、QA-B1/B2/B3a（K 批降级与 N/Y/K 文案）语义已被滑动窗口取代 → 重写为「起速 1/s、满载即补、落定顺序」；QA-B3b（`useAiStatus.terminalHint` 常驻）与 **QA-B4（`AiReadingPanel.vue` 五区静态契约，含恰 3 处 `emit('cancel')`）必须原样保留**；QA-D1/D2（拒绝保存）改单字段；QA-D3/D4（三分支默认值 + 一次提示）改为 `aiMaxConcurrency`；QA-D5「persist 只含两个 concurrency 字段」→ 只含 `aiMaxConcurrency` 一个；QA-F2（`AiProgress` 8 字段 + `PROMPT_VERSION='3.4'` + 29.875/302.000）→ 版本断言改 `'4.0'`，**8 字段与两个锚点数字不动** |
| `tests/aiFullReading.test.ts` | `runFullReading` 的定批断言 → 迁移为 `aiReadingPlan.test.ts`（清单快照）+ `aiScheduler.test.ts`（时序）；`buildFullTasks`/`buildFusionInput`/`splitFusion` 的纯函数断言**保留** |
| `tests/aiBatchReading.test.ts` | `tokenBudget: 1200` 传参与断言删除；`audience` → `style`；`scheduleInfo` 结构断言更新 |
| `tests/readings.test.ts` | 记录 meta 字段 `audience` → `style`，新增 `entry`；旧记录缺 `entry` 时的推断断言新增 |
| `tests/aiStage.test.ts` | 若含「按上限 X 分 K 批」「设定并发数 X / 上限 Y」文案断言 → 改为「最高并发数 N · 在跑 X」 |
| `tests/aiRelationshipReading.test.ts` | 保留事实块与任务清单断言；`fusionAngle` 文案不变；新增「合盘不出现个体结论」的 prompt 段来源断言（移到 `PROMPT_CORE`） |

### 11.2 必须保留（一个字都不能动）

| 项 | 位置 |
|---|---|
| `data-zone="A"`…`data-zone="E"` 五区 | `AiReadingPanel.vue`（QA-B4） |
| `aria-label="关闭"`、`role="status" aria-live="polite"` 恰 1 处、`class="progress-wrap"` 恰 1 处 | 同上 |
| `emit('cancel')` **恰 3 处** | 同上 |
| `AiProgress` **8 个字段** | `src/types/report.ts`（QA-F2） |
| `29.875` / `302.000` | `src/engine/mandala.ts` |
| 防幻觉差集 `validateAiReplyFacts` 的全部 4 个用例 | `tests/ai-prompt.test.ts` |
| 四段顺序「【盘面事实】→【用户选择】→【离线释义】→【本次任务】」及各出现一次 | 同上 |
| `finish_reason='length'` 续写三轮 + 触顶不写缓存 + `truncated` 标记 | `tests/aiClientContinuation.test.ts`、`ai-v250` |
| 取消语义（不进入融合、不伪造、已完成项保留） | `aiConcurrency.acceptance` QA-E2/E3/E4 |
| 合盘禁输出类型/权威/定义/轮回交叉 | `aiRelationshipReading` + prompt 段 |

### 11.3 必须新增

| 文件 | 覆盖 |
|---|---|
| `tests/aiScheduler.test.ts` | I1–I10；fake timers 断言前 N 个任务的启动时刻恰为 `0 / 1000 / 2000ms`；`onSettled.seq < 下一个 onStart.seq`（落定即补）；同步连续落定 10 个仍 `inFlight ≤ N`；`N=1` 无 1s 空档；`retry` 使 `attempts ≤ 2`；取消保留已落定结果且不启动新任务；定时器零残留 |
| `tests/aiReadingPlan.test.ts` | 三入口 × 三档的 `tasks.map(t => t.ref)` 快照；`singleShot` 标志；B 的白名单串与 C 的勾选清单渲染 |
| `tests/aiTokenFallback.test.ts` | 阶梯逐级；401/`invalid_api_key`/空 body 不降级；末位为 `undefined`（请求不含该字段）；降级不外泄到第二个并发请求 |
| `tests/aiEvidence.test.ts` | 依据覆盖（有/无依据段落、共用依据、中心名依据）；维度白名单告警；条目覆盖（20 条闸门漏 1 条） |
| `tests/settings.migration.test.ts` | §5.2 的 4 条优先级 + §5.3 的 4 类提示 + 严格校验拒绝路径 + 旧字段不出现在 persist |
| `tests/aiPromptLayers.test.ts` | 18 组合两两不同；拼接顺序（用段落首行的段名标记断言）；`style` 覆盖 `detail` 的冲突裁决；旧 `读者已熟悉人类图术语` 已消失 |

---

## 12. 实施顺序建议（给工程师的排期提示）

1. **T01 先落 `aiPrompt.ts` + `AI-PROMPT-v3.0.md`**：提示词是本需求的最终产物，先定稿再写代码能省掉两轮返工（`tests/aiPromptLayers.test.ts` 可作为定稿门禁）。
2. **T02 的 `aiScheduler.ts` 独立开发、独立测**：它不依赖任何人类图业务，可以用纯 `Promise` + fake timers 写完再接入，风险最低。
3. **T03 与 T04 可并行**：T04 只依赖 T01 的类型契约，不必等编排层。
4. **每完成一个 T，先跑 `npm run typecheck`**：类型是这次重构最强的守卫（`AiScope` 联合类型 + `ReadingRequest` 必填字段能挡住绝大多数漏改）。

---

## 13. 最关键的 3 个设计决定（200 字以内）

1. **「一次 vs 多次」收敛为运行策略**：三入口共用 `planReading()`，精简/详细档恒返回单任务（一次传全部资料、单次生成），只有完整档拆模块 + 末位融合。提示词改为「基础 + 入口 + 档位 + 风格 + 范围」五段拼装，18 种组合全部进缓存键。
2. **token 上限整体删除，降级是局部阶梯**：请求恒传 `max_tokens: 128000`，遇 400/422 越界按 128000→64000→32000→16000→8192→省略逐级重试，状态只活在 `explain()` 栈内，绝不跨请求共享，避免一条失败污染全部并发。
3. **并发收敛为一个旋钮 + 滑动窗口**：删除并发数 / 并发上限 / 多步编排三项，只留「最高并发数 1–99」；调度器语义为「起速每秒 1 个直到在跑 N，落定即补」，串行就是 N=1。
