# 架构说明（ARCHITECTURE.md）

## 1. 总体结构

```
┌────────────── 前端（Vue 3 + TS）──────────────┐
│ views  ──►  components（chart / panel / base） │
│   │              │                            │
│   ▼              ▼                            │
│ stores（pinia）  services（解读内容 / AI / md）│
│   │              │                            │
│   └──────► engine（纯 TS 计算，无 DOM）◄───────┘
└───────────────┬───────────────────────────────┘
                │ dist/
     ┌──────────┴───────────┐
     ▼                      ▼
desktop（Electron）     android（原生 WebView 壳）
```

- **engine** 只依赖 `astronomy-engine`，不引用 DOM/ Vue，可单测。
- **services** 是「内容 + 外部能力」层：解读文案、AI 客户端、Markdown 渲染、视角定义。
- **stores** 只管状态与持久化（`localStorage`），不做渲染。
- **components/chart** 只吃 `BodyGraph` 数据，不自行计算盘面。

## 2. 数据流

```
BirthInput ──computeChart()──► BodyGraph
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  HumanDesignBodyGraph      ActivationPanels            BoardMeta / PlanetColumn
  （SVG 渲染）              （清单 + 多选）             （盘面信息 / 星体两翼）
                                  │
                                  ▼
                          useAiReading → services/aiClient → AiReadingPanel（Markdown）
```

- `BodyGraph` 由 `engine/bodygraph.ts` 产出：centers / gates / channels / hangingGates /
  personality / design / type / authority / profile / definition / incarnationCross。
- 意识的判定不需要额外字段：`chart.personality` 与 `chart.design` 的 `gate` 集合
  直接决定每条通道是「红 / 黑 / 条纹」。

## 3. 关键模块

| 模块 | 职责 | 位置 |
| --- | --- | --- |
| 星历与时间 | 平黄经→视黄经、交点、时区归一化、设计时刻求解 | `src/engine/ephemeris.ts` `time.ts` |
| 盘序 | 64 卦盘序与偏移 | `src/engine/mandala.ts` |
| 盘面判定 | 通道→中心→类型/权威/定义型、悬挂闸门 | `src/engine/bodygraph.ts` |
| 合盘 | A/B/merged 与归属色 | `src/engine/composite.ts` |
| 几何 v1 | 底图 1:1 坐标、通道裁剪、20-57 枢纽走线 | `src/components/chart/bodyGraphLayout.ts` |
| 几何 v2 | 参考实现布局与渐变 | `bodyGraphLayoutV2.ts` |
| 版式注册表 | 两版统一为 `LayoutPreset` | `layouts.ts` |
| 渲染 | 底板 + 数据两层 SVG | `HumanDesignBodyGraph.vue` |
| 解读内容 | 闸门/通道/中心/类型/星体/闸门洞察/人生轨迹/角度 | `src/services/*` |
| AI | 请求、缓存（选择集/角度入 key）、错误护栏 | `services/aiClient.ts` `composables/useAiReading.ts` |

## 4. 状态与持久化

| 键 | 内容 | 说明 |
| --- | --- | --- |
| `hdt.archives.v1` | 档案数组（含已算好的 `chart`） | 导出/导入同构 |
| `hdt.settings.v1` | AI 配置、外观（主题/字号/配色/**绘图程序**） | 版本号不在此处 |
| `hdt.module.order.v1` | 历史遗留的模块排序（已不参与布局） | 可清理 |
| `hdt.ai.history.v1` | 本地保存的解读记录（最多 50 条） | 仅本机 |

版本号**单一来源**为根 `package.json`，由构建与发布脚本读取。

## 5. 打包链路

### 桌面（Electron）

```
npm run build → dist/
desktop/main.cjs 注册 app:// 协议（standard + secure + supportFetchAPI）
build-exe.py：把 dist 装进 release/desktop/win-unpacked/resources/app
             → electron-builder --prepackaged 打 NSIS
             → release/desktop/HumanDesign-Setup-<version>.exe
```

> 为什么不用 `file://`：Chromium 禁止 `file://` 文档访问 localStorage，且 ES module 会被 CORS 拦。
> 自定义 `app://` 同时解决这两点。

### 安卓（原生 WebView 壳，无需 Gradle）

```
npm run build → dist/ 复制到 android/assets/www
aapt2 compile/link → javac → d8 → 合并 zip → zipalign → apksigner
MainActivity 通过 shouldInterceptRequest 从 assets/www 读取
资源挂在 https://appassets.androidplatform.net
```

- `build-apk.py` 自动读取根 `package.json` 的版本 → `versionName`，`versionCode` 固定递增变量。
- 产物约 0.47 MB（复用系统 WebView）。

## 6. 自检体系

| 层级 | 命令 | 覆盖 |
| --- | --- | --- |
| 单元 | `npm test` | 盘序边界、通道路由、合盘归属、时区、几何 4 项、Markdown 5 项 |
| 端到端 | `HD_SMOKE=1 <exe>` | 29 项：加载、渲染、清单、详情、批量、AI 护栏、深色、合盘、设置、新建 |
| 安装验证 | NSIS `/S` 静默安装 → 运行安装后程序 | 同一套 29 项 |
| APK | 静态服务模拟 `appassets` 加载 | ES module + localStorage 正常 |

> Windows GUI 程序拿不到 stdout，冒烟日志写入 `HD_SMOKE_DIR/smoke.log` 与 `smoke-result.json`；
> 运行前需 `env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS`，否则 exe 退化为纯 Node。

## 7. 数据来源

| 数据 | 来源 |
| --- | --- |
| 闸门↔中心、36 通道拓扑 | Jovian Archive / Ra Uru Hu 标准人体图（与 rave-engine、free-human-design 一致） |
| 64 卦盘序与偏移 29.8333° | Jovian 标准 Mandala |
| 星历 | `astronomy-engine`（VSOP87，MIT） |
| 交点 | Meeus《Astronomical Algorithms》第 47 章 |
| 版式二布局 | [adamblvck/free-human-design](https://github.com/adamblvck/free-human-design) `site/charts.min.js` |
| 解读文案 | 项目内编写（通行人类图解释整理），非第三方授权文本 |
