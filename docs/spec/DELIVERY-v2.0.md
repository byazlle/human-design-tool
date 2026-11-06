# HumanDesignTool v2.0.0 · 交付清单

> 交付日期：2026-11-06
> 版本：**2.0.0**（根 `package.json` 为唯一版本源）
> 规范基线：`docs/spec/HD-SPEC-v2.0.md`
> 代码基线：`main` 分支，`ENGINE_VERSION = 2.0.0+mandala.29.875`，`SCHEMA_VERSION = 3`

---

## 1. 交付概述

| 项 | 状态 |
| --- | --- |
| 交付形态 | 可直接运行的完整工程（源码 + 文档 + 配置 + 构建产物），非片段 |
| 平台 | Web 静态站 / Windows（Electron + NSIS）/ Android（原生 WebView 壳） |
| 运行依赖 | 无后端、无账号；全部计算与数据在本机；唯一网络出口为用户自配的 AI 接口 |
| 测试 | 单元测试 **54 项 / 7 个文件**，全绿 |
| 类型检查 | `vue-tsc --noEmit` 通过 |
| 构建 | `vite build` 通过（197 modules） |
| 已知阻塞问题 | 0（非阻塞限制见第 7 节） |

### 本版交付的三条主线

1. **规范成文**：把 9 个开源实现的对照结论固化为 15 条可执行标准，每条标注证据层级（L1 可复现锚点 ＞ L2 多实现一致 ＞ L3 单实现 ＞ L4 项目约定）。
2. **功能补齐**：多 AI 配置、档案删除（含撤销/批量/引用清理）、全局错误边界、导入明细、AI 请求取消与重试语义。
3. **计算逻辑对齐规范**：合盘不再输出类型/权威/定义型/交叉、交叉四闸门顺序统一、闸门三态落库、合盘同人按 `Archive.id` 判定。

---

## 2. 交付物清单

### 2.1 文档（4 份）

| 文件 | 内容 | 规模 |
| --- | --- | --- |
| `docs/spec/HD-SPEC-v2.0.md` | 正式计算规范：范围、15 项标准选定与依据、计算规范、数据模型、状态机、交互规范、验收、版本策略、附录 | 598 行 |
| `docs/spec/OPTIMIZATION-BACKLOG-v2.0.md` | 优化清单 U-01…U-30：现象证据、目标、可测试验收、优先级 | 249 行 |
| `docs/review/计算逻辑冲突清单-2026-11-06.md` | 60 项冲突的全量证据（项目内 25 项 + 仓库间 23 项 + 单仓库矛盾 4 项 + 未覆盖 8 项） | 674 行 |
| `docs/review/计算逻辑冲突-勾选决策表-2026-11-06.md` | 28 个冲突项的可勾选决策表（本版已按选定标准执行） | 512 行 |

### 2.2 源码（按模块）

| 模块 | 本版变更 |
| --- | --- |
| `src/engine/mandala.ts` | 未改动（偏移仍 29.875°） |
| `src/engine/bodygraph.ts` | 闸门三态写入；交叉四闸门顺序改为 `pSun/pEarth \| dSun/dEarth` |
| `src/engine/composite.ts` | 移除合盘 `type/authority/definition` 输出；新增 `opts.{aId,bId}` 同人判定；合并闸门带三态 |
| `src/engine/version.ts` | `ENGINE_VERSION = 2.0.0+mandala.29.875`、`SCHEMA_VERSION = 3` |
| `src/types/hd.ts` | 新增 `AiProfile`、`GateState`；删除 `CompositeResult.composite` |
| `src/stores/settings.ts` | 多 AI 配置（增删改切换复制）、旧配置迁移、`persistError` |
| `src/stores/archive.ts` | `remove/removeMany/restore/detachReferences`、`regenerateAll` 容错、同批去重 |
| `src/services/aiClient.ts` | 配置校验增强、缓存键含配置指纹、`probeAiConfig`、错误分类 |
| `src/services/backupImport.ts` | **新增**：备份解析纯函数（时区补回、schema 兼容、去重、旧快照清理） |
| `src/composables/useAiReading.ts` | `AbortSignal` 取消、`retry()` 语义、失败保留旧内容 |
| `src/composables/useAiResultActions.ts` | **新增**：AI 结果复制/保存共用动作 |
| `src/components/base/ConfirmDialog.vue` | **新增**：通用二次确认（Esc/遮罩/焦点/aria） |
| `src/components/base/ErrorBoundary.vue` | **新增**：路由级错误边界 |
| `src/views/SettingsView.vue` | 导入明细面板、删除确认、清空失败提示 |
| `src/views/ArchiveHomeView.vue` | 删除 + 5 秒撤销 + 批量删除 + 搜索空态 |
| `src/views/SingleChartView.vue` | 删除入口、`chartError`/DST 提示、复制保存、AI 取消 |
| `src/views/EntryView.vue` | 保存失败提示、字段定位、提交防抖 |
| `src/components/settings/SettingsForm.vue` | AI 配置区重做（列表 + 内联表单 + 字段校验 + 测试连接） |
| `src/components/archive/*` | 卡片/列表/批量条新增删除入口与失败角标 |
| `src/components/composite/CompositeColumn.vue` | 合并列改为「中心数 · 共享通道数」 |
| `src/views/ChironView.vue` | 扩展层标注、异常保护 |
| `tests/*` | 新增 `backupImport.test.ts`(8)、`dataManagement.test.ts`(8)；`composite`(12)、`engine`(13) 扩充 |

### 2.3 配置项

| 文件 | 作用 | 需要用户填写 |
| --- | --- | --- |
| `.env` | 仅发版用 GitHub Token（`GITHUB_TOKEN=...` 或裸 `ghp_...` 均可，脚本已兼容） | 是（已存在） |
| `package.json` | 版本源、脚本（dev/build/test/typecheck） | 否 |
| `vite.config.ts` | 构建配置（`base: './'`、别名、测试 include） | 否 |
| `desktop/package.json` | Electron 打包配置（NSIS） | 否 |
| `android/AndroidManifest.xml` | 安卓壳版本与权限（versionName 由 `build-apk.py` 按根版本补丁） | 否 |
| `.github/workflows/build.yml` | CI：内核测试 / Windows / Android / Release | 否 |
| AI 配置 | 运行时在「设置 → AI 配置」中维护，存于 `localStorage['hdt.settings.v1']` | 是（用户自填接口/Key/模型） |

### 2.4 构建产物

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| Web 静态站 | `dist/` | 可直接静态托管；也可双击 `dist/index.html`（hash 路由） |
| Windows 安装包 | `release/desktop/HumanDesign-Setup-2.0.0.exe` | Electron + NSIS，静默安装 `/S` |
| Android APK | `release/android/HumanDesign-2.0.0.apk` | 原生 WebView 壳，约 0.5 MB |

---

## 3. 运行方式

### 3.1 开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 54 项
npm run typecheck
npm run build
```

### 3.2 生产构建

```bash
npm run build                    # dist/
python scripts/build-exe.py      # Windows NSIS
python scripts/build-apk.py      # Android APK
```

### 3.3 发版

```bash
python scripts/push-api.py       # 推送提交（git over HTTPS 不可用时的兜底）
python scripts/publish-release.py # 创建 GitHub Release 并上传安装包
```

> `.env` 只需含一行 `ghp_...`（脚本用正则提取），无需严格写成 `GITHUB_TOKEN=`。

---

## 4. 验收结果

| 验收项 | 方法 | 结果 |
| --- | --- | --- |
| 单元测试 | `npm test` | 7 文件 / **54 项全绿** |
| 类型检查 | `npm run typecheck` | 通过（无输出） |
| 生产构建 | `npm run build` | 197 modules，通过 |
| 锚点不变 | `gateStartLongitude(41)=302`、`(25)=358.25`、`(17)=3.875` | 断言通过 |
| 闸门三态 | `gates[].state ∈ {in-channel,hanging}`；`hangingGates` 与 state 自洽 | 断言通过 |
| 交叉顺序 | `pSun/pEarth \| dSun/dEarth` | 断言通过 |
| 合盘去结论 | `'composite' in result === false` | 断言通过 |
| 同人判定 | 相同 `aId/bId` 抛 `SAME_PERSON` | 断言通过 |
| 多 AI 迁移 | 旧单配置 → 1 条「默认配置」 | 断言通过 |
| 删除与撤销 | 删除后引用清理、`restore` 字段完整 | 断言通过 |
| 备份往返 | 导出形状 → 导入 0 跳过 | 断言通过 |

### 本次选定标准（摘要）

| 计算点 | 取值 | 证据 |
| --- | --- | --- |
| 曼陀罗偏移 | 29.875°（Gate 41 = 302.000°） | 两时刻太阳黄经实测 302.00016°/302.00019°，5 家实现交叉一致 |
| 36 通道 / 门→中心 | 主流 5 家一致的 36 组；门 28 只属脾 | 逐项比对 0 差异 |
| 权威 / 类型 / 定义 | 7 类；G→喉连通；骶骨 BFS；连通分量 | 3 家一致，防守性最强 |
| 交点 / 星历 | Meeus 47 + Δψ；astronomy-engine，月球不加 aberration | 可复现性最好 |
| 合盘 | 仅四象限 + 关系主题 + 四类通道 + 共享/独有 | 规范 §3.8 + SharpAstrology 结构互证 |
| 状态 | 中心两态 + 闸门三态 | L4 项目约定（已显式标注） |

---

## 5. 版本与兼容性

| 项 | 说明 |
| --- | --- |
| 盘面结果 | 计算规则未变（偏移仍 29.875）；`ENGINE_VERSION` 变更使存量档案重算一次，结果应与 v1.2.0 一致 |
| 备份文件 | 导出 `schemaVersion: 3`；v1/v2 旧备份可导入，自动重算并提示 |
| AI 配置 | 首次启动自动迁移为一条「默认配置」 |
| 合盘页面 | 不再显示合图类型/权威/定义型/交叉（规范修正） |
| 回滚 | 需对照旧结果时保留 v1.2.0 安装包 |

---

## 6. 目录结构（新增部分）

```
docs/
├─ spec/
│  ├─ HD-SPEC-v2.0.md                 # 计算规范
│  └─ OPTIMIZATION-BACKLOG-v2.0.md    # 优化清单
└─ review/
   ├─ 计算逻辑冲突清单-2026-11-06.md
   ├─ 计算逻辑冲突-勾选决策表-2026-11-06.md
   └─ ...（历史审查文档）

src/
├─ components/base/
│  ├─ ConfirmDialog.vue               # 新增
│  └─ ErrorBoundary.vue               # 新增
├─ composables/
│  └─ useAiResultActions.ts           # 新增
└─ services/
   └─ backupImport.ts                 # 新增
```

---

## 7. 已知限制

1. **API Key 以明文存于本机 `localStorage`**（与 v1.x 一致）；掩码仅作用于展示层，DOM 不写入明文。
2. `probeAiConfig` 用 `max_tokens: 1` 探测，对要求更大 token 的推理模型可能返回 4xx；此时如实显示接口错误，不伪造成功。
3. `ErrorBoundary` 只捕获子组件渲染/生命周期异常；事件处理器与未 await 的 Promise 异常不在 Vue `onErrorCaptured` 范围。
4. 删除撤销窗口 5 秒；删除立即写入 `localStorage`，超时不可恢复（无回收站）。
5. 192 个轮回交叉专有名称**本轮未接入**（规范 §3.7 标注 TBD）：9 个参考实现均无「四闸门 → 名称」映射，接入需额外授权数据。
6. 未做 390px 真机截图；手机端验证覆盖 ≤768 分支。
7. 未与 Jovian Archive / Genetic Matrix 商业软件逐例比对（需授权样本）。
8. 桌面端与安卓端安装包需在对应工具链环境构建；CI 已配置自动产物。

---

## 8. 后续可选项（非本版范围）

| 项 | 说明 |
| --- | --- |
| 回收站 | 删除后保留 30 天可恢复 |
| 备份含 AI 配置 | 默认不含 Key，可选导出 |
| 192 交叉名称 | 需授权数据 + 中文译名 |
| 行运 / Penta | 参考实现已具备（natalengine、SharpAstrology），需产品定义 |
| 长列表虚拟滚动 | 200+ 档案时的性能优化 |
