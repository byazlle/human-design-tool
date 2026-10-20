# HumanDesignTool 组件拆分清单（COMPONENTS.md）

> 配套文档：`D:/AIws/txgzml/rlt/DESIGN.md`（设计令牌与组件视觉规范，本文件不重复配色/字号，只定义**结构与契约**）。
> 技术栈：Vue3 + Vite + TypeScript + Pinia + Vue Router。
> 目标：把 12 个页面（桌面 6 + 手机 6）拆成可独立实现的组件，明确 **props / emits / slots / 本地状态 / store 依赖 / 服务接口**，使 AI 或前端可直接编码。

---

## 0. 命名与约定

- 基础组件前缀 `Hd`（如 `HdButton`、`HdToggle`）；业务组件用领域名（`HumanDesignBodyGraph`、`StarList`）。
- 所有 props 用 `interface XxxProps` 显式声明；事件用 `defineEmits<{...}>`。
- 视口分流统一用 `useBreakpoint()`，页面级 View 内部渲染 `Desktop*` / `Mobile*` 子布局，**不复制路由**。
- 数据单向：`store → props → 子组件`；交互 `emit → 父 → store action`。人体图/合盘计算在 `services/hdEngine.ts`，组件只负责渲染。

---

## 1. 工程目录

```
src/
├─ main.ts
├─ App.vue
├─ router/index.ts
├─ styles/{tokens.css, base.css}
├─ types/hd.ts
├─ stores/{archive.ts, board.ts, composite.ts, settings.ts, ui.ts}
├─ composables/{useBreakpoint.ts, useHdInteractions.ts, useAiReading.ts}
├─ services/{hdEngine.ts, interpretations.ts, aiClient.ts}
├─ components/
│  ├─ base/        AppToolbar, HdButton, HdToggle, HdField, HdDrawer,
│  │               HdSidePanel, HdDialog, SearchInput, IconButton, EmptyState
│  ├─ archive/     ArchiveCard, ArchiveCanvas, MobileArchiveList, BulkActionBar
│  ├─ chart/       HumanDesignBodyGraph, StarList, BoardMeta, BoardControls
│  ├─ composite/   CompositeToolbar, CompositeColumn
│  ├─ panel/       GateChannelPanel, AiReadingPanel
│  └─ settings/    SettingsForm
└─ views/
   ├─ ArchiveHomeView.vue      → ArchiveCanvas | MobileArchiveList
   ├─ SingleChartView.vue      → ChartDesktop | MobileSingleChartView
   ├─ MultiBoardView.vue       → (仅桌面) 多栏并排
   ├─ CompositeView.vue        → CompositeDesktop(三栏) | MobileCompositeView
   ├─ EntryView.vue            → EntryDesktop(双栏) | MobileEntryView
   └─ SettingsView.vue         → SettingsForm(响应式)
```

---

## 2. 路由表

| 路径 | 视图 | 桌面行为 | 手机行为 |
| --- | --- | --- | --- |
| `/` | ArchiveHomeView | 自由卡片画布 + 顶部工具栏 | 垂直档案列表 + 新建大按钮 |
| `/archive/:id` | SingleChartView | 单人完整盘（可多开为多栏） | 单人盘 + 折叠 + 底部固定按钮 |
| `/boards?ids=a,b,c` | MultiBoardView | 多盘 auto-fit 并排 | **重定向**到 `/archive/:id`（不做并排） |
| `/composite/:aId/:bId` | CompositeView | 三栏 A\|B\|合盘 | 只显合盘总图 + A/B 切换 |
| `/new` | EntryView | 双栏 表单+预览 | 身份证/手动 二选一 |
| `/settings` | SettingsView | 左导航+右内容 | 单列 |
| `/ai/:scope/:ref?` | AiReadingPanel（全局弹层） | 右侧面板/弹窗 | 全屏页 |

---

## 3. 类型契约 `types/hd.ts`

```ts
export type Planet =
  | 'Sun' | 'Earth' | 'Moon'
  | 'NorthNode' | 'SouthNode'
  | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn'
  | 'Uranus' | 'Neptune' | 'Pluto';

export type CenterId =
  | 'head' | 'ajna' | 'throat' | 'g' | 'heart'
  | 'sacral' | 'spleen' | 'solar' | 'root';

export type HDType =
  | 'Generator' | 'ManifestingGenerator' | 'Manifestor'
  | 'Projector' | 'Reflector';

export type Ownership = 'a' | 'b' | 'shared';

/** 单颗星体的落点（度数保留两位小数，爻/color/tone/base 全量） */
export interface StarPosition {
  planet: Planet;
  longitude: number;   // 0–360, 显示 xx.xx°
  gate: number;        // 1–64
  line: number;        // 1–6
  color: number;       // 1–6
  tone: number;        // 1–6
  base: number;        // 1–5
}

export interface CenterState { id: CenterId; defined: boolean; }

export interface GateActivation { gate: number; stars: Planet[]; }
export interface ChannelActivation { key: string; gates: [number, number]; } // key 例 "1-8"

/** 单人盘计算结果（由 hdEngine 产出，组件只读） */
export interface BodyGraph {
  type: HDType;
  strategy: string;
  authority: string;
  profile: string;            // 人生角色，例 "1/3"
  incarnationCross: string;   // 轮回交叉
  centers: CenterState[];     // 9 个
  gates: GateActivation[];
  channels: ChannelActivation[];
  personality: StarPosition[]; // 意识（Personality）13 星
  design: StarPosition[];      // 无意识（Design）13 星
}

export interface Archive {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'other';
  birth: { year: number; month: number; day: number; hour: number; minute: number };
  timezone: string;            // 例 "Asia/Shanghai"
  location: { lat: number; lng: number; place: string };
  createdAt: string;
  chart?: BodyGraph;           // 生成后缓存
}

/** 合盘结果：A / B / 合并 + 共享集合 */
export interface CompositeResult {
  a: BodyGraph;
  b: BodyGraph;
  merged: {
    centers: CenterState[];
    gates: Array<GateActivation & { owners: Ownership[] }>;
    channels: Array<ChannelActivation & { owners: Ownership[] }>;
  };
  sharedChannels: ChannelActivation[];
}

export type UiFilter = { showDecimals: boolean; showColorToneBase: boolean; sharedOnly: boolean };

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  cacheEnabled: boolean;
}

export type ThemeMode = 'light' | 'dark';
```

---

## 4. Pinia Stores

### 4.1 `useArchiveStore`
```ts
state: { archives: Archive[]; selectedIds: string[]; keyword: string }
getters: filtered (按 keyword 过滤 name), selectedArchives
actions: create(input), update(id, patch), remove(id),
         toggleSelect(id), clearSelect(),
         ensureChart(id)  // 调用 hdEngine.compute 并回填 chart
```

### 4.2 `useBoardStore`（桌面多盘）
```ts
state: { openIds: string[]; zoom: Record<string,'1x'|'1.5x'|'2x'>;
         starListCollapsed: Record<string, boolean> }
actions: open(ids), closeOne(id), closeAll, setZoom, toggleStarList
```

### 4.3 `useCompositeStore`
```ts
state: { aId: string|null; bId: string|null; result: CompositeResult|null;
         filters: UiFilter; loading: boolean; error: string|null }
actions: setPair(aId,bId), build() /* 调 hdEngine.composite */,
         setFilter(key,val), reset
```

### 4.4 `useSettingsStore`（AI 配置全局生效）
```ts
state: { ai: AiConfig; appearance: { theme: ThemeMode; fontScale: number;
         bodyGraphPalette: 'default'|'high-contrast' }; precision: { decimals: 2 } }
actions: saveAi(patch), loadAi(), setTheme, setFontScale
persist: localStorage（apiKey 仅本地，不落服务端）
```

### 4.5 `useUiStore`
```ts
state: { panel: { kind:'gate'|'channel'|'center'|null; ref: string|number|null; source:'a'|'b'|'merged'|'single'|null };
         drawerOpen: boolean;
         aiReading: { open:boolean; scope:string; ref?:string; content:string; loading:boolean; error:string|null } }
actions: openGate(gate,source), openChannel(key,source), closePanel,
         openAi(scope,ref), closeAi, setAiContent
```

---

## 5. 基础组件契约（components/base）

| 组件 | Props | Emits | Slots | 说明 |
| --- | --- | --- | --- | --- |
| `AppToolbar` | `title?: string` | `new`, `bulk(action)`, `search`, `settings`, `help` | `left`,`right` | 桌面固定顶栏；手机简化为标题+新建+设置 |
| `HdButton` | `variant:'primary'\|'ghost'\|'danger'`, `size:'sm'\|'md'`, `disabled`, `loading` | `click` | default | 主操作中性深色（见 DESIGN §4.9） |
| `HdToggle` | `modelValue:boolean`, `label:string`, `disabled?` | `update:modelValue` | — | 44×24，触摸 ≥44 |
| `HdField` | `label`, `modelValue`, `error?`, `type?`, `placeholder?` | `update:modelValue` | `suffix`（放【解析】按钮） | 录入/设置通用 |
| `HdDrawer` | `open:boolean`, `side:'bottom'\|'right'`, `size?` | `close` | default | 手机底部抽屉/桌面右栏 |
| `HdSidePanel` | `open:boolean`, `width?:number` | `close` | `header`,`default`,`footer` | 桌面常驻右侧面板 |
| `HdDialog` | `open:boolean` | `close` | default | 遮罩弹窗 |
| `SearchInput` | `modelValue:string` | `update:modelValue` | — | 按人名搜索 |
| `IconButton` | `label:string`（a11y）, `icon` | `click` | — | Lucide 图标，带 aria-label |
| `EmptyState` | `title`, `desc?` | `action` | — | 空档案库 |

---

## 6. 业务组件契约

### 6.1 `HumanDesignBodyGraph`（核心 SVG）
```ts
interface HumanDesignBodyGraphProps {
  chart: BodyGraph;
  mode?: 'single' | 'composite';
  gateOwners?: Record<number, Ownership>;       // 合盘：闸门 → 归属
  channelOwners?: Record<string, Ownership>;    // 合盘：通道 key → 归属
  filter?: UiFilter;
  highlight?: { gates?: number[]; channels?: string[] };
  interactive?: boolean;                        // 默认 true
  width?: number;                               // 自适应容器时省略
}
emits: {
  'gate-click': [gate: number, source: 'a'|'b'|'merged'|'single'];
  'channel-click': [key: string, source: ...];
  'center-click': [id: CenterId, source: ...];
}
```
- 内部：`<path>` 九中心、`<circle>`+`<text>` 64 闸门、`<line>`/`<path>` 36 通道；`filter.sharedOnly` 时隐藏 `owners` 非 `shared` 的闸门/通道；单盘用 `--hd-single-accent`，合盘按 `gateOwners/channelOwners` 上色。
- 父组件监听事件 → 调 `useUiStore.openGate/openChannel`，并传 `source` 区分来自哪一栏。

### 6.2 `StarList`
```ts
interface StarListProps {
  personality: StarPosition[];
  design: StarPosition[];
  filter: UiFilter;
  collapsible?: boolean;
  defaultOpen?: boolean;
}
emits: { 'gate-click': [gate:number] }
```
- 列：星体｜度数(`xx.xx°`)｜闸门｜爻｜color/tone/base；`filter.showDecimals=false` 时度数整显示、`showColorToneBase=false` 时隐藏末列；每盘独立收起。

### 6.3 `BoardMeta`
`props: chart: BodyGraph` — 展示类型、策略、权威、人生角色、轮回交叉、九中心状态。

### 6.4 `BoardControls`
`props: boardId:string; collapsed:boolean`；`emits: toggle-stars`, `close` — 右上角收起星体表/关盘。

### 6.5 `GateChannelPanel`
```ts
interface GateChannelPanelProps {
  selection: { kind:'gate'|'channel'|'center'; ref: number|string; source: string } | null;
  offlineText: string;           // interpretations.ts 提供
  aiState: 'idle'|'loading'|'done'|'error';
}
emits: { 'request-ai': [], 'retry-ai': [], 'close': [] }
```
- 桌面渲染进 `HdSidePanel`，手机渲染进 `HdDrawer(side='bottom')`；底部【AI 深度解读】。

### 6.6 `AiReadingPanel`
```ts
props: { open:boolean; title:string; content:string; loading:boolean; error:string|null }
emits: { close, copy, save, regenerate }
```

### 6.7 `ArchiveCard`（自由画布卡片）
```ts
props: { archive: Archive; selected: boolean; zoom: '1x'|'1.5x'|'2x' }
emits: { open, add-to-composite, close, toggle-select, drag, resize }
```

### 6.8 `ArchiveCanvas`（桌面自由画布）
`props: { archives: Archive[]; selectedIds: string[] }`；`emits: ...` 透传；内部处理绝对定位、拖拽/缩放、批量条显隐。

### 6.9 `MobileArchiveList`
`props: { archives: Archive[]; selectedIds: string[] }`；`emits: open, toggle-select, new, composite`（选中 2 时启用合盘）。

### 6.10 `CompositeColumn`
```ts
props: { role: 'a'|'b'|'merged'; chart: BodyGraph; gateOwners?; channelOwners?; filter: UiFilter }
emits: { 'gate-click', 'channel-click' }
```
- A/B 列：独有闸门蓝/橙标记；merged 列：按 owners 蓝/橙/紫；下方共享通道汇总。

### 6.11 `SettingsForm`
`props: { model: { ai: AiConfig; appearance; precision } }`；`emits: save`, `import`, `export`, `clear-cache`；分组：AI 接口 / 外观 / 数据 / 计算精度。

---

## 7. 桌面页面组件树

```
ArchiveHomeView
├─ AppToolbar [new, bulk, search, settings]
├─ BulkActionBar (选中≥1 显示) → 并排打开 / 生成合盘
└─ ArchiveCanvas
   └─ ArchiveCard × N (drag/resize/close/select)
      └─ HumanDesignBodyGraph (缩略) + 星体摘要

MultiBoardView (仅桌面, /boards)
└─ grid auto-fit
   └─ SingleBoardColumn × N
      ├─ BoardControls (收起星体表/关盘)
      ├─ HumanDesignBodyGraph (single)
      ├─ StarList (可收起)
      └─ BoardMeta
└─ GateChannelPanel → HdSidePanel (共用右侧)

CompositeView (桌面三栏)
├─ CompositeToolbar
│  ├─ HdButton「生成整套合盘 AI 爱情解读」
│  └─ HdToggle × 3 (小数度数 / color-tone-base / 仅看共享通道)
├─ grid 1fr 1fr 1fr
│  ├─ CompositeColumn role="a"
│  ├─ CompositeColumn role="b"
│  └─ CompositeColumn role="merged" (+共享通道汇总)
└─ GateChannelPanel → HdSidePanel

EntryView (桌面双栏)
├─ HdField × (姓名/年月日时分/时区/经纬度)
└─ 实时预览 (BasicPreview)

SettingsView
└─ SettingsForm (AI 接口 / 外观 / 数据 / 精度)

AiReadingPanel (全局, /ai/:scope/:ref)
```

## 8. 手机页面组件树

```
ArchiveHomeView → MobileArchiveList
├─ 标题 + HdButton「新建档案」
├─ ArchiveRow × N (名字+类型+缩略图+勾选)
└─ 选中2 → 底部【生成合盘】

MobileEntryView (/new)
├─ 分段切换 [身份证快捷 | 手动录入]
├─ 方式A: HdField(身份证号) + suffix【解析】→ 回填年月日; 时分 HdField 手填
├─ 方式B: HdField × (姓名/年月日/时分/出生地)
└─ 底部 HdButton「生成人类图」+ warning 提示

MobileSingleChartView (/archive/:id)
├─ HumanDesignBodyGraph (自适应)
├─ 顶部折叠: StarList / BoardMeta
├─ GateChannelPanel → HdDrawer(side=bottom)
└─ 底部固定 HdButton「全盘 AI 解读」

MobileCompositeView (/composite/:aId/:bId)
├─ Tab [A盘 | B盘 | 合盘] (默认合盘)
├─ HumanDesignBodyGraph (merged, owners 上色)
├─ 折叠: 闸门清单(标注归属)
├─ HdToggle「仅展示共享通道」
├─ GateChannelPanel → HdDrawer
└─ 底部 HdButton「生成合盘 AI 爱情解读」

MobileSettingsView (/settings)
└─ SettingsForm (单列)

MobileAiReadingView (/ai/:scope/:ref)
└─ 全屏 AiReadingPanel (复制/保存/重新生成)
```

---

## 9. 数据与事件流

```
录入 → archive.create → hdEngine.compute(input) → archive.chart
                                                     │
ArchiveCard/列表 → 勾选 → board.open / composite.setPair
                                                     │
HumanDesignBodyGraph.onGateClick(gate, source) → ui.openGate
                                                     │
              interpretations.get(kind, ref) ──┐     │
                                               ▼     ▼
                                        GateChannelPanel
                                     【AI 深度解读】→ aiClient.explain()
                                                     │
                                                AiReadingPanel
```

- **合盘构建**：`composite.build()` 调 `hdEngine.composite(a,b)` → 产出 `merged` + `sharedChannels` + 每项 `owners`；`filters.sharedOnly` 只影响**渲染过滤**，不改 `result`。
- **AI 全局配置**：`aiClient` 从 `settingsStore.ai` 读地址/Key/模型/超时；缓存开关命中时读本地缓存，不重复请求。

---

## 10. 服务接口

```ts
// services/hdEngine.ts
export function compute(input: ArchiveInput): BodyGraph;
export function composite(a: BodyGraph, b: BodyGraph): CompositeResult;

// services/interpretations.ts  (离线固定释义, 内置数据)
export function getGate(gate: number): { title: string; text: string };
export function getChannel(key: string): { title: string; text: string };

// services/aiClient.ts  (预留接口, 失败不伪造)
export async function explain(cfg: AiConfig, scope: string, ref: string, offline: string,
                              signal?: AbortSignal): Promise<string>;
```

---

## 11. 组件 ↔ 页面矩阵

| 组件 \ 页面 | 档案首页 | 多盘 | 合盘 | 录入 | 设置 | 单人盘 | AI阅读 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| HumanDesignBodyGraph | ○缩略 | ● | ● | 预览 | | ● | |
| StarList | ○ | ● | ● | | | ● | |
| ArchiveCard/Row | ● | | | | | | |
| CompositeColumn | | | ● | | | | |
| GateChannelPanel | | ● | ● | | | ● | |
| SettingsForm | | | | | ● | | |
| AiReadingPanel | | | ● | | | ● | ● |

---

## 12. 实施顺序与验收

1. **脚手架**：Vite+Vue3+TS+Pinia+Router；`tokens.css` 落地 DESIGN.md 变量。
2. **类型 + 服务**：`types/hd.ts`、`hdEngine`（先 mock 数据）、`interpretations`、`aiClient`。
3. **基础组件**（base/*）→ 业务组件（chart/*、archive/*）。
4. **桌面页面**（ArchiveHome → MultiBoard → Composite → Entry → Settings）。
5. **手机页面**（列表 → 录入 → 单人盘 → 合盘 → 设置 → AI）。
6. **四档实测** 375/768/1024/1440 十态；触摸 ≥44px；深浅色/字号全局生效；对比度实测补齐。

**验收标准**：12 页面可跑通主路径；点任一闸门/通道出离线释义且 AI 按需触发；合盘「仅看共享通道」过滤正确且不丢原始数据；身份证解析后强制手填时分并 warning；多盘/合盘分区独立不串色。
