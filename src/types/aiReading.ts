/**
 * AI 解读重构（v4.0.0）的共享类型契约。
 *
 * 定位：视图层（三入口） → 编排层（计划器 / 执行器） → 调度层 → 提示词层 → 请求层
 * 全部共用这一份结构，避免各层各自定义导致字段漂移（ARCH v4.0.0 §7.1）。
 *
 * 口径来源：`docs/design/ARCH-v4.0.0-AI解读重构.md` §7.1。
 * 只声明类型，不含任何运行期逻辑，因此可以被任意层 `import type` 引用而不产生循环依赖。
 */
import type { AiDetailMode, AiStyle, BodyGraph } from './hd'
import type { ReadingDimKey } from '../services/chartFacts'

/** 三个 AI 入口（软件级入口，不是完整版内部子模式） */
export type AiEntry = 'full' | 'composite' | 'selection'

/**
 * 表达风格（替代旧 `AiAudience`：取值不变，语义反转）。
 *
 * 定义放在 `types/hd.ts`（与 `AiDetailMode` / 旧 `AiAudience` 同处，改一处即可），
 * 这里只做重导出，让 `types/aiReading.ts` 依然是编排层拿风格的唯一入口——
 * 避免出现两份同名同值的字面量联合类型（两份会各自漂移）。
 */
export type { AiStyle } from './hd'

/**
 * 请求范围标识（进缓存键；新增值只追加，不改既有）。
 *
 * 末位 `(string & {})` 是**故意的兜底**：v3.5.0 的既有调用点里存在
 * `composite-love` / `composite-career` / `full-module:A1-core` 这类动态 scope，
 * 把它们一次性收紧成联合类型会造成大面积类型错误且无收益。
 * 保留祖传字面量 + 任意字符串兜底，新代码只使用上面列出的显式值。
 */
export type AiScope =
  // ── v4.0.0 新增 ──
  | 'panorama-one' // 入口 A 单次档（精简 / 详细）：6 模块在同一篇里按序写完
  | 'unified' // 入口 B 单次（勾选维度 + 方向，一篇写完）
  | 'selection-one' // 入口 C 单次（逐条 + 关联汇总在一篇里）
  | 'full-module' // 入口 A ①④、入口 C 可选模块
  | 'full-all-channels' // 入口 A ②（一次通解全部通道）
  | 'full-all-gates' // 入口 A ③（一次通解全部闸门）
  | 'full-trajectory' // 入口 A ⑤（5 方向 1 模块）
  | 'full-dimension' // 入口 B 完整档分项 / 关系场维度
  | 'full-gate' // 逐闸门
  | 'full-channel' // 逐通道
  | 'full-fusion' // A⑥ / B 融合 / C 汇总 / 关系场整合
  | 'selection-fusion' // 入口 C 完整档的关联汇总
  // ── v3.5.0 既有单点入口（保留，不改）──
  | 'single'
  | 'gate'
  | 'channel'
  | 'center'
  | 'chiron'
  // ── 祖传动态 scope 兜底（composite-* 等）──
  | (string & {})

/** 入口 C 的勾选对象（三者至少勾一项，回路 / 交叉为可选） */
export interface SelectionPick {
  /** 通道 key，如 '20-34' */
  channels: string[]
  /** 闸门号 */
  gates: number[]
  /** 勾选「定义状态」 */
  definition: boolean
  /** 勾选「回路分布」 */
  circuit: boolean
  /** 勾选「轮回交叉」 */
  cross: boolean
}

/** 解读方向：内置角度 或 用户自定义（`custom` 非空时优先） */
export interface ReadingDirection {
  /** `READING_ANGLES` 的 key，或 'custom' */
  key: string
  label: string
  prompt: string
  /** 用户自定义方向正文；非空时优先于 label / prompt */
  custom: string
}

/** 一次解读请求（视图 → 计划器的唯一入参） */
export interface ReadingRequest {
  entry: AiEntry
  detail: AiDetailMode
  style: AiStyle
  chart: BodyGraph
  /** 盘面摘要；缺省由 `chartSummaryOf(chart)` 生成，合盘由调用方注入 */
  chartSummary?: string
  /** 入口 B：勾选维度（按 `READING_DIMENSIONS` 顺序，不按点击顺序） */
  dims?: ReadingDimKey[]
  /** 入口 C：勾选对象 */
  selection?: SelectionPick
  /** 方向（A ⑥ 用 fusionAngle，C 可省略表示「不限方向」） */
  direction?: ReadingDirection
  /** 档案名：只用于报告标题，**绝不**进 prompt（否则缓存键分裂） */
  archiveName: string
}

/** 计划里的一项任务 */
export interface ReadingTask {
  /** 稳定 key，形如 `A2-channels` / `B-dim:authority` / `C-one:ch:20-34` */
  key: string
  /** 报告与进度区展示用的标题 */
  title: string
  scope: AiScope
  /** 进入缓存键的引用标识 */
  ref: string
  /** 【离线释义】正文（事实块 + 方向 + 收束指令） */
  offline: string
  /** 报告分节类型（与 report.ts 的 FullSectionKind 对齐，另加 summary） */
  kind: 'module' | 'gate' | 'channel' | 'dimension' | 'summary'
}

/** 请求 → 计划（纯函数产物，可单测） */
export interface ReadingPlan {
  entry: AiEntry
  detail: AiDetailMode
  /** true = 一次请求内按小节组织；false = 多请求 + 末位融合 */
  singleShot: boolean
  tasks: ReadingTask[]
  /** 末位融合任务；singleShot 时为 null */
  fusion: ReadingTask | null
  /** 报告标题（含档位与入口，供 UI 与导出页眉） */
  title: string
}

/**
 * 运行期进度：**扩展**既有 `AiProgress`，不替换它。
 *
 * `AiProgress` 的 8 个字段是桌面冒烟与 QA-F2 的静态契约，一个字都不能动；
 * 「在跑数 / 上限」这两个新字段只服务状态区文案，因此单独放在这里。
 */
export interface ReadingProgress {
  done: number
  total: number
  current: string
  phase: string
  elapsedMs: number
  etaMs: number | null
  skipped: string[]
  failed: string[]
  /** 当前在跑数（滑动窗口内），供状态区展示起速过程 */
  inFlight: number
  /** 最高并发数 N（1–99） */
  maxConcurrency: number
}
