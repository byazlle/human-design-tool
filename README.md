# 人类图工具（HumanDesignTool）v1.0.1

本地优先的人类图（Human Design）排盘 / 合盘 / 解读工具。所有星历计算与档案存储都在本机完成，
**无后端、无账号、出生信息不出设备**。

技术栈：Vue 3 + Vite + TypeScript + Pinia + Vue Router；人体图为纯前端 SVG 渲染（两套绘图程序）；
桌面端用 **Electron** 壳（`desktop/`），安卓端用**原生 WebView 壳**（`android/`），
都产出可直接安装的产物。

---

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 内核 + 几何 + Markdown 渲染校验（22 项）
npm run build      # 产出 dist/（可直接静态托管）
```

## 功能范围

| 能力 | 说明 |
| --- | --- |
| 排盘 | 13 天体 × 意识/无意识双流（26 激活点）→ 闸门、爻、color/tone/base、通道、九中心、类型、权威、人生角色、定义型、轮回交叉结构 |
| 录入 | 手动录入（日期 + 时分秒 + 时区 + 出生地）／身份证解析（仅取出生日期与地区，时分手填） |
| 单人盘 | 四列布局：①人体图（星体两翼内嵌）②盘面信息 + 已激活通道 ③已激活闸门 + 九中心 ④人生轨迹 + 详情卡 |
| 编辑 | 已生成的盘可改姓名、出生年月日时分、时区、出生地、经纬度（保存即重算）；支持「复制副本」，副本独立存储 |
| 多盘 | 桌面自由画布拖拽 + `auto-fit` 并排多栏，每栏独立收起星体表 / 关盘 |
| 合盘 | 三栏 A｜B｜合盘；A 独有蓝、B 独有橙、共享紫；「仅看共享通道」为视图过滤，不改数据 |
| 对比 | 双完整盘并排对比（`/compare`），手机端自动堆叠 |
| 解读 | 内置 64 闸门（含义 + 特质/成长方向/扎根力/驱动力）、36 通道、9 中心（定义/开放）、5 类型（七段解析）、7 权威、13 星体 |
| 批量解读 | 任意多选闸门 / 通道 / 中心 / 星体，一次发起 AI 解读；选择集相同命中缓存 |
| 解读角度 | 综合 / 成长方向 / 扎根力 / 驱动力 / 人生轨迹 / 未来形势 / 前世姻缘 / 事业方向，共用同一盘数据换提示词，各自独立缓存 |
| 人生轨迹 | 离线分层内容：人生轨迹 / 发展轨迹 / 未来形势 / 前世姻缘，每条 4–7 段（南交→转向期→北交、双线整合、近中长期、关系剧本） |
| 绘图程序 | 设置内两套版式一键切换、立即生效；「重新生成全部图表」按当前版本重建档案 |
| 设置 | AI 接口（地址/Key/模型/超时/缓存）、深浅色、字号、人体图配色、**绘图程序**、导入导出、清空数据 |
| Markdown | AI 解读结果以 Markdown 层级渲染（标题/加粗/列表/引用/代码，先转义防注入） |
| 自适应 | 完整盘一屏显示（高度锁视口 + SVG 等比缩放，不裁切不滚动）；≤1400px 星体面板停靠图上方；手机单列 |

## 绘图程序（两套版式）

在 **设置 → 绘图程序** 切换，`settings.appearance.drawingEngine` 全局响应，所有视图立即重绘；
点「重新生成全部图表」会按当前档案逐份重算并持久化。

| 版式 | 来源 | 特征 |
| --- | --- | --- |
| 版式一 · 底图对齐 | 用户提供的人类图底图，1:1 像素实测 | 青色渐变底板 + 人体剪影 + 白色通道管；九中心白底黑描边，有定义填专属纯色 |
| 版式二 · Free Human Design | [adamblvck/free-human-design](https://github.com/adamblvck/free-human-design) 的站点绘图数据 | 八角星 G 中心、渐变中心色、紧凑比例；无底板，直接落在页面背景 |

两版共用同一套**数据规则**（闸门标注、通道线型、中心填充），详见
[docs/RENDERING.md](docs/RENDERING.md)。

## 计算内核

| 环节 | 实现 |
| --- | --- |
| 时间归一化 | 本地民用时 → IANA 时区（含历史夏令时，来自平台 ICU）→ UTC；夏令时切换点给出核实提示 |
| 设计时刻 | 精确求解「太阳视黄经回推 88°」的时刻（二分法，非固定 88 天） |
| 星历 | `astronomy-engine`（VSOP87，MIT）；视黄经 = 真黄道 + 当日平分点 |
| 真交点 | Meeus《Astronomical Algorithms》第 47 章解析式（平交点 + 5 项周期改正 + 章动） |
| 盘序 | Jovian 标准 64 卦盘序，偏移 29.8333°（非「闸门 1 起于白羊 0°」） |
| 判定 | 通道 → 中心 → 类型/权威/定义型，规则见 `src/engine/bodygraph.ts` |

## 目录结构

```
src/
  engine/            星历、时间、盘序、bodygraph、合盘（纯 TS，无 DOM）
  components/
    chart/           bodyGraphLayout(v1) / bodyGraphLayoutV2 / layouts 注册表
                     HumanDesignBodyGraph.vue（两层渲染）、PlanetColumn、ActivationPanels、DetailCard
    panel/           AI 解读面板、闸门/通道/中心详情
    base/ settings/ archive/ composite/   UI 基件与业务组件
  services/          解读内容（interpretations / gateInsight / destinyText / readingAngles / markdown）
  stores/            archive / settings / ui / board
  views/             档案库、单人盘、多盘、合盘、对比、录入、设置
desktop/             Electron 壳（main.cjs 注册 app:// 协议 + 冒烟自检）
android/             原生 WebView 壳 + aapt2/javac/d8/apksigner 手工构建
scripts/             build-exe.py / build-apk.py / publish-release.py / push-api.py
docs/                渲染规则、架构说明
tests/               几何、星历、Markdown 渲染
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/RENDERING.md](docs/RENDERING.md) | 渲染规则：闸门标注、通道线型（含 20-57 枢纽走线）、中心填充、两版绘图程序、坐标来源 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 模块划分、数据流、状态管理、打包链路、自检方式 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [功能与数据补全清单.md](功能与数据补全清单.md) | 需求落地清单与待办路线 |

## 构建与发布

```bash
npm run build                        # 前端

python scripts/build-exe.py          # 桌面（Electron + NSIS）
python scripts/build-apk.py          # 安卓（原生 WebView 壳，无需 Gradle）
python scripts/publish-release.py    # 发布到 GitHub Release（读根 package.json 版本）
python scripts/push-api.py           # 网络受限时用 Git Data API 推送提交
```

版本号**单一来源**：根 `package.json`。`build-apk.py` / `publish-release.py` 均读取该值，
产物文件名、Android `versionName`、Release tag 自动跟随，不再各自硬编码。

## 校验状态

- ✅ 4 个跨时区样本（含 1990 中国夏令时、1972 北美、1964 欧洲跨年）的 **26 个激活点（闸门+爻）、类型、权威、人生角色、通道集合、中心集合** 与 `free-human-design`（rave-engine 血统）完全一致；
- ✅ 1950–2035 随机 200 个时刻 × 13 天体 = 2600 个位置比对：无闸门/爻分歧（唯一 1 例为参照实现月球截断级数残差 0.011°）；
- ✅ 单元测试 **22 项**：盘序边界、通道路由、合盘归属、时区换算、几何（闸门不重叠/不越界/必须落在所属中心内/通道裁剪后长度足够）、Markdown 渲染与防注入；
- ✅ 桌面壳端到端自检 **29/29**（`HD_SMOKE=1`）：安全 origin、localStorage、空态、示例档案、人体图点亮、通道与闸门清单、类型详解、星体两翼、点击未激活闸门不误亮、批量解读条、AI 未配置护栏、深色模式、合盘维度、设置页、新建页；
- ✅ 安装包实测：NSIS 静默安装 → 运行安装后程序 → 同一套自检；APK 用静态服务复现 WebView 加载路径；
- ⚠️ 未在真实 390px 设备上截图（headless Chrome 有最小窗口宽度限制），手机端验证覆盖 ≤768 分支；
- ⚠️ 未与 Jovian Archive / Genetic Matrix 等商业软件逐例比对（需授权样本），未做 192 个轮回交叉专有名称映射。

## 已知限制

1. **出生时间精度**：约 4 分钟误差即可改变通道判定，界面已强制提示；
2. 出生地经纬度**不参与**人类图计算（行星为地心位置，不用宫位/上升点），仅用于档案标注；真正影响结果的是时区与时间；
3. 身份证地区映射为**精简表**（省 + 约 80 个地级市），未收录城市回退到省会坐标并提示；
4. AI 接口不内置厂商、不做连通性验证，失败只显示错误与重试，不生成任何伪造内容；
5. 手机端为满足人体图密度，闸门点击命中区约 38px（小于 44px 触摸标准），精度不足时建议用桌面端。

## 隐私与数据

- 全部计算在本机完成，无任何网络请求（AI 解读除外，需自行配置接口）。
- 档案存于 `localStorage`（键：`hdt.archives.v1`），可导出 JSON 备份（不含身份证号）。
- 清空数据会同时清除档案与 AI 缓存，操作前有二次确认。

## 许可

MIT。星历与参考数据来源见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
