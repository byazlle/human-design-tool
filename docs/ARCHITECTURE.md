# 架构说明（ARCHITECTURE.md）

## 1. 总体结构

```
┌────────────── 前端（Vue 3 + TS）──────────────┐
│ views  ──►  components（chart / panel / base） │
│   │              │                            │
│   ▼              ▼                            │
│ stores（pinia）  services（解读内容 / AI / md）│
│   │              │                            │
│   └──────► engine（纯 TS 计算，无 DOM）◄───────┘
└───────────────┬───────────────────────────────┘
                │ dist/
     ┌──────────┴───────────┐
     ▼                      ▼
desktop（Electron）     android（原生 WebView 壳）
```

- **engine** 只依赖 `astronomy-engine`，不引用 DOM/ Vue，可单测。
- **services** 是「内容 + 外部能力」层：解读文案、AI 客户端、Markdown 渲染、视角定义。
- **stores** 只管状态与持久化（`localStorage`），不做渲染。
- **components/chart** 只吃 `BodyGraph` 数据，不自行计算盘面。

## 2. 数据流

```
BirthInput ──computeChart()──► BodyGraph
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  HumanDesignBodyGraph      ActivationPanels            BoardMeta / PlanetColumn
  （SVG 渲染）              （清单 + 多选）             （盘面信息 / 星体两翼）
                                  │
                                  ▼
              ReadingRequest{entry, detail, style, chart, dims, selection, direction}
                                  │
                        planReading() ──► ReadingPlan{tasks, fusion, singleShot}
                                  │
                      runReadingPlan() ──► aiScheduler（滑动窗口）+ aiClient.explain()
                                  │
                  ┌───────────────┴────────────────┐
                  ▼                                ▼
        AiWorkspaceView（/ai 三入口页）     AiReadingPanel（侧栏兼容层）
        + AiMiniDock（最小化胶囊）          ui.aiPanelSuspended 控制显示位置
```

- `BodyGraph` 由 `engine/bodygraph.ts` 产出：centers / gates / channels / hangingGates /
  personality / design / type / authority / profile / definition / incarnationCross。
- 意识的判定不需要额外字段：`chart.personality` 与 `chart.design` 的 `gate` 集合
  直接决定每条通道是「红 / 黑 / 条纹」。
- **两条 AI 显示路径共用一份状态**：`ui.aiReading` 是单一槽位，`activeController` 是模块级单例。
  请求生命周期不绑在任何 View 上；只有显式取消或关闭可见面板才中断。
  三入口、档位、风格与并发的完整契约见 [docs/AI-WORKSPACE.md](AI-WORKSPACE.md)。

## 3. 关键模块

| 模块 | 职责 | 位置 |
| --- | --- | --- |
| 星历与时间 | 平黄经→视黄经、交点、时区归一化、设计时刻求解 | `src/engine/ephemeris.ts` `time.ts` |
| 盘序 | 64 卦盘序与偏移 | `src/engine/mandala.ts` |
| 盘面判定 | 通道→中心→类型/权威/定义型、悬挂闸门 | `src/engine/bodygraph.ts` |
| 合盘 | A/B/merged 与归属色 | `src/engine/composite.ts` |
| 几何 v1 | 底图 1:1 坐标、通道裁剪、20-57 枢纽走线 | `src/components/chart/bodyGraphLayout.ts` |
| 版式注册表 | 单一版式 `LayoutPreset`（v2.2 起移除版式二） | `layouts.ts` |
| 渲染 | 底板 + 数据两层 SVG | `HumanDesignBodyGraph.vue` |
| 解读内容 | 闸门/通道/中心/类型/星体/闸门洞察/人生轨迹/角度 | `src/services/*` |
| AI 请求层 | 提示词拼装、HTTP、续写、缓存键、错误分类、`max_tokens` 降级 | `services/aiClient.ts` `aiPrompt.ts` `aiTokenFallback.ts` |
| AI 编排层 | 请求 → 计划（纯函数）、执行计划（单次 / 滑动窗口 + 末位融合） | `services/aiReadingPlan.ts` `aiReadingRunner.ts` `aiScheduler.ts` |
| AI 事实与检测 | 盘面事实块唯一实现、回复后检测（只告警） | `services/chartFacts.ts` `services/aiEvidence.ts` |
| AI 工作区 | 三入口页面 / 最小化胶囊 / 跨页状态与来源记录 | `views/AiWorkspaceView.vue` `components/ai/*` `components/panel/AiMiniDock.vue` `stores/ui.ts` |
| 样式收敛层 | 冷中性 token 覆盖与 ws-* 组件样式，只追加 | `styles/workspace.css` |

## 4. 状态与持久化

| 键 | 内容 | 说明 |
| --- | --- | --- |
| `hdt.archives.v1` | 档案数组（含已算好的 `chart`） | 导出/导入同构 |
| `hdt.settings.v1` | AI 配置、`aiDetailMode` / `aiStyle` / `aiMaxConcurrency`、外观（主题/字号/配色/绘图程序） | 键名不变，字段级兼容；已删字段不再写入 |
| `hdt.ai.readings.v1` | 已保存的解读记录（含 `style` / `entry` / 版本戳） | 单档案最多 12 条，超出按时间淘汰 |
| `hdt.ai.cache.v2` | 解读缓存（键含提示词版本、入口、档位、风格、ref、内容哈希） | v1 代键在启动时清理 |
| `hdt.module.order.v1` | 历史遗留的模块排序（已不参与布局） | 可清理 |
| `hdt.ai.history.v1` | 全局保存流水（最多 50 条，无档案归属） | 仅本机 |

版本号**单一来源**为根 `package.json`，由构建与发布脚本读取。

## 5. 打包链路

### 桌面（Electron）

```
npm run build → dist/
desktop/main.cjs 注册 app:// 协议（standard + secure + supportFetchAPI）
build-exe.py：把 dist 装进 release/desktop/win-unpacked/resources/app
             → electron-builder --prepackaged 打 NSIS
             → release/desktop/HumanDesign-Setup-<version>.exe
```

> 为什么不用 `file://`：Chromium 禁止 `file://` 文档访问 localStorage，且 ES module 会被 CORS 拦。
> 自定义 `app://` 同时解决这两点。

### 安卓（原生 WebView 壳，无需 Gradle）

```
npm run build → dist/ 复制到 android/assets/www
aapt2 compile/link → javac → d8 → 合并 zip → zipalign → apksigner
MainActivity 通过 shouldInterceptRequest 从 assets/www 读取
资源挂在 https://appassets.androidplatform.net
```

- `build-apk.py` 自动读取根 `package.json` 的版本 → `versionName`，`versionCode` 固定递增变量。
- 产物约 0.47 MB（复用系统 WebView）。

## 6. 自检体系

| 层级 | 命令 | 覆盖 |
| --- | --- | --- |
| 单元 | `npm test` | 盘序边界、通道路由、合盘归属、星历对照、几何、Markdown、提示词分层与逐字文档校验、入口计划、滑动窗口调度、回复后检测、token 降级、跨档案批量生成、事实块与解读记录、画布排布、页面布局、报告导出、完整版编排、关系场编排 |
| 端到端 | `HD_SMOKE=1 <exe>` | 29 项：加载、渲染、清单、详情、批量、AI 护栏、深色、合盘、设置、新建 |
| 安装验证 | NSIS `/S` 静默安装 → 运行安装后程序 | 同一套 29 项 |
| APK | 静态服务模拟 `appassets` 加载 | ES module + localStorage 正常 |

> Windows GUI 程序拿不到 stdout，冒烟日志写入 `HD_SMOKE_DIR/smoke.log` 与 `smoke-result.json`；
> 运行前需 `env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS`，否则 exe 退化为纯 Node。

## 7. 数据来源

| 数据 | 来源 |
| --- | --- |
| 闸门↔中心、36 通道拓扑 | Jovian Archive / Ra Uru Hu 标准人体图（与 rave-engine、free-human-design 一致） |
| 64 卦盘序与偏移 **29.875°**（Gate 41 起于 302.000°） | Jovian 标准 Mandala；已由 Rave New Year 实测锁定 |
| 星历 | `astronomy-engine`（VSOP87，MIT） |
| 交点 | Meeus《Astronomical Algorithms》第 47 章 |
| 版式二布局（历史，v2.2.0 起已移除） | [adamblvck/free-human-design](https://github.com/adamblvck/free-human-design) `site/charts.min.js` |
| 解读文案 | 项目内编写（通行人类图解释整理），非第三方授权文本 |

## 8. AI 解读报告导出（v2.2.0）

`src/services/aiExport.ts` 是唯一入口：三档解读先由 `reportToMarkdown()` 统一序列化
（精简 / 详细 = 单篇 Markdown；完整 = `FullReport` 按「维度 → 闸门 → 通道 → 整合 → 结论」展开），
之后四种格式都从这一份文本出图，避免排版逻辑分叉。

| 格式 | 生成方式 | 保存位置 |
| --- | --- | --- |
| MD | 序列化后的 Markdown 原文 | 桌面端 `file:save-report` 原生另存为；浏览器 `Blob + a.download` |
| Word | `docx@9` **动态 import()**，`Packer.toBlob()`，不进主 bundle | 同上（`encoding: 'base64'` 传二进制） |
| HTML | 独立可离线打开的文档，CSS 内联；表格由导出侧补 `<table>` 渲染 | 同上 |
| PDF | 桌面端 `file:save-pdf`：临时 HTML → 隐藏 `BrowserWindow.loadFile()` → `webContents.printToPDF()`；浏览器/安卓为打印专用页 + `window.print()` | 桌面端原生另存为；浏览器由用户在打印对话框选「另存为 PDF」并指定文件夹 |

- PDF 走 Chromium 系统字体，不用 jsPDF 内置字体（中文会乱码）。
- `file:save-report` 按扩展名给 filters，支持 UTF-8 文本与 base64 二进制；原有 `file:save`
  仍只服务 JSON 备份，语义不变。
- 旧版壳若缺少 `saveReport` / `savePdf`，渲染层自动退化为浏览器下载，不报错。
- `renderMarkdown` 本身不支持表格；导出侧 `markdownToHtml()` 把表格块单独转成 `<table>`，
  Word 则降级为以 `｜` 分隔的纯文本行。

## 9. 关系场完整版编排

合盘（`CompositeView`）与双盘对比（`CompareView`）在「完整」档同样走多轮编排，但**不能**套用单人整盘的维度：

| 环节 | 单人整盘 | 关系场（合盘 / 双盘对比） |
| --- | --- | --- |
| 任务来源 | `planReading({ entry:'composite', detail:'full', dims: ALL_READING_DIMS })`：八个维度各 1 篇 + 1 融合 | `relationshipFullPlan()` 注入 `tasks`，`runFullReading()` 原样采用（不重排、不增删） |
| 事实块 | `chartFacts.buildWholeChartFacts(chart)`：类型 / 权威 / 角色 / 中心 / 闸门 / 通道 / 交叉 | `relationshipFactBlock()`：双方人生角色、中心四象限、四类关系通道、共享与独有通道闸门、合并盘离线释义 |
| 维度 | `READING_DIMENSIONS` 八项 | `COMPOSITE_DIMENSIONS` 五项（自定义议题可追加）+ 四类连接动力学 |
| 逐项 | 由计划器决定（模块 ①–⑤ 或逐维度） | `sharedGates` / `merged.channels`（带归属） |
| 融合 | 全盘整合分析与最终总结论 | 关系场整合分析与最终总结论 |

- `runFullReading()` 是薄适配层：把选项翻译成 `ReadingPlan` 后交给 `runReadingPlan()`，
  与本仓其他入口共用同一个滑动窗口调度器与同一套末位融合机制，**不再自带分批/重跑逻辑**。
- 关系场事实块顶部只保留一句「本盘为关系场」声明；「合盘不输出类型 / 权威 / 定义型 / 轮回交叉」
  的完整条款由 system 的 `PROMPT_CORE` 第 5 条统一承担，不在每个分项里重复。
- `src/services/aiRelationshipReading.ts` 只消费 `CompositeResult` 已有字段与
  `compositeDimensions` / `interpretations` / `gateData` 的既有离线释义，不新增任何人类图判定。
- `mergedAsChart()` 的 `type / authority / definition` 只是渲染占位，绝不进入事实块；
  `tests/aiRelationshipReading.test.ts` 对此有回归。
- 覆盖边界：整盘类（单人整盘 / 合盘 / 双盘对比）在「完整」档走多轮；凯龙回归盘与
  闸门 / 通道 / 中心单点解读仍只发单次请求。

## 10. AI 工作区与后台运行（v3.5.0，v3.6.0 起为三入口）

- 路由 `/ai`（name `ai-workspace`），不加入 `DERIVED_ROUTE_NAMES`，不改变既有返回按钮语义。
- `App.vue` 监听 `ui.aiReading.open`：从任意盘面页发起解读时自动跳到工作区，只记来源路径并挂起侧栏，**不修改 `open`**。
- `useAiReading` 删除 `onScopeDispose(abort)`：`AbortController` 仍是模块级单例，但生命周期改由显式动作控制——点「取消解读」或关闭可见面板才中断。
- `ui.aiPanelSuspended` 只控制侧栏是否让位；`ui.aiReturnPath` 供最小化原路返回。两者都是纯 UI 状态，不持久化、不进备份。
- 侧栏 `AiReadingPanel.vue` 与冒烟脚本依赖的选择器完全未动；`styles/workspace.css` 是加载顺序在后的追加层，`classic` 皮肤不受冷中性收敛影响。
- 完整契约、三维决策与测试防线见 [docs/AI-WORKSPACE.md](AI-WORKSPACE.md)。

## 11. v3.6.0 AI 解读分层

AI 解读按「提示词 / 事实 / 计划 / 执行 / 调度 / 检测 / 请求」分成七层，
每层只认识下一层的接口，不允许反向依赖：

```
views/AiWorkspaceView.vue · components/ai/*
        │ ReadingRequest
        ▼
services/aiReadingPlan.ts ────► chartFacts.ts（事实块的唯一实现）
        │ ReadingPlan
        ▼
services/aiReadingRunner.ts ──► aiEvidence.ts（回复后检测，只告警）
        │                 └────► aiScheduler.ts（滑动窗口，不懂业务）
        ▼                              │
services/aiClient.ts ◄─────────────────┘
        │ 提示词 + 请求体
        ├──► aiPrompt.ts（12 段常量 + 五段拼装）
        └──► aiTokenFallback.ts（max_tokens 阶梯与越界识别）
```

| 模块 | 职责 | 允许依赖 |
| --- | --- | --- |
| `services/aiPrompt.ts` | 12 个段落常量、`systemPromptOf(ctx)`、`buildUserPrompt`、档位/风格归一 | `types/*`、`chartFacts`（维度标签） |
| `services/chartFacts.ts` | 盘面事实块的**唯一**实现：整盘 / 逐闸门 / 逐通道 / 模块 ①–⑤ / 勾选签名 | `interpretations`、`gateInsight`、`crossData`、`engine/*` |
| `services/aiReadingPlan.ts` | 纯函数：请求 → 计划（任务 key / scope / ref / offline / 融合 / 标题 / 请求数） | `chartFacts`、`readingAngles`、`types/aiReading` |
| `services/aiReadingRunner.ts` | 执行计划：单次档 1 请求、多请求档调度 + 末位融合、进度与 `FullReport` | `aiScheduler`、`aiClient`、`aiEvidence` |
| `services/aiScheduler.ts` | 滑动窗口：起速、稳态补发、同槽重试、取消、进度；不含任何业务概念 | `aiConcurrency`、`aiAttempt` |
| `services/aiEvidence.ts` | 依据覆盖 / 维度白名单 / 条目覆盖三项检测，可测、只告警、不改写正文 | `chartFacts`、`types/hd` |
| `services/aiTokenFallback.ts` | `max_tokens` 阶梯（128000 → 64000 → 32000 → 16000 → 8192 → 不带该字段）与越界措辞识别 | 无 |

三条不变式：

1. **提示词正文只有一个来源**：代码常量在 `aiPrompt.ts`，权威文本在
   `docs/spec/AI-PROMPT-v4.0.md`，两者必须逐字一致（`scripts/sync-prompt-spec.mjs --check`
   与 `tests/ai-prompt.test.ts` 双重守护）。`aiClient.ts` 只重导出，不留第二份正文。
2. **事实块只有一个来源**：所有入口、所有档位、所有单点解读的事实文本都出自
   `chartFacts.ts`；任何地方再写一份必然会与它漂移（`aiFullReading.ts` 曾是第二份，已删除）。
3. **调度状态只在函数栈内**：并发数与 `max_tokens` 降级的进度都是单次调用的局部变量，
   不写模块级变量、不跨请求共享，避免一条请求失败把并发中的其他请求一起降质。

并发模型（详见 [docs/AI-WORKSPACE.md](AI-WORKSPACE.md) §5）：设置项 `aiMaxConcurrency`
是唯一旋钮（1–99，默认 3），语义是「每秒起 1 个，直到在跑 N 个；之后落定即补」。
`resolveSchedule` / 双参数 / `aiStepMode` 已随 v3.6.0 移除。
