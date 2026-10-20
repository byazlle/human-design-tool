# 人类图工具（HumanDesignTool）

本地优先的人类图（Human Design）排盘 / 合盘 / 解读工具。所有星历计算与档案存储都在本机完成，**无后端、无账号、出生信息不出设备**。

技术栈：Vue 3 + Vite + TypeScript + Pinia + Vue Router，人体图为纯前端 SVG 渲染；桌面端用 **Electron** 壳（`desktop/`），安卓端用**原生 WebView 壳**（`android/`），两者都打包出可直接安装的产物。

---

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 排盘内核校验（含权威实现交叉比对）
npm run build      # 产出 dist/（可直接静态托管或双击 index.html）
```

## 功能范围

| 能力 | 说明 |
| --- | --- |
| 排盘 | 13 天体 × 意识/无意识双流（26 激活点）→ 闸门、爻、color/tone/base、通道、九中心、类型、权威、人生角色、定义型、轮回交叉结构 |
| 录入 | 手动录入（日期 + 时分秒 + 时区 + 出生地）／身份证解析（仅取出生日期与地区，时分强制手填） |
| 单人盘 | 人体图 + 盘面信息 + **已激活通道 / 闸门 / 九中心常驻清单**（通道直接写出作用，无需点击）+ 星体表 |
| 多盘 | 桌面自由画布拖拽 + `auto-fit` 并排多栏，每栏独立收起星体表 / 关盘 |
| 合盘 | 三栏 A｜B｜合盘；A 独有蓝、B 独有橙、共享紫；「仅看共享通道」为视图过滤，不改数据 |
| 解读 | 内置 64 闸门 / 36 通道 / 9 中心 / 5 类型 / 7 权威 / 13 星体的离线释义；类型含机制·策略·签名·非自我·误区·建议六段完整解析 |
| 批量解读 | 勾选任意多个闸门 / 通道 / 中心，一次性发起 AI 解读；选择集相同则命中缓存 |
| 合盘维度 | 爱情 / 事业 / 工作 / 朋友 / 父母 + 自定义；同一份数据换提示词分别生成，各维度独立缓存 |
| 设置 | AI 接口（地址/Key/模型/超时/缓存）、深浅色、字号、人体图配色、导入导出、清空数据 |

## 计算内核

| 环节 | 实现 |
| --- | --- |
| 时间归一化 | 本地民用时 → IANA 时区（含历史夏令时，来自平台 ICU）→ UTC；夏令时切换点给出核实提示 |
| 设计时刻 | 精确求解「太阳视黄经回推 88°」的时刻（二分法，非固定 88 天） |
| 星历 | `astronomy-engine`（VSOP87，MIT）；视黄经 = 真黄道 + 当日平分点 |
| 真交点 | Meeus《Astronomical Algorithms》第 47 章解析式（平交点 + 5 项周期改正 + 章动） |
| 盘序 | Jovian 标准 64 卦盘序，偏移 29.8333°（非「闸门 1 起于白羊 0°」） |
| 判定 | 通道 → 中心 → 类型/权威/定义型，规则见 `src/engine/bodygraph.ts` |

### 校验状态

- ✅ 4 个跨时区样本（含 1990 中国夏令时、1972 北美、1964 欧洲跨年）的 **26 个激活点（闸门+爻）、类型、权威、人生角色、通道集合、中心集合** 与 `free-human-design`（rave-engine 血统，已对齐 Swiss Ephemeris）**完全一致**；
- ✅ 1950–2035 随机 200 个时刻 × 13 天体 = 2600 个位置比对：无闸门/爻分歧（唯一 1 例为参照实现月球截断级数残差 0.011°）；
- ✅ 64 闸门盘序边界、通道路由、合盘归属划分、时区换算均有单元测试（`npm test`，15 项全绿）；
- ✅ 几何自检：64 个闸门锚点不重叠、不越界，36 条通道端点归属正确；
- ✅ 浏览器实测（Chrome）1440px 与 500px 两档：档案库、单人盘、多盘并排、合盘三栏、录入、设置均正常渲染；
- ✅ **桌面壳端到端自检 29/29 通过**（`HD_SMOKE=1` 触发）：安全 origin、localStorage 读写、空态、示例档案、人体图点亮/外圈、通道与闸门清单、类型详解分节、星体含义展开、「点击未激活闸门不误亮」回归、批量解读条、AI 未配置时的错误提示、深色模式、合盘三栏与维度切换、设置页、新建页；
- ✅ 安装包实测：NSIS 静默安装 → 运行安装后程序 → 上述自检同样全通过；APK 侧用静态服务复现 WebView 加载路径，确认 ES module + 本地存储正常；
- ⚠️ **未**在真实 390px 视口下截图验证（当前 headless Chrome 有最小窗口宽度限制），手机端仅验证了 ≤768 分支的渲染；
- ⚠️ 尚未与 Jovian Archive / Genetic Matrix 等商业软件逐例比对（需授权样本），也**未做** 192 个轮回交叉专有名称的映射（本项目只给结构，不臆造名称）。

## 安装包产物

| 平台 | 产物 | 大小 | 说明 |
| --- | --- | --- | --- |
| Windows | `release/desktop/HumanDesign-Setup-0.2.0.exe` | ≈ 77 MB | NSIS 安装包，可选安装目录、创建桌面与开始菜单快捷方式，自带卸载程序 |
| Android | `release/android/HumanDesign-0.2.0.apk` | ≈ 0.45 MB | minSdk 24 / targetSdk 34，自签名（v2+v3），安装即用 |

### 本地构建

```bash
# 1) 先构建前端（两个平台共用）
npm run build

# 2) Windows 安装包（需要 desktop/ 下已安装 electron 与 electron-builder）
python scripts/build-exe.py

# 3) Android APK（需要 .toolchain 下的 JDK + Android SDK build-tools/platform）
python scripts/build-apk.py
```

### 为什么是「Electron + 原生 WebView 壳」而不是 Tauri

当前网络环境到 `github.com` / `crates.io` 完全不可达（TLS 被重置），而 Tauri 编译必须拉取 crates 与 NSIS 组件，
CI 也无法触发。因此改用依赖更可控的组合：

- **桌面**：Electron 二进制与 NSIS 走 npmmirror 镜像，全程可离线复现；
- **安卓**：不依赖 Gradle（官方发行版会 302 到被阻断的 GitHub），直接用 SDK 自带的
  `aapt2 → javac → d8 → zipalign → apksigner` 手工链路，零第三方依赖。

`src-tauri/` 保留为可选方案，联网环境仍可 `npx tauri build`。

### 关键实现约束

- 桌面壳**不能**用 `file://` 加载：Chromium 会禁止 `file://` 文档访问 `localStorage`，导致档案无法保存。
  因此主进程注册了自定义 `app://` 协议（`standard + secure + supportFetchAPI`），既满足安全上下文，也支持 ES module。
- 安卓壳同理，把资源挂在 `https://appassets.androidplatform.net`，由 `shouldInterceptRequest` 直接读 `assets/www`，
  不走网络；`file://` 下 ES module 会被 CORS 阻断。

## 推送到 GitHub

仓库已在本地初始化并提交（`.env`、`node_modules`、`dist`、`.toolchain`、`release` 均已忽略）。
当前环境到 `api.github.com` 不可达，需在可访问 GitHub 的终端执行：

```bash
git remote add origin https://github.com/<用户名>/human-design-tool.git
git push -u origin main
```

## 目录结构

```
src/
├─ engine/        排盘内核（纯函数，可脱离 UI 运行）
│  ├─ mandala.ts    黄道经度 → 闸门/爻/色/调/基
│  ├─ ephemeris.ts  星历（含真交点、88° 回推）
│  ├─ bodygraph.ts  通道/中心/类型/权威判定
│  ├─ gateData.ts   64 闸门 ↔ 九中心、36 通道拓扑
│  └─ time.ts       时区归一化
├─ services/      离线释义、AI 客户端、身份证解析
├─ stores/        Pinia（档案/多盘/合盘/设置/UI）
├─ components/    base / chart / archive / composite / panel / settings
└─ views/         12 个页面形态（桌面 + 手机同一套路由）
tests/            引擎单元测试 + 权威实现交叉校验
desktop/          Electron 桌面包（main.cjs / preload.cjs / 打包配置）
android/          原生 WebView 安卓壳（Manifest / res / MainActivity.java）
scripts/          构建脚本（build-exe.py / build-apk.py）
src-tauri/        Tauri v2 壳（可选，联网环境可用）
```

## 隐私

- 身份证号只在输入控件内存中解析，**不存储、不上传、不写日志**；
- 档案仅存 `localStorage`（含出生时间与地点），导出文件不含证件号；
- AI 调用仅在你点击「AI 深度解读」时发起，请求内容为盘面事实 + 离线释义，不含证件号；
- 提供「清空全部档案 + AI 缓存」入口。

## 已知限制

1. **出生时间精度**：约 4 分钟误差即可改变通道判定，界面已强制提示；
2. 出生地经纬度**不参与**人类图计算（行星为地心位置，不用宫位/上升点），仅用于档案标注；真正影响结果的是时区与时间；
3. 身份证地区映射为**精简表**（省 + 约 80 个地级市），未收录城市回退到省会坐标并提示；
4. AI 接口不内置厂商、不做连通性验证，失败只显示错误与重试，不生成任何伪造内容；
5. 手机端为满足人体图密度，闸门点击命中区约 38px（小于 44px 触摸标准），精度不足时建议用桌面端。
