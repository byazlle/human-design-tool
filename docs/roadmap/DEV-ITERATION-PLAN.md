# 开发执行计划（可直接认领）

> 基准：2026-11-20 · v3.6.0 + 提示词内容修订 4.1
> 这是**开发视角**的可执行计划：每个任务拆到文件级，含背景 / 涉及文件 / 实施要点 / 验收标准 / 依赖 / 预估。
> 产品视角的「为什么做、季度主题、北极星指标」见 [ROADMAP.md](ROADMAP.md)；版本节奏见 [ITERATION-PLAN.md](ITERATION-PLAN.md)（**v2 表达可懂性驱动版**）；
> **本计划已同步 v2 的 6b 专项（DEV-701/702/703）——表达可懂性是当前第一优先级主题**；
> **口径门禁（C-01～C-28）在 [DECISIONS.md](DECISIONS.md)——未确认前不得实现任何结果级改动**。
>
> **进度（2026-11-20 · v3.7.0 / I-1 已交付）**：CONFIRM.md 勾选已回填 DECISIONS.md（A 组 10 项全维持现状，内核零改动）；DEV-101 已解锁且无实施动作；DEV-103、DEV-701 已完成；DEV-702（I-2 释义白话化）为下一迭代核心。

---

## 0. 开工前必读

### 0.1 当前基线（已完成，勿重复做）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 提示词内容修订 4.2 | ✅ 已完成 | `PROMPT_VERSION='4.2'`；v4.1 两段风格 + v4.2 三处示例修订（可懂性基线驱动），缓存版本段已变 |
| 审计脚本注释订正 | ✅ 已完成 | `scripts/check-mandala-anchor.mjs` 头注释已明确"审计脚本、❌ 属预期" |
| 全局错误边界 U-19 | ✅ 已存在 | `src/components/base/ErrorBoundary.vue` 已在 `App.vue:44` 使用；**不要重做** |
| 曼陀罗锚点文档同步 | ✅ 已修复 | `ARCHITECTURE.md:131` 已是 29.875°；`docs/review/` 旧值属审计语境，勿改 |

### 0.2 未实现项（已核实，本计划中确属待办）

| 项 | 核实结论 | 对应任务 |
| --- | --- | --- |
| 离线提示 U-18 | 全库无 `navigator.onLine` | DEV-302 |
| 长列表性能 U-26 | 无分页 / 虚拟滚动 / IntersectionObserver | DEV-301 |
| 加载骨架 U-30 | 无 skeleton / 路由占位 | DEV-304 |
| 回收站 U-07 | 无 `deletedAt` / trash 结构 | DEV-502 |
| 备份含 AI 配置 U-13 | `SettingsView.vue` 导出仅 `archives` | DEV-501 |

### 0.3 硬约束（违反即返工）

1. **口径不推断**：DECISIONS.md 里未勾选的 C 项，一律维持现状、相关实现冻结。改名 / 改判定 / 改算法前必须有勾选记录。
2. **内核零改动默认**：`MANDALA_OFFSET`、`gateData.ts` 通道表、类型 / 权威 / 定义判定、合盘口径、`SCHEMA_VERSION` 不在任何任务范围内，除非门禁明确授权。
3. **改提示词必同步**：改 `aiPrompt.ts` 任一常量 → 跑 `node scripts/sync-prompt-spec.mjs` → 升 `PROMPT_VERSION` → 改 4 处测试版本断言（ai-prompt / aiStage / aiClientContinuation / aiConcurrency.acceptance）。
4. **冻结契约不可动**：`tests/aiConcurrency.acceptance.test.ts` QA-B4 逐字扫 `AiReadingPanel.vue` 源码；桌面冒烟 `HD_SMOKE=1` 29/29 是冻结契约——要改前端行为，不改冒烟脚本。
5. **版本单一来源**：产品版本只在根 `package.json`；提示词版本只在 `aiClient.ts` 的 `PROMPT_VERSION`。两者独立，勿混改。
6. **发布通道**：推送通道 curl / Node fetch 会交替失效，发布前各探一次；CI tag 工作流四 job 是唯一权威产物来源。

### 0.4 通用 Definition of Done（每个任务都要过）

- [ ] `npm run typecheck` 0 错
- [ ] `npm test` 全绿且只增不减（当前基线 39 文件 / 534 项）
- [ ] `npm run build` 通过
- [ ] `node scripts/sync-prompt-spec.mjs --check` 通过（若改了提示词）
- [ ] 新增行为有对应单测；UI 改动在桌面 + 手机视口目检
- [ ] README / CHANGELOG / 相关 docs 与代码同步
- [ ] 无新增 P0 缺陷；冒烟 29/29 不退化

---

## 1. 迭代 I-1 · 口径收口（2026-11-23 → 12-04 · v3.7.0）

> 关键路径在 DECISIONS.md 的勾选，**不在开发**。勾选未到位时，DEV-101 不得开工，DEV-102 可并行。

### DEV-101　结果级口径确认后的实施 【已解锁 · 全维持现状，无代码改动 ✅】

- **背景**：C-01～C-08 + C-16 / C-18 共 10 项结果级门禁，勾选结果决定是否需要改计算。
- **涉及文件**（按勾选结果局部改动）：
  - `src/engine/mandala.ts`（C-01）、`src/engine/gateData.ts`（C-02/C-03）
  - `src/engine/bodygraph.ts`（C-04/C-05）、`src/engine/ephemeris.ts`（C-06/C-07/C-18）
  - `src/types/hd.ts` + `src/engine/composite.ts` + `src/services/aiClient.ts`（C-08）
  - `src/engine/version.ts`（`ENGINE_VERSION`）
  - 对应 `tests/*.test.ts` 与金标准样本
- **实施要点**：
  1. 只对勾了"改动"的项动手；勾"维持现状"或"暂不决定"的一律不动。
  2. 任何改变结果的项，同步升级 `ENGINE_VERSION`，老档案下次启动自动重算——须在发布说明里告知用户"人生角色 / 交叉角度可能变"。
  3. 每改一项，补一条锚点断言（金标准样本重定标），不要只改实现不改测试。
- **验收标准**：
  - 每项改动都能在 DECISIONS.md 第 3 节找到对应勾选记录；
  - 未勾项的代码 diff 为空（`git diff` 可验证）；
  - 金标准样本重跑通过，`npm test` 全绿。
- **依赖**：项目所有者完成 DECISIONS.md 勾选。
- **结果（2026-11-20）**：A 组全勾「维持现状」，无改动项；内核、`ENGINE_VERSION`、金标准零改动，本任务关闭。
- **预估**：0.5～3 人日（取决于勾选结果；全维持现状则近乎 0）。

### DEV-102　审计脚本注释订正 【已完成 ✅】

- 详见 0.1 基线。任务关闭，无需认领。

### DEV-103　口径一致性静态防线 【已完成 ✅】

- **结果（2026-11-20）**：QA-F2 增补文件内容断言锁定现行 29.875°；实测篡改 ARCHITECTURE.md 后变红、恢复后变绿。

- **背景**：防止旧值 29.8333° 通过复制粘贴回流到现行文档。
- **涉及文件**：`tests/aiConcurrency.acceptance.test.ts`（静态契约区，已有类似断言可参照 `:1137`）、`scripts/check-mandala-anchor.mjs`
- **实施要点**：加一条文件内容断言，锁定 `docs/ARCHITECTURE.md` 与 `README.md` 中现行口径值为 `29.875`；明确 `docs/review/` 的历史值不在检查范围。
- **验收标准**：篡改 `ARCHITECTURE.md` 的值为 29.8333 时测试变红；恢复后变绿。
- **依赖**：无，可立即开工。
- **预估**：0.3 人日。

---

## 2. 迭代 I-2 · 度量 + 手机端（2026-12-07 → 12-18 · v3.8.0）

> DEV-201/202 需先由产品所有者确认"接受本地度量"（ROADMAP 6.1）；不接受则整体替换为问卷方案。

### DEV-201　最小使用度量核心模块 【待确认：本地度量是否接受】

- **背景**：产品无任何遥测，无法回答"用户是否用了新功能、在哪一步流失"。
- **涉及文件**：新建 `src/services/usageMetrics.ts`；`src/utils/storage.ts`（新键 `hdt.usage.v1`）；`src/types/hd.ts` 或新 `src/types/usage.ts`（事件类型）
- **实施要点**：
  1. 事件只含 `{event, ts, count}`，**不含出生数据 / 档案内容 / 解读正文 / IP / 设备指纹**。
  2. 默认关闭；设置页显式开启才写；一键清除只删 `hdt.usage.v1`，不动档案 / 解读 / 缓存。
  3. 白名单事件名固定，未知事件直接丢弃（防误采集）。
  4. 纯本地，无网络请求——新增代码里不得出现 `fetch` / `XMLHttpRequest` / `sendBeacon`。
- **验收标准**：
  - 默认关闭时任何操作零写入（单测断言）；
  - 开启后完成一次闭环，事件计数正确 +1；
  - 清除后计数归零，档案与解读不变；
  - 全库检索度量模块无网络 API。
- **依赖**：产品所有者确认度量方案。
- **预估**：1～1.5 人日。

### DEV-202　埋点接入（事件清单）

- **涉及文件**：`src/views/EntryView.vue`（chart.created）、`src/composables/useAiReading.ts` 或 `src/services/aiClient.ts`（reading.generated / saved / exported）、`src/components/archive/BatchImportDialog.vue`（import.batch.used）、`src/components/ai/AiEntryTabs.vue`（入口 a/b/c）
- **实施要点**：只在成功路径计数；失败不算；入口事件带 entry 标识但不含档案名。
- **验收标准**：六类事件各自单测覆盖；手动走一遍完整流程，汇总数字与预期一致。
- **依赖**：DEV-201。
- **预估**：0.5～1 人日。

### DEV-203　手机端闸门命中区等效交互

- **背景**：README 已知限制第 6 条——手机闸门命中区约 38px，低于 44px 触摸标准。
- **涉及文件**：`src/components/chart/HumanDesignBodyGraph.vue`、`src/components/chart/bodyGraphLayout.ts`、`src/views/SingleChartView.vue`（移动坞）、`tests/layout-geometry.test.ts` 或同类几何测试
- **实施要点**：
  1. **不改几何回归**：`GATE_POINTS` / 中心多边形 / 通道端点的既有断言必须保持通过。
  2. 采用等效替代交互（建议：长按放大选闸门、或点选后弹出闸门列表二次选择），优先级高于硬改 38px。
  3. 桌面行为完全不变。
- **验收标准**：手机视口能用替代交互准确选中任意闸门；几何测试零回归；桌面交互与改前一致。
- **依赖**：无，可立即开工。
- **预估**：1.5～2 人日。

### DEV-204　真实 390px 设备闭环验证

- **涉及文件**：验证记录写入 `docs/VERIFY-v3.8.0.md`（新建）
- **实施要点**：390px 真机（或最接近的 headless 配置）走通"新建 → 排盘 → 选闸门 → AI 解读 → 保存 → 导出"；截图留证。
- **验收标准**：全链路无横向溢出、无命中失败；记录写入 VERIFY 文档。
- **依赖**：DEV-203。
- **预估**：0.5 人日。

---

## 3. 迭代 I-3 · 体验补齐（2027-01-04 → 01-15 · v3.9.0）

### DEV-301　长列表性能（U-26）

- **涉及文件**：`src/components/archive/ArchiveCanvas.vue`、`src/components/archive/MobileArchiveList.vue`、`src/components/archive/ArchiveCard.vue`、`src/views/ArchiveHomeView.vue`、`src/components/archive/canvasLayout.ts`
- **实施要点**：
  1. 优先分页 / 分批渲染；**不要轻易上虚拟滚动**——每张卡含 SVG 人体图，虚拟卸载会与自由画布拖拽冲突。
  2. 保留 `auto-fit` 并排与画布拖拽能力；只优化"同时挂载的卡片数"。
- **验收标准**：200 份档案首屏可交互 ≤2s；滚动无连续 >50ms 长任务；画布拖拽功能不退化。
- **依赖**：无。
- **预估**：1.5～2 人日。

### DEV-302　离线态提示（U-18）

- **涉及文件**：新建 `src/composables/useOnline.ts`；`src/components/panel/AiReadingPanel.vue`（保留兼容层）、`src/views/AiWorkspaceView.vue`
- **实施要点**：
  1. `navigator.onLine` + `online`/`offline` 事件；断网时明确提示"AI 不可用，离线释义仍可查看"。
  2. 恢复网络提示自动消失，无需刷新。
  3. 不改 AI 请求逻辑，只加提示层。
- **验收标准**：断网 → 提示出现且离线内容可见；恢复 → 提示消失；单测覆盖状态切换。
- **依赖**：无。
- **预估**：0.5 人日。

### DEV-303　错误态 / 超时 / 缓存命中标记统一（U-17）

- **涉及文件**：`src/stores/ui.ts`（加状态字段）、`src/composables/useAiReading.ts`、`src/services/aiClient.ts`（错误分类）、`src/components/panel/AiReadingPanel.vue`、`src/components/ai/AiModuleList.vue`
- **实施要点**：请求中 / 超时 / 失败 / 缓存命中四态各有独立可辨识 UI；超时提示含秒数与"去调大超时"入口；HTTP 失败显示状态码；缓存命中显示标记。
- **验收标准**：四态各有单测或可复现步骤；文案不出现"已成功"误报（U-14 同类问题一并排查）。
- **依赖**：DEV-201（缓存命中标记共用事件或状态）。
- **预估**：1 人日。

### DEV-304　加载骨架与路由占位（U-30）

- **涉及文件**：`src/router/index.ts`（路由占位）、`src/App.vue`、`src/components/base/`（新建 `SkeletonCard.vue` 或复用 `EmptyState.vue`）、`src/views/ArchiveHomeView.vue`（列表首帧）
- **实施要点**：慢速 3G 切页 300ms 内出现占位；列表首帧显示骨架卡；加载完成无布局位移（CLS）。
- **验收标准**：慢速网络目检通过；有可复现录屏 / 截图。
- **依赖**：无。
- **预估**：0.8 人日。

### DEV-305　存储写满降级（U-21）

- **涉及文件**：`src/utils/storage.ts`（已有 `SAVE_FAILURE_HINT`）、`src/views/EntryView.vue`（U-14 保存结果统一）、`src/stores/archive.ts`
- **实施要点**：写失败时提示含"导出备份"按钮，全程不出现"已保存 / 已生成"。
- **验收标准**：模拟 `localStorage.setItem` 抛错，提示为失败而非成功；导出按钮可点。
- **依赖**：无。
- **预估**：0.5 人日。

---

## 4. 迭代 I-4 · 价值复盘（2027-01-18 → 01-29 · v3.9.x）

### DEV-401　解读数据汇总与入口去留支撑

- **背景**：用 DEV-201/202 的数据回答"三入口哪个值得保留 / 深化"。
- **涉及文件**：新建 `src/services/usageReport.ts`（本地汇总）；文档 `docs/roadmap/VALUE-REVIEW.md`（新建）
- **实施要点**：输出三入口占比 / 三档占比 / 闭环率 / 采纳率 / 重新生成率；样本不足（<30 天或 <100 次解读）时明确标注"初步观察，不下线结论"。
- **验收标准**：汇总数字可追溯；每个结论标注数据来源；样本阈值逻辑有单测。
- **依赖**：DEV-202 已运行足够时长。
- **预估**：1 人日（不含等待数据的时间）。

---

## 5. 迭代 I-5 · 数据安全补齐（2027-02-01 → 02-12 · v3.10.0）

### DEV-501　备份包含 AI 配置（U-13）

- **涉及文件**：`src/views/SettingsView.vue`（`exportAll()`，当前仅 `archives`）、`src/services/backupImport.ts`、`src/types/hd.ts`
- **实施要点**：
  1. 导出 payload 增加 `settings.aiProfiles`（**默认 `apiKey` 置空并标注**）；勾选"包含密钥"且二次确认后才写明文。
  2. 导入后配置恢复；未含密钥的项标记"需重新填写"。
  3. `SCHEMA_VERSION` 不改；旧备份仍可导入。
- **验收标准**：
  - 默认导出文件不含 apiKey；勾选 + 确认后才含；
  - 导出→导入往返，档案与配置一致；
  - 旧格式备份导入不报错。
- **依赖**：无。
- **预估**：1 人日。

### DEV-502　回收站 / 误删恢复（U-07）

- **涉及文件**：`src/stores/archive.ts`（`remove()`）、`src/utils/storage.ts`（新键 `hdt.trash.v1`）、`src/views/SettingsView.vue`（"最近删除"入口）、`src/views/ArchiveHomeView.vue`
- **实施要点**：删除超过 5 秒撤销窗口后进入回收站；保留期 30 天自动清理；恢复后 id 与出生信息不变；清空回收站二次确认。
- **验收标准**：删除→超窗口→恢复，档案 id / 出生信息不变；超 30 天自动清理且有说明；引用清理（多盘 / 合盘）不残留（U-06 一并回归）。
- **依赖**：无。
- **预估**：1.5 人日。

---

## 6. 迭代 I-6 · 一致性收尾（2027-02-15 → 02-26 · v3.10.x）

### DEV-601　术语统一（U-27）【阻塞：等术语门禁确认】

- **背景**：C-19 / C-20 / C-21 / C-23 等术语门禁决定全站统一叫法。
- **涉及文件**：`src/types/hd.ts`、`src/services/interpretations.ts`、`src/services/crossData.ts`、`src/views/SingleChartView.vue`、`src/engine/composite.ts`（注释）、`docs/` 相关文档
- **实施要点**：按勾选结果产出术语对照表；抽查档案库 / 单盘 / 合盘 / 设置 / AI 面板 5 处，同一概念用词一致；未确认项只出对照表、不改代码。
- **验收标准**：门禁项全部标"已确认 / 维持现状"；5 处抽查用词一致。
- **依赖**：DECISIONS.md 术语类勾选。
- **预估**：0.5～1 人日。

### DEV-602　桌面 / 移动能力对齐（U-29）

- **涉及文件**：`src/views/SingleChartView.vue`（工具栏与移动坞）、`src/components/archive/ArchiveCard.vue`、`src/components/archive/MobileArchiveList.vue`
- **实施要点**：手机端补齐"复制副本 / 加入合盘"入口；两端入口名称一致。
- **验收标准**：375px 下完成"新建→编辑→复制副本→加入合盘→删除"全流程。
- **依赖**：DEV-203（命中区交互）。
- **预估**：0.8 人日。

### DEV-603　季度复盘与路线图更新

- **涉及文件**：`docs/roadmap/ROADMAP.md`（变更记录）、`docs/roadmap/README.md`
- **实施要点**：Now / Next 目标达成情况、指标趋势、门禁关闭率、P0 缺陷、下季度主题建议；决定 Later 主题（行运 / 商业比对 / 名称精修）是否启动。
- **验收标准**：变更记录有条目；Later 启动项的"前置条件"列已满足。
- **依赖**：I-1～I-5 完成。
- **预估**：0.3 人日。

---

## 6b. 表达可懂性专项（产品计划 v2 新增 · 优先于原 I-6）

> 来源：产品迭代计划 v2 把"看不懂"根因定位到离线释义素材 + 术语混用 + 无验收。
> 以下三项是对 DEV-201/301 等已有任务的补充，**DEV-701 是新增的最高优先级任务**。

### DEV-701　可懂性检查表 + 基线抽检 【新增 · 已完成 ✅】

- **结果（2026-11-20）**：`tests/readability.test.ts`（8 项）+ `tests/fixtures/readability-baseline.json`（524 条）+ `docs/VERIFY-可懂性-基线.md`；机械达标率 14.3%，作为 I-2 起点。

- **背景**：全库没有任何一条测试测"用户能不能看懂"；先把主观抱怨变成可测指标。
- **涉及文件**：新建 `tests/readability.test.ts`、新建 `docs/VERIFY-可懂性-基线.md`；参考 `docs/roadmap/ITERATION-PLAN.md` 第 5 节检查表
- **实施要点**：
  1. 机械断言：禁用解释词表（能量/频率/磁场/共振/天命/业力/高维/模式/制约/放大/整合/课题）、单句 ≤45 字、每条 defined/open 含场景锚点。
  2. 抽检脚本：从解读记录随机抽 30 条（AI 15 + 离线 15），按"三问法"人工打分，产出基线报告。
  3. 断言先只覆盖离线释义（静态、可判定），AI 输出走抽检不自动断言。
- **验收标准**：故意塞入抽象话时测试变红；基线报告含分数 + 不达标样例清单。
- **依赖**：无。
- **预估**：1 人日。

### DEV-702　离线释义白话化（I-2 核心）【新增 · 依赖 DEV-701 基线】

- **背景**：提示词 v4.1 已修，但素材（离线释义）本身抽象，AI 生成仍被带偏。
- **涉及文件**：`src/services/interpretations.ts`（GATE_TEXT 64×2 / CHANNEL_TEXT 36 / CENTER_TEXT 9×2 / TYPE_TEXT 5 / AUTHORITY_TEXT 7）、`src/services/gateInsight.ts`（64×4）、`src/services/destinyText.ts`（4 类轨迹）、`src/services/typeDetail.ts`（5 类型）
- **实施要点**：
  1. **定向重写，不全库手写**：用 DEV-701 基线里的不达标样例清单定位到具体条目改写，保证风格一致。
  2. 每条过第 5 节三问：有画面 / 不绕 / 对得上；编号与术语不当主语。
  3. **只改文案，不改数值 / 判定 / 类型签名**，不改 `PROMPT_VERSION`（内容数据非提示词）。
- **验收标准**：可懂性达标率 ≥80%（对比基线）；`readability.test.ts` 全绿；CHANGELOG 有条目。
- **依赖**：DEV-701 基线 + CONFIRM C 组术语结论（未确认则只改措辞、不改术语名）。
- **预估**：2～3 人日（文案量大，定向重写控量）。

### DEV-703　术语对照表与全站统一 【新增 · 依赖 CONFIRM C 组】

- **涉及文件**：新建 `docs/GLOSSARY.md`；按 C7/C11 结论改 `src/types/hd.ts`、`src/services/interpretations.ts`、`src/services/crossData.ts`、相关 views
- **实施要点**：按 CONFIRM C7 统一"意识两侧"叫法、C11 给「开放的通道」改名；产出对照表；抽查 5 处（档案库/单盘/合盘/设置/AI 面板）。
- **验收标准**：门禁项有结论；5 处抽查无混用；未确认项只出对照表不改代码。
- **依赖**：CONFIRM C 组勾选（🔴 硬阻塞，未勾则降级为只出对照表）。
- **预估**：0.5～1 人日。

---

## 7. Later 候选（未排期 · 需前置条件）

| 候选 | 前置条件 | 备注 |
| --- | --- | --- |
| 行运（Transit）实时推演 | 口径确认 + 星历能力评估 | 替代模板式"未来形势"，工作量最大 |
| 商业软件逐例比对 | Jovian / Genetic Matrix 授权样本 | 无样本不可行 |
| 轮回交叉 192 名称完整映射 | 用户确认需要 + 数据来源合规 | v3.3 已做 111 去重主题名 |
| 自定义 AI 角度（用户自填提示词） | 提示词策略确认 + 缓存键设计 | 升 `PROMPT_VERSION` |
| 快捷键 U-23 / 批量删除 U-05 / 星列状态持久化 | 上述 P1/P2 清空后 | 低成本，可随时提前 |

---

## 8. 任务速览表

| ID | 任务 | 迭代 | 依赖 | 阻塞 | 预估(人日) |
| --- | --- | --- | --- | --- | --- |
| DEV-101 | 口径确认后实施 | I-1 | DECISIONS 勾选 | ✅ 已解锁/全维持 | 0（无改动） |
| DEV-102 | 审计脚本注释 | I-1 | — | ✅ 已完成 | — |
| DEV-103 | 口径静态防线 | I-1 | — | ✅ 已完成 | 0.3 |
| DEV-201 | 度量核心模块 | I-2 | 产品确认 | 🟡 待确认 | 1～1.5 |
| DEV-202 | 埋点接入 | I-2 | DEV-201 | 🟡 间接 | 0.5～1 |
| DEV-203 | 手机闸门交互 | I-2 | — | 否 | 1.5～2 |
| DEV-204 | 390px 验证 | I-2 | DEV-203 | 否 | 0.5 |
| DEV-301 | 长列表性能 | I-3 | — | 否 | 1.5～2 |
| DEV-302 | 离线态 | I-3 | — | 否 | 0.5 |
| DEV-303 | 错误态统一 | I-3 | DEV-201 | 🟡 间接 | 1 |
| DEV-304 | 加载骨架 | I-3 | — | 否 | 0.8 |
| DEV-305 | 存储写满降级 | I-3 | — | 否 | 0.5 |
| DEV-401 | 数据汇总复盘 | I-4 | DEV-202 + 数据 | 🟡 间接 | 1 |
| DEV-501 | 备份含配置 | I-5 | — | 否 | 1 |
| DEV-502 | 回收站 | I-5 | — | 否 | 1.5 |
| DEV-601 | 术语统一 | I-6 | 术语门禁 | 🔴 是 | 0.5～1 |
| DEV-602 | 桌面/移动对齐 | I-6 | DEV-203 | 否 | 0.8 |
| DEV-603 | 季度复盘 | I-6 | I-1～I-5 | 否 | 0.3 |
| **DEV-701** | **可懂性检查表 + 基线** | **I-1** | — | **✅ 已完成** | **1** |
| **DEV-702** | **离线释义白话化** | **I-2** | DEV-701 + C组 | 🟡 间接 | **2～3** |
| **DEV-703** | **术语对照表与统一** | **I-2** | C组勾选 | 🔴 是 | 0.5～1 |
| PROMPT-1 | 可懂性抽检与再优化 | I-1 | — | ✅ 已完成（升 4.2） | 1 |
| PROMPT-3 | 版本断言 CI 加固 | I-1 | — | ✅ 已完成 | 0.3 |

**立即可开工（无阻塞、无依赖）**：DEV-103、**DEV-701**、DEV-203、DEV-301、DEV-302、DEV-304、DEV-305、DEV-501、DEV-502。

> **DEV-701 建议优先认领**：它是"看不懂"问题从抱怨变指标的第一步，且零依赖。DEV-702 是新版产品计划的核心迭代（I-2），依赖基线报告定位重写范围。

---

## 9. 开发纪律与提交规范

1. **一任务一分支**：`dev/DEV-xxx-简述`；提交信息前置任务 ID，如 `DEV-301: 分批渲染档案列表`。
2. **先测试后合并**：每个任务的验收标准转成测试，测试不过不合。
3. **口径变更走门禁**：任何涉及"什么叫对"的判断，先查 DECISIONS.md，没有记录就停下来问，不自行推断。
4. **缓存失效意识**：改提示词（`PROMPT_VERSION`）/ 改计算（`ENGINE_VERSION`）/ 改数据结构（`SCHEMA_VERSION`）都会让旧数据重算或失效——提交说明里必须写明影响。
5. **发布走 CI**：本地不直接发布；推送前探测通道；tag 触发 CI 四 job 全绿后以 Release 产物为准。

---

*变更记录*

| 日期 | 变更 | 原因 |
| --- | --- | --- |
| 2026-11-20 | 初版建立 | 交付开发团队执行；纳入提示词 4.1 基线与代码现状核实结果 |
| 2026-11-20 | 新增 6b 表达可懂性专项 DEV-701/702/703 | 同步产品迭代计划 v2；"看不懂"根因定位到离线释义素材 + 术语混用 + 无验收 |
