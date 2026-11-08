# HumanDesignTool v2.3.0 · AI 并发能力增量 PRD

> **文档性质**：**增量 PRD**，只描述本次新增的 AI 并发能力变更部分。
> **不重写、不修改**已落盘的 `docs/design/PRD-v2.3.0-全站页面重设计.md`；原 PRD 的全部章节、AC-1～AC-32、R-1～R-8、AI-01～AI-11、P0/P1/P2 继续有效，本文只对其做**追加与局部口径补充**。
> **撰写人**：产品经理 许清楚（Xu）　|　**适用语言**：简体中文　|　**目标版本**：v2.3.0
> **本阶段产出**：仅文档，未修改任何代码或配置；编译 / 打包 / 发布仍按原 PRD P0-7、P0-8 与 AC-29～AC-32 执行。
> **下游读者**：架构师高见远 → 工程师

---

## 0. 变更定位

| 项 | 内容 |
| --- | --- |
| 触发来源 | 用户在原 PRD 基础上新增的明确需求：「首先优先补全并实现 AI 并发能力」 |
| 变更性质 | ① 设置页新增 2 个配置项（属于用户在设置页改动范围内，**不算新增无关功能**）；② 完整版多轮编排的并发调度规则变更（由固定 3 个一批 → 条件满足时一次性并发）；③ 融合步骤明确为例外；④ AI 面板状态区文案与数值扩展 |
| 不变的部分 | 人类图计算规则与数据结构、AI 解读业务内容与口径、解读三档语义、导出格式、报告结构、路由与页面数量、`.workbuddy/` |
| 与原 PRD 的冲突处理 | 原 PRD P1-4 中「串行/并发」作为既有能力保留；P2-7「不新增 AI 配置项」这条**在本文范围内被用户新需求显式覆盖**：仅允许新增本文定义的 2 个配置项，其余 P2 条目一律继续生效 |

---

## 1. 变更总览（一句话 + 变更点清单）

> **一句话口径**：在设置页提供「AI 并发数」与「并发上限」两个整数配置；当且仅当「本次任务所需并发数 ≤ 并发上限」时，完整版编排中除最终大总结外的全部可并行任务**一次性并发执行**（不再按 3 个一批分批）；最终大总结不参与并发，待所有并发任务完成（含失败跳过项）后作为最后一步单独执行；两类超限分别按「拒绝保存并提示」与「允许继续、收敛批宽并明确反馈」处理，全程不静默截断、不丢任务、不伪造内容。

| 编号 | 变更点 | 影响面 | 章节 |
| --- | --- | --- | --- |
| CH-1 | 新增 `aiConcurrency`（AI 并发数）与 `aiConcurrencyLimit`（并发上限）两个配置项 | `stores/settings.ts`、`hdt.settings.v1`、`SettingsForm.vue` | 2 |
| CH-2 | 定义「任务所需并发数」并厘清与 `aiStepMode`、`PARALLEL_CONCURRENCY=3`、`AiProgress` 的关系 | `services/aiFullReading.ts`、`types/report.ts` | 3 |
| CH-3 | 两类超限的触发条件、唯一处理口径、反馈文案与状态 | 设置页、AI 面板状态区 | 4 |
| CH-4 | 一次性并发范围与「并发失败自动转串行」共存规则 | `runFullReading()` 编排 | 5 |
| CH-5 | 最终大总结（full-fusion / 关系场融合）作为例外步骤 | `runFullReading()` 融合段 | 6 |
| CH-6 | 设置页 UI 落位与 AI 面板状态区扩展 | `SettingsForm.vue`、`AiReadingPanel.vue` | 7 |
| CH-7 | 独立编号验收标准 AC-C1～AC-C19 | 全量验收 | 8 |

---

## 2. 两个配置项定义

### 2.1 字段表（准确名称与取值）

| 项 | **AI 并发数** | **并发上限** |
| --- | --- | --- |
| **字段名（唯一）** | `aiConcurrency` | `aiConcurrencyLimit` |
| **中文标签（唯一）** | AI 并发数 | 并发上限 |
| **类型** | 整数 | 整数 |
| **含义** | 用户为「完整版多轮编排」设定的**期望并发度**。它是用户偏好值与合法性校验对象；在「任务所需并发数 ≤ 并发上限」判定通过时，**不用于把任务切片分批**，实际一次性在途数 = 任务所需并发数 | 单次编排允许**一次性并发的任务数硬上限**，也是判定「是否一次性并发」与两类超限的唯一闸门 |
| **取值范围** | 1–128 | 1–128 |
| **默认值** | `3` | `64` |
| **默认值依据** | 沿用现有 `PARALLEL_CONCURRENCY = 3`，保证旧配置迁移后行为不突变 | 覆盖典型单人整盘任务规模（8 维度 + 已激活闸门 + 已成型通道，通常 40–60 项）；关系场任务更多时可能触发条件 ②，用户可提高上限 |
| **持久化位置** | `localStorage` key `hdt.settings.v1`（`src/stores/settings.ts` 的 `KEY`），作为顶层字段由 `persist()` 写入；与 `aiDetailMode`、`aiStepMode`、`appearance`、`precision` 同级 | 同左 |
| **读取/迁移范式** | 沿用 `normalizeDetailMode()` / `normalizeStepMode()` 范式新增归一化函数：缺失、非整数、越界一律回落默认值 | 同左 |
| **设置页控件** | 数字输入（`inputmode="numeric"`）+ 范围提示 + 行内错误 | 同左 |
| **是否进入备份导出** | 否。`SettingsView.exportAll()` 只导出档案 JSON（不含 AI Key），设置项不参与导入导出，原 PRD P1-1 保持不变 | 同左 |

### 2.2 二者关系（唯一约束式）

```
1 ≤ aiConcurrency ≤ aiConcurrencyLimit ≤ 128
```

- 用户设定的「AI 并发数」**不得超过**「并发上限」；违反时按第 4 章条件 ① 处理。
- 两个字段互相独立存储，不存在派生关系；`aiConcurrencyLimit` 不随 `aiConcurrency` 自动变化。
- `aiConcurrency` **不是**「一次性并发」的判定闸门：即使 `requiredConcurrency > aiConcurrency`，只要 `requiredConcurrency ≤ aiConcurrencyLimit`，仍一次性全发（见 4.3 补充判定）。

### 2.3 与既有字段的关系

| 既有对象 | 关系 |
| --- | --- |
| `aiDetailMode: 'concise' \| 'detailed' \| 'full'` | 不变。仅 `full` 档会进入完整版编排；`concise` / `detailed` 为单次解读，不读取并发配置 |
| `aiStepMode: AiStepMode = 'serial' \| 'parallel'` | 枚举值不变、不新增。`parallel` 应用本文全部变更；`serial` 不受影响（见 5.3） |
| `AiConfig` / `AiProfile`（`types/hd.ts`） | **不改动**。两个并发项是**全局设置**，不进入单条 AI 配置 profile，不随切换 profile 变化 |
| `hdt.settings.v1` 现有字段 | 全部保留；仅追加两个顶层 number 字段 |
| `SettingsView.exportAll()` / `parseBackup()` | 不改动；备份只含档案 |

---

## 3. 「任务所需并发数」定义与既有对象关系

### 3.1 定义（唯一）

> **任务所需并发数 `requiredConcurrency` = 本次完整版编排中「可并行任务」的数量 = 本次 `FullReadingPlan.tasks`（未注入时取 `buildFullTasks(chart)`）产出的任务数 `tasks.length`，不含最终大总结 / 融合步骤。**

| 编排场景 | `requiredConcurrency` 的构成 | 来源 |
| --- | --- | --- |
| 单人整盘（完整档） | 8 个 READING_ANGLES 维度 + `chart.gates.length` 个逐闸门 + `chart.channels.length` 条逐通道 | `buildFullTasks()`（`src/services/aiFullReading.ts:186`） |
| 合盘 / 双盘对比（完整档，关系场） | 合盘既有 6 个解读维度（+ 用户自定义维度） + 四类连接动力学（`REL_ORDER`，4 项） + 逐共享闸门（`r.sharedGates.length`） + 逐合并通道（`r.merged.channels.length`） | `buildRelationshipTasks()` → `relationshipFullPlan()`（`src/services/aiRelationshipReading.ts:213/280`） |
| 最终大总结 | **不计入**，`scope='full-fusion'`（关系场 `fusionAngle='关系场整合分析与最终总结论'`） | `runFullReading()` 融合段（`aiFullReading.ts:445`） |
| 单次解读 | **无此概念**（不进入编排） | 精简/详细档、单点闸门/通道/中心解读、凯龙回归盘解读 |

- 判定发生在**发起解读时、编排开始前**（`runFullReading()` 入口、`while` 循环之前），取的是本次实际任务清单长度，不用估算、不取历史值。
- `requiredConcurrency` 是**运行时计算值，不持久化**、不写入 `hdt.settings.v1`。

### 3.2 与 `PARALLEL_CONCURRENCY = 3` 的关系（分批语义废止）

现有 `src/services/aiFullReading.ts:43` 的 `PARALLEL_CONCURRENCY = 3` 有两处用途：

| 现用途 | 位置 | 变更后口径 |
| --- | --- | --- |
| 固定批宽：`pending.splice(0, PARALLEL_CONCURRENCY)` | `aiFullReading.ts:422` | **废止**。不再按 3 个一批切批；未超限时一次性发起全部 `requiredConcurrency` 项 |
| ETA 估算的 `divisor` | `aiFullReading.ts:345` | 由固定 3 改为**本次实际一次性并发数 N**（未超限）或**收敛后的批宽 Y**（条件 ② 降级） |

- 常量值 `3` 保留为 `aiConcurrency` 的**默认值来源**（保证旧配置迁移后用户看到的设定值与历史一致），但不再参与任何分批计算。

### 3.3 与 `AiProgress` 的关系（结构不变）

`src/types/report.ts` 的 `AiProgress { done, total, current, phase, elapsedMs, etaMs, skipped, failed }` **8 个字段、结构、语义全部不变，不新增字段、不改数据结构**（符合不做清单）。

| 字段 | 变更后表现 |
| --- | --- |
| `total` | 仍 = `tasks.length + 1`（`+1` 为融合），即 `requiredConcurrency + 1` |
| `done` | 分项阶段 0 → N；融合阶段 N → N+1 |
| `current` | 一次性并发时显示批次概览（如「一次性并发 12 项」），融合阶段显示融合任务名 |
| `phase` | 文案扩展为「分项解读（一次性并发 N 项）」「分项解读（按上限 Y 分 K 批）」「并发失败，失败项改串行重跑」「全盘整合分析（最后一步，单独执行）」「已完成」；关系场融合用「关系场整合分析与最终总结论（最后一步，单独执行）」 |
| `elapsedMs` | 不变 |
| `etaMs` | 不变（只把 divisor 从 3 改为 N 或 Y） |
| `skipped` / `failed` | 语义不变；**超限期降级不记入 skipped**（降级不是失败） |

---

## 4. 超限触发条件与唯一处理口径

### 4.1 逐条可判定的触发条件

| 编号 | 触发条件（布尔式） | 触发时机 | 判定位置 |
| --- | --- | --- | --- |
| **①** | `aiConcurrency > aiConcurrencyLimit` | **保存配置时**（设置页数字输入失焦校验 / 点击保存） | 设置页表单校验 + `setAiConcurrency*` 写入前 |
| **②** | `requiredConcurrency > aiConcurrencyLimit` | **发起解读时**（点击「全盘 AI 解读」/「生成「某维度」解读」之后、编排循环开始之前） | `runFullReading()` 入口 |

**补充判定（必须明确，避免误当闸门）**：`requiredConcurrency > aiConcurrency` 但 `requiredConcurrency ≤ aiConcurrencyLimit` 时，**不触发任何超限**，仍按一次性并发执行；`aiConcurrency` 只作设定值展示，不切片。

### 4.2 唯一处理口径（分场景组合，已定，不再二选一）

| 条件 | 处理规则 | 用户可见反馈 | 状态 | 是否仍允许继续发起解读 |
| --- | --- | --- | --- | --- |
| **① 配置非法** | **拒绝保存并提示**：不写入 `hdt.settings.v1`、不更新 store、保留原生效值；不自动收敛、不静默截断 | 行内错误：`AI 并发数不能超过并发上限（当前上限 Y），请调小并发数或调大上限`；错误 toast：`保存失败：AI 并发数不能超过并发上限`；保存按钮不禁用（可再次修改重试），但每次提交均被拒 | 错误态（红色行内提示 + error toast），无成功 toast | **允许**：当前生效的仍是上一次合法配置，用户可直接离开设置页继续解读；设置页须明确显示「配置未保存」 |
| **② 任务超限** | **允许继续发起，调度批宽自动收敛到 `aiConcurrencyLimit` 并明确反馈**：按上限 Y 为批宽分 `K = ceil(N / Y)` 批执行；**全部 N 项任务一个不少、不跳过、不截断、不伪造**；融合仍最后单独执行 | 状态区常驻提示：`本次需并发 N 项，超过并发上限 Y，已按上限 Y 分 K 批执行（全部 N 项都会执行，不会减少）；可在设置页提高并发上限以启用一次性并发`；另发一次 info toast；报告完成态/页眉保留一行同义提示 | 进行中常驻提示 + 完成后保留，不自动消失 | **允许**（按降级方式完成）；用户也可改为「串行」档或提高上限后重新发起 |

> 口径说明：选「拒绝保存 / 允许继续但收敛」这一组合，是因为 ① 属用户配置错误，静默收敛会掩盖误设；② 属任务规模超出保护闸门，直接拒绝会让大盘用户完全用不了并发档。**两者都不得以「丢弃多余任务」实现收敛**——收敛的只是「单批在途任务数」，任务总数恒为 N。

### 4.3 未超限时的状态文案

| 场景 | 状态区文案（示例） |
| --- | --- |
| `parallel` 且 `N ≤ Y` | `分项解读（一次性并发 N 项）· 设定并发数 X / 上限 Y · 已等待 T s` |
| `parallel` 且 `N > Y` | 采用 4.2 条件 ② 的常驻提示 + `分项解读（按上限 Y 分 K 批）` |
| 融合阶段 | `全盘整合分析（最后一步，单独执行）` / `关系场整合分析与最终总结论（最后一步，单独执行）` |
| `serial` | `分项解读（串行）· 并发设置不生效`（不显示一次性并发字样） |

---

## 5. 一次性并发范围

### 5.1 判定与执行（唯一）

```
若 aiStepMode === 'parallel' 且 requiredConcurrency ≤ aiConcurrencyLimit：
    在同一批次一次性发起全部 requiredConcurrency 个可并行任务（批次数 = 1）
    实际同时在途请求数 = requiredConcurrency
    不按 3 个一批、不按 aiConcurrency 切片、不留「剩余待启动」队列
否则按第 4 章条件 ② 或 5.3 串行档处理
```

### 5.2 可并行任务范围（全部覆盖，不得遗漏）

| 场景 | 一次性并发的任务 |
| --- | --- |
| 单人整盘（完整档） | 8 个维度（综合/成长/扎根/驱动/人生轨迹/未来形势/前世姻缘/事业）、逐已激活闸门、逐已成型通道 |
| 合盘 / 双盘对比（完整档） | 合盘既有 6 个解读维度（含自定义维度）、四类连接动力学、逐共享闸门、逐合并通道 |
| **不参与** | 最终大总结 `full-fusion` / 关系场融合（见第 6 章） |

> 不改变任何任务的提示词、事实块、口径约束与输出内容；只改变「同时发起的调度方式」。

### 5.3 各档位受影响情况（逐项明确）

| 档位 / 场景 | 是否受本次变更影响 | 行为 |
| --- | --- | --- |
| `aiStepMode = 'parallel'` + `aiDetailMode = 'full'` + 整盘类请求（单人整盘 / 合盘 / 双盘对比） | **是（本次核心）** | 按 5.1 一次性并发；超限时按 4.2 条件 ② 降级；融合最后单独执行 |
| `aiStepMode = 'serial'` | **否** | 仍逐项串行（`while` 串行分支不变）；两个并发配置可保存、可查看，但标注「串行档不生效」；融合仍最后单独执行；`total` 仍 = N+1 |
| 单次解读：`concise` / `detailed` 档；单闸门 / 单通道 / 单中心「AI 深度解读」；`selection` 批量解读；凯龙回归盘解读 | **否** | 本来只发 1 次 `explain()`，不进入 `runFullReading()`、无任务清单、无并发判定、无融合步骤；不读取两个并发配置 |
| 未配置 AI / 配置校验失败 | **否** | 仍按原 PRD AI-11 / AC-24 拦截，不进入编排、不产出任何正文 |

### 5.4 「并发失败自动转串行」保留与共存（唯一口径）

现有策略（`aiFullReading.ts:437-442`）：任一项失败 → `mode='serial'`，把失败项与剩余未启动项重新排队逐个重跑。**保留该保护策略**，但与一次性并发按以下方式共存：

1. 全部 N 项**先在同一批次一次性并发**发起，不存在「剩余未启动任务」。
2. 批次结束后，仅对「重试 1 次后仍失败」的失败项，改为**串行逐个重跑 1 次**（仍复用 `withRetry()` 的单次重试规则，`phase` 显示「并发失败，失败项改串行重跑」）。
3. 重跑仍失败 → 记入 `skipped` / `failed`，**继续**后续流程（含融合），不阻断、不伪造。
4. 成功的任务**不重跑**；不存在「因一次失败把未启动任务改串行」的分支。
5. 取消（AbortSignal）优先于失败补救：取消时立即抛出，不做串行重跑。

> 这样「一次性并发」与「失败自动转串行」不冲突：前者定义**首次发起方式**，后者定义**失败项补救方式**。

---

## 6. 例外步骤：最终大总结

### 6.1 位置关系（保持现有位置，明确不可并入并发）

`runFullReading()`（`src/services/aiFullReading.ts`）现有结构：

```
tasks = options.tasks ?? buildFullTasks(...)          // N 项可并行任务
total = tasks.length + 1                              // +1 = full-fusion
while (pending.length) { ... }                        // ← 本次变更只作用于这一段的调度方式
publish(fusionAngle, '全盘整合分析')                  // ← 融合在循环「之后」
raw = await withRetry(explain({ scope:'full-fusion', ref:'fusion', ... }))
splitFusion(raw) → fusion / summary
done = total; publish('已完成', '已完成')
```

| 要求 | 产品口径 |
| --- | --- |
| 不参与并发 | 融合**不计入** `requiredConcurrency`、不进入一次性并发批次、不与任何分项请求同时发起；`scope='full-fusion'` 请求数恒为 1 |
| 触发时机 | 必须**晚于所有 N 个分项完成**（含成功项、重试后仍失败的跳过项、降级批次的全部批次、失败项串行重跑）之后才开始 |
| 进度表达 | `AiProgress.total = N + 1`；分项阶段 `done ≤ N`；融合阶段单独由 N → N+1，`phase` 明确标注「最后一步，单独执行」 |
| 输入不变 | 仍由 `buildFusionInput(orderedSections(), skipped)` 提供每项前 300 字要点 + 标题；跳过项明确写入「请勿据此推断」；**不改融合提示词、不改业务口径** |
| 关系场 | `fusionAngle = '关系场整合分析与最终总结论'`，仍走 `scope='full-fusion'`，同样最后单独执行；不输出类型/权威/轮回交叉等个体结论 |

### 6.2 取消 / 失败行为

| 情况 | 行为 |
| --- | --- |
| 分项阶段取消 | 不进入融合；不产出 `fusion` / `summary`；不写占位文本；已成功分项按现有 `useAiReading` 逻辑保留旧内容，面板显示「已取消」终态（原 PRD AI-03 / AC-17） |
| 融合阶段取消 | 融合请求中断，`fusion=''`、`summary=''`；不伪造融合内容；不把已成功分项误标为整体成功 |
| 分项失败 / 跳过 | 融合照常执行，但输入中明确列出未完成分项并禁止推断；不因跳过项而跳过融合 |
| 融合失败 | 沿用现状：重试 1 次仍失败则 `skipped.push('全盘整合与最终总结论')`、`fusion=''`、`summary=''`，报告仍由分项构成；状态区显示失败原因 |
| 条件 ② 降级 | 融合仍在全部 K 批完成后单独执行，**降级不改变融合的例外地位** |
| 未配置 AI | 不进入编排、不产出任何正文（原 PRD AI-11 / AC-24） |

---

## 7. 与页面重设计的关系（仅产品口径，不写实现代码）

### 7.1 设置页 UI 落位

| 项 | 口径 |
| --- | --- |
| 落位 | `SettingsForm.vue` 的「AI 配置」分节 → `.detail-mode`（解读详细度）→ `.step-mode`（多步编排方式，**现有行 528–545**）**之后**新增「并发设置」子块；**不新增分节、不新增页面、不新增路由** |
| 控件 | 两个数字输入 + 范围提示「1–128 的整数」+ 关系说明「AI 并发数不得超过并发上限」+ 行内错误提示；沿用 `HdField` / `type="number"` / `inputmode="numeric"` 与现有校验范式 |
| 生效条件 | 仅当 `aiDetailMode !== 'concise'` 且 `aiStepMode === 'parallel'` 时可编辑；其余情况**显示但禁用**并标注「仅并发档生效」，不隐藏（避免用户找不到） |
| 保存反馈 | 合法 → 成功 toast（≤3s）+ 立即生效；违反条件 ① → 拒绝保存 + 行内错误 + 错误 toast（4.2） |
| 与原 PRD 的关系 | 属用户在设置页改动范围内，**不算新增无关功能**；遵循原 PRD 第 5 章 TB/CD/BT/FB 规范（次操作、行内校验、五态反馈、手机端单列与 44px 热区）与第 8 章设置页区块布局 |

### 7.2 AI 解读面板状态区扩展（原 PRD 第 6 章 B 区）

| 项 | 口径 |
| --- | --- |
| 并发档 | B 状态区显示「一次性并发 N 项（设定并发数 X / 上限 Y）」或 4.3 的超限提示；进度条 `total = N + 1`，融合阶段明确「最后一步，单独执行」 |
| 串行档 / 单次解读 | 不显示一次性并发字样；沿用原 PRD 6.5 的状态区信息架构 |
| 结构约束 | `AiProgress` 8 字段不变；B 区仍为「只读 + 唯一取消入口」，**不新增任何破坏性控件**；只扩展文案与数值，不改变原 PRD AI-08 / AI-09 / AI-22 / AI-23 已定的进度与连接状态口径 |
| 放大态 | 原 PRD AI-05～AI-07、AC-19～AC-21 的放大阅读态不受影响；状态区在放大态仍固定可见 |
| 连接状态 | 仍只呈现客户端可观测事实（原 PRD 6.4 / TX-2）：并发批次的「请求已发出，等待响应 / 已等待 T s / 超时上限」等，不得写「服务端已并发处理 N 项」等未验证表述 |

---

## 8. 可验证验收标准（AC-C1 … AC-C19，独立编号）

> 编号独立于原 PRD 的 AC-1～AC-32，互不冲突；原 PRD 全部 AC 继续有效（见 AC-C19）。视口基线沿用原 PRD：桌面 1280×800、手机 390×844。

| 编号 | 验收标准 |
| --- | --- |
| **AC-C1** | `hdt.settings.v1` 中存在且仅存在两个新增顶层字段 `aiConcurrency`、`aiConcurrencyLimit`；设置页中文标签分别为「AI 并发数」「并发上限」；`persist()` 写入后重新加载可原样读回；`AiConfig` / `AiProfile` 未被改动、两字段不随切换 profile 变化 |
| **AC-C2** | 两值均为整数且满足 `1 ≤ aiConcurrency ≤ aiConcurrencyLimit ≤ 128`；输入 0、129、小数、非数字时行内报错且不写入；默认值实测为 `3` 与 `64` |
| **AC-C3** | 旧配置（无这两个字段）加载后回落 `aiConcurrency=3`、`aiConcurrencyLimit=64`，无报错、无白屏、无成功态误报；若存量值违反约束，归一为合法值并在设置页给**一次可见提示**，不静默改值；备份导入导出行为不变 |
| **AC-C4** | 条件 ① 实测：把 AI 并发数设为大于并发上限后保存 → 写入被拒、`hdt.settings.v1` 保持原值、出现行内错误 + 错误 toast、无成功 toast；随后用当前生效的合法配置仍可正常发起一次解读 |
| **AC-C5** | 条件 ② 实测：构造 `requiredConcurrency > aiConcurrencyLimit` 的完整档任务 → 仍可发起并完成；状态区显示含 N、Y、K 的超限提示且常驻不消失；完成后报告含**全部 N 个分项**（逐项 key 可核对），无任务被丢弃、截断或凭空跳过 |
| **AC-C6** | 两类超限均不静默截断：`skipped` 数量与真实失败项数量一致；降级批次的 `done` 最终等于 `N`（不含融合），`failed` 只记录真实失败；不出现「为凑批宽而少发请求」 |
| **AC-C7** | 未超限一次性并发：构造 N 项（N ≤ 上限）的 `parallel` 完整档任务，用网络面板/调用日志断言：**批次数 = 1**、该批含 N 个 `explain()` 调用、N 个调用起始时刻处于同一调度批次（相互间隔 ≤ 100 ms 或同属一个 `Promise.all`）；不存在 3 个一批 |
| **AC-C8** | N=10、上限 ≥10 时调用序列不是 `3+3+3+1` 四批；`PARALLEL_CONCURRENCY=3` 不再作为批宽参与切批，其值仅作 `aiConcurrency` 默认值来源；ETA 的 divisor 实测为 N（未超限）或 Y（降级）而非固定 3 |
| **AC-C9** | 融合最后单独执行：`scope='full-fusion'` 的请求发起时刻**晚于**全部 N 个分项请求完成（含失败跳过项与串行重跑），且不与任何分项请求时间重叠；融合请求数恒 = 1 |
| **AC-C10** | 融合不参与并发：融合不计入 `requiredConcurrency`、不进入一次性并发批次；`AiProgress.total = N + 1`，分项阶段 `done ≤ N`，融合阶段由 N → N+1；`phase` 含「最后一步，单独执行」字样 |
| **AC-C11** | 串行档不受影响：`aiStepMode='serial'` 时 N 个请求依次串行发起（批次数 = N、每批 1 项），执行顺序与结果逐字段同 v2.2.1；两个并发配置可保存/展示但不改变执行方式；融合仍最后单独执行 |
| **AC-C12** | 单次解读不受影响：精简档、详细档、单闸门/通道/中心深度解读、凯龙回归盘解读各只发 1 次 `explain()`；不读取并发配置、不进入 `runFullReading()`、不产生融合步骤、不出现并发相关状态文案 |
| **AC-C13** | 「并发失败自动转串行」保留且共存：人为令 M 项失败 → 这 M 项在一次性批次结束后改为串行逐个重跑 1 次（含各自重试 1 次）；仍失败记入 `skipped`/`failed`；成功的 N−M 项不重跑；**不存在「剩余未启动任务改串行」**；`phase` 出现「并发失败，失败项改串行重跑」 |
| **AC-C14** | 取消不伪造：分项阶段取消 → 不产出 `fusion`/`summary`、不写占位文本；融合阶段取消 → `fusion=''`、`summary=''`，已成功分项保留，状态区显示「已取消」≥3 秒；取消时不做失败项串行重跑 |
| **AC-C15** | 失败不伪造：融合失败（重试 1 次后仍失败）→ `fusion=''`、`summary=''`，报告仍由分项构成，`skipped` 含「全盘整合与最终总结论」；分项跳过时融合输入含「请勿据此推断」；未配置 AI 时展示区正文节点数 = 0（继承原 PRD AC-24） |
| **AC-C16** | 设置页 UI 落位：两个配置项位于「AI 配置 → 解读详细度 → 多步编排方式」之后，未新增分节/页面/路由；`serial` 或 `concise` 下显示为禁用并标注「仅并发档生效」；违反约束时行内错误；手机端 390×844 无横向溢出、输入热区 ≥44px |
| **AC-C17** | AI 面板状态区：并发档显示「一次性并发 N 项（设定并发数 X / 上限 Y）」或 AC-C5 的超限提示；融合阶段标注「最后一步，单独执行」；`AiProgress` 仍为 8 字段、结构未变；B 区仍为只读 + 唯一取消入口，无新增破坏性控件 |
| **AC-C18** | 连接状态文案仍只含客户端可观测事实（原 PRD TX-2）：不出现「服务端已并发处理 N 项」「模型正在同时生成」等未验证表述；三档进度/状态区仍满足原 PRD AC-22 / AC-23（≤300ms 可见、≤1s 刷新、断网/超时/正常三场景终态正确） |
| **AC-C19** | 兼容性：原 PRD AC-1～AC-32 全部继续通过；本次变更不破坏其中任何一条，尤其 AC-22/23（进度与连接状态）、AC-24（未配置不伪造）、AC-25（计算锚点 `MANDALA_OFFSET=29.875` / Gate 41 `302.000°`）、AC-26（既有能力不回归）、AC-32（`.workbuddy/` 完好） |

---

## 9. 明确「不做」清单

| 编号 | 不做 | 说明 |
| --- | --- | --- |
| N-1 | 不改人类图计算规则与数据结构 | `MANDALA_OFFSET=29.875`、Gate 41 `302.000°` 锁定；`BodyGraph` / `CompositeResult` / 通道与中心判定一律不动 |
| N-2 | 不改 AI 解读业务内容、提示词、事实块与口径约束 | 分项清单、离线释义、合盘「不输出类型/权威/轮回交叉」约束、融合输入（前 300 字要点）全部原样保留；只改调度方式与状态文案 |
| N-3 | 不新增导出格式、不改报告结构与四格式导出 | MD / Word / HTML / PDF 与 `FullReport` 结构不变 |
| N-4 | 不删除或清空 `.workbuddy/` | 交付前后目录完好 |
| N-5 | 不新增路由、页面、弹层或业务模块 | 设置页仅在既有 `.step-mode` 之后追加 2 个输入控件；AI 面板仅扩展 B 区文案 |
| N-6 | 不新增除 `aiConcurrency` / `aiConcurrencyLimit` 之外的任何配置项；不改 `AiConfig` / `AiProfile` / `aiStepMode` 枚举 | 两个字段为全局设置，不进入单条 profile |
| N-7 | 不新增 `AiProgress` 字段、不改 `types/report.ts` 数据结构；不改备份导入导出格式 | 进度表达只通过既有 8 字段的取值与文案实现 |
| N-8 | 不修改构建脚本、CI、版本号单一来源策略 | 编译 / apk / exe / GitHub Release 仍按原 PRD P0-7、P0-8、AC-29～AC-32 |

---

## 10. 待确认问题（仅列新增边界口径，确认前按本文口径执行、不推断）

| 编号 | 待确认项 | PM 默认口径（确认前按此执行） |
| --- | --- | --- |
| **Q-C1** | 「AI 并发数」在一次性并发判定通过后是否应作为批宽下限（即 `N > aiConcurrency` 时是否仍分批）？ | **不切片**：判定只看 `N ≤ aiConcurrencyLimit`，通过即一次性全发；`aiConcurrency` 仅作设定值、校验与展示。理由：用户明确要求「不再分批受限」。若用户本意是「AI 并发数即实际批宽」，需显式确认后再调整 5.1 |
| **Q-C2** | 默认 `aiConcurrencyLimit = 64` 是否需按关系场实际任务规模上调（合盘/对比任务数可能更多）？ | 默认 64；关系场任务数超 64 时按条件 ② 降级并提示用户可提高上限。**不推断实际盘面规模**，不擅自改默认值 |
| **Q-C3** | 条件 ② 的降级是否也可选择「直接拒绝发起」？ | 本文已定唯一口径：**允许继续 + 收敛批宽 + 明确反馈 + 任务不减少**（4.2）。若主理人/用户要求改为「拒绝发起」，需显式确认后统一修改 4.2、AC-C5、AC-C6 |

---

## 附录　变更点 ↔ 源码位置对照（供架构师定位，非改动方案）

| 变更点 | 现有源码位置 | 备注 |
| --- | --- | --- |
| CH-1 配置项 | `src/stores/settings.ts:6` `KEY='hdt.settings.v1'`；`SettingsState`（27–42）；`persist()`（203–215）；`normalizeDetailMode/StepMode`（107–115） | 新增 2 字段 + 2 个归一化函数 + setter |
| CH-1 UI | `src/components/settings/SettingsForm.vue:504–547` `.detail-mode` / `.step-mode` | 在 `.step-mode` 之后追加子块 |
| CH-2/3 分批与 ETA | `src/services/aiFullReading.ts:43` `PARALLEL_CONCURRENCY=3`；`:345` `divisor`；`:404–443` `while` 循环 `pending.splice(0,3)` | 分批语义废止、divisor 改实际并发数 |
| CH-3 任务清单 | `aiFullReading.ts:186–225` `buildFullTasks()`；`src/services/readingAngles.ts:14–63` 8 个维度；`src/services/aiRelationshipReading.ts:213–277` `buildRelationshipTasks()`、`:280–290` `relationshipFullPlan()` | `requiredConcurrency = tasks.length` |
| CH-5 例外融合 | `aiFullReading.ts:316` `total = tasks.length + 1`；`:445–477` 融合段；`splitFusion()`（253） | 位置保持、不参与并发 |
| CH-6 状态区 | `src/types/report.ts:68–80` `AiProgress`；`src/components/panel/AiReadingPanel.vue:203–221` 进度条；`src/composables/useAiReading.ts:82–125` `runFull()` | 结构不变，文案与数值扩展 |
| CH-6 编排入口 | `useAiReading.ts:101–109` 传 `stepMode: options.stepMode ?? settings.aiStepMode`；`src/views/SingleChartView.vue:190–203`、`CompareView.vue:147–159`、`CompositeView.vue` 的 `fullPlan` | 判定在 `runFullReading()` 入口 |

---

> **增量文档结束**。本文只描述变更部分；`PRD-v2.3.0-全站页面重设计.md` 未被重写或修改，其全部内容与验收标准继续有效。本阶段仅产出文档，未修改任何代码或配置。
