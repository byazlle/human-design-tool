# v2.5.0 交付与验证记录

> 本轮任务来自交接文档末尾的三条反馈：① 批量解读每份都是无限 token；② 设置里要能选「有基础 / 零基础」并在提示词里写明白；③ 中转站接口用不了、要能自动获取模型。
> 用户补充：交接文件里记录的那个 API Key 已过期，**接口服务本身是好的**，本版不做该站点的在线验证。

## 一、结论

三项都已落地。`PROMPT_VERSION` 3.2 → **3.3**，版本号 2.4.0 → **2.5.0**。
`typecheck` 零错误、`test` **25 文件 / 323 项全绿**、`build` 通过、提示词规范同步检查通过、安卓 Java 源码本地 `javac` 编译通过。

## 二、三项需求落点

### ① 单份 token 预算

| 文件 | 改动 |
| --- | --- |
| `src/services/aiClient.ts` | `AiExplainArgs.tokenBudget`；`MIN_TOKEN_BUDGET=200`；`applyTokenBudget()` 把「本篇总预算」折算成单轮 `max_tokens`（÷ `MAX_CONTINUATIONS+1`），夹在 [200, 档位默认额度]。0 / 未传 = 不限制，行为与 v2.4.0 一致。`completed` 阶段带 `truncated`；触顶内容**不写缓存**。 |
| `src/stores/settings.ts` | `aiTokenBudget`（默认 0）、`normalizeTokenBudget()`、`MAX_TOKEN_BUDGET=100000`、`setAiTokenBudget()`，随 `hdt.settings.v1` 持久化。 |
| `src/components/settings/SettingsForm.vue` | 设置页「单份解读 token 上限」输入 + 保存按钮，行内校验。 |
| `src/components/archive/BatchReadingDialog.vue` | 批量对话框可临时覆盖全局值（0 / 1000 / 2000 / 4000 / 8000 预设），预检区显示当前全局值；完成后点名触顶档案。 |
| `src/services/aiBatchReading.ts` / `useAiBatch.ts` | `tokenBudget` 逐份传给 `explain()`；`BatchOutcome.truncated`、`BatchReport.truncatedNames`；结论条写明「其中 N 份触顶可能不完整」。 |
| `src/stores/readings.ts` / `ArchiveReadingsDrawer.vue` | 解读记录带 `truncated`，抽屉标「可能不完整」，导出文本同样标注。 |

**关键取舍**：预算**不进缓存键**。它只影响输出长度上限，若进键，用户把预算调小试一次就会导致同一张盘重新付费生成——省钱的设定不该增加成本。触顶内容不进缓存，否则调大预算后仍会永远命中那份半截结果。

### ② 专业版 / 简明版

| 文件 | 改动 |
| --- | --- |
| `src/types/hd.ts` | `AiAudience = 'pro' \| 'plain'`。 |
| `src/services/aiClient.ts` | `AUDIENCE_PRO` / `AUDIENCE_PLAIN` 两段【读者背景】，`systemPromptOf()` 第三参显式传值时追加到四套正文末尾；`resolveAudience()` 缺省 `pro`；`cacheKey()` 含受众。四套正文逐字不动（规范同步检查通过），字数契约与事实块不变。 |
| 设置页 | 「面向人群」两个选项卡，说明写在界面上：专业版允许术语、不逐个解释；简明版大白话 + 生活例子、术语先解释再带原名、不删减结论。 |
| 调用链 | 手动单次（`useAiReading`）、完整版分项与融合（`aiFullReading`）、批量（`aiBatchReading`）全链路传 `audience`。 |
| 解读记录 | `readingKey()` 只在 `plain` 时追加 `|plain` 一段；专业版与所有旧记录仍是原 4 段键，存量数据零迁移，两版并存互不覆盖；批量「已有解读」判定按受众区分。 |

**提示词区分是明确的**：两段都单独成节、写进 system，不是靠 UI 文案或后置替换。缺省 `pro` 保持历史风格；`systemPromptOf()` 不传第三参时返回纯正文，既有提示词契约测试无需改写正文断言。

### ③ 中转站兼容 + 自动获取模型

**排查结论（上一轮实测，本版据此设计）**：

1. 该中转站 `GET /v1/models` 与 `POST /v1/chat/completions` 在未带 Key 时返回标准 JSON 错误 `API_KEY_REQUIRED` → **服务是活的**。
2. 带有效 Key 时 `/v1/models` 返回 200、`{"data":[{"id":"DeepSeek-V4.1-Flash-1017"}],"object":"list"}`，是标准 OpenAI 格式。
3. `OPTIONS /v1/models` 返回 **403**，POST 响应的 `access-control-allow-origin` 为 **null**。带 `Authorization` + `Content-Type: application/json` 的请求必然触发预检，所以渲染进程 / WebView 里永远连不上，而主进程里同一请求 200。
4. 模型名必须是列表里的那一个；随便填 `gpt-4o-mini` 会得到 404 `Model ... is not supported by any configured account in this group`。所以「自动获取模型」不是锦上添花，是这类中转站的刚需。
5. 推理型模型会把 `completion_tokens` 大量花在 `reasoning_tokens` 上，短 `max_tokens` 可能得到空正文——这是接口特性，本版不为此改变提示词口径，只把预算下限设为 200 并在触顶时明确标注。

**落地**：

| 文件 | 改动 |
| --- | --- |
| `src/services/aiTransport.ts`（新增） | 统一传输层：桌面端走 Electron 主进程 IPC、安卓端走原生桥、网页/测试退回 `fetch`。只搬一次 HTTP 往返，不理解 chat/completions 语义；失败以 `ok:false + errorKind` 返回，由 `explain()` 翻译成既有 6 类 `AiError`。 |
| `desktop/main.cjs` / `preload.cjs` | 主进程 `net.request` 代理（自动继承系统代理/证书），支持超时、取消、退出时清理；`hdDesktop.ai.request/cancel`。 |
| `android/java/.../MainActivity.java` | `hdAndroid.aiRequest/aiCancel`：后台线程 HttpURLConnection、主线程 `evaluateJavascript` 回传 `window.__hdAiResolve`。 |
| `src/services/aiClient.ts` | `explain()` 与 `probeAiConfig()` 都改走统一传输层（此前「测试」按钮会因预检失败，而生成解读却通）；新增 `resolveModelsEndpoint()`、`parseAiModels()`、`fetchAiModels()`——多路径兼容、401/403/404 明确文案、主路径 404/405 自动改试源站 `/v1/models`。 |
| `SettingsForm.vue` | 每条配置「获取模型」按钮 + 编辑表单「自动获取」；拉回的模型列成可点选 chips，点一下即写入该配置的模型名。 |

> ⚠️ **网页端仍受浏览器同源策略限制**。中转站不返回 CORS 头这件事不是客户端能修的，请用桌面版或安卓版；网页版只能连允许 CORS 的接口。失败文案里已写明这一点。

## 三、顺手修掉的一处真缺陷

上一轮草稿用模块级 `lastTruncated` / `takeTruncated()` 传递「本次是否截断」。批量并发时多个 `explain()` 同时完成，这个「上一次」会把 A 的截断误记到 B 头上。本版删掉该变量，改为**每次调用自己的 `onStage` 回调**收集 `completed.truncated`，逐项独立。`tests/aiBatchReading.test.ts` 加了并发下 a/b 分别断言的回归钉住这条语义。

## 四、实跑证据

```
npm run typecheck                      → 0 错误
npm test                               → 25 files / 323 tests 全绿
npm run build                          → ✓ built
node scripts/sync-prompt-spec.mjs --check → [OK] 四个提示词代码块与源码常量逐字一致
javac -source 11 -target 11 -encoding UTF-8 -classpath android-34/android.jar MainActivity.java → 编译通过
```

新增回归：`tests/ai-v250.test.ts`（17 项，预算折算 / 受众提示词与缓存键 / 模型列表解析与错误分支 / 触顶不写缓存 / 连通性测试走统一传输层），`tests/aiBatchReading.test.ts` 追加 2 项（受众与预算透传、并发触顶不串台）。

## 五、发布状态（2026-11-10 22:32 更新）

| 项 | 结果 |
| --- | --- |
| 提交 / 推送 | `f9a00bf`，`b0ea5c2..f9a00bf` 已推 main |
| tag | annotated `v2.5.0` → `f9a00bf`，已推 |
| CI | run `#53`（push main）与 `#54`（tag）**均 success** |
| Release | CI 的 `release` job 自动创建 `440463284`（非 draft / 非 prerelease），附 `HumanDesign-Setup-2.5.0.exe` **80,580,758 B**、`HumanDesign-2.5.0.apk` **632,494 B** |
| 归档 | `rlt-archive/v2.5.0/` 源码包 + MANIFEST 已生成，索引含 **12 个版本** |

**归档已补齐双安装包**：`rlt-archive/v2.5.0/installers/` 含 exe 与 apk，MANIFEST 记录 SHA256。下载过程有一条环境坑值得记：Node fetch 直连 `github.com` 与 PowerShell `Invoke-WebRequest` 都失败，PowerShell 工具执行时注入的 safe-delete 包装脚本还会触发本机杀软报警；最终用 **`.NET WebClient` 直链拿到 APK**、**Node fetch 经 GitHub 加速站 `https://30006000.xyz/<原始 GitHub URL>` 拿到 80 MB exe**，全程不经 PowerShell 下载命令。校验：exe `MZ` 头 / 80,580,758 B / SHA256 `ac104dc4…`；apk `PK` 头 / 632,494 B / SHA256 `e976ea69…`，与 Release 资产大小一致。

## 六、接手必读

1. **`PROMPT_VERSION` 是静态契约**：`tests/ai-prompt.test.ts`、`tests/aiClientContinuation.test.ts`、`tests/aiConcurrency.acceptance.test.ts` 三处硬编码版本号，改提示词版本必须同步改三处断言。
2. **提示词正文在 `docs/spec/AI-PROMPT-v2.0.md` 有镜像**，`sync-prompt-spec.mjs --check` 会逐字比对，改 `PROMPT_SYSTEM_*` 前先看该脚本。受众两段是**附加**在正文之后的，不在规范镜像里。
3. **安卓 Java 编译必须带 `-encoding UTF-8`**：Windows 默认 GBK 会把源码注释里的中文判成非法字符；构建脚本已带，手工验证时别漏。
4. **`resolveEndpoint()` 与 `resolveModelsEndpoint()` 是两套路径推导**，一个给 chat、一个给 models；新增中转站路径形态时两处都要看。
5. 交接文档里的那个 Key 已过期，**不要拿它做回归验证**；需要联调时向用户要新 Key。`fetchAiModels()` 的失败分支已覆盖 401/403/404/网络失败/空列表，可用 stub 单测，不依赖真实站点。
6. 本机 GUI 冒烟自检（`HD_SMOKE=1`）仍跑不通（无交互桌面会话），打包后的启动验证只能由 CI 的 windows-latest 提供——这条限制与 v2.4.0 相同。
7. 本地完整 APK 打包在 `build-apk.py` 清理旧 assets 时被环境的「单回合批量删除」保护拦下（一次要删 50+ 个带 hash 的旧文件），**不是代码或工具链问题**。Java 源码已按脚本同参 `javac` 编译通过，d8 / aapt2 / 签名链路交由 CI 的 ubuntu runner 完成。
