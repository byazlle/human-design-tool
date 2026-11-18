<script setup lang="ts">
/**
 * AI 工作区（v3.5.0）
 *
 * 把 AI 解读从五个盘面页的侧栏附属能力，升级为一级完整页面：
 * - 完整页面：对象 / 维度 / 角度 / 档位在一栏，解读正文在另一栏，一屏内完成一次解读
 * - 最小化：回到来源页，请求不中断（useAiReading 的 controller 与视图生命周期已解耦）
 * - 后台运行：状态写在 ui.aiReading 单例，任意页面都能通过胶囊看到进度并回到这里
 *
 * 业务边界：本页只组装"已有"的请求参数（buildUnifiedOffline / unifiedScopeRef），
 * 不改变提示词、缓存键、并发编排、解读档位含义，也不写回任何用户设置。
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
import {
  READING_DIMENSIONS,
  buildUnifiedOffline,
  unifiedScopeRef,
  type ReadingDimKey,
} from '../services/chartFacts'
import { READING_ANGLES, angleOf } from '../services/readingAngles'
import { renderMarkdown } from '../services/markdown'
import { exportReport, REPORT_FORMATS, REPORT_FORMAT_LABELS } from '../services/aiExport'
import type { ReportFormat } from '../types/report'
import type { AiDetailMode } from '../types/hd'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'

const router = useRouter()
const archiveStore = useArchiveStore()
const settings = useSettingsStore()
const readings = useReadingsStore()
const ui = useUiStore()
const { state: aiState, run, abort, retry, configured } = useAiReading()
const status = useAiStatus()

const archiveId = ref(String(archiveStore.archives[0]?.id ?? ''))
const selectedDims = ref<Set<ReadingDimKey>>(
  new Set(READING_DIMENSIONS.map((d) => d.key)),
)
const angleKey = ref('comprehensive')
const customDirection = ref('')
const modeOverride = ref<AiDetailMode | null>(null)
const exportFormat = ref<ReportFormat>('md')
const cancelOpen = ref(false)
const revealRoot = ref<HTMLElement | null>(null)

let observer: IntersectionObserver | null = null

const archives = computed(() => archiveStore.archives)
const currentArchive = computed(() => archiveStore.byId(archiveId.value))
const effectiveMode = computed<AiDetailMode>(
  () => modeOverride.value ?? settings.aiDetailMode,
)
const loading = computed(() => aiState.value.loading)
const hasContent = computed(() => aiState.value.content.trim().length > 0)
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
const rendered = computed(() =>
  displayText.value ? renderMarkdown(displayText.value) : '',
)
const progress = computed(() => aiState.value.progress)
const progressPct = computed(() => {
  const p = progress.value
  return p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0
})
const recent = computed(() => readings.recent.slice(0, 20))

function toggleDim(key: ReadingDimKey) {
  const next = new Set(selectedDims.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedDims.value = next
}

function allDims() {
  selectedDims.value = new Set(
    selectedDims.value.size === READING_DIMENSIONS.length
      ? []
      : READING_DIMENSIONS.map((d) => d.key),
  )
}

function chooseAngle(key: string) {
  angleKey.value = key
  if (key !== 'custom') customDirection.value = ''
}

function ensureChart(): boolean {
  if (!archiveId.value) return false
  archiveStore.ensureChart(archiveId.value)
  return Boolean(currentArchive.value?.chart)
}

async function start() {
  if (loading.value || !selectedDims.value.size || !ensureChart()) return
  const chart = currentArchive.value!.chart!
  const dims = READING_DIMENSIONS.filter((d) => selectedDims.value.has(d.key)).map((d) => d.key)
  const angle = angleOf(angleKey.value === 'custom' ? 'comprehensive' : angleKey.value)
  const direction = angleKey.value === 'custom' ? customDirection.value.trim() : ''
  const mode = effectiveMode.value
  const labels: Record<AiDetailMode, string> = {
    concise: '精简',
    detailed: '详细',
    full: '完整',
  }
  await run({
    scope: 'unified',
    ref: unifiedScopeRef(dims, angleKey.value, direction),
    title: direction
      ? `${currentArchive.value!.name} · AI 综合解读 · ${direction}`
      : `${currentArchive.value!.name} · 整体解读（${labels[mode]}） · ${angle.label}`,
    offline: buildUnifiedOffline(chart, dims, angle.label, angle.prompt, direction),
    chart,
    detailMode: mode,
    full: mode === 'full',
    stepMode: settings.aiStepMode,
    angle: direction || angle.label,
  })
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
  if (!hasContent.value) return
  saveAiResult({
    title: aiState.value.title,
    content: aiState.value.content,
    archiveId: archiveId.value || undefined,
    scope: aiState.value.scope,
    ref: aiState.value.ref,
    mode: aiState.value.resultMode ?? effectiveMode.value,
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

function openRecord(record: ReadingRecord) {
  if (loading.value) return
  archiveId.value = record.archiveId
  ui.aiReading.title = record.title
  ui.aiReading.scope = record.scope
  ui.aiReading.ref = record.ref
  ui.aiReading.content = record.content
  ui.aiReading.error = null
  ui.aiReading.report = null
  ui.aiReading.progress = null
  modeOverride.value = record.mode
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
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer?.unobserve(entry.target)
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
            <select id="ws-archive" v-model="archiveId" class="ws-control ws-select">
              <option v-for="a in archives" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <p v-if="!archives.length" class="ws-note">还没有档案，先新建一张盘</p>
          </div>

          <div class="ws-field">
            <div class="ws-field-head">
              <span class="ws-label">维度</span>
              <button type="button" class="ws-chip" @click="allDims">
                {{ selectedDims.size === READING_DIMENSIONS.length ? '清空' : '全选' }}
              </button>
            </div>
            <div class="ws-chips">
              <button
                v-for="d in READING_DIMENSIONS"
                :key="d.key"
                type="button"
                class="ws-chip"
                :aria-pressed="selectedDims.has(d.key)"
                :title="d.desc"
                @click="toggleDim(d.key)"
              >
                {{ d.label }}
              </button>
            </div>
          </div>

          <div class="ws-field">
            <span class="ws-label">角度</span>
            <div class="ws-chips">
              <button
                v-for="a in READING_ANGLES"
                :key="a.key"
                type="button"
                class="ws-chip"
                :aria-pressed="angleKey === a.key"
                :title="a.desc"
                @click="chooseAngle(a.key)"
              >
                {{ a.label }}
              </button>
            </div>
            <input
              v-if="angleKey === 'custom'"
              v-model="customDirection"
              class="ws-control ws-input"
              type="text"
              maxlength="60"
              placeholder="自定义方向"
              @keydown.enter="start"
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
                @click="modeOverride = m"
              >
                {{ m === 'concise' ? '精简' : m === 'detailed' ? '详细' : '完整' }}
              </button>
            </div>
          </div>

          <div class="ws-actions">
            <button
              type="button"
              class="ws-control ws-control--primary"
              :disabled="loading || !selectedDims.size || !archives.length"
              @click="start"
            >
              生成解读
            </button>
            <button
              v-if="loading"
              type="button"
              class="ws-control"
              @click="requestCancel"
            >
              取消
            </button>
          </div>
        </section>

        <section class="ws-card ws-history">
          <div class="ws-history-head">
            <span class="ws-label">最近解读</span>
            <span class="ws-label ws-mono">{{ readings.recent.length }}</span>
          </div>
          <table v-if="recent.length" class="ws-table">
            <thead>
              <tr><th>标题</th><th class="num">档位</th></tr>
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
                <td class="num">{{ r.mode === 'concise' ? '精简' : r.mode === 'detailed' ? '详细' : '完整' }}</td>
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
          <div v-if="loading && !hasContent" class="ws-card ws-running">
            <div class="ws-running-head">
              <span class="ws-label">{{ progress?.phase || statusLabel }}</span>
              <span v-if="progress" class="ws-label ws-mono">{{ progress.done }} / {{ progress.total }}</span>
            </div>
            <div class="ws-track"><span :style="{ width: `${progressPct}%` }" /></div>
            <p v-if="progress?.current" class="ws-current">{{ progress.current }}</p>
          </div>

          <article
            v-if="rendered"
            class="ws-card ws-result ws-reveal"
            aria-label="解读正文"
            v-html="rendered"
          />

          <div v-else-if="!loading" class="ws-empty ws-card">
            <p>选择对象与角度后生成解读</p>
          </div>

          <div v-if="hasContent && !loading" class="ws-result-bar ws-hairline">
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
  gap: 20px;
  padding: 20px;
  flex: none;
}
.ws-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ws-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  max-width: 180px;
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
