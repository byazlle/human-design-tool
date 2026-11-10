# 接手提示词（可直接复制给其他专家团）

> 用途：把本轮 HumanDesignTool v2.2.0 迭代交给一个新的会话 / 专家团时，把下方「主提示词」整段作为第一条消息发送即可。
> 提示词是自包含的，接手方看不到本会话历史；所有事实与口径都指向 `docs/HANDOVER-2026-11-07.md`。
> 生成时间：2026-11-07 10:45 (GMT+8)

---

## 主提示词（推荐，完整接手）

````text
你是「全栈架构交付专家团」的接手方，负责把 D:/AIws/txgzml/rlt 的 HumanDesignTool 从 v2.1.0 推进到 v2.2.0。上一个执行方因后台子任务连续异常终止已中止，工作区留有未提交的半成品改动。请严格按下列顺序执行，不要跳过第一步。

【第一步：先读，不要动手改代码】
1. 通读 docs/HANDOVER-2026-11-07.md（完整交接文档）。其中 §1.1 是 11 项原始需求全文，§1.2/§1.3 是用户已逐条确认的口径与解读规则原文，§3 是逐文件进度，§4.2 是关键代码位置速查，§5.1 是止血步骤，§5.2 是详细待办，§5.3 是风险表，§6 是需求→文件映射。
2. 读 .workbuddy/memory/2026-11-07.md、.workbuddy/memory/2026-11-06.md、.workbuddy/memory/MEMORY.md（项目长期约束与工程坑）。
3. 读 功能与数据补全清单.md（绘图与布局历史）。
4. 跑 git status 与 git diff --stat，确认工作区状态与交接文档描述一致。
5. 用一句话复述你对「已完成 / 半成品 / 未开始」的理解，并列出执行顺序，然后再动手。

【任务目标】
完成用户 2026-11-07 提出的 11 项需求：图形 #1–#3（小三角旋转、通道平行、悬挂段 1/4）、页面设置 #4–#8（自定义页面布局、设置去重、设置返回、档案卡片重叠、无用代码清理）、#9 AI「完整版」三档解读、#10 报告四格式导出、#11 AI 超时 3600 秒。三档解读命名为「精简 / 详细 / 完整」，八大维度 = 综合解读、成长方向、扎根力、驱动力、人生轨迹、未来形势、前世姻缘、事业方向。

【不可违背的硬约束】
- 用户已确认的口径不要重新提问、不要二次推断（见交接文档 §1.2）；新增业务规则/术语/流程状态/边界条件不清楚时集中提问，确认前不推断、不补全任何人类图业务规则、不基于假设下结论。
- 文档与代码逻辑冲突时，以 free-human-design、natalengine、SharpAstrology、human-design-mcp、origincalcu、swisseph、@gonzih/hd-bodygraph 的计算规则与数据结构为基准；不脑补规则；仓库之间不一致时整理差异点交用户选标准。
- docs/review/ 三份报告是 v1.1.0 历史审查意见，不是用户已确认口径，不得拿「与历史审查一致」当正确性证明。
- MANDALA_OFFSET = 29.875、Gate 41 起于 302.000° 已锁定，勿再翻案。
- 不要删除或清空 .workbuddy/ 目录（只允许追加当日工作日志）。
- 不要 git commit、不要打 tag、不要发 Release、不要推送，除非用户明确要求。

【当前代码状态（接手方必须知道）】
- HEAD 0419f65（v2.1.0），11 个已修改文件全部未提交，无新增未跟踪文件；.workbuddy/memory/2026-11-06.md 的 +24 行是上一会话遗留，非本轮改动。
- 已完成且验证：图形 #1–#3（几何回归 22/22 全绿）、#7 档案卡片碰撞检测排布、#6 路由层来源记录与滚动恢复、#11 底层两处校验（settings.ts clampTimeout、aiClient.ts validateAiConfig 已放宽到 3600000ms）、docx@9.15.3 已安装。
- 当前构建是红的：npx vue-tsc --noEmit 报 5 个错误（根因是 src/types/hd.ts 的 AiDetailMode 仍为 'concise'|'detailed'，未加 'full'）；npm test 85/90（5 项失败）；npm run build 必然失败。这是上一个执行方停在 src/services/aiClient.ts 提示词改写中途造成的，不是历史遗留缺陷。
- 另有 9 项半成品：交接文档 §3.2 逐条列明（PROMPT_VERSION 仍 '2.0'、explain() 未传 scope 导致 FULL/FUSION 提示词拿不到、主动取消被误报超时、docs/spec 与测试未同步、SettingsView.goBack() 只加 import 未接线、SettingsForm 超时校验仍是 3–600 秒与底层冲突、5 项失败测试、自定义布局三文件零产出）。

【第二步：止血，先让构建回到全绿，再开始新功能】
严格按交接文档 §5.1 六步执行：① 扩 AiDetailMode 加 'full' 并新增 AiStepMode；② PROMPT_VERSION 升 '3.0'、explain() 改 systemPromptOf(params.mode, args.scope)、修取消误报超时、更新头部注释；③ settings store 支持三档并新增 aiStepMode；④ SettingsForm 超时 3 处 600→3600 + 2 处文案 + 1 处 hint + 预设档位、DETAIL_MODES 扩三档并加串行/并发开关；⑤ SettingsView.goBack() 用 consumeSettingsReturn()；⑥ 同步 docs/spec/AI-PROMPT-v2.0.md 的 text 代码块 + 改写 tests/ai-prompt.test.ts 4 项旧断言 + tests/dataManagement.test.ts:128 的超时边界值改为 3600001。
注意：tests/ai-prompt.test.ts 按 text 代码块出现顺序逐字比对规范文档（现有 4 块：1.3 事实块模板 / 2.1 精简全文 / 3.1 详细全文 / 4.6 验收夹具），新增 FULL 与 FUSION 后需同步改期望；建议写 scripts/sync-prompt-spec.mjs 从 aiClient.ts 常量自动生成代码块，避免逐字漂移。
止血后跑 npx vue-tsc --noEmit、npm test、npm run build 三条命令，全绿才进入第三步。

【第三步：按依赖顺序推进，每块单独验证】
建议顺序（详细做法见交接文档 §5.2）：
1. #11 超时收尾、#6 导航收尾、#7 补回归测试。
2. #5 设置去重 + #8 清理：删 SettingsForm 的「完整盘布局」「人体图幅面」两个 seg 与「绘图程序」section（含 DRAWING_ENGINES import 与 .engine* CSS，把 regenerateAll 按钮移到「数据」section）；删 ArchiveHomeView 的 [1,1.5,2] 缩放按钮；settings.ts 删 drawingEngine/layoutDensity/graphSize 字段与 dataset、setDrawingEngine；layouts.ts 删 V2；useDrawingEngine 恒返回 'v1'（或删除并改 7 个调用点）；删 src/components/chart/bodyGraphLayoutV2.ts、src-tauri/ 目录、package.json 的 @tauri-apps/cli；定位并删除全项目空函数按钮。凯龙回归盘 / 双盘对比 / 多盘 / 合盘必须保留，并优化展示与同步优化 AI 解读。
3. #4 自定义页面布局：新建 src/stores/pageLayout.ts、src/components/layout/CustomLayoutCanvas.vue、src/components/settings/CustomLayoutEditor.vue，接线 SettingsForm.vue 与 SingleChartView.vue。7 个模块 key 建议 angles/chart/meta/activation/cross/destiny/detail；全局一份配置存 hdt.page.layout.v1；默认「单列」预设保持现有视觉，另给「双列/三列」；支持拖拽 + 右下角改尺寸 + 8px 网格吸附 + 缩放滑块 + 锁定 + 显隐 + 重置；手机端固定退化为单列流。
4. #10 报告导出：MD / Word / HTML / PDF 四格式，三档解读都支持。Word 用已装的 docx@9（动态 import 避免进主 bundle）；桌面端复用 hdDesktop.file.save，需扩展 desktop/main.cjs 的 file:save（当前 filters 固定 json、只写 UTF-8 文本）并新增 PDF 保存 IPC；PDF 用 Electron webContents.printToPDF 或浏览器 window.print()，不要用 jsPDF 默认字体（中文乱码）；浏览器/安卓退化为 Blob + a.download。注意 renderMarkdown 不支持表格。
5. #9 AI 完整版编排：新建 src/services/aiFullReading.ts，任务 = 8 个 READING_ANGLES 维度 + chart.gates 逐个闸门 + chart.channels 逐条通道 + 最后 1 个 full-fusion 融合任务，每项独立调 explain()（scope 用 full-dimension / full-gate / full-channel / full-fusion，detailMode='full'）；串行/并发可切换，并发失败自动转串行，单项失败先重试 1 次、仍失败则跳过继续，全程可取消；进度显示第 N/M 项、当前项名称、预计剩余时间；整套报告 15000–25000 字。改 useAiReading.ts、stores/ui.ts、AiReadingPanel.vue（模块化展示、每条通道独立展开收起、末尾全盘整合分析 + 最终总结论）、SettingsForm.vue、SingleChartView.vue，并按 Q5.3 同步优化凯龙/双盘/多盘/合盘的 AI 解读。

【必须处理的已知风险】
- 17/11 闸门实际移动方向（17 左上、11 右上）与用户字面描述（17 右上、11 左上）相反，唯一原因是必须与竖直的 43-23 通道严格平行。不要擅自改回，请找用户目检确认后再定稿。
- 完整版约 45 次请求，融合步骤只注入每项前 300 字要点 + 标题，避免超出模型上下文。
- PROMPT_VERSION 必须升到 3.0，否则旧 p2.0 缓存会串档。
- 桌面端 AI 接口地址/Key 由用户自行配置，不内置任何厂商，失败不得伪造内容。
- 本仓库 core.autocrlf=true，diff 会有 LF/CRLF 警告；git push 常被本机 TLS 代理重置，需要时走 python scripts/push-api.py。

【验证与交付标准】
- npx vue-tsc --noEmit 无错、npm test 全绿（含新增回归）、npm run build 通过；桌面端与手机端各做一次目检（本轮尚未做视觉目检，只做了几何数值回归）。
- 每完成一个阶段用一句话通报进度；不确定处标注【待确认】，不编造事实、不伪造 AI 解读内容。
- 收尾追加 .workbuddy/memory/2026-11-07.md 工作日志（append-only），并逐项说明 11 项需求的完成状态与未决项。

【常用命令】
npm test / npx vue-tsc --noEmit / npm run build / npm run dev / python scripts/push-api.py [commit]

现在开始：先通读交接文档，复述你对「已完成 / 半成品 / 未开始」的理解并列出执行顺序，再动手改代码。
````

---

## 备用短提示词（只想让接手方先把构建修绿时用）

````text
接手 D:/AIws/txgzml/rlt 的 HumanDesignTool 迭代。先通读 docs/HANDOVER-2026-11-07.md（尤其 §1.2 已确认口径、§3.2 半成品清单、§5.1 止血步骤）。当前工作区有 11 个未提交改动，vue-tsc 报 5 错、npm test 85/90，根因是上一个执行方改 aiClient.ts 三档提示词时没同步 AiDetailMode 类型、PROMPT_VERSION、规范文档与测试。请只做 §5.1 六步止血，把 npx vue-tsc --noEmit、npm test、npm run build 三条命令跑到全绿，然后停下来汇报，不要开始新功能、不要提交 commit。用户硬约束：已确认口径不要重新提问，新增业务规则不清楚时集中确认，确认前不推断。
````

---

## 使用提示

- 主提示词已自包含，接手方无需本会话历史；若对方能访问同一工作区，直接复制「主提示词」整段发送即可。
- 若接手方是**全新的空工作区**（无法读取本地文件），需把 `docs/HANDOVER-2026-11-07.md` 一并作为附件或粘贴内容提供，否则提示词里的文件引用会失效。
- 建议在第一轮回复里要求对方先复述理解再动手（主提示词末尾已包含此要求），可避免半成品状态被误当成历史缺陷而回滚。
