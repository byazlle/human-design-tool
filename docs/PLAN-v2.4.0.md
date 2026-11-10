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

### 3.1 AI 提示词优化

现状：`src/services/aiClient.ts`（39KB）承载四套全文提示词，`PROMPT_VERSION = 3.1`，
提示词正文一改必须 +1 版本号（同时进入缓存键）。规范文档在 `docs/spec/AI-PROMPT-v2.0.md`（34KB），
由 `scripts/sync-prompt-spec.mjs` 同步。

### 3.2 批量生成解读（本次主功能）

需求：对档案库中的多个档案批量生成 AI 解读，复用 v2.3.0 已有的并发调度
（`src/services/aiConcurrency.ts`：`resolveSchedule` / `DEFAULT_AI_CONCURRENCY = 3` / `DEFAULT_AI_CONCURRENCY_LIMIT = 64`）。

要点：
- 选择范围（全部 / 选中 / 按筛选结果）
- 解读档位与 scope 选择（复用 `AiDetailMode`）
- 并发上限沿用既有设置项，不新增第二套并发概念
- 进度可见（N/总、成功/失败/跳过）、可中断、可续跑
- 失败项可单独重试；已缓存的档案跳过（缓存键已含提示词版本+内核版本+baseUrl+model+Key 短哈希）
- 结果落库：解读文本需可持久化到档案（当前 AI 解读是否存在 archive 里需先确认）

### 3.3 全站页面架构梳理优化

范围：`src/views/` 8 个视图 + `src/components/` + `src/styles/`。
沿用 v2.3.0 已建立的 `pageLayout` / `navigationSource` 抽象，不推倒重来。

## 待确认的开放问题

1. AI 解读结果当前是否持久化到 archive？若否，批量生成后结果会丢（需先补持久化）。
2. `交接文件夹/` 是否入库？
3. 推送走 REST API（稳定）还是等 `github.com:443` 恢复走 git push？
