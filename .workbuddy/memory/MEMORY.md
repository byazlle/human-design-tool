# 项目长期笔记：HumanDesignTool（人类图计算应用）

## CI 与打包（关键坑）
- `.gitignore` 的 `build/` 匹配任意层级，曾把 `desktop/build/icon.ico`（electron-builder 必需）忽略
  → CI NSIS 打包失败。已加 `!desktop/build/`、`!desktop/build/**` 反白名单；icon.ico 已入库，勿删。
- `build-exe.py` 的 electron-builder 调用必须带 `--publish never`：CI 下 v26 隐式发布缺 GH_TOKEN 会失败。
- CI 任务分工：内核测试 / Android APK / Windows 安装包（NSIS）/ 附加产物到 Release（单独 job）。
- 查 CI：GET /repos/byazlle/human-design-tool/actions/runs；job 日志 302 → curl -L 可直接跟随（带 token 即可）。

## 推送工作流（关键坑）
- **本机 TLS 实况（2026-11-10 实测，此前记载有误，已订正）**：
  - `curl.exe` 对 api.github.com / github.com **全线 HTTP 000**：`curl: (35) schannel:
    AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`。PowerShell
    `Invoke-RestMethod` 报「基础连接已经关闭」。**即「系统 curl 可通」的旧记载不成立。**
  - `git -c http.sslBackend=openssl` **可完成握手**（schannel 后端不行），但 `github.com:443`
    **间歇性 reset**（README 抓取与 fetch 均多次失败）；`ls-remote` 与 `push` 曾成功，不稳定。
  - **`api.github.com` 经 Node 内置 fetch 稳定 200**（走 Node 自带 OpenSSL）→ 首选通道。
    `scripts/ghfetch.mjs` 即为此封装（`node scripts/ghfetch.mjs GET /rate_limit`）。
  - `git` 不在 PATH：用 `D:\AIws\WorkBuddy\resources\vendor\PortableGit\cmd\git.exe`。
  - push 还需 `-c credential.helper=`（禁凭据助手），否则报 `could not read Username`。
- 兜底脚本 scripts/push-api.py 用 curl 实现，**在本机当前不可直接运行**（curl TLS 000 + 裸 git 不在 PATH），
  但在 CI runner 上可用。用法：python scripts/push-api.py [commit]，以远端 HEAD 为基底推送单次提交 diff。
- **分叉根因已定性（2026-11-10，勿再翻案）**：两份历史**内容 100% 相同**
  （`git diff --ignore-cr-at-eol main origin/main` = `88 files changed, 0 insertions(+), 0 deletions(-)`，
   blob sha 不同的条目数为 0），唯一分歧是**文件模式位**：本地 100755=57 / 远端 100755=145。
  根因是 `scripts/push-api.py` 旧代码 `os.access(abs_path, os.X_OK)` 在 Windows 上对普通文本也返回 True。
  **附带订正**：本仓库 blob 里**确有** 14 个文本文件混入 CRLF（.github/workflows/build.yml、.gitignore、
  package.json、desktop/package.json、desktop/package-lock.json、scripts/build-apk.py、scripts/build-exe.py、
  scripts/push-api.py、scripts/publish-release.py、src/components/base/GlassBackdrop.vue、
  src/components/chart/HumanDesignBodyGraph.vue、src/services/destinyText.ts、src/styles/tokens.css、
  .workbuddy/memory/2026-10-21.md），**但不是分叉的原因**。
  **已废的旧建议**：`git reset --hard origin/main` —— 会丢掉本地 18 个提交，**永不可照做**。
  现行对齐方式：`.gitattributes` + `core.autocrlf=false` + `git add --renormalize`，已落地。
- CI：push main / tag v* 触发 .github/workflows/build.yml 构建 Windows(NSIS) 与 Android(APK)。


## 人类图口径（历史审查意见，非用户已确认口径）
> 2026-11-06 现状盘点：用户明确要求「业务规则/术语/流程状态/边界不清楚时先集中提问，确认前不推断、不下结论」。
> 以下全部是 docs/review/ 历史审查意见（基于 v1.1.0），**未逐条获用户确认**，已全部列入本轮待确认清单；
> 确认前不得作为结论或改动依据，也不要拿"与历史审查一致"当正确性证明。

- **MANDALA_OFFSET 审查意见主张 = 29.875**（= 331.875 − 302，即 5 门宽 28.125 + 1.75）。
  代码事实：v1.1.0 及更早为 29.8333；**v1.2.0 起 `src/engine/mandala.ts:35` 已是 29.875**，
  但 `docs/ARCHITECTURE.md:114` 仍写 29.8333°（文档未同步）。29.8333 会让 Gate 41 起于 302.0417°。
  **L1 证据（已锁定，勿再翻案）**：Jovian 官方公布 Rave New Year = 太阳进第 41 门，
  2024-01-22 13:18 UTC、2026-01-22 00:54 UTC；本项目星历在两时刻均得太阳黄经 302.0002°，
  反解 302.000° 得 00:53:46（差 14 秒），反解 302.0417° 得 01:52:47（差 58 分 47 秒）。
  复现脚本 `node scripts/check-mandala-anchor.mjs` 是**对照旧口径 29.8333 的审计脚本**
  （输出含 ❌ /「发现 2 处不符」），不是"当前实现是否通过"的校验器。注意：rave-engine 的 src/calc/mandala.js 用的是同一个错常数，所以
  "与 rave-engine 一致"不是正确性证明。
- 四个边界锚点：41@302.000 / 60 末@302.000 / 18@183.875 / 25@358.250。详见 docs/review/。
- 交叉角度：右角度 7 个（含 **4/6**）、并列仅 4/1、左角度 4 个（5/1、5/2、6/2、6/3）。
  现有 `if 4/1 → 并列; else if pl>=5 → 左; else 右` **是对的**，别去"修"。
- `defined` 只用于中心/通道/整图；闸门只有 activated/hanging/open 三态。
- 连接盘（合盘）没有类型/权威/轮回交叉，只有电磁/妥协/主导/同伴四动力学。
- Chiron 不属于 13 体，不参与类型/权威/通道判定。

## 验证命令
- 类型+构建：npm run build（vue-tsc --noEmit && vite build）
- 测试：npm run test（vitest，2026-11-06 实测 5 文件 / 32 项全绿；`npm run typecheck`、`npm run build` 亦通过）
- 打包 Windows 安装包：npm run build（根）→ python scripts/build-exe.py（封 NSIS）
- 打包 Android APK：python scripts/build-apk.py（需本地 Android 工具链，CI 更稳）
