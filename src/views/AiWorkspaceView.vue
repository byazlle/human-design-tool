<script setup lang="ts">
/**
 * AI 工作区（v4.0.0 三入口）
 *
 * 三入口：A 全盘（固定 6 模块）/ B 综合（自选维度 + 方向）/ C 勾选（通道 + 闸门逐条 + 汇总）。
 * 本页只做「组装请求 + 展示结果」：
 * - 请求清单由 `planReading()` 决定（单次档 1 请求、完整档多请求 + 末位融合），
 *   页面不自己数任务，只调 `requestCountOf()` 显示预计请求数；
 * - 执行、取消、重试、进度全部走 `useAiReading`（与侧栏共用同一份在途状态）；
 * - 不写回设置（只有「最高并发数」「风格」两处显式保存）。
 *
 * 与 v3.5.0 的差别只在左栏：入口标签 + 三套面板 + 风格/并发控件；
 * 骨架（ws-shell / ws-top / ws-body / 状态灯 / 最小化 / 导出 / ConfirmDialog）保持不变。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useSettingsStore } from '../stores/settings'
import { useReadingsStore, type ReadingRecord } from '../stores/readings'
import { useUiStore } from '../stores/ui'
import { useAiReading } from '../composables/useAiReading'
import { useAiStatus } from '../composables/useAiStatus'
import { copyAiResult, saveAiResult } from '../composables/useAiResultActions'
import { READING_DIMENSIONS, type ReadingDimKey } from '../services/chartFacts'
import { planReading, requestCountOf } from '../services/aiReadingPlan'
import { angleOf } from '../services/readingAngles'
import { validateMaxConcurrency } from '../services/aiConcurrency'
import { renderMarkdown } from '../services/markdown'
import { exportReport, REPORT_FORMATS, REPORT_FORMAT_LABELS } from '../services/aiExport'
import type { AiEntry, ReadingDirection, ReadingRequest, SelectionPick } from '../types/aiReading'
import type { AiDetailMode, AiStyle, BodyGraph } from '../types/hd'
import type { ReportFormat } from '../types/report'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import AiEntryTabs from '../components/ai/AiEntryTabs.vue'
import AiEntryAPanel from '../components/ai/AiEntryAPanel.vue'
import AiEntryBPanel from '../components/ai/AiEntryBPanel.vue'
import AiEntryCPanel from '../components/ai/AiEntryCPanel.vue'
import AiModuleList from '../components/ai/AiModuleList.vue'
import AiConcurrencyField from '../components/ai/AiConcurrencyField.vue'

const router = useRouter()
const archiveStore = useArchiveStore()
const settings = useSettingsStore()
const readings = useReadingsStore()
const ui = useUiStore()
const { state: aiState, run, abort, retry, configured } = useAiReading()
const status = useAiStatus()

/** 请求数超过这个阈值先二次确认（R11：一次点错可能烧掉几十次请求） */
const CONFIRM_THRESHOLD = 20

const archiveId = ref(String(archiveStore.archives[0]?.id ?? ''))
const entry = ref<AiEntry>('full')
const dims = ref<ReadingDimKey[]>(READING_DIMENSIONS.map((d) => d.key))
const angleKey = ref('comprehensive')
const customDirection = ref('')
const selection = ref<SelectionPick>({
  channels: [],
  gates: [],
  definition: false,
  circuit: false,
  cross: false,
})
const modeOverride = ref<AiDetailMode | null>(null)
const exportFormat = ref<ReportFormat>('md')
const cancelOpen = ref(false)
const confirmStartOpen = ref(false)
const revealRoot = ref<HTMLElement | null>(null)
/** 并发数输入：本地编辑 + 显式保存，避免每次敲键都写盘 */
const concurrencyInput = ref(settings.aiMaxConcurrency)
const concurrencyError = ref('')

let observer: IntersectionObserver | null = null

const archives = computed(() => archiveStore.archives)
const currentArchive = computed(() => archiveStore.byId(archiveId.value))
const chart = computed<BodyGraph | null>(() => currentArchive.value?.chart ?? null)
const effectiveMode = computed<AiDetailMode>(() => modeOverride.value ?? settings.aiDetailMode)
const loading = computed(() => aiState.value.loading)
const hasContent = computed(() => aiState.value.content.trim().length > 0)
const report = computed(() => aiState.value.report)
const statusLabel = computed(() => status.snapshot.value.label)
const dotState = computed(() => {
  if (loading.value) return 'running'
  if (aiState.value.error) return 'error'
  if (hasContent.value) return 'done'
  return 'idle'
})
const displayText = computed(() =>
  hasContent.value ? aiState.value.content : aiState.value.streamText,
)
const rendered = computed(() => (displayText.value ? renderMarkdown(displayText.value) : ''))
const progress = computed(() => aiState.value.progress)
const progressPct = computed(() => {
  const p = progress.value
  return p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0
})
const recent = computed(() => readings.recent.slice(0, 20))

/** 可勾的通道 / 闸门：来自当前档案的盘面，升序 */
const availableChannels = computed(() =>
  [...(chart.value?.channels ?? [])]
    .map((c) => c.key)
    .sort((a, b) => {
      const [a1, a2] = a.split('-').map(Number)
      const [b1, b2] = b.split('-').map(Number)
      return a1 - b1 || a2 - b2
    }),
)
const availableGates = computed(() =>
  [...(chart.value?.gates ?? [])].map((g) => g.gate).sort((a, b) => a - b),
)

/** 方向：B 必填（默认综合解读），C 允许「不限方向」 */
const direction = computed<ReadingDirection | undefined>(() => {
  const custom = customDirection.value.trim()
  if (custom) {
    return { key: 'custom', label: '自定义方向', prompt: '', custom }
  }
  if (entry.value === 'selection' && angleKey.value === 'comprehensive') return undefined
  const angle = angleOf(angleKey.value === 'custom' ? 'comprehensive' : angleKey.value)
  return { key: angle.key, label: angle.label, prompt: angle.prompt, custom: '' }
})

function archiveName(): string {
  return currentArchive.value?.name?.trim() || '本盘'
}

/** 组装请求（计划器与执行用同一份，保证「显示的请求数 = 实际发的请求数」） */
function buildRequest(target: BodyGraph): ReadingRequest {
  return {
    entry: entry.value,
    detail: effectiveMode.value,
    style: settings.aiStyle,
    chart: target,
    dims: entry.value === 'composite' ? dims.value : undefined,
    selection: entry.value === 'selection' ? selection.value : undefined,
    direction: direction.value,
    archiveName: archiveName(),
  }
}

const planPreview = computed(() => {
  const target = chart.value
  if (!target) return null
  return planReading(buildRequest(target))
})
const requestCount = computed(() => (planPreview.value ? requestCountOf(planPreview.value) : 0))
const emptySelection = computed(() => (planPreview.value ? planPreview.value.tasks.length === 0 : false))
const canStart = computed(
  () => !loading.value && Boolean(chart.value) && requestCount.value > 0 && !emptySelection.value,
)

/** 多请求档：有融合或分项 > 1 时用模块列表展示，否则渲染正文 */
const useModuleList = computed(() => {
  const r = report.value
  if (!r) return false
  return r.sections.length > 1 || Boolean(r.fusion)
})

function ensureChart(): boolean {
  if (!archiveId.value) return false
  archiveStore.ensureChart(archiveId.value)
  return Boolean(currentArchive.value?.chart)
}

function chooseStyle(style: AiStyle) {
  if (settings.aiStyle === style) return
  settings.setAiStyle(style)
}

function saveConcurrency() {
  const error = validateMaxConcurrency(concurrencyInput.value)
  if (error) {
    concurrencyError.value = error
    return
  }
  const ok = settings.setAiMaxConcurrency(concurrencyInput.value)
  concurrencyError.value = ok ? '' : settings.persistError || '保存失败，设置未生效'
  if (ok) ui.notify(`最高并发数已设为 ${settings.aiMaxConcurrency}`, 'success')
}

watch(
  () => settings.aiMaxConcurrency,
  (v) => {
    concurrencyInput.value = v
    concurrencyError.value = ''
  },
)
// 切盘时勾选项要跟着收敛：新盘没有的通道 / 闸门不能留在选择里（否则 ref 与盘面不符）
watch(
  () => archiveId.value,
  () => {
    const keys = new Set(availableChannels.value)
    const gates = new Set(availableGates.value)
    selection.value = {
      ...selection.value,
      channels: selection.value.channels.filter((k) => keys.has(k)),
      gates: selection.value.gates.filter((g) => gates.has(g)),
    }
  },
)

async function launch() {
  const target = chart.value
  if (!target) return
  const req = buildRequest(target)
  const plan = planReading(req)
  if (plan.tasks.length === 0) return
  ui.setAiEntryContext({
    entry: req.entry,
    dims: req.dims,
    selection: req.selection ?? null,
    direction: req.direction,
  })
  await run({
    entry: req.entry,
    dims: req.dims,
    selection: req.selection,
    direction: req.direction,
    chart: target,
    detailMode: effectiveMode.value,
    full: effectiveMode.value === 'full',
    // 计划器会按 chart 自建事实块；offline 传空串只为兼容旧签名
    offline: '',
    scope: plan.tasks[0].scope,
    ref: plan.tasks[0].ref,
    title: plan.title,
    angle: req.direction?.label,
  })
}

async function start() {
  if (!canStart.value || !ensureChart()) return
  if (requestCount.value > CONFIRM_THRESHOLD) {
    confirmStartOpen.value = true
    return
  }
  await launch()
}

async function confirmStart() {
  confirmStartOpen.value = false
  await launch()
}

function requestCancel() {
  if (!loading.value) return
  cancelOpen.value = true
}

function confirmCancel() {
  cancelOpen.value = false
  abort()
}

function save() {
  if (!hasContent.value && !report.value) return
  saveAiResult({
    title: aiState.value.title,
    content: aiState.value.content,
    archiveId: archiveId.value || undefined,
    scope: aiState.value.scope,
    ref: aiState.value.ref,
    mode: aiState.value.resultMode ?? effectiveMode.value,
    style: aiState.value.resultStyle ?? settings.aiStyle,
    entry: aiState.value.resultEntry ?? entry.value,
  })
}

async function doExport() {
  if (!hasContent.value) return
  const res = await exportReport(exportFormat.value, {
    title: aiState.value.title,
    mode: aiState.value.resultMode ?? effectiveMode.value,
    content: aiState.value.content,
    report: aiState.value.report,
  })
  ui.notify(res.message, res.ok ? 'success' : 'error')
}

/**
 * 打开历史记录：先按 `record.entry` 切入口，再尽力恢复勾选。
 * 恢复不了（老记录 / scope 不认识）就只切入口，不报错——记录本身照常可读。
 */
function openRecord(record: ReadingRecord) {
  if (loading.value) return
  archiveId.value = record.archiveId
  entry.value = record.entry ?? 'composite'
  modeOverride.value = record.mode

  if (record.scope === 'unified') {
    // ref = `${dims.join('+')}:${angleKey}:${custom}`
    const [dimPart, key, custom] = record.ref.split(':')
    if (dimPart) {
      const known = new Set(READING_DIMENSIONS.map((d) => d.key))
      const parsed = dimPart.split('+').filter((k) => known.has(k as ReadingDimKey)) as ReadingDimKey[]
      if (parsed.length) dims.value = parsed
    }
    if (key) angleKey.value = custom ? 'custom' : key
    customDirection.value = custom && custom !== '-' ? custom : ''
  } else if (record.scope === 'selection-one') {
    // ref = `ch:20-34+34-57|g:41,57|f:101|d:growth`
    const chPart = /ch:([^|]*)/.exec(record.ref)?.[1] ?? '-'
    const gPart = /g:([^|]*)/.exec(record.ref)?.[1] ?? '-'
    const fPart = /f:([^|]*)/.exec(record.ref)?.[1] ?? '000'
    selection.value = {
      channels: chPart === '-' ? [] : chPart.split('+'),
      gates: gPart === '-' ? [] : gPart.split(',').map(Number).filter((n) => Number.isFinite(n)),
      definition: fPart[0] === '1',
      circuit: fPart[1] === '1',
      cross: fPart[2] === '1',
    }
  }

  ui.aiReading.title = record.title
  ui.aiReading.scope = record.scope
  ui.aiReading.ref = record.ref
  ui.aiReading.content = record.content
  ui.aiReading.error = null
  ui.aiReading.report = null
  ui.aiReading.progress = null
  void nextTick(observeReveal)
}

/** 最小化：不触碰 open（会触发 abort），只恢复来源页的侧栏显示并返回 */
function minimize() {
  ui.exitAiWorkspace()
  void router.push(ui.consumeAiReturnPath())
}

function observeReveal() {
  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          observer?.unobserve(e.target)
        }
      }
    },
    { threshold: 0.08 },
  )
  revealRoot.value?.querySelectorAll('.ws-reveal').forEach((el) => observer!.observe(el))
}

onMounted(() => {
  ui.enterAiWorkspace(router.currentRoute.value.query.from as string | undefined)
  void nextTick(observeReveal)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch(hasContent, () => void nextTick(observeReveal))

const MODE_LABEL: Record<AiDetailMode, string> = { concise: '精简', detailed: '详细', full: '完整' }
const ENTRY_LABEL: Record<AiEntry, string> = { full: '全盘', composite: '综合', selection: '勾选' }
</script>

<template>
  <div class="ws-shell ws-grain workspace">
    <header class="ws-top ws-hairline">
      <div class="ws-top-id">
        <span class="ws-dot" :data-state="dotState" />
        <h1>AI 解读</h1>
        <span class="ws-label ws-mono">{{ statusLabel }}</span>
      </div>
      <button type="button" class="ws-control" @click="minimize">最小化</button>
    </header>

    <div class="ws-body">
      <aside class="ws-side" aria-label="解读设置">
        <section class="ws-card ws-form">
          <div class="ws-field">
            <label class="ws-label" for="ws-archive">解读对象</label>
            <select id="ws-archive" v-model="archiveId" class="ws-control ws-select" :disabled="loading">
              <option v-for="a in archives" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <p v-if="!archives.length" class="ws-note">还没有档案，先新建一张盘</p>
          </div>

          <div class="ws-field">
            <span class="ws-label">入口</span>
            <AiEntryTabs v-model="entry" :disabled="loading" />
          </div>

          <div class="ws-field">
            <AiEntryAPanel v-if="entry === 'full'" />
            <AiEntryBPanel
              v-else-if="entry === 'composite'"
              v-model:dims="dims"
              v-model:angle-key="angleKey"
              v-model:custom="customDirection"
              :disabled="loading"
            />
            <AiEntryCPanel
              v-else
              v-model:selection="selection"
              :gates="availableGates"
              :channels="availableChannels"
              :disabled="loading"
            />
          </div>

          <div class="ws-field">
            <span class="ws-label">档位</span>
            <div class="ws-chips">
              <button
                v-for="m in (['concise', 'detailed', 'full'] as AiDetailMode[])"
                :key="m"
                type="button"
                class="ws-chip"
                :aria-pressed="effectiveMode === m"
                :disabled="loading"
                @click="modeOverride = m"
              >
                {{ MODE_LABEL[m] }}
              </button>
            </div>
          </div>

          <div class="ws-field">
            <span class="ws-label">表达风格</span>
            <div class="ws-chips">
              <button
                type="button"
                class="ws-chip"
                :aria-pressed="settings.aiStyle === 'plain'"
                :disabled="loading"
                title="零基础：全程口语，每 200 字给一个具体例子"
                @click="chooseStyle('plain')"
              >
                零基础
              </button>
              <button
                type="button"
                class="ws-chip"
                :aria-pressed="settings.aiStyle === 'pro'"
                :disabled="loading"
                title="专业：使用术语，但每个术语第一次出现必须阐释"
                @click="chooseStyle('pro')"
              >
                专业
              </button>
            </div>
          </div>

          <div v-if="effectiveMode === 'full'" class="ws-field">
            <AiConcurrencyField
              v-model="concurrencyInput"
              :error="concurrencyError"
              :disabled="loading"
            />
            <button type="button" class="ws-chip concurrency-save" @click="saveConcurrency">
              保存并发数
            </button>
          </div>

          <div class="ws-actions">
            <button
              type="button"
              class="ws-control ws-control--primary"
              :disabled="!canStart"
              @click="start"
            >
              生成解读
            </button>
            <button v-if="loading" type="button" class="ws-control" @click="requestCancel">
              取消
            </button>
          </div>
          <p class="ws-note">
            预计 {{ requestCount }} 次请求
            <template v-if="emptySelection">（请至少选择一个维度或条目）</template>
          </p>
        </section>

        <section class="ws-card ws-history">
          <div class="ws-history-head">
            <span class="ws-label">最近解读</span>
            <span class="ws-label ws-mono">{{ readings.recent.length }}</span>
          </div>
          <table v-if="recent.length" class="ws-table">
            <thead>
              <tr><th>标题</th><th class="num">入口</th><th class="num">档位</th></tr>
            </thead>
            <tbody>
              <tr
                v-for="r in recent"
                :key="`${r.archiveId}|${r.scope}|${r.ref}|${r.mode}`"
                tabindex="0"
                :aria-selected="r.content === aiState.content"
                @click="openRecord(r)"
                @keydown.enter="openRecord(r)"
              >
                <td class="ws-record-title">{{ r.title }}</td>
                <td class="num">{{ ENTRY_LABEL[r.entry ?? 'composite'] }}</td>
                <td class="num">{{ MODE_LABEL[r.mode] }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="ws-note">尚无保存的解读</p>
        </section>
      </aside>

      <main ref="revealRoot" class="ws-main" aria-live="polite">
        <div v-if="!configured" class="ws-empty ws-card">
          <p>未配置 AI 接口</p>
          <button type="button" class="ws-control" @click="router.push('/settings')">去设置</button>
        </div>

        <template v-else>
          <div v-if="progress" class="ws-card ws-running">
            <div class="ws-running-head">
              <span class="ws-label">{{ progress.phase }}</span>
              <span class="ws-label ws-mono">{{ progress.done }} / {{ progress.total }}</span>
            </div>
            <div class="ws-track"><span :style="{ width: `${progressPct}%` }" /></div>
            <p v-if="progress.current" class="ws-current">正在生成：{{ progress.current }}</p>
            <p class="ws-current">
              上限 {{ settings.aiMaxConcurrency }} ·
              已用 {{ Math.round((progress.elapsedMs ?? 0) / 1000) }}s
              <template v-if="progress.etaMs">· 预计剩余 {{ Math.round(progress.etaMs / 1000) }}s</template>
            </p>
          </div>

          <AiModuleList
            v-if="useModuleList"
            :sections="report?.sections ?? []"
            :progress="aiState.progress"
            :running="loading"
          />

          <article
            v-else-if="rendered"
            class="ws-card ws-result ws-reveal"
            aria-label="解读正文"
            v-html="rendered"
          />

          <div v-else-if="!loading" class="ws-empty ws-card">
            <p>选择对象与入口后生成解读</p>
          </div>

          <p v-if="aiState.error" class="ws-card ws-error">{{ aiState.error }}</p>

          <div v-if="(hasContent || report) && !loading" class="ws-result-bar ws-hairline">
            <button type="button" class="ws-control" @click="copyAiResult(aiState.content)">复制</button>
            <button type="button" class="ws-control" @click="save">保存</button>
            <button type="button" class="ws-control" @click="retry()">重新生成</button>
            <div class="ws-export">
              <select v-model="exportFormat" class="ws-control ws-select" aria-label="导出格式">
                <option v-for="f in REPORT_FORMATS" :key="f" :value="f">
                  {{ REPORT_FORMAT_LABELS[f] }}
                </option>
              </select>
              <button type="button" class="ws-control" @click="doExport">导出</button>
            </div>
          </div>
        </template>
      </main>
    </div>

    <ConfirmDialog
      :open="cancelOpen"
      title="取消本次解读？"
      description="在途请求会中断，已完成的内容保留。"
      confirm-label="取消解读"
      @confirm="confirmCancel"
      @close="cancelOpen = false"
    />

    <ConfirmDialog
      :open="confirmStartOpen"
      title="这次解读需要较多次请求"
      :description="`预计发出 ${requestCount} 次请求（含融合）。确认继续吗？`"
      confirm-label="继续生成"
      @confirm="confirmStart"
      @close="confirmStartOpen = false"
    />
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--ws-fg);
  background: var(--ws-bg);
}

.ws-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  height: 56px;
  padding: 0 24px;
  background: var(--ws-surface);
}
.ws-top-id {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.ws-top h1 {
  font-size: calc(var(--fs-title) * var(--font-scale));
  font-weight: 500;
}
.ws-top .ws-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-body {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  gap: 20px;
  flex: 1;
  min-height: 0;
  padding: 20px 24px 24px;
  overflow: hidden;
}

.ws-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.ws-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  flex: none;
}
.ws-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ws-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-left: -10px;
}
.ws-select,
.ws-input {
  width: 100%;
}
.ws-note {
  color: var(--ws-fg-3);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
.ws-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
  border-top: var(--ws-line);
}
.ws-actions .ws-control--primary {
  flex: 1;
}
.concurrency-save {
  align-self: flex-start;
}

.ws-history {
  flex: 0 1 auto;
  max-height: 280px;
  min-height: 0;
  padding: 16px 12px 8px;
  overflow-y: auto;
}
.ws-history-head {
  display: flex;
  justify-content: space-between;
  padding: 0 10px 10px;
}
.ws-record-title {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ws-fg);
}

.ws-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

.ws-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 240px;
  padding: 32px;
  color: var(--ws-fg-3);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}
.ws-empty p {
  margin: 0;
}

.ws-running {
  flex: none;
  padding: 16px 20px;
}
.ws-running-head,
.ws-result-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ws-track {
  height: 2px;
  margin-top: 12px;
  background: var(--ws-surface-2);
  overflow: hidden;
}
.ws-track span {
  display: block;
  height: 100%;
  background: var(--ws-accent);
  transition: width var(--dur-base) var(--ws-ease);
}
.ws-current {
  margin: 10px 0 0;
  color: var(--ws-fg-3);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}

.ws-error {
  flex: none;
  padding: 12px 16px;
  color: var(--danger, #c0392b);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  margin: 0;
}

.ws-result {
  flex: 1;
  min-height: 0;
  padding: 28px 32px 40px;
  line-height: 1.75;
  font-size: calc(var(--fs-body) * var(--font-scale));
}
.ws-result :deep(h1),
.ws-result :deep(h2),
.ws-result :deep(h3) {
  margin: 24px 0 10px;
  color: var(--ws-fg);
  font-weight: 500;
  line-height: 1.4;
}
.ws-result :deep(h1:first-child),
.ws-result :deep(h2:first-child) {
  margin-top: 0;
}
.ws-result :deep(p) {
  margin: 0 0 14px;
  color: var(--ws-fg-2);
}
.ws-result :deep(ul),
.ws-result :deep(ol) {
  margin: 0 0 14px;
  padding-left: 24px;
  color: var(--ws-fg-2);
}
.ws-result :deep(blockquote) {
  margin: 0 0 14px;
  padding-left: 14px;
  border-left: 2px solid var(--border-strong);
  color: var(--ws-fg-3);
}
.ws-result :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.ws-result-bar {
  flex: none;
  flex-wrap: wrap;
  padding: 12px 0 0;
}
.ws-export {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.ws-export .ws-select {
  width: 88px;
}

@media (max-width: 900px) {
  .ws-body {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }
  .ws-side {
    overflow: visible;
  }
  .ws-main {
    overflow: visible;
  }
  .ws-history {
    max-height: 260px;
  }
}

@media (max-width: 640px) {
  .ws-top {
    padding: 0 16px;
  }
  .ws-body {
    padding: 16px;
  }
  .ws-result {
    padding: 20px 16px 28px;
  }
  .ws-export {
    width: 100%;
    margin-left: 0;
  }
}
</style>
