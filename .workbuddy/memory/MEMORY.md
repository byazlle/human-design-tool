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

## 验证命令
- 类型+构建：npm run build（vue-tsc --noEmit && vite build）
- 测试：npm run test（vitest，29 项）
- 打包 Windows 安装包：npm run build（根）→ python scripts/build-exe.py（封 NSIS）
- 打包 Android APK：python scripts/build-apk.py（需本地 Android 工具链，CI 更稳）
