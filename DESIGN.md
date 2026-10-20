# HumanDesignTool 设计系统契约（DESIGN.md）

> **受众与任务**：面向人类图（Human Design）使用者与从业者，需在电脑端做多盘对比/合盘分析、在安卓手机端极简录入并查盘。核心任务=排盘、看闸道/通道释义、做双盘合盘、按需触发 AI 解读。
> **范围**：本契约覆盖桌面（≥1024px）与安卓手机（≤768px）双端的设计令牌、组件、布局、响应式与状态，不涉及排盘计算算法（已有独立技术文档）。
> **证据**：用户提供的新版页面设计长文（12 个页面 + 全局规则 + 跳转链路）；工作区既有 `output/20261020-hd-techdoc` 为「人类图计算应用技术文档」生成流水线，其 `design_tokens.json`（SimSun 12pt / modern-minimal）仅用于**文档排版**，与本 App UI 无关，本契约不沿用。
> **关键假设**（待确认即修正）：① 技术栈 = Vue3 响应式网页，桌面/手机同一套代码按断点切换；② AI 接口为「预留配置」，不内置任何具体大模型，设置页只收集地址/密钥/模型名/超时；③ 人体图与合盘均为前端 SVG 渲染，离线释义为内置静态数据，AI 解读为网络按需附加。

---

## 路由决策摘要（Route Decision）

- **分支**：`product`（工具型 / operational，重扫描与对比），仅借用轻量 brand/graphic 思路承载「A 独有 / B 独有 / 共享」三色数据语义体系。
- **模式**：高密度操作工具。桌面信息量大但分区独立、视觉干净；手机信息收敛、单栏 + 底部抽屉。
- **主视觉谱系**：modern-minimal。所有**主操作按钮用中性深色**（不抢数据色），蓝 / 橙 / 紫**三色仅保留给数据语义**（A 独有 / B 独有 / 双方共享），避免任何装饰性渐变或无关风格堆叠。
- **五条不可妥协原则**：① 闸门/通道的离线释义永远可看，AI 只是附加按需触发；② 所有星体度数保留两位小数 + 爻/color/tone/base 全展示；③ 桌面多盘/合盘分区独立互不混淆；④ 合盘「仅看共享通道」一键简化视图必须两端都有；⑤ AI 配置一次填写全局生效，集中在设置页。
- **五条分支交互原则**：① 任意闸门/通道点击即给反馈（右侧面板/底部抽屉 <100ms）；② 触摸目标 ≥44px；③ 录入错误可恢复（尤其身份证无出生时间，必须手动补时分）；④ 关闭单盘/单卡片不波及整体；⑤ 深浅色、字体大小、人体图配色在设置页可调且全局生效。

---

## 1. Visual Theme

- **层级与密度**：工具优先扫描与对比。桌面用清晰分区卡片承载高信息量；手机做信息收敛，把细节藏进折叠面板与底部抽屉，主屏只保留人体图与关键动作。
- **视觉性格**：克制、专业、可信任。中性灰白底 + 深色文字 + 深色主按钮；数据三色（蓝/橙/紫）作为唯一彩色信号，只在人体图、星体清单、合盘标记处出现。
- **与既有资产关系**：无既有产品品牌资产。文档排版用的 SimSun 令牌不进入 App。
- **参考观察（非规则）**：人类图领域惯例——定义中心填实色、未定义中心留白描边；闸门为带编号小圆；通道为连接两闸门的线。本契约据此定义，而非照搬某竞品皮肤。

---

## 2. Color Palette

> 对比度：下列配对**尚未实测**，交付前端后须用对比度工具核对 WCAG AA（正文 ≥4.5:1，大字号 ≥3:1），此处不臆造数值。

语义角色、CSS 变量、HEX、用途如下（浅色主题为基准，深色主题见末行映射）：

| 角色 | CSS 变量 | 浅色 HEX | 用途 |
| --- | --- | --- | --- |
| 应用背景 | `--bg-base` | `#F5F6F8` | 页面底色 |
| 卡片/面板表面 | `--surface` | `#FFFFFF` | 卡片、面板、抽屉、弹窗 |
| 次级表面 | `--surface-2` | `#F0F2F5` | 内嵌区、表头、凹陷背景 |
| 边框 | `--border` | `#E2E5EA` | 卡片/输入/分区分隔 |
| 强边框 | `--border-strong` | `#C9CED6` | 聚焦态边框、强调分隔 |
| 主文字 | `--text-primary` | `#1A1D23` | 标题、正文、闸门编号 |
| 次文字 | `--text-secondary` | `#5B616E` | 标签、说明 |
| 弱文字 | `--text-muted` | `#8A909C` | 占位、辅助说明 |
| 主操作（中性深色） | `--action-primary` | `#1A1D23` | 「生成/保存」等主按钮（白字） |
| 主操作悬停 | `--action-primary-hover` | `#2B2F36` | |
| 次操作/幽灵按钮 | `--action-ghost-bg` | `#FFFFFF` | 描边按钮，配 `--border-strong` |
| 危险操作 | `--action-danger` | `#D92D20` | 删除/清空缓存 |
| 焦点环 | `--focus-ring` | `#1A1D23` | 2px 实线 + 2px 偏移，避免与数据色混淆 |
| 成功 | `--status-success` | `#1F9D55` | 保存成功、缓存命中 |
| 错误 | `--status-error` | `#D92D20` | 录入校验失败、AI 调用失败 |
| 警告/提示 | `--status-warning` | `#D97706` | 「出生分钟影响极大」提示 |
| 加载 | `--status-loading` | `#8A909C` | 骨架/转圈 |
| **数据：A 独有** | `--owner-a` | `#2563EB` | 合盘中仅 A 激活的闸门/通道（蓝） |
| **数据：B 独有** | `--owner-b` | `#EA7317` | 合盘中仅 B 激活的闸门/通道（橙） |
| **数据：双方共享** | `--owner-shared` | `#7C3AED` | 合盘中共有的闸门/通道（紫） |
| 人体图·定义中心 | `--hd-center-defined` | `#2B2F36` | 填实色的中心 |
| 人体图·未定义中心 | `--hd-center-undef` | `#FFFFFF` | 留白 + `--border-strong` 描边 |
| 人体图·闸门底 | `--hd-gate-bg` | `#FFFFFF` | 闸门圆填充 |
| 人体图·闸门描边 | `--hd-gate-stroke` | `#1A1D23` | |
| 人体图·通道线（底） | `--hd-channel` | `#9AA1AD` | 未激活/非高亮通道 |
| 人体图·单盘激活强调 | `--hd-single-accent` | `#1A1D23` | 单盘模式下高亮闸门/通道（中性，不与数据三色混用） |

**深色主题映射**：`--bg-base:#111317`、`--surface:#1B1E24`、`--surface-2:#23272F`、`--border:#2E333C`、`--border-strong:#3D434E`、`--text-primary:#F2F4F7`、`--text-secondary:#AEB4BF`、`--text-muted:#767D89`；数据三色与状态色保持不变（在深底上已满足对比）。

**CSS 片段（浅色，:root）**：
```css
:root{
  --bg-base:#F5F6F8; --surface:#FFFFFF; --surface-2:#F0F2F5;
  --border:#E2E5EA; --border-strong:#C9CED6;
  --text-primary:#1A1D23; --text-secondary:#5B616E; --text-muted:#8A909C;
  --action-primary:#1A1D23; --action-primary-hover:#2B2F36; --action-ghost-bg:#FFFFFF;
  --action-danger:#D92D20; --focus-ring:#1A1D23;
  --status-success:#1F9D55; --status-error:#D92D20; --status-warning:#D97706; --status-loading:#8A909C;
  --owner-a:#2563EB; --owner-b:#EA7317; --owner-shared:#7C3AED;
  --hd-center-defined:#2B2F36; --hd-center-undef:#FFFFFF; --hd-gate-bg:#FFFFFF;
  --hd-gate-stroke:#1A1D23; --hd-channel:#9AA1AD; --hd-single-accent:#1A1D23;
}
```

---

## 3. Typography

- **字体栈（按字形覆盖优先）**：
  - `--font-sans`: `-apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif`（中文优先 PingFang/YaHei）。
  - `--font-mono`: `"SF Mono", "JetBrains Mono", "Consolas", monospace`（仅用于度数、闸门编号、经纬度、color/tone/base 代码等数据）。
- **字距**：全局 `letter-spacing: 0`，不使用负字距。
- **角色尺寸**（px / 行高 / 字重）：

| 角色 | 变量 | 尺寸 | 行高 | 字重 | 场景 |
| --- | --- | --- | --- | --- | --- |
| 页面标题 | `--fs-display` | 20 | 28 | 600 | 页头标题 |
| 区块标题 | `--fs-title` | 16 | 24 | 600 | 面板分区、设置分组 |
| 正文 | `--fs-body` | 14 | 21 | 400 | 列表、说明 |
| 数据 | `--fs-data` | 13 | 18 | 400(mono) | 度数 `29.14°`、闸门号、坐标 |
| 次级说明 | `--fs-sm` | 12 | 18 | 400 | 标签、脚注 |
| 微型标签 | `--fs-xs` | 11 | 16 | 500 | 中心/闸门角标（大写感） |

- **换行与截断**：人名/档案名超长时 `--fs-body` 单行省略（`text-overflow:ellipsis; white-space:nowrap; overflow:hidden`）；CJK 文本不断词；星体清单表格列宽固定，度数列用 mono 右对齐；控件内文字不换行。
- **字体依赖**：仅用系统字体，无外部字体授权风险。中文与英文混排时术语保持中英对照（如 闸门 Gate / 通道 Channel / 中心 Center）。

---

## 4. Component Styles

> 仅定义本任务用到的组件；状态覆盖默认/悬停/激活/选中/禁用/加载/成功/错误/空/恢复。尺寸单位 px，圆角与间距引用令牌。

### 4.1 全局工具栏 Toolbar
- 高度 56，固定顶部，`background:var(--surface)`，底部 `1px var(--border)`；左放「新建档案」+ 批量菜单，右放搜索 + 设置/帮助图标（图标用 Lucide，配 `aria-label`）。
- 按钮：主按钮 `padding:8 14; radius:var(--radius-md); bg:var(--action-primary); color:#fff`；禁用态 `opacity:.45; pointer-events:none`。

### 4.2 档案卡片 ArchiveCard（自由画布）
- 尺寸：默认 260×340，可拖动/缩放（1×–2×）；`bg:var(--surface); border:1px var(--border); radius:var(--radius-lg); box-shadow:var(--elev-card)`。
- 内容：人名(`--fs-title`)、类型/人生角色(`--fs-sm`)、人体图缩略 SVG、星体摘要；右下角三按钮【展开完整盘】【加入合盘】【关闭卡片】。
- 关闭仅移除自身，不影响画布其余卡片。

### 4.3 多选与批量菜单 MultiSelect + BulkMenu
- 卡片左上角 24×24 勾选框；选中 ≥1 出现浮动批量条：并排打开 / 生成合盘（选中=2 时高亮「生成合盘」）。
- 空/未选状态：批量条隐藏（空状态设计）。

### 4.4 搜索框 Search
- 高 36，`radius:var(--radius-md); border:1px var(--border)`，聚焦 `border:var(--border-strong); outline:2px var(--focus-ring) offset 2`。占位「按人名搜索档案」。

### 4.5 人体图 HumanDesignBodyGraph（SVG 组件）
- 视图盒子固定比例（约 3:4），自适应容器宽度；九大中心为 `<path>`，闸门为 `<circle>`+编号 `<text>`，通道为 `<line>`/`<path>`。
- 状态：定义中心填 `var(--hd-center-defined)`，未定义填 `var(--hd-center-undef)`+描边；单盘高亮用 `--hd-single-accent`；合盘按归属上色 `--owner-a/--owner-b/--owner-shared`。
- 交互态：hover 闸门放大描边；点击闸门/通道派发事件 → 打开详情面板；`--仅看共享通道` 开启时隐藏非共享元素（合盘专用）。

### 4.6 星体数据表 StarList
- 列：星体｜度数(`xx.xx°`, mono)｜闸门｜爻｜color/tone/base(mono)。行高 32，表头 `--surface-2`。密集但分区清晰，可单独收起/展开（每盘独立开关）。

### 4.7 闸门/通道详情面板 GateChannelPanel
- **桌面**：右侧统一侧边面板 `width:360; bg:var(--surface); border-left:1px var(--border)`；标题(闸门/通道名) + 离线释义(正文) + 底部按钮【AI 深度解读】。
- **手机**：底部抽屉 Drawer，`height:auto max 80vh; radius-top:var(--radius-lg)`；上滑展开，点击遮罩/下箭头关闭。
- 加载态：释义区骨架；错误态：`--status-error` 文案 + 重试；AI 解读返回后切换面板内容。

### 4.8 开关 Toggle（含「仅看共享通道」）
- 44×24 轨道 + 20 圆点；开=`--action-primary` 轨道，关=`--border-strong`。标签 `--fs-body`。关键开关【仅看共享通道】置于合盘页顶部与手机合盘页，语义=通道合并简化视图。

### 4.9 按钮 Button
- primary：`bg:var(--action-primary); color:#fff`；ghost：`bg:var(--action-ghost-bg); border:1px var(--border-strong); color:var(--text-primary)`；danger：`color:var(--action-danger)` 文字/描边。所有按钮 `min-height:40`（手机 ≥44），`radius:var(--radius-md)`。

### 4.10 抽屉 Drawer / 侧边面板 SidePanel
- 桌面 SidePanel 常驻右栏（非模态）；手机 Drawer 为模态底部抽屉 + 半透明遮罩 `rgba(0,0,0,.4)`。z-index 见 §6。

### 4.11 表单字段 FormField（录入页）
- 标签 `--fs-sm` 置顶；输入 `height:40; border:1px var(--border); radius:var(--radius-md)`；错误态 `border:var(--status-error)` + 下方 `--status-error` 提示文字；身份证输入框配【解析】按钮，解析后自动填充年月日，出生时分留空待手动补（warning 提示）。

### 4.12 设置面板 SettingsPanel（AI 接口配置）
- 分组：AI 接口（地址/API Key/模型名/超时/缓存开关）、外观（深浅色/字号/人体图配色）、数据（备份导入/清缓存）、计算精度。输入同 FormField；API Key 输入 `type=password` 默认掩码。

### 4.13 AI 解读阅读面板 AiReadingPanel（全局复用）
- 独立弹层（桌面右侧/手机全屏），展示 AI 返回文本；功能：复制、存本地记录、重新生成。加载/错误/空态齐全；文本区域 `--fs-body` 可滚动。

---

## 5. Layout

- **间距刻度**（4 基准）：`--sp-1:4 --sp-2:8 --sp-3:12 --sp-4:16 --sp-5:24 --sp-6:32 --sp-8:48`。
- **圆角**：`--radius-sm:6 --radius-md:10 --radius-lg:14 --radius-pill:999`。

### 桌面布局
1. **档案首页**：顶部 Toolbar（56 固定）+ 下方自由卡片画布（绝对定位卡片，可拖拽/缩放）。
2. **多盘同屏**：`display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:var(--sp-4)`；每栏=单盘（人体图 + 侧边星体表 + 基础信息）；右上角控件收起星体表/关盘。
3. **双盘合盘（核心）**：`grid-template-columns:1fr 1fr 1fr; gap:var(--sp-4)`；左 A 盘 / 中 B 盘 / 右合盘，三栏各自独立滚动；顶部大按钮【生成整套合盘 AI 爱情解读】+ 三个开关（小数度数 / color-tone-base / 仅看共享通道）。
4. **录入页**：双栏 `grid-template-columns:1fr 1fr`，左表单右实时预览；底部操作条。
5. **设置页**：左导航分组 + 右内容，或单栏分节。

### 手机布局（≤768）
- 单列；档案列表竖向；录入页单栏（身份证/手动二选一）；单人盘页人体图自适应 + 顶部折叠（星体清单/基础信息）+ 底部固定【全盘 AI 解读】；合盘页只展示**合盘总图**，A/B 原始盘通过顶部 Tab 或「切换查看」单独打开；详情一律底部抽屉；设置页单列。

### 长内容与空态
- 星体清单超长 → 列表内部滚动，表头吸顶；空档案库 → 居中插画 + 「新建档案」主按钮（空状态）。

---

## 6. Depth And Elevation

- `--elev-card: 0 1px 3px rgba(16,18,23,.08), 0 1px 2px rgba(16,18,23,.06)`（卡片悬浮）。
- `--elev-panel: 0 4px 16px rgba(16,18,23,.12)`（侧边面板/抽屉）。
- `--elev-dialog: 0 8px 32px rgba(16,18,23,.20)`（弹窗/AI 阅读面板）。
- **层级顺序（z-index）**：画布卡片(10) < Toolbar(20) < SidePanel(30) < Drawer 遮罩(40)/Drawer(41) < Dialog/AI 阅读(50) < Toast(60)。
- 桌面合盘三栏为平级内容层，不叠加阴影；仅在抽屉/弹窗/Toast 使用阴影与遮罩，区分内容与浮层。

---

## 7. Cautions

- **身份证不含出生时间**：解析身份证只能得公历年月日，**出生时分必须由用户手动补**；录入页须以 `--status-warning` 明确提示「出生分钟对闸门影响极大，尽量准确填写」，不得把身份证当作完整生日来源。
- **AI 接口为预留**：设置页只收集配置，不内置/不验证任何具体大模型；界面不得暗示「已接入可用」，AI 调用失败必须走错误态 + 重试，不得伪造解读结果。
- **数据三色专属**：蓝/橙/紫仅用于 A 独有 / B 独有 / 共享 的**数据语义**，主操作按钮一律中性深色，禁止把这三色用于普通按钮或装饰，避免语义混淆。
- **小数度数不可省略**：所有星体度数保留两位（`xx.xx°`），爻/color/tone/base 全展示；「仅看共享通道」是**视图过滤**，不得修改或丢失原始数据。
- **不可编造**：不声称对比度已测（§2 标注 pending）、不声称平台审核/法律清权通过、不伪造 AI 输出效果数据。
- **简洁优先**：不堆叠装饰性渐变、无关图标或不可解释组件；信息密度要有意图，分区独立不堆砌。
- **既有文档令牌不混用**：`output/20261020-hd-techdoc` 的 SimSun 排版令牌仅服务于那份技术文档，不进入 App UI。

---

## 8. Responsive Behavior

- **断点**：375（手机）、768（小平板/手机横屏）、1024（桌面起）、1440（宽屏）。检查这四档。
- **交互模型随断点切换**（不仅改列数）：
  - ≥1024：多盘可并排（auto-fit 多栏）；合盘三栏同屏；闸门/通道 → 右侧常驻面板。
  - ≤768：**不做多盘并排**；合盘只显示总图，A/B 原始盘经 Tab/切换单独查看；闸门/通道 → 底部抽屉；主操作按钮 ≥44px 触摸目标。
- **文本压力**：手机星体清单可折叠进顶部下拉；小数度数与代码用 mono 防错位。
- **动效与可达性**：抽屉/面板过渡 ≤200ms；支持 `prefers-reduced-motion` 时关闭非必要动画；焦点环 `--focus-ring` 在桌面键盘可达，手机提供触摸替代；所有图标按钮带 `aria-label`。
- **加载/错误/恢复**：录入校验失败保留已填内容并定位错误字段；AI 解读超时走错误态 + 重试；合盘生成失败回退到选择页并提示原因。
- **已执行 / 待执行检查**：本契约为文档产出，**未执行浏览器渲染与交互测试**；待前端实现后在 375/768/1024/1440 实测默认/悬停/激活/选中/禁用/加载/成功/错误/空/恢复十态。

---

## 9. Agent Prompt Guide

> 复用的实现提示词（给写前端代码的 AI Agent）。本文件本身**不是**已通过测试的证据，验证状态见 §8。

```
你是 HumanDesignTool 的前端实现 Agent。技术栈：Vue3 + Vite + TypeScript + Pinia（全局状态：档案库、当前多盘、合盘选择、设置/AI 配置、主题）。
严格遵循 D:/AIws/txgzml/rlt/DESIGN.md 的令牌与组件规范，禁止另立配色或字体。

核心工作流：
1) 排盘录入（电脑双栏 / 手机身份证+手动双模式）→ 生成单人盘。
2) 桌面支持多张单人盘并排（auto-fit 多栏，卡片可拖拽/缩放/单关）；手机单盘。
3) 勾选 2 份档案 → 进入合盘页：桌面三栏(A|B|合盘)同屏，手机只显合盘总图+A/B 切换。
4) 点击闸门/通道：桌面右侧面板、手机底部抽屉，先显离线释义，【AI 深度解读】按需调用。
5) AI 配置统一在设置页（地址/Key/模型/超时/缓存），全局生效；AI 解读走独立阅读面板（复制/保存/重生成）。

令牌与约束（必读 §2-§7）：主操作中性深色；数据三色仅 owner-a(#2563EB)/owner-b(#EA7317)/owner-shared(#7C3AED)；
所有度数两位小数 + 爻/color/tone/base 全展示；合盘「仅看共享通道」=通道合并过滤视图，不丢原始数据；
身份证无出生时间，必须手动补时分并 warning 提示；AI 接口仅为预留配置，失败走错误态不伪造。

预期产物：可运行的 Vue3 工程 + 12 个页面组件 + 人体图 SVG 组件 + 设计令牌 CSS 变量文件。
验收：375/768/1024/1440 四档下，十态（默认/悬停/激活/选中/禁用/加载/成功/错误/空/恢复）可用；触摸目标≥44px；深浅色与字号设置全局生效。
```

**验证状态**：设计令牌与组件规则已定义；**实现未开始**，浏览器渲染/交互/对比度测试 pending。
