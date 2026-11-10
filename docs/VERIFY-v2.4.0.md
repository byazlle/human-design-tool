# v2.4.0 交付与验证记录

- 发布日期：2026-11-10
- 版本 tag：`v2.4.0` → commit `69626da6cfcf03413b06fb892cbb307718b5273b`（tree `a70aed98637fcfe15fa3c318afd2b9fb04fd812c`）
- 前置版本：v2.3.0（`6a6d50f3`）
- Release：https://github.com/byazlle/human-design-tool/releases/tag/v2.4.0 （Release id `440235941`）
- 归档：`D:\AIws\txgzml\rlt-archive\v2.4.0\`（MANIFEST 含逐文件 SHA256）

---

## 一、本版主题

**跨档案批量生成解读 + AI 解读结果持久化 + 提示词 v3.2 + 页面架构收敛**。
计算内核、数据结构、曼陀罗锚点（`MANDALA_OFFSET = 29.875`、Gate 41 起于 `302.000°`）、
`SCHEMA_VERSION = 3`、档案备份形状全部零改动，因此**计算结果与 v2.3.0 逐字段一致**。

## 二、需求逐项落地

| # | 需求（来源 m00199） | 落地 |
| --- | --- | --- |
| 1 | AI 提示词优化 | `PROMPT_VERSION` 3.1 → 3.2；三套提示词新增【与事实块的分工】；字数由硬指标降为上限。`docs/spec/AI-PROMPT-v2.0.md` 由 `scripts/sync-prompt-spec.mjs` 同步且 `--check` 通过 |
| 2 | 批量生成解读（并发批量） | 新增跨档案批量引擎 + 发起对话框 + 常驻进度条 + 失败重跑；复用既有并发调度，唯一闸门仍是「任务数 ≤ 并发上限」 |
| 3 | 全站页面架构梳理优化 | 5 个盘面页重复的 18 行 AI 面板绑定收敛为 `AiReadingHost.vue`；修掉重构暴露出的「中断」跨实例失效 |

## 三、新增／变更文件

**新增**

| 文件 | 职责 |
| --- | --- |
| `src/services/chartFacts.ts` | 事实块与离线释义的统一拼装（手动与批量共用，避免口径漂移） |
| `src/services/aiAttempt.ts` | 取消判定 / 失败重试 1 次 / 错误文案（原内联在 `aiFullReading`） |
| `src/services/aiBatchReading.ts` | 跨档案批量编排（纯函数式，不碰 store、不写 localStorage） |
| `src/composables/useAiBatch.ts` | 批量的编排层（跑谁 + 结果落哪 + 增量落库） |
| `src/stores/readings.ts` | AI 解读结果持久化（`hdt.ai.readings.v1`，每档案保留最新 12 条） |
| `src/components/archive/BatchReadingDialog.vue` | 批量发起对话框（范围 / 维度 / 角度 / 档位 / 已有解读处理 + 实时预检） |
| `src/components/archive/BatchReadingStatus.vue` | 顶层常驻进度与结论条（切页可见、可中断） |
| `src/components/archive/ArchiveReadingsDrawer.vue` | 单盘「解读记录」抽屉（回看 / 复制 / 重新生成 / 删除） |
| `src/components/panel/AiReadingHost.vue` | 统一的 AI 面板挂载点（替代 5 份重复绑定） |

**变更**：`src/services/aiClient.ts`（提示词 v3.2）、`src/services/aiFullReading.ts`（改用
`aiAttempt`）、`src/stores/ui.ts`（`batch` 状态）、`src/App.vue`（挂常驻条 + 启动清理孤儿解读）、
`src/composables/useAiResultActions.ts`（保存同时落档案）、`src/composables/useAiReading.ts`
（controller 改模块级）、`src/components/panel/AiComposer.vue`、5 个盘面视图 + 档案首页 + 设置相关视图。

**测试新增**：`tests/aiBatchReading.test.ts`（20 项）、`tests/chartFacts.test.ts`（26 项）、
`tests/readings.test.ts`（25 项）、`tests/aiReadingHost.test.ts`（4 项）。

## 四、三处真实缺陷（本版修复）

1. **批量与手动的缓存键分裂** —— 批量任务未传 `chartSummary`，而 `cacheKey()` 把
   `chartSummary` 拼进内容哈希，同一张盘「先手动生成过」在批量时算不出同一个键，
   缓存两处各存一份、永远互相不命中，表现为**重复计费**。
2. **批量上下文口径不一致** —— 批量曾把任务标题（含档案名）当 `angle` 注入，
   同一张盘的【用户选择】角度行与手动解读不同。
3. **面板「中断」按钮在视图之外失效** —— `AbortController` 原为 `useAiReading()`
   实例私有，而视图负责发起、`AiReadingHost` 负责中断，host 侧看到自己的 `null`
   便判定「无在途请求」直接返回。因全局同时只可能存在一次解读，改为模块级共用。

## 五、验证（实跑证据）

```text
npm run typecheck              → exit 0（vue-tsc --noEmit）
npm test                       → Test Files 24 passed (24)、Tests 304 passed (304)
npm run build                  → ✓ built in 2.02s
node scripts/sync-prompt-spec.mjs --check → [OK] 四个提示词代码块与源码常量逐字一致
```

CI（GitHub Actions `Build Installers`）：

| run | head_sha | 结论 |
| --- | --- | --- |
| `42801519370`（main push） | `69626da6` | success |
| `42801526611`（tag `v2.4.0`） | `69626da6` | success（含打包后冒烟自检 + Release 附加产物） |

> 说明：本机为无交互会话，打包后的 GUI 冒烟自检（`HD_SMOKE=1`）无法在本地跑通
> （进程在无桌面会话时立即退出，不产出 `smoke-result.json`），故以 **CI 的
> windows-latest 冒烟结果为准**。Release 与归档携带的 exe 取自 CI 产物
> （80574498 字节，即通过冒烟的那一份），而非本地构建的 80574549 字节版本。

## 六、撞过的坑（接手必读）

- **`.env` 里的冒号是全角「：」** —— 用 `Select-String -Pattern 'ghp_...'` 取 token 会返回
  空数组并抛 `NullArray`。必须用 `[regex]::Match([IO.File]::ReadAllText('.env'), 'ghp_[A-Za-z0-9]+')`。
- **`archive-version.mjs` 覆盖式重写根索引** —— 带版本参数运行只会把该版本写进 `INDEX.md`，
  其余版本的行会消失。追加新版本后要**不带参数跑一次全量**（或手工补索引）。
- **脚本依赖 `git` 在 PATH** —— `archive-version.mjs` / `verify-tree-parity.mjs` 用
  `execFileSync('git', ...)`；本机需先 `$env:PATH = "D:\AIws\WorkBuddy\resources\vendor\PortableGit\cmd;" + $env:PATH`。
- **`publish-release.py` 会用本地产物覆盖 CI 产物** —— 若本地构建与 CI 构建字节不同，
  会先删旧 asset 再上传本地的。要保留 CI 冒烟验证过的那一份，就得先把 CI artifact 下载下来
  替换本地文件再跑脚本。
- **PowerShell 无 heredoc** —— 中文提交信息会被代码页破坏，必须用 `write` 工具写
  `.git/COMMIT_MSG_*.tmp` 再 `git commit -F`。
- **vitest 的 stderr 噪声**会让 PowerShell 报 `[exit code: 1]`，判断成败只看 `Test Files N passed`。

## 七、遗留与下一步

- `useAiReading.ts` 的 `clearError()` 仍是 0 引用死代码；`retry(externalSignal?)` 第二参无人使用。
  两者都无行为影响，留待下次顺手清理。
- `class="page page-shell"` 与各视图 `goSettings` 为**有意保留**的重复（理由见
  `docs/PLAN-v2.4.0.md` §3.3）。
- 新增路由 / 改提示词 / 改事实块顺序都会影响缓存键或冻结清单，动手前先读
  `docs/PLAN-v2.4.0.md` 与 `docs/HANDOVER-2026-11-10.md` 的冻结清单一节。
