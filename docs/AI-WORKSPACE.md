# AI 解读契约与工作区（v3.6.0）

本篇描述**当前生效**的 AI 解读实现：三个入口、三档详细度、两种表达风格、提示词分层、
滑动窗口并发、token 与缓存口径，以及工作区页面的交互约定。所有数值与文案都取自代码，
改代码时请同改本篇（提示词正文的权威文本是 `docs/spec/AI-PROMPT-v4.0.md`）。

```
AiWorkspaceView（三入口 UI）
        │  ReadingRequest{entry, detail, style, chart, dims, selection, direction}
        ▼
services/aiReadingPlan.ts     纯函数：请求 → 计划（任务清单 + 融合 + 请求数）
        ▼
services/aiReadingRunner.ts   编排：单次档 1 请求 / 多请求档走调度器，末位融合单独跑
        ▼
services/aiScheduler.ts       滑动窗口：最多 N 个在跑，每秒起 1 个，落定即补
        ▼
services/aiClient.ts          explain()：拼提示词、请求、续写、缓存、max_tokens 降级
        ▼
services/aiPrompt.ts          12 个段落常量 + 五段拼装（正文与 docs/spec 逐字一致）
```

## 1. 三个入口

入口决定「写什么」，档位决定「拆几次请求」，风格决定「怎么说话」。三者互不替代。

| 入口 | 参数 | 精简 / 详细档 | 完整档 | 报告结构 |
| --- | --- | --- | --- | --- |
| A 全盘 `full` | 无（档位 + 风格 + 方向可选） | **1 请求**：六模块同篇按序写完 | **6 请求**：①–⑤ 各 1 + ⑥ 融合 | 5 个 `module` 分节 + 融合 |
| B 综合 `composite` | `dims`（`READING_DIMENSIONS` 勾选）+ `direction`（必填） | **1 请求**：勾选维度各一小节 + 末句整体关联 | **N+1 请求**：每个维度 1 篇 + 融合 | `dimension` 分节 + 融合 |
| C 勾选 `selection` | `selection{channels, gates, definition, circuit, cross}` + `direction`（可空） | **1 请求**：逐条 + 「关联汇总」 | **k+m+r+1 请求**：通道 → 闸门 → 可选模块 → 汇总 | `channel`/`gate`/`module` 分节 + 融合 |

### 1.1 入口 A｜全盘 AI 解读

六个模块的**顺序固定、不可调换、不可跳过**：

1. 类型 / 策略 / 内在权威
2. 全部通道通解（一次请求内逐条覆盖，不合并）
3. 全部闸门通解（一次请求内逐项覆盖，不合并；每项标注所属中心与对端是否激活）
4. 中心状态 / 定义型 / 回路分布 / 轮回交叉四闸门
5. 人生轨迹 / 发展轨迹 / 未来形势 / 扎根力 / 成长方向（一个模块内五个三级标题）
6. 最终综合（只在最后出现，写「合起来之后才成立」的判断）

完整档的 ⑥ 是**融合任务**：它在 ①–⑤ 全部落定后才执行，输入是各分项前 800 字要点 +
未完成分项清单，不与任何分项请求重叠。

### 1.2 入口 B｜AI 综合解读

- `dims` 按 `READING_DIMENSIONS` 的**固定顺序**归一（点击顺序不影响任务顺序与缓存键）。
- 输出白名单是硬约束：未勾选的维度不得成为标题或独立段落；`{DIMS}` 由计划器渲染成
  中文标签串，同时写进 system 的白名单段与 user 的【用户选择】，两处必须同一份串。
- 完整档每个分项只写一个维度，其 system 白名单收窄为该维度；融合按 400 字截断整合。
- 一个维度都没勾时计划器返回空任务，页面提示「请至少选择一个维度或条目」，不发请求。

### 1.3 入口 C｜勾选解读

- 勾选顺序无关：通道 key 归一为 `lo-hi` 升序、闸门号升序、三个布尔标记固定顺序
  （定义 / 回路 / 交叉），方向 key 收尾，拼成稳定签名
  `ch:20-34+34-57|g:41,57|f:101|d:growth` 进 `ref` 与缓存键。
- 精简 / 详细档：一篇里先逐条（二级标题「逐条解读」下每项一个三级标题），
  再二级标题「关联汇总」（与前者同级）。
- 完整档：通道（升序）→ 闸门（升序）→ 可选模块 → `selection-fusion` 汇总；
  汇总要求至少点名 3 组跨条目联动，且不得引入未勾选的结构。
- 方向可空：不选时注入「不限方向」，让模型按「这些勾选项如何互相影响」组织，
  不套用固定角度、也不自己编一个。

### 1.4 请求数

请求数由 `planReading()` 唯一决定，页面左栏的「预计 N 次请求」与运行时实际请求同源
（都来自 `requestCountOf(plan)`）。实测（3 通道 / 5 闸门 / 2 定义中心的盘）：

| 入口 | 精简 | 详细 | 完整 |
| --- | --- | --- | --- |
| A | 1 | 1 | 6 |
| B（8 维度全选） | 1 | 1 | 9 |
| B（2 维度） | 1 | 1 | 3 |
| C（1 通 + 2 闸 + 定义 + 交叉） | 1 | 1 | 6 |
| 空勾选 | — | — | 0（不发请求） |

请求数 > 20 时页面先弹二次确认，避免一次误点消耗几十次额度。

## 2. 三档详细度

| 档位 | 篇幅契约 | 硬约束 |
| --- | --- | --- |
| 精简 `concise` | 600–900 字 | **只描述日常行为倾向，不做事实性断言**；禁用「你就是 / 你必定 / 这说明你 / 根本原因是 / 你的天赋是」；不要求写依据；一次覆盖多个模块或条目时按量放大（模块 300–500 字 / 条目 150–250 字），宁长不漏 |
| 详细 `detailed` | 5000–10000 字，硬上限 20000 | **每条结论必须「依据 → 结论」**，依据按 通道 → 闸门 → 中心 三级取用，取不到就删掉该结论；不允许用「一般来说 / 大多数人都」代替依据 |
| 完整 `full` | 无字数上限 | 每篇只写本次分项，不写全盘总论、不写「接下来还有…」；依据前置同样生效；结尾边界提示由最后一篇（融合）统一给 |

精简档与「依据铁律」互斥（有断言才需要依据），因此**精简档不做依据检测**。

## 3. 两种表达风格

风格是「怎么说」，不改变结论强度与字数契约；它进缓存键，切换后不会命中另一版的缓存。

| 风格 | 要求 |
| --- | --- |
| 零基础 `plain` | 全程口语；每 200 字至少一个具体例子或生活场景；「能量 / 频率 / 磁场 / 共振 / 天命 / 业力 / 高维」不得当解释词；禁「在能量层面上 / 从更高视角看 / 某种意义上是」；结论精确度不降 |
| 专业 `pro` | 使用通行术语，但**每个术语第一次出现必须阐释**：先给一句定义，再给本盘取值与例子；英文原词只括注一次 |

> **与 v3.5.0 相反的一点**：旧「专业版」的台词是「读者已熟悉术语、不必逐个解释」，
> 新专业版要求「每个术语第一次出现必须阐释」。这是唯一一处语义反转的改名
> （`aiAudience` → `aiStyle`，取值仍是 `pro` / `plain`），任何从旧文档复制的措辞都是反向违约。

## 4. 提示词：五段拼装

system 由五个段落按固定顺序拼成，**段间两个换行**：

```
systemPromptOf({ entry, detail, style, scope?, dims? })
  = [ PROMPT_CORE, ENTRY, DETAIL, STYLE, SCOPE? ].filter(Boolean).join('\n\n')
```

| 序 | 段 | 常量 | 何时拼 |
| --- | --- | --- | --- |
| 1 | 基础契约 | `PROMPT_CORE` | 恒拼：事实来源只有【盘面事实】【离线释义】；禁止编造事实块以外的结构；与事实块分工（不复述）；合盘禁个体结论；Markdown；边界提示 |
| 2 | 入口契约 | `PROMPT_ENTRY_FULL` / `_COMPOSITE` / `_SELECTION` | 恒拼（按 `entry` 三选一） |
| 3 | 档位契约 | `PROMPT_DETAIL_CONCISE` / `_DETAILED` / `_FULL` | 恒拼（按 `detail` 三选一） |
| 4 | 风格段 | `PROMPT_STYLE_PLAIN` / `PROMPT_STYLE_PRO` | 恒拼（按 `style` 二选一） |
| 5 | 范围段 | `PROMPT_SCOPE_FUSION` / `_ITEM` / `_OVERVIEW` | 仅融合 / 分项 / 通解三类 scope 追加 |

顺序不可调换：从「全局不可违背」→「入口职责」→「本档强度」→「表达方式」→「本次范围」。
**靠后的段落覆盖靠前的**：档位段允许使用术语时，风格段=零基础仍要求逐句解释。

user 侧固定四段（顺序与各出现一次的语义不变）：

```
【盘面事实】 → 【用户选择】 → 【离线释义】 → 【本次任务】
```

【用户选择】一行携带：入口 / 范围（scope · ref）/ 勾选维度 / 角度 / 档位 / 风格。
`ref` 这类内部键只出现在「范围」字段里，不会写进【本次任务】的指令句。

正文的权威文本在 `docs/spec/AI-PROMPT-v4.0.md`，代码常量与之逐字一致，
由 `node scripts/sync-prompt-spec.mjs --check` 与 `tests/ai-prompt.test.ts` 双重守护。

## 5. 并发：滑动窗口

一句话语义：**设为 N 就每秒起 1 个，直到在跑 N 个；之后任一完成（结果已展示）立即补发下一个。**

- `maxConcurrency` 取值 1–99（`AI_MAX_CONCURRENCY_MIN/MAX`，默认 3），只由设置项
  `aiMaxConcurrency` 提供，没有第二个旋钮；
- **起速**：第 1 个立即发起，第 2 个 t=1s，第 3 个 t=2s …… 判据是「已启动数 ≥ N」，
  不是「在跑数首次等于 N」（后者在任务比 1 秒快时会自锁在 1/s）；
- **稳态**：任一任务落定并已回调展示后，立即补发下一个，不再节流；
- **串行** = `N = 1`：此时起速间隔为 0，不给每个任务凭空加 1 秒；
- **重试**：单任务失败在**同一个并发槽**内重试 1 次（`retry: 1`），不额外占位；
  调度器内部不包 `withRetry`（叠加会变成 4 次尝试）；
- **已知副作用**：N 越大，满载越慢。N=99 需要 98 秒才满载，而这期间串行反而更快。
  状态区据此显示「起速中（每秒 1 个）· 已启动 M / N」而不是假装已满载。

状态文案两种形态（由 `slidePhaseText()` 产出，进 `AiProgress.phase`）：

```
起速中（每秒 1 个）· 已启动 1 / 3
最高并发数 3 · 在跑 3 / 总 9
```

取消语义：`signal.abort` 后不再启动新任务、在跑任务收到 abort、**已落定结果全部保留**，
最终抛 `AiError('已取消','cancelled')`；定时器在全部返回/抛出路径上清理干净。

## 6. token：上限已删除

- 请求体恒带 `max_tokens: 128000`（`MAX_TOKENS_CEILING`），用户不再设置 token 上限；
- `finish_reason === 'length'` 时自动续写，最多 **3** 段（`MAX_CONTINUATIONS`），
  拼接不重复；续写配额用完仍未收尾则标记「已触顶」且**不写缓存**；
- 服务端以 400/422 明确拒绝 `max_tokens`（措辞含 max_tokens / context length / 上下文长度等）时，
  按阶梯逐级降级重试一次：`128000 → 64000 → 32000 → 16000 → 8192 → 不带该字段`；
- 降级只认越界措辞：`401 / invalid_api_key / model_not_found / insufficient_quota` 一律**不降级**，
  body 为空也不降级（否则一个 Key 错误会被重试 6 轮）；
- 降级状态只存在于单次调用的函数栈内，不写模块变量、不跨请求共享。

## 7. 依据前置与回复后检测（`aiEvidence`）

提示词里的「依据前置」「输出白名单」「逐项覆盖」都是请求，不是保证。回复后只做**检测与告警**，
绝不改写或丢弃正文：

| 检测 | 口径 |
| --- | --- |
| `checkEvidenceCoverage` | 结论块 = 非标题行、去空白后 ≥ 24 字的自然段；含依据 = 事实块内的通道 key / `闸门 N`（白名单内）/ 任一九个中心名 / 字面量「依据」；只告警 |
| `checkDimensionWhitelist` | 入口 B：未勾选维度出现在标题或以该维度开头的独立段 → 泄漏（只在段中作附带修饰不算） |
| `checkItemCoverage` | 入口 A ②③ 与 ⑤：每条通道 / 闸门 / 方向必须各有标题；正文里顺带提到不算覆盖 |

数字 key 匹配带边界（`闸门 157` 不算覆盖 57）；排序与阈值都是常量，不做自适应——
同一份回复在任何版本下必须给出同一份数字。

## 8. 缓存与版本

| 项 | 值 |
| --- | --- |
| 提示词版本 | `PROMPT_VERSION = '4.0'`（提示词一改必须 +1） |
| 缓存前缀 | `hdt.ai.cache.v2`（v1 代键永不命中，启动时 `migrateAiCacheV1()` 清理，幂等） |
| 键组成 | 前缀 · `p{版本}` · 内核版本 · 接口地址 · 模型 · 配置指纹 · **入口** · scope · 档位 · **风格** · ref · 内容哈希 |
| 进键但不进正文 | `entry` 必须在键里：B 与 C 可能 scope/ref 相同，但提示词契约完全不同 |
| 不进键 | 档案名（只用于标题）；`ReadingProgress` 的并发数（只影响调度节奏，不影响内容） |

## 9. 设置项

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `aiDetailMode` | `concise` / `detailed` / `full` | 三档详细度，默认 `concise` |
| `aiStyle` | `pro` / `plain` | 表达风格，默认 `pro`（语义见 §3，与旧「面向人群」相反） |
| `aiMaxConcurrency` | 1–99 整数，默认 3 | 最高并发数；设为 1 即串行 |

加载期宽松归一（`normalizeMaxConcurrency`）：新字段优先；缺失时取旧 `aiConcurrency`
并夹到 1–99；**旧 `aiConcurrencyLimit` 永不作为迁移来源**（它是技术闸门，默认 64，
迁过来会变成真实的 64 并发）；多个旧字段被调整时合并成**一条多行提示**，消费即清。
保存期严格拒绝（`validateMaxConcurrency`）：非法值不写 store、不 persist、原值不变。

## 10. 工作区页面与后台运行

- 路由 `/ai`（name `ai-workspace`），不加入 `DERIVED_ROUTE_NAMES`，不改变返回按钮语义；
- 左栏：解读对象 → 入口标签 → A/B/C 面板 → 档位 → 表达风格 → 最高并发数（仅完整档）
  → 生成 / 取消 + 预计请求数 → 最近解读（标题 / 入口 / 档位）；
- 右栏：进度卡（`phase` + `done/total` + 上限 + 已用 / 预计剩余）、分项列表（多请求档，
  可折叠、边生成边增长）或渲染后的正文（单次档）、复制 / 保存 / 重新生成 / 导出；
- 运行中禁用入口、档案、档位、风格切换，避免参数与在途请求不一致；
- 打开历史记录时按 `record.entry` 切入口，并按 `scope/ref` 尽力恢复勾选，恢复不了只切入口；
- 后台运行：`activeController` 是模块级单例，请求不绑在任何 View 上。中断只有两个来源——
  点「取消解读」，或关闭可见侧栏面板（`watch(ui.aiReading.open)`）。视图卸载不 abort；
- 侧栏 `AiReadingPanel.vue` 与桌面冒烟脚本依赖的选择器保持不变（`data-zone` A–E、
  恰 3 处 `emit('cancel')`、`aria-label="关闭"`），工作区是独立组件树。

## 11. 分层职责与依赖方向

| 模块 | 职责 | 依赖 |
| --- | --- | --- |
| `services/aiPrompt.ts` | 12 个段落常量 + `systemPromptOf(ctx)` + `buildUserPrompt` + 档位/风格归一 | 只依赖 `types/*`、`chartFacts`（维度标签） |
| `services/chartFacts.ts` | 事实块唯一实现（整盘 / 逐闸门 / 逐通道 / 模块 ①–⑤ / 勾选签名） | `interpretations` / `gateInsight` / `crossData` / `engine` |
| `services/aiReadingPlan.ts` | 纯函数：请求 → 计划（任务 key / scope / ref / offline / 融合 / 标题） | `chartFacts`、`readingAngles`、`types/aiReading` |
| `services/aiReadingRunner.ts` | 执行计划：单次档 1 请求、多请求档调度 + 末位融合、进度与报告 | `aiScheduler`、`aiClient`、`aiEvidence` |
| `services/aiScheduler.ts` | 滑动窗口（起速 / 稳态 / 重试 / 取消 / 进度），不懂业务 | `aiConcurrency`、`aiAttempt` |
| `services/aiEvidence.ts` | 回复后检测（依据覆盖 / 维度白名单 / 条目覆盖），只告警 | `chartFacts`、`types/hd` |
| `services/aiTokenFallback.ts` | `max_tokens` 阶梯与越界识别 | 无 |
| `services/aiClient.ts` | 提示词拼装调用、HTTP、续写、缓存、错误分类、降级编排 | `aiPrompt`、`aiTokenFallback`、`aiTransport` |

依赖方向单一：`aiClient → aiPrompt / aiTokenFallback`、`aiReadingRunner → aiScheduler /
aiClient / aiEvidence`、`aiReadingPlan → chartFacts`。**不允许反向依赖**：
提示词层不认识请求层，调度器不认识业务概念，事实层不认识编排。

## 12. 测试防线

| 文件 | 守住什么 |
| --- | --- |
| `tests/ai-prompt.test.ts` | 12 段常量与 `docs/spec/AI-PROMPT-v4.0.md` 逐字一致；缓存键含入口/风格；采样恒 128000；旧专业版文案必须消失 |
| `tests/aiPromptLayers.test.ts` | 18 种入口×档位×风格组合两两不同；拼接顺序；风格段覆盖档位段 |
| `tests/aiReadingPlan.test.ts` | 三入口 × 三档的任务快照、请求数、勾选顺序无关、空勾选出口 |
| `tests/aiScheduler.test.ts` | I1–I10：起速时刻、落定即补的全局序号、峰值 ≤ N、串行无空档、重试同槽、取消保留、定时器零残留 |
| `tests/aiReadingRunner.test.ts` | 单次档 1 次调用；融合最后且只 1 次；失败只进 skipped；进度 10 字段 |
| `tests/aiEvidence.test.ts` | 三种检测的判定口径（24 字门槛、边界安全、独立段判定） |
| `tests/aiTokenFallback.test.ts` | 阶梯递减、末位不带字段、越界措辞白名单与四类排除、降级不外泄 |
| `tests/aiConcurrency.test.ts` | 单旋钮常量、两种归一语义、5 条迁移优先级 |
