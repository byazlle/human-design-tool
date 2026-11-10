# v2.4.0 迭代计划

生成日期：2026-11-10
基线：v2.3.0（本地 `306ff624a65910f3daeea9af26896d3b2c61bebf` / 远端 `4644c0fac8c4b53359ce536782bf52f7941a917f`）

## 阶段一：Git 治理（阻塞项，先做）

现状：本地 18 提交 / 远端 19 提交，内容 100% 一致（`git diff --ignore-cr-at-eol` 显示
`88 files changed, 0 insertions(+), 0 deletions(-)`），唯一分歧是**文件模式位**与少量**行尾**。

| 子任务 | 动作 |
| --- | --- |
| 1.1 | 备份当前状态（bundle + tag），保证可回滚 |
| 1.2 | 新增 `.gitattributes`：`* text=auto eol=lf`，二进制显式标注 |
| 1.3 | `core.autocrlf` 由 `true` 改为 `false`，让仓库确定性 |
| 1.4 | 模式归一：57 个 `100755` 全部改回 `100644`（Windows 无 exec 语义，CI 用 `python x.py` 显式调用，不需要 exec 位） |
| 1.5 | 行尾归一：14 个非 LF 文本 blob 统一为 LF |
| 1.6 | 合并孪生历史：`git merge origin/main -s ours`（保留双方祖先，不 force push） |
| 1.7 | 修 `scripts/push-api.py` 的 mode 取值（改为读 git index，不再看工作区可执行位） |
| 1.8 | 推送并验证 `git diff --raw main origin/main` 为空 |

### 关键环境事实（本机特有，务必遵守）

- **无 `pwsh`**：只有 Windows PowerShell 5.1（`powershell.exe`）。`pwsh` 命令不存在。
- **执行策略禁止 .ps1**：需 `powershell -NoProfile -ExecutionPolicy Bypass -File x.ps1`。
- **`git` 不在 PATH**：`D:\AIws\WorkBuddy\resources\vendor\PortableGit\cmd\git.exe`。
- **TLS 情况**：`curl.exe` 对 github 全线 HTTP 000（`schannel: SEC_E_NO_CREDENTIALS 0x8009030e`）；
  `git -c http.sslBackend=openssl` 可握手，但 **`github.com:443` 间歇性 reset**（实测多次失败）；
  **`api.github.com` 经 Node 内置 fetch 稳定 200**。故推送优先走 REST API。
- **Node 版本 v24.15.0**，npm 是 `C:\Program Files\nodejs\npm.cmd`。

## 阶段二：按版本归档

目标目录约定（仓库外，避免污染 git）：

```
D:\AIws\txgzml\rlt-archive\
  v2.3.0\
    source\      HumanDesignTool-2.3.0-src.zip     ← git archive 产物（受版本控制的内容）
    installers\  HumanDesign-Setup-2.3.0.exe
                 HumanDesign-2.3.0.apk
    MANIFEST.md  版本、commit、tree、文件校验（SHA256 + 字节数）
```

源文件归档用 `git archive`（只含受版本控制内容，天然排除 node_modules/dist/release）；
安装文件从 `release/` 复制。每个版本一份 `MANIFEST.md` 记录可校验信息。

## 阶段三：v2.4.0 开发

### 3.1 AI 提示词优化 ✅

现状：`src/services/aiClient.ts` 承载四套全文提示词，`PROMPT_VERSION` 已由 `3.1` 升到 `3.2`
（提示词正文一改必须 +1 版本号，同时进入缓存键）。规范文档在 `docs/spec/AI-PROMPT-v2.0.md`，
由 `scripts/sync-prompt-spec.mjs` 同步（`--check` 可校验）。

本轮改动：
- 三套提示词（精简 / 详细 / 完整分项）新增一致的【与事实块的分工】：禁止把事实块与
  离线释义里的内容换种说法再讲一遍，要写它们之上才成立的东西。
- 字数从硬指标降为上限：短盘面不要求凑满下限，篇幅让给真正复杂的结构。
- 顺带修复批量生成的两处真实缺陷（见 `aiBatchReading.ts`）：`chartSummary` 缺失导致
  缓存键与手动路径分裂；`angle` 被塞入任务标题导致上下文口径不一致。

### 3.2 批量生成解读（本次主功能）✅

需求已全部落地：对档案库中的多个档案批量生成 AI 解读，复用 v2.3.0 已有的并发调度。

| 要点 | 落地 |
| --- | --- |
| 选择范围 | 全部 / 已勾选（发起前实时预检「将生成 N 份 / 跳过 M 份」） |
| 解读档位与 scope | 三档 `AiDetailMode`；维度 8 项、角度 8 项 + 自定义方向 |
| 并发上限 | 沿用既有设置项，不新增第二套并发概念 |
| 进度可见 | `ui.batch` 常驻状态条，切页可见；可中断，已完成项保留 |
| 失败可续跑 | 失败项单独重跑，只重跑上次失败的 |
| 缓存复用 | 与手动解读共用 scope/ref/offline/chartSummary，缓存键逐字相同（已加测试） |
| 结果落库 | 新增 `src/stores/readings.ts`（`hdt.ai.readings.v1`），每档每档案保留 12 条 |

新增文件：`services/chartFacts.ts`、`services/aiAttempt.ts`、`services/aiBatchReading.ts`、
`composables/useAiBatch.ts`、`stores/readings.ts`、
`components/archive/{BatchReadingDialog,BatchReadingStatus,ArchiveReadingsDrawer}.vue`、
`tests/aiBatchReading.test.ts`（20 项）。

### 3.3 全站页面架构梳理优化 ✅

范围：`src/views/` 8 个视图 + `src/components/` + `src/styles/`。
沿用 v2.3.0 已建立的 `pageLayout` / `navigationSource` 抽象，不推倒重来。

本轮只收敛**确属重复**的部分，不做形态改造：

| 问题 | 落地 |
| --- | --- |
| 5 个盘面视图各自复制 18 行 `<AiReadingPanel>` 绑定（9 props + 6 事件） | 抽出 `components/panel/AiReadingHost.vue`；视图退化为 `<AiReadingHost :chart-name="…" @save="saveAi" />` |
| 5 份 `copyAi()` / `goSettings()` / `retryAi` / `abortAi` 包装 | 移入 host；视图只保留 `saveAi`（归属判定是视图的业务事实） |
| `useAiReading()` 被视图与 host 分别实例化，`abort()` 打不到在途请求 | controller 由闭包变量改为**模块级**共用（`ui.aiReading` 与 `useAiStatus` 本就是单例，语义一致） |
| `chartFacts.ts` 顶部注释写的维度顺序与实现不符 | 订正注释，并加测试钉住真实顺序 |

**刻意不改**（避免无收益的形态改造）：`class="page page-shell"` 各处保留——它只是
`base.css` 的两个工具类组合，再抽一层 wrapper 只会增加间接层；各视图 `goSettings`
保留——`AppToolbar` / `AiConfigBadge` 的 `@settings` 是各自的事件契约，收敛成共享函数
并不减少重复量，却让「哪个组件为什么去设置页」变得不明确。

## 待确认的开放问题

已解决：
1. ✅ AI 解读结果此前不落盘到 archive —— v2.4.0 已补 `stores/readings.ts`。
2. ✅ `交接文件夹/` 已入库（286,868 字节）。
3. ✅ 推送走 git push（`-c http.sslBackend=openssl -c credential.helper=`），
   `github.com:443` 仍会间歇 reset，用退避重试；REST API 作为查询通道（`scripts/ghfetch.mjs`）。

