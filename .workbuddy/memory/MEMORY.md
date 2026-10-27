# 项目长期笔记：HumanDesignTool（人类图计算应用）

## CI 与打包（关键坑）
- `.gitignore` 的 `build/` 匹配任意层级，曾把 `desktop/build/icon.ico`（electron-builder 必需）忽略
  → CI NSIS 打包失败。已加 `!desktop/build/`、`!desktop/build/**` 反白名单；icon.ico 已入库，勿删。
- `build-exe.py` 的 electron-builder 调用必须带 `--publish never`：CI 下 v26 隐式发布缺 GH_TOKEN 会失败。
- CI 任务分工：内核测试 / Android APK / Windows 安装包（NSIS）/ 附加产物到 Release（单独 job）。
- 查 CI：GET /repos/byazlle/human-design-tool/actions/runs；job 日志 302 → curl -L 可直接跟随（带 token 即可）。

## 推送工作流（关键坑）
- 本机有 TLS 拦截代理：Python urllib 直连 api.github.com 报 SSL EOF；系统 curl / git(schannel 后端) 可通。
- 兜底脚本 scripts/push-api.py 已改为 curl 实现（--retry 5、请求体走临时文件 -d @file）。
  用法：python scripts/push-api.py [commit]，以远端 HEAD 为基底推送单次提交 diff，绕开非快进分叉。
- 历史分叉常因 core.autocrlf（本仓库开启）：本地提交存 CRLF、API 推送存 LF → 树不同。
  对齐：git -c http.sslBackend=schannel fetch origin main && git reset --hard origin/main。
- CI：push main / tag v* 触发 .github/workflows/build.yml 构建 Windows(NSIS+MSI) 与 Android(APK)。

## 人类图口径（审查结论，改动前先看这里）
- **MANDALA_OFFSET 必须 = 29.875**（= 331.875 − 302，即 5 门宽 28.125 + 1.75）。
  现库里的 29.8333 会让 Gate 41 起于 302.0417°，权威口径是宝瓶 2°00′ = 302.000°。
  **L1 证据（已锁定，勿再翻案）**：Jovian 官方公布 Rave New Year = 太阳进第 41 门，
  2024-01-22 13:18 UTC、2026-01-22 00:54 UTC；本项目星历在两时刻均得太阳黄经 302.0002°，
  反解 302.000° 得 00:53:46（差 14 秒），反解 302.0417° 得 01:52:47（差 58 分 47 秒）。
  复现：`node scripts/check-mandala-anchor.mjs`（在 Rave New Year 时刻，现实现返回 Gate 60.6，
  L1 应为 41.1）。注意：rave-engine 的 src/calc/mandala.js 用的是同一个错常数，所以
  "与 rave-engine 一致"不是正确性证明。
- 四个边界锚点：41@302.000 / 60 末@302.000 / 18@183.875 / 25@358.250。详见 docs/review/。
- 交叉角度：右角度 7 个（含 **4/6**）、并列仅 4/1、左角度 4 个（5/1、5/2、6/2、6/3）。
  现有 `if 4/1 → 并列; else if pl>=5 → 左; else 右` **是对的**，别去"修"。
- `defined` 只用于中心/通道/整图；闸门只有 activated/hanging/open 三态。
- 连接盘（合盘）没有类型/权威/轮回交叉，只有电磁/妥协/主导/同伴四动力学。
- Chiron 不属于 13 体，不参与类型/权威/通道判定。

## 验证命令
- 类型+构建：npm run build（vue-tsc --noEmit && vite build）
- 测试：npm run test（vitest，29 项）
- 打包 Windows 安装包：npm run build（根）→ python scripts/build-exe.py（封 NSIS）
- 打包 Android APK：python scripts/build-apk.py（需本地 Android 工具链，CI 更稳）
