<script setup lang="ts">
/**
 * AI 解读阅读面板（v2.3.0 · T-6 五区重构 + 放大态 + 二次确认）。
 *
 * 五区：A 固定头部 / B 状态区 / C 报告工具区 / E 错误区（常驻）/ D 唯一滚动展示区。
 * A/B/C/E `flex:none`；D 是唯一 `overflow-y:auto` 且带 `min-height:0` 的容器。
 *
 * ★ 条件 ② / 一次性并发的 N/Y/K 同义提示由模块级单例 `useAiStatus.terminalHint` 承载：
 *   `useAiReading.runFull.publish` 调 `status.applyProgress()` 在分项阶段记住完整长文案，
 *   融合阶段 current 被覆盖后仍保留，`finish()` 不覆盖 → B 区独立静态行在终态、
 *   乃至 progress 置 null 后都不消失（PRD §4.2 / AC-C5 / AC-C17）。
 *
 * 放大与还原是纯 class 切换、同一棵 DOM 树：零 DOM 重建、零请求、零 store 写入。
 * 遮罩无任何事件监听；关闭 / 取消 / 重新生成三种代价操作统一走 ConfirmDialog。
 * 不进 Pinia / 不持久化 / 不新增 AiProgress 字段。
 */
import { computed, nextTick, ref, watch } from 'vue'
import IconButton from '../base/IconButton.vue'
import ConfirmDialog from '../base/ConfirmDialog.vue'
import { renderMarkdown } from '../../services/markdown'
import { exportReport, REPORT_FORMAT_LABELS, REPORT_FORMATS } from '../../services/aiExport'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
import { useBreakpoint } from '../../composables/useBreakpoint'
import { useAiStatus } from '../../composables/useAiStatus'
import type { AiDetailMode } from '../../types/hd'
import type {
  AiProgress,
  FullReport,
  FullReportSection,
  FullSectionKind,
  ReportFormat,
  ReportInput,
  ReportMeta,
} from '../../types/report'

const props = defineProps<{
  open: boolean
  title: string
  content: string
  loading: boolean
  error: string | null
  /** 当前是否已配置可用的 AI 配置；未配置时错误态给「去设置」入口 */
  configured?: boolean
  /** 本次解读实际生效的档位；不传则跟随设置里的全局档位 */
  mode?: AiDetailMode
  /** 完整版结构化报告（#9）；传入时导出按分项序列化、面板按模块展示 */
  report?: FullReport | null
  /** 完整版多轮编排的实时进度（#9） */
  progress?: AiProgress | null
  /** 报告页眉上下文（范围 / 引用 / 盘面名），不推断 */
  meta?: ReportMeta
}>()

const emit = defineEmits<{
  close: []
  copy: []
  save: []
  regenerate: []
  cancel: []
  settings: []
}>()

const settings = useSettingsStore()
const ui = useUiStore()
const status = useAiStatus()
const { isMobile } = useBreakpoint()

const hasContent = computed(() => props.content.trim().length > 0)
const hasReportSections = computed(() => Boolean(props.report?.sections.length))
const effectiveMode = computed<AiDetailMode>(() => props.mode ?? settings.aiDetailMode)
/** #9 的完整版可能只产出了结构化报告、content 仍在拼装，因此两者都可作为导出源 */
const canExport = computed(() => hasContent.value || Boolean(props.report))
const exporting = ref<ReportFormat | null>(null)

/** AI 解读以 Markdown 层级排版渲染（先转义防注入） */
const renderedHtml = computed(() => renderMarkdown(props.content))

const MODE_LABEL: Record<AiDetailMode, string> = {
  concise: '精简',
  detailed: '详细',
  full: '完整',
}

/* ── #9 完整版：进度条 + 模块化分项展示 ────────────────── */

interface ReportGroup {
  key: FullSectionKind
  label: string
  sections: FullReportSection[]
}

const GROUP_LABELS: Array<{ key: FullSectionKind; label: string }> = [
  { key: 'dimension', label: '一、八大维度' },
  { key: 'gate', label: '二、逐闸门解读' },
  { key: 'channel', label: '三、逐通道解读' },
]

const reportGroups = computed<ReportGroup[]>(() =>
  GROUP_LABELS.map((g) => ({
    ...g,
    sections: props.report?.sections.filter((s) => s.kind === g.key) ?? [],
  })).filter((g) => g.sections.length > 0),
)

/** 通道默认收起，每条通道可独立展开/收起；维度默认展开，闸门默认收起 */
const DEFAULT_OPEN: Record<FullSectionKind, boolean> = {
  dimension: true,
  gate: false,
  channel: false,
}
const toggles = ref<Record<string, boolean>>({})
function isOpen(s: FullReportSection): boolean {
  return toggles.value[s.key] ?? DEFAULT_OPEN[s.kind]
}
function toggleSection(s: FullReportSection) {
  toggles.value = { ...toggles.value, [s.key]: !isOpen(s) }
}
function setAll(open: boolean) {
  const next: Record<string, boolean> = {}
  props.report?.sections.forEach((s) => {
    next[s.key] = open
  })
  toggles.value = next
}
// 同一轮生成的 generatedAt 稳定，分项递增时不会重置用户的展开状态；新一轮才重置
watch(
  () => props.report?.generatedAt,
  () => {
    toggles.value = {}
  },
)

const sectionHtml = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  props.report?.sections.forEach((s) => {
    out[s.key] = renderMarkdown(s.content)
  })
  return out
})
const fusionHtml = computed(() => renderMarkdown(props.report?.fusion ?? ''))
const summaryHtml = computed(() => renderMarkdown(props.report?.summary ?? ''))

/** T-C6：终态保留静态 phase 行（融合「最后一步，单独执行」/「已完成」可见） */
const lastPhase = ref('')
watch(
  () => props.progress?.phase,
  (nextPhase) => {
    if (nextPhase) lastPhase.value = nextPhase
  },
  { immediate: true },
)

/** 终态同义提示：唯一来源是状态单例，B 区独立静态行不依赖 props.progress */
const terminalHint = computed(() => status.snapshot.value.terminalHint)

const progressPct = computed(() => {
  const p = props.progress
  return p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0
})

function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '预计剩余：计算中'
  if (ms <= 0) return '预计剩余：即将完成'
  const totalSec = Math.round(ms / 1000)
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return minutes > 0 ? `预计剩余 ${minutes} 分 ${seconds} 秒` : `预计剩余 ${seconds} 秒`
}

function buildReportInput(): ReportInput {
  return {
    title: props.title,
    mode: effectiveMode.value,
    content: props.content,
    report: props.report ?? null,
    // scope / ref 直接取 UI 状态里本次请求的真实值，不推断；view 可再补 chartName
    meta: { scope: ui.aiReading.scope, ref: ui.aiReading.ref, ...props.meta },
    generatedAt: new Date().toISOString(),
  }
}

/** 需求 #10：MD / Word / HTML / PDF；桌面端原生另存为，浏览器/安卓退化为下载或打印 */
async function doExport(format: ReportFormat) {
  if (!canExport.value || exporting.value) return
  exporting.value = format
  try {
    const result = await exportReport(format, buildReportInput())
    if (!result.canceled) ui.notify(result.message, result.ok ? 'success' : 'error')
  } catch (err) {
    ui.notify(`导出失败：${(err as Error).message || '未知错误'}`, 'error')
  } finally {
    exporting.value = null
  }
}

/* ── 放大 / 还原：纯展示控件（AI-07 / AC-21）─────────────── */

const bodyEl = ref<HTMLElement | null>(null)
// MB-3：手机默认放大态；一次性取值，之后不随 resize 自动切换
const expanded = ref(isMobile.value)
let savedScrollTop = 0

function toggleExpanded() {
  const el = bodyEl.value
  if (el) savedScrollTop = el.scrollTop
  expanded.value = !expanded.value
  nextTick(() => {
    if (!el) return
    // 明确规则：保留原滚动位置；超出新容器最大可滚动值时归位到末尾且首屏可见
    const max = Math.max(0, el.scrollHeight - el.clientHeight)
    el.scrollTop = Math.min(savedScrollTop, max)
  })
}

/* ── 三种代价操作的二次确认（R-7 / AI-01 / 6.4）──────────── */

type ConfirmKind = 'close' | 'cancel' | 'regenerate' | null
const confirm = ref<ConfirmKind>(null)

const CONFIRM_TEXT: Record<Exclude<ConfirmKind, null>, { title: string; desc: string }> = {
  close: {
    title: '关闭 AI 解读面板？',
    desc: '本次生成将被中断，已生成内容保留。你可以稍后重新生成。',
  },
  cancel: {
    title: '取消本次 AI 请求？',
    desc: '取消后本次结果不会生成，已生成内容保留。',
  },
  regenerate: {
    title: '重新生成 AI 解读？',
    desc: '将覆盖当前报告；生成期间旧内容仍保留在下方。',
  },
}

function requestClose() {
  if (props.loading) confirm.value = 'close'
  else emit('close')
}

function requestRegenerate() {
  if (hasContent.value) confirm.value = 'regenerate'
  else emit('regenerate')
}

/** B 区三个互斥入口共用同一确认流程；任一入口只触发一次取消 */
let cancelSource: 'status' | 'skeleton' | 'regen' = 'status'
function requestCancel(source: 'status' | 'skeleton' | 'regen' = 'status') {
  cancelSource = source
  confirm.value = 'cancel'
}

function confirmApply() {
  const k = confirm.value
  confirm.value = null
  if (k === 'close') emit('close')
  else if (k === 'regenerate') emit('regenerate')
  else if (k === 'cancel') {
    // 按来源分支 emit：三个入口统一确认，且恰好各触发一次
    if (cancelSource === 'skeleton') emit('cancel')
    else if (cancelSource === 'regen') emit('cancel')
    else emit('cancel')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <!-- AI-01：遮罩无任何事件监听，点击一律不关闭、不中断 -->
      <div v-if="open" class="ai-mask" aria-hidden="true" />
    </Transition>
    <Transition name="rise">
      <section
        v-if="open"
        class="ai-panel"
        :class="{ 'is-expanded': expanded }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        data-zone-root
      >
        <!-- A 固定头部区：查看类 / 代价类分组，间距 ≥12px -->
        <header class="head zone zone-a" data-zone="A">
          <div class="grow">
            <p class="t-xs">AI READING · {{ MODE_LABEL[effectiveMode] }}</p>
            <h2 class="t-title ellipsis">{{ title }}</h2>
          </div>
          <div class="actions">
            <div class="group group-view">
              <IconButton label="复制内容" icon="copy" size="sm" :disabled="!hasContent" @click="emit('copy')" />
              <IconButton label="保存到本地记录" icon="save" size="sm" :disabled="!hasContent" @click="emit('save')" />
              <IconButton
                :label="expanded ? '还原阅读' : '放大阅读'"
                :icon="expanded ? 'chevron-down' : 'grid'"
                size="sm"
                @click="toggleExpanded"
              />
            </div>
            <div class="group group-cost">
              <IconButton label="重新生成" icon="refresh" size="sm" :disabled="loading" @click="requestRegenerate" />
              <IconButton label="关闭" icon="close" size="sm" @click="requestClose" />
            </div>
          </div>
        </header>

        <!-- A 区导出条：R-5 文案固定「导出报告 · MD / Word / HTML / PDF」 -->
        <div v-if="canExport" class="export-bar zone zone-a-extra" data-zone="A" aria-label="导出报告 · MD / Word / HTML / PDF">
          <span class="t-xs t-muted export-label">导出报告 · MD / Word / HTML / PDF</span>
          <button
            v-for="format in REPORT_FORMATS"
            :key="format"
            type="button"
            class="export-btn"
            :disabled="loading || exporting !== null"
            :title="`导出报告 · ${REPORT_FORMAT_LABELS[format]}`"
            @click="doExport(format)"
          >
            {{ exporting === format ? '导出中…' : REPORT_FORMAT_LABELS[format] }}
          </button>
        </div>

        <!-- B 状态区（只读 + 唯一取消请求入口；FB-6 状态唯一源） -->
        <div class="zone zone-b" data-zone="B" role="status" aria-live="polite">
          <p class="t-sm status-label">{{ status.snapshot.value.label }}</p>
          <div v-if="progress" class="progress-wrap">
            <div class="progress-top">
              <span class="t-sm">
                第 {{ progress.done }}/{{ progress.total }} 项 · {{ progress.current }} ·
                {{ formatEta(progress.etaMs) }}
              </span>
              <button type="button" class="export-btn" :disabled="!loading" @click="requestCancel('status')">
                取消
              </button>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: progressPct + '%' }" />
            </div>
            <p class="t-xs t-muted progress-note">
              {{ progress?.phase || lastPhase }}｜已跳过 {{ progress.skipped.length }} 项{{
                progress.skipped.length ? `（${progress.skipped.join('、')}）` : ''
              }}
            </p>
          </div>
          <div v-else-if="loading && !hasContent" class="b-placeholder">
            <button type="button" class="export-btn" @click="requestCancel('skeleton')">取消请求</button>
          </div>
          <div v-else-if="loading" class="b-placeholder">
            <button type="button" class="export-btn" @click="requestCancel('regen')">取消请求</button>
          </div>
          <!-- 终态同义提示：B 区独立静态行，不依赖 progress，置 null 后仍渲染 -->
          <p v-if="terminalHint" class="t-xs t-muted terminal-hint">{{ terminalHint }}</p>
        </div>

        <!-- C 报告工具区（展示控制） -->
        <div class="zone zone-c" data-zone="C">
          <span class="t-xs t-muted">
            共 {{ report?.sections.length ?? 0 }} 个分项 · 约 {{ report?.totalChars ?? 0 }} 字
          </span>
          <div class="report-toolbar-actions">
            <button type="button" class="export-btn" @click="setAll(true)">全部展开</button>
            <button type="button" class="export-btn" @click="setAll(false)">全部收起</button>
          </div>
        </div>

        <!-- E 错误区（FB-3 常驻；固定在 C 与 D 之间，不被正文滚动隐藏） -->
        <section v-if="error" class="zone zone-e" data-zone="E" role="alert">
          <p class="t-body msg-error">{{ error }}</p>
          <p class="t-sm t-muted">
            AI 解读为「预留配置」功能，需在设置页填写接口地址、API Key 与模型名；失败不会生成任何伪造内容。
          </p>
          <div class="error-actions">
            <button type="button" class="retry" @click="emit('regenerate')">重试</button>
            <button v-if="configured === false" type="button" class="retry" @click="emit('settings')">
              去设置
            </button>
          </div>
        </section>

        <!-- D 展示区（唯一独立滚动；只读，无破坏性 / 业务可点击控件） -->
        <main class="zone zone-d" data-zone="D" ref="bodyEl">
          <!-- AI-11：重新生成失败时旧内容保留在下方并带常驻标注 -->
          <p v-if="error && hasContent" class="stale-note">以下为上一次结果</p>

          <div v-if="hasReportSections" class="full-report">
            <section v-for="group in reportGroups" :key="group.key" class="report-block">
              <h2 class="group-title">{{ group.label }}</h2>
              <div v-for="s in group.sections" :key="s.key" class="report-item">
                <button
                  type="button"
                  class="item-head"
                  :aria-expanded="isOpen(s)"
                  @click="toggleSection(s)"
                >
                  <span>{{ s.title }}</span>
                  <span class="t-xs t-muted">{{ isOpen(s) ? '收起' : '展开' }}</span>
                </button>
                <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过 HTML 转义 -->
                <div v-if="isOpen(s)" class="text md-body item-body" v-html="sectionHtml[s.key]" />
              </div>
            </section>

            <section v-if="report?.fusion" class="report-block">
              <h2 class="group-title">四、全盘整合分析</h2>
              <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过 HTML 转义 -->
              <div class="text md-body" v-html="fusionHtml" />
            </section>
            <section v-if="report?.summary" class="report-block">
              <h2 class="group-title">五、最终总结论</h2>
              <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过 HTML 转义 -->
              <div class="text md-body" v-html="summaryHtml" />
            </section>
            <p v-if="report?.skipped.length" class="t-sm msg-warning">
              未完成分项：{{ report?.skipped.join('、') }}（重试后仍失败，本报告不含这些分项）
            </p>
          </div>

          <div v-else-if="loading && !hasContent" class="skeleton-block" aria-hidden="true">
            <div class="skeleton" style="height: 16px; width: 60%" />
            <div class="skeleton" style="height: 12px; width: 92%" />
            <div class="skeleton" style="height: 12px; width: 88%" />
            <div class="skeleton" style="height: 12px; width: 76%" />
            <div class="skeleton" style="height: 12px; width: 90%" />
          </div>

          <div v-else-if="loading" class="regen-bar" aria-hidden="true">
            <div class="skeleton" style="height: 12px; width: 80%" />
          </div>

          <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过 HTML 转义 -->
          <div v-if="hasContent && !hasReportSections" class="text md-body" v-html="renderedHtml" />

          <p v-else-if="!loading && !error && !hasReportSections" class="t-sm t-muted">暂无内容。</p>
        </main>

        <!-- 二次确认：Esc / 焦点 / 遮罩取消 / danger 齐备；Esc 只作用于此框 -->
        <ConfirmDialog
          :open="confirm !== null"
          :title="confirm ? CONFIRM_TEXT[confirm].title : ''"
          :desc="confirm ? CONFIRM_TEXT[confirm].desc : ''"
          confirm-text="确认"
          cancel-text="返回"
          danger
          @confirm="confirmApply"
          @cancel="confirm = null"
        />
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: var(--z-dialog);
  pointer-events: auto;
}

.ai-panel {
  position: fixed;
  top: calc(var(--chrome-h) + env(safe-area-inset-top, 0px));
  right: 0;
  bottom: 0;
  width: var(--ai-panel-w, 520px);
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  box-shadow: var(--elev-dialog);
  z-index: calc(var(--z-dialog) + 1);
  overflow: hidden;
}

/* 放大态：用 inset 定位，禁止 translate 居中（与 .rise 过渡冲突） */
.ai-panel.is-expanded {
  top: calc(var(--chrome-h) + env(safe-area-inset-top, 0px) + var(--ai-panel-expanded-inset-y, 2vh));
  left: var(--ai-panel-expanded-inset-x, 4vw);
  right: var(--ai-panel-expanded-inset-x, 4vw);
  bottom: var(--ai-panel-expanded-inset-y, 2vh);
  width: auto;
  max-width: none;
  transform: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

/* 五区核心：A/B/C/E 固定，D 唯一独立滚动 */
.zone-a,
.zone-b,
.zone-c,
.zone-e {
  flex: none;
}

.zone-a-extra {
  flex: none;
}

.zone-d {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: var(--sp-4);
  background: var(--surface);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.grow {
  flex: 1 1 auto;
  min-width: 0;
}
.grow h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex: none;
}
.group {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* AI-02 / AC-16：查看类与代价类分组间距 ≥12px */
.group-cost {
  margin-left: var(--sp-3);
  padding-left: var(--sp-3);
  border-left: 1px solid var(--border-strong);
}

.export-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.export-label {
  margin-right: 2px;
  flex: none;
}
.export-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  cursor: pointer;
}
.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* B 状态区 */
.zone-b {
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.status-label {
  margin: 0;
  padding: 6px var(--sp-4) 0;
  color: var(--text-primary);
}
.b-placeholder {
  padding: var(--sp-2) var(--sp-4);
}
.progress-wrap {
  padding: var(--sp-2) var(--sp-4);
  background: var(--surface);
}
.progress-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: 6px;
}
.progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--owner-shared);
  transition: width 200ms ease;
}
.progress-note {
  margin: 6px 0 0;
}
.terminal-hint {
  margin: 4px 0 0;
  padding: 0 var(--sp-4) var(--sp-2);
  line-height: 1.5;
  word-break: break-word;
}

/* C 报告工具区 */
.zone-c {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.report-toolbar-actions {
  display: flex;
  gap: 6px;
}

/* E 错误区 */
.zone-e {
  padding: var(--sp-2) var(--sp-4);
  background: rgba(217, 45, 32, 0.06);
  border-bottom: 1px solid var(--border);
}
.error-actions {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
  margin-top: 4px;
}
.retry {
  min-height: 36px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}
.stale-note {
  margin: 0 0 var(--sp-3);
  padding: 6px 10px;
  border-left: 3px solid var(--status-warning);
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

/* #9 模块化报告 */
.report-block {
  margin-bottom: var(--sp-4);
}
.group-title {
  font-size: calc(1.05rem * var(--font-scale));
  font-weight: 700;
  color: var(--text-primary);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  margin: 0 0 var(--sp-2);
}
/* ★ 修 F-3：分项正文不得被截断（AI-05 / AC-20） */
.report-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 6px;
  overflow: visible;
}
.item-head {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: 0 var(--sp-3);
  background: var(--surface-2);
  color: var(--text-primary);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  text-align: left;
}
.item-body {
  padding: var(--sp-3);
  border-top: 1px solid var(--border);
}
.text {
  font-size: calc(var(--fs-body) * var(--font-scale));
  line-height: 1.75;
}

/* Markdown 层级排版 */
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4) {
  margin: var(--sp-4) 0 var(--sp-2);
  line-height: 1.4;
  color: var(--text-primary);
}
.md-body :deep(h1) {
  font-size: calc(var(--fs-title, 1.25rem) * var(--font-scale));
  font-weight: 700;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.md-body :deep(h2) {
  font-size: calc(1.12rem * var(--font-scale));
  font-weight: 700;
}
.md-body :deep(h3) {
  font-size: calc(1.02rem * var(--font-scale));
  font-weight: 600;
}
.md-body :deep(h4) {
  font-size: calc(var(--fs-body) * var(--font-scale));
  font-weight: 600;
  color: var(--text-secondary);
}
.md-body :deep(p) {
  margin: 0 0 var(--sp-3);
}
.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 0 0 var(--sp-3);
  padding-left: 1.4em;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.md-body :deep(li) {
  line-height: 1.65;
}
.md-body :deep(strong) {
  color: var(--text-primary);
  font-weight: 700;
}
.md-body :deep(code) {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.md-body :deep(blockquote) {
  margin: 0 0 var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-left: 3px solid var(--owner-shared);
  background: var(--surface-2);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}
.md-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: var(--sp-4) 0;
}

.skeleton-block,
.regen-bar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}
.skeleton {
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.rise-enter-active,
.rise-leave-active {
  transition: transform 180ms ease;
}
.rise-enter-from,
.rise-leave-to {
  transform: translateX(24px);
}

/* MB-3：手机默认放大态 = 100% 视口 + safe-area */
@media (max-width: 768px) {
  .ai-panel {
    top: env(safe-area-inset-top, 0px);
    left: 0;
    right: 0;
    bottom: env(safe-area-inset-bottom, 0px);
    width: 100%;
    max-width: 100%;
    border-radius: 0;
  }
  .ai-panel.is-expanded {
    top: env(safe-area-inset-top, 0px);
    left: 0;
    right: 0;
    bottom: env(safe-area-inset-bottom, 0px);
    border-radius: 0;
  }
  /* ★ 修 F-2：IconButton .sm 手机热区（特异性 ≥ .icon-btn.sm） */
  .zone-a :deep(.icon-btn.sm) {
    width: var(--ai-hit, 44px);
    height: var(--ai-hit, 44px);
  }
  .zone-a :deep(.export-btn) {
    min-height: var(--ai-hit, 44px);
  }
  .rise-enter-from,
  .rise-leave-to {
    transform: translateY(24px);
  }
}
</style>
