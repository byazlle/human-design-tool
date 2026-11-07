<script setup lang="ts">
/** AI 解读阅读面板（DESIGN.md §4.13）：独立弹层，支持复制 / 保存 / 重新生成 / 四格式导出 */
import { computed, ref, watch } from 'vue'
import IconButton from '../base/IconButton.vue'
import { renderMarkdown } from '../../services/markdown'
import { exportReport, REPORT_FORMAT_LABELS, REPORT_FORMATS } from '../../services/aiExport'
import { useSettingsStore } from '../../stores/settings'
import { useUiStore } from '../../stores/ui'
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
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('close')" />
    </Transition>
    <Transition name="rise">
      <section v-if="open" class="panel" role="dialog" aria-modal="true" :aria-label="title">
        <header class="head">
          <div class="grow">
            <p class="t-xs">AI READING · {{ MODE_LABEL[effectiveMode] }}</p>
            <h2 class="t-title">{{ title }}</h2>
          </div>
          <div class="actions">
            <IconButton label="复制内容" icon="copy" size="sm" :disabled="!hasContent" @click="emit('copy')" />
            <IconButton label="保存到本地记录" icon="save" size="sm" :disabled="!hasContent" @click="emit('save')" />
            <IconButton label="重新生成" icon="refresh" size="sm" :disabled="loading" @click="emit('regenerate')" />
            <IconButton label="关闭" icon="close" size="sm" @click="emit('close')" />
          </div>
        </header>

        <!-- 需求 #10：四格式导出；三档解读共用同一份序列化 -->
        <div v-if="canExport" class="export-bar">
          <span class="t-xs t-muted export-label">导出报告</span>
          <button
            v-for="format in REPORT_FORMATS"
            :key="format"
            type="button"
            class="export-btn"
            :disabled="loading || exporting !== null"
            :title="`导出为 ${REPORT_FORMAT_LABELS[format]} 格式`"
            @click="doExport(format)"
          >
            {{ exporting === format ? '导出中…' : REPORT_FORMAT_LABELS[format] }}
          </button>
        </div>

        <!-- #9：完整版多轮进度（Q3.4：第 N/M 项 · 当前项名称 · 预计剩余） -->
        <div v-if="progress" class="progress-wrap">
          <div class="progress-top">
            <span class="t-sm">
              第 {{ progress.done }}/{{ progress.total }} 项 · {{ progress.current }} ·
              {{ formatEta(progress.etaMs) }}
            </span>
            <button type="button" class="export-btn" :disabled="!loading" @click="emit('cancel')">
              取消
            </button>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPct + '%' }" />
          </div>
          <p class="t-xs t-muted progress-note">
            {{ progress.phase }}｜已跳过 {{ progress.skipped.length }} 项{{
              progress.skipped.length ? `（${progress.skipped.join('、')}）` : ''
            }}
          </p>
        </div>

        <div class="body">
          <!-- 错误条常驻：重新生成失败时旧内容仍在下方（U-20） -->
          <div v-if="error" class="error-state">
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
          </div>

          <!-- #9 完整版：模块化展示；通道/闸门每个分项独立展开收起 -->
          <div v-if="hasReportSections" class="full-report">
            <div class="report-toolbar">
              <span class="t-xs t-muted">
                共 {{ report?.sections.length }} 个分项 · 约 {{ report?.totalChars }} 字
              </span>
              <div class="report-toolbar-actions">
                <button type="button" class="export-btn" @click="setAll(true)">全部展开</button>
                <button type="button" class="export-btn" @click="setAll(false)">全部收起</button>
              </div>
            </div>

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

          <div v-else-if="loading && !hasContent" class="skeleton-block">
            <div class="skeleton" style="height: 16px; width: 60%" />
            <div class="skeleton" style="height: 12px; width: 92%" />
            <div class="skeleton" style="height: 12px; width: 88%" />
            <div class="skeleton" style="height: 12px; width: 76%" />
            <div class="skeleton" style="height: 12px; width: 90%" />
            <p class="t-sm loading-text">正在请求 AI 解读，请稍候…</p>
            <button type="button" class="retry" @click="emit('cancel')">取消请求</button>
          </div>

          <div v-else-if="loading" class="regen-bar">
            <p class="t-sm loading-text">正在重新生成，旧内容先保留在下方…</p>
            <button type="button" class="retry" @click="emit('cancel')">取消请求</button>
          </div>

          <!-- eslint-disable-next-line vue/no-v-html -- 内容已经过 HTML 转义 -->
          <div v-if="hasContent && !hasReportSections" class="text md-body" v-html="renderedHtml" />

          <p v-else-if="!loading && !error && !hasReportSections" class="t-sm t-muted">暂无内容。</p>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: var(--z-dialog);
}

.panel {
  position: fixed;
  /* 桌面壳让出自绘标题栏；手机端避开系统状态栏（刘海/挖孔） */
  top: calc(var(--chrome-h) + env(safe-area-inset-top, 0px));
  right: 0;
  bottom: 0;
  width: 520px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  box-shadow: var(--elev-dialog);
  z-index: calc(var(--z-dialog) + 1);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-4);
  border-bottom: 1px solid var(--border);
}

.actions {
  display: flex;
  gap: 2px;
  flex: none;
}

/* 四格式导出条：桌面端原生另存为，浏览器/安卓默认下载目录 / 打印另存 */
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

/* #9 完整版进度条 */
.progress-wrap {
  padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--border);
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

/* #9 模块化报告 */
.report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--sp-3);
}

.report-toolbar-actions {
  display: flex;
  gap: 6px;
}

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

.report-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 6px;
  overflow: hidden;
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

.body {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-4);
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

.skeleton-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.loading-text {
  margin-top: var(--sp-2);
  color: var(--text-muted);
}

.error-state {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  align-items: flex-start;
  margin-bottom: var(--sp-3);
}

.regen-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}

.retry {
  min-height: 36px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.error-actions {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
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

@media (max-width: 768px) {
  .panel {
    width: 100%;
    max-width: 100%;
  }
  .rise-enter-from,
  .rise-leave-to {
    transform: translateY(24px);
  }
}
</style>
