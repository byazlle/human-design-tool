# v3.0.0 交付与验证记录

> 时间：2026-11-11（GMT+8）
> 基准：`交接文件夹/2026年11月11日16点55分/16点55分.md` 与
> `docs/superpowers/specs/2026-11-11-v3.0.0-design.md`（B档视觉 + 流式 + 批量导出，用户已确认）
> 前置版本：v2.5.0（`f9a00bf` / `92d1762`）

## 一、本版做了什么

| 块 | 落点 |
| --- | --- |
| nova 视觉（B档） | `src/styles/tokens.css`、`base.css`（纯追加两套 `[data-skin='nova']` 覆盖）、`src/stores/settings.ts`（`skin` + `styleTouched` + `setSkin` / `resetDefaultStyle`）、`SettingsForm.vue`（皮肤切换 + 恢复默认样式） |
| SSE 传输 | `src/services/sse.ts`（新，纯函数分帧）、`src/services/aiTransport.ts`（`aiHttpStream` 三通道）、`desktop/main.cjs`（`ai:stream` + `ai:stream-event`）、`desktop/preload.cjs`、`desktopBridge.ts` |
| 请求接入 | `src/services/aiClient.ts`（`AiExplainArgs.onStream`；不传时请求体与 v2.5.0 逐字一致）、`aiBatchReading.ts` / `aiFullReading.ts`（逐路 hooks） |
| 逐路状态 | `src/composables/useAiStreams.ts`（新，模块级 Map + 250ms 节流）、`useAiReading.ts`、`useAiBatch.ts`、`AiReadingPanel.vue`（B 区状态行 + D 区逐路行）、`BatchReadingStatus.vue`（可折叠逐路明细） |
| 批量落盘 | `src/services/batchExport.ts`（新）、`desktop/main.cjs`（`dir:default` / `dir:pick` / `file:write-in-dir`，`flag:'wx'` 不覆盖）、`BatchReadingDialog.vue`（保存位置 + 自动导出开关） |
| P1 / P2 / P3 | `useAiResultActions.ts` + 5 个视图 + `stores/ui.ts`（生成元数据锁定）；`AI-PROMPT-v2.0.md` §六 + `sync-prompt-spec.mjs`；预算语义文案；`aiTransportKind()` 接进错误归类 |

## 二、关键设计决定

1. **`PROMPT_VERSION` 保持 3.3**。四套提示词正文与两段受众段落逐字未改，只是把受众常量改成可由同步脚本提取的 `PROMPT_SYSTEM_AUDIENCE_*` 并写进规范文档。改版本号会无谓触发 4 处测试钉与缓存失效。
2. **默认明暗仍 `light`**。nova 默认深色会让 CI 冒烟的「深色模式切换」断言空转通过（找不到「深色」按钮就不点击，`dataset.theme` 本来是 dark）。
3. **`styleTouched` 显式标记**。`applyToDom()` 此前无条件把 5 个颜色变量写成内联样式，优先级高于任何皮肤规则；不修会让 nova 的九中心 / 关键字配色静默失效。未标记的用户改用皮肤配色，改过设置的人保留控制权。
4. **流式不改 `explain()` 返回类型与解析逻辑**。流式结果合成 OpenAI 兼容 JSON（`{choices:[{message:{content},finish_reason}]}`）返回，续写 / 触顶 / 缓存 / 6 类错误分类全部复用。
5. **速率用「字/秒」而非 tok/s**。只有服务端知道真实 token 数；累计有效字符 ÷ 时间是能实测的量。已收字数逐字累计不丢，仅渲染节流 ≤4 次/秒。
6. **不覆盖用户文件**。主进程 `file:write-in-dir` 用 `flag:'wx'`，重名自动 `-2` / `-3`；文件名 basename 预留后缀长度。
7. **保留既有静态契约**。五区结构、`role="status"` 恰好 1 处、`class="progress-wrap"` 恰好 1 处、`emit('cancel')` 恰好 3 处、`AiProgress` 8 字段、禁止词与全部冒烟选择器零改动；新增流式行一律用 `role="list"` 与新类名。

## 三、验证证据

```
npm run typecheck                          → 0 错误
npm run test                               → 28 files / 345 tests 全绿
npm run build                              → ✓ built in 3.13s
node scripts/sync-prompt-spec.mjs --check  → [OK] 6 个提示词代码块与源码常量逐字一致
node --check desktop/main.cjs              → OK
node --check desktop/preload.cjs           → OK
```

新增回归：

- `tests/aiResultActions.test.ts`（4 项）：钉住「同一张盘存过简明版后，专业版批量不应跳过它」、元数据回落与显式优先。
- `tests/batchExport.test.ts`（8 项）：文件名清洗与长度、与手动导出逐字一致、网页退化下载、单份写盘失败不回滚其余份、不覆盖语义入口。
- `tests/aiStream.test.ts`（10 项）：跨 chunk SSE 分帧、delta / message / `[DONE]` / 非法 JSON、默认请求体不含 `stream`、流式四态回调、非流式回退、逐路状态隔离与速率。
- `tests/ai-prompt.test.ts` 块数断言由「恰好 6」放宽为下限，并新增两段受众段落的逐字比对。

## 四、限制与未做

1. **本机无交互桌面会话**：`HD_SMOKE=1` 的 29 项 GUI 冒烟与「一眼不同」截图验收只能由 CI `windows-latest` 提供。安装包能否启动以 CI 为准。
2. **本机无 Android SDK**：APK 由 CI 产出；安卓端按设计降级为非流式（状态区明示），Java SSE 未实现。
3. **真实中转站未做端到端联调**：交接文件里的 API Key 已过期；SSE 分帧、回退、四态均由 stub 单测覆盖，桌面主进程流式只做了静态语法 / 类型检查。
4. **网页端 CORS 无解**：不返回 CORS 头的中转站在网页版仍连不上，失败文案已按 `aiTransportKind()` 给出「改用桌面 / 安卓版」的可执行建议。
5. **B档的 8 视图骨架重排与约 106 处组件内硬编码色未逐个替换**：本版通过 `tokens.css` / `base.css` 两套覆盖做到全站「一眼不同」，个别局部 scoped 样式可能仍带 classic 痕迹。
6. **nova 未新增独立单测**：`styleTouched` 语义与皮肤切换目前由 typecheck 与冒烟契约间接覆盖，建议后续补专门的 store 回归。
7. ~~归档脚本待 tag 存在后全量重跑~~ **已完成**：`node scripts/archive-version.mjs` 不带参数全量重跑，`INDEX.md` 含 13 个版本，`rlt-archive/v3.0.0/` 有源码包、本机 exe 与含 SHA256 的 MANIFEST。APK 待 CI 产出后补齐。
8. **GitHub 密钥扫描**：`交接文件夹/2026年11月10日21点45分/交接.md`（2.48 MB）与 `2026年11月11日16点55分/16点55分.md`（3.0 MB）内含历史 API Key，首次推送被 `push declined due to repository rule violations` 拒绝。处理方式是**文件原样保留在本机**、仅用 `.git/info/exclude` 本地排除不入库，其余交接资料（含重命名为「老版本…」的目录）照常入库且 git 识别为 100% rename。未删除任何用户资料，也未放行任何密钥。

## 五、版本与发布状态

- 根 / desktop `package.json`、`package-lock.json` → `3.0.0`；`android/AndroidManifest.xml` → `versionCode=30000` / `versionName=3.0.0`。
- 本地提交 `b36fa77`（父提交 `92d1762` 一并带上）；推送 main 成功：`d24dc6d..b36fa77`。
- annotated tag `v3.0.0` → `b36fa77`，已推送；**不移动**。
- CI：`#56`（push main）、`#57`（tag v3.0.0）由本次推送触发，构建 Windows NSIS 与 Android APK 并自动附加到 Release；结果以 GitHub Actions 页面为准。
- 本机打包：`python scripts/build-exe.py` 成功，`release/desktop/HumanDesign-Setup-3.0.0.exe`（约 76.9 MB / 80,6xx,xxx B），已复制进 `rlt-archive/v3.0.0/installers/`。本机无交互桌面会话，GUI 冒烟以 CI 为准；若 CI 产物可用，发布件应优先取 CI 已验证的那一份。
- 归档：`D:\AIws\txgzml\rlt-archive\v3.0.0\`（源码 1.55 MB + 安装包），`INDEX.md` 共 13 版。
