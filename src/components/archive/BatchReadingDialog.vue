<script setup lang="ts">
/**
 * 跨档案批量生成解读（v2.4.0 主功能）。
 *
 * 与单盘内的「批量勾选解读」不同：这里对**档案库里的多份档案**各生成一份完整解读，
 * 结果写入 `readings` store（可持久化、可回看），而不是只停留在当前面板。
 *
 * 分工：
 * - 本组件只管「选什么、看进度」；
 * - 展开任务 / 调度 / 落库都在 `composables/useAiBatch.ts`；
 * - 运行态在 `ui.batch`，因此关掉本弹窗或切页后进度条仍在（见 App.vue 的 BatchReadingStatus）。
 */
import { computed, ref, watch } from 'vue'
import { useArchiveStore } from '../../stores/archive'
import { useReadingsStore } from '../../stores/readings'
import { useSettingsStore, MAX_TOKEN_BUDGET } from '../../stores/settings'
import { MIN_TOKEN_BUDGET } from '../../services/aiClient'
import { useAiBatch } from '../../composables/useAiBatch'
import {
  canPickDirectory,
  ensureDefaultOutputDir,
  getOutputDir,
  isAutoExport,
  setAutoExport,
  pickOutputDir,
  exportBatchReadings,
  type BatchExportItem,
  type BatchExportResult,
} from '../../services/batchExport'
import { READING_ANGLES } from '../../services/readingAngles'
import { READING_DIMENSIONS, type ReadingDimKey } from '../../services/chartFacts'
import HdButton from '../base/HdButton.vue'
import type { AiDetailMode } from '../../types/hd'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const archiveStore = useArchiveStore()
const readings = useReadingsStore()
const settings = useSettingsStore()
const { running, configured, state: batch, lastOutcomes, preview, run, retryFailed, abort } = useAiBatch()

/** 目标范围：优先「已选中」，否则全部（含当前搜索过滤） */
const scope = ref<'selected' | 'all'>('all')
const dimensions = ref<Set<ReadingDimKey>>(new Set(READING_DIMENSIONS.map((d) => d.key)))
const angleKey = ref('comprehensive')
const customDirection = ref('')
const showCustom = ref(false)
const detailMode = ref<AiDetailMode>(settings.aiDetailMode)
const onExisting = ref<'skip' | 'overwrite'>('skip')
const starting = ref(false)
/** v3.0.0：保存位置 + 完成后自动导出 md，一人一份 */
const outputDir = ref(getOutputDir())
const autoExport = ref(isAutoExport())
const canPickDir = canPickDirectory()
const exportResult = ref<BatchExportResult | null>(null)
const exporting = ref(false)
/** 本次批量每份解读的 token 总预算；0 = 不限制。打开时继承设置页的全局值 */
const tokenBudgetInput = ref(String(settings.aiTokenBudget))
const BUDGET_PRESETS = [0, 1000, 2000, 4000, 8000] as const

const tokenBudgetError = computed(() => {
  const raw = tokenBudgetInput.value.trim()
  if (!/^\d+$/.test(raw)) return '请填 0（不限制）或正整数'
  const n = Number(raw)
  return n !== 0 && (n < MIN_TOKEN_BUDGET || n > MAX_TOKEN_BUDGET)
    ? `限制值需在 ${MIN_TOKEN_BUDGET}–${MAX_TOKEN_BUDGET} 之间，或填 0 不限制`
    : ''
})

const effectiveBudget = computed(() =>
  tokenBudgetError.value ? null : Number(tokenBudgetInput.value.trim()),
)

const AUDIENCE_LABEL = computed(() =>
  settings.aiAudience === 'plain' ? '简明版（零基础，大白话）' : '专业版（有基础，允许术语）',
)

const list = computed(() => archiveStore.filtered)
const selectedIds = computed(() => archiveStore.selectedIds)

/** 打开时对齐当前上下文：有勾选就用勾选，没有就用全部 */
watch(
  () => props.open,
  (open) => {
    if (!open) return
    scope.value = selectedIds.value.length ? 'selected' : 'all'
    detailMode.value = settings.aiDetailMode
    tokenBudgetInput.value = String(settings.aiTokenBudget)
    exportResult.value = null
    // 首次打开时向主进程要一个默认目录（<文档>/HumanDesign解读），不覆盖用户已选目录
    void ensureDefaultOutputDir().then((d) => {
      if (d) outputDir.value = d
    })
  },
)

const targetIds = computed(() =>
  scope.value === 'selected' ? [...selectedIds.value] : list.value.map((a) => a.id),
)

const dimList = computed(() =>
  READING_DIMENSIONS.filter((d) => dimensions.value.has(d.key)).map((d) => d.key),
)

function toggleDim(key: ReadingDimKey) {
  const next = new Set(dimensions.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  dimensions.value = next
}

const allOn = computed(() => dimensions.value.size === READING_DIMENSIONS.length)
function toggleAll() {
  dimensions.value = allOn.value ? new Set() : new Set(READING_DIMENSIONS.map((d) => d.key))
}

/** 实时预检：让用户在点按钮之前就知道会生成几份、跳过几份 */
const plan = computed(() => {
  if (!props.open) return null
  return preview({
    archiveIds: targetIds.value,
    dimensions: dimList.value,
    angleKey: angleKey.value,
    customDirection: customDirection.value.trim(),
    detailMode: detailMode.value,
    onExisting: onExisting.value,
  })
})

const canRun = computed(
  () =>
    configured.value &&
    !running.value &&
    Boolean(plan.value?.runnable) &&
    dimList.value.length > 0 &&
    effectiveBudget.value !== null,
)

/** 已生成解读的档案数（用于解释为什么会跳过） */
const coveredInTarget = computed(
  () => targetIds.value.filter((id) => readings.coveredIds.has(id)).length,
)

async function chooseDir() {
  const d = await pickOutputDir()
  if (d) outputDir.value = d
}

function updateAutoExport() {
  setAutoExport(autoExport.value)
}

/** 完成后自动落盘：只导有正文的项，逐份独立成功 / 失败，不整体回滚 */
async function autoExportOutcomes() {
  if (!autoExport.value) return
  const items: BatchExportItem[] = lastOutcomes.value
    .filter((o) => o.content.trim())
    .map((o) => ({
      archiveId: o.archiveId,
      name: o.name,
      title: o.title,
      content: o.content,
      mode: o.mode ?? detailMode.value,
      scope: o.scope,
      ref: o.ref,
    }))
  if (!items.length) return
  exporting.value = true
  try {
    exportResult.value = await exportBatchReadings(items, {
      dirPath: outputDir.value,
      audience: settings.aiAudience,
    })
  } finally {
    exporting.value = false
  }
}

async function start() {
  if (!canRun.value) return
  starting.value = true
  exportResult.value = null
  try {
    await run({
      archiveIds: targetIds.value,
      dimensions: dimList.value,
      angleKey: angleKey.value,
      customDirection: customDirection.value.trim(),
      detailMode: detailMode.value,
      tokenBudget: effectiveBudget.value ?? undefined,
      onExisting: onExisting.value,
    })
    await autoExportOutcomes()
  } catch {
    /* 报告已通过 ui.batch.summary 呈现，此处不再抛给用户 */
  } finally {
    starting.value = false
  }
}

async function retry() {
  if (!configured.value || running.value) return
  try {
    await retryFailed({
      dimensions: dimList.value,
      angleKey: angleKey.value,
      customDirection: customDirection.value.trim(),
      detailMode: detailMode.value,
      tokenBudget: effectiveBudget.value ?? undefined,
    })
    await autoExportOutcomes()
  } catch {
    /* 同上 */
  }
}

const failedCount = computed(() => lastOutcomes.value.filter((o) => o.error).length)
/** 触顶的解读：内容已在，但结尾可能缺失，必须明确点名而不是混进「已生成」 */
const truncatedNames = computed(() =>
  lastOutcomes.value.filter((o) => o.truncated && o.content).map((o) => o.name),
)

function fmtMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} 秒`
  return `${Math.floor(total / 60)} 分 ${total % 60} 秒`
}

const percent = computed(() =>
  batch.value.total ? Math.round((batch.value.done / batch.value.total) * 100) : 0,
)

const MODE_LABELS: Record<AiDetailMode, string> = {
  concise: '精简',
  detailed: '详细',
  full: '完整',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('close')" />
    </Transition>
    <Transition name="pop">
      <section v-if="open" class="dialog" role="dialog" aria-modal="true" aria-label="批量生成解读">
        <header class="head">
          <h2 class="t-title">批量生成解读</h2>
          <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="body">
          <!-- ① 范围 -->
          <section class="block">
            <h3 class="t-sm block-title">生成范围</h3>
            <div class="chips">
              <button
                type="button"
                class="chip"
                :class="{ on: scope === 'selected' }"
                :disabled="!selectedIds.length"
                :title="selectedIds.length ? '' : '先在档案库勾选档案'"
                @click="scope = 'selected'"
              >
                已勾选的 {{ selectedIds.length }} 份
              </button>
              <button
                type="button"
                class="chip"
                :class="{ on: scope === 'all' }"
                @click="scope = 'all'"
              >
                当前列表的 {{ list.length }} 份
              </button>
            </div>
          </section>

          <!-- ② 维度 -->
          <section class="block">
            <h3 class="t-sm block-title">
              解读维度
              <button type="button" class="link" @click="toggleAll">
                {{ allOn ? '清空' : '全选' }}
              </button>
            </h3>
            <div class="chips">
              <button
                v-for="d in READING_DIMENSIONS"
                :key="d.key"
                type="button"
                class="chip"
                :class="{ on: dimensions.has(d.key) }"
                :title="d.desc"
                @click="toggleDim(d.key)"
              >
                {{ d.label }}
              </button>
            </div>
          </section>

          <!-- ③ 角度 -->
          <section class="block">
            <h3 class="t-sm block-title">解读角度</h3>
            <div class="chips">
              <button
                v-for="a in READING_ANGLES"
                :key="a.key"
                type="button"
                class="chip"
                :class="{ on: angleKey === a.key && !showCustom }"
                :title="a.desc"
                @click="
                  () => {
                    angleKey = a.key
                    showCustom = false
                  }
                "
              >
                {{ a.label }}
              </button>
              <button
                type="button"
                class="chip"
                :class="{ on: showCustom }"
                @click="showCustom = !showCustom"
              >
                自定义方向
              </button>
            </div>
            <input
              v-if="showCustom"
              v-model="customDirection"
              class="input"
              type="text"
              maxlength="60"
              placeholder="例如：事业、感情、修行、性格卡点、财富…"
            />
          </section>

          <!-- ④ 档位与重复处理 -->
          <section class="block">
            <h3 class="t-sm block-title">生成档位</h3>
            <div class="chips">
              <button
                v-for="m in (['concise', 'detailed', 'full'] as AiDetailMode[])"
                :key="m"
                type="button"
                class="chip"
                :class="{ on: detailMode === m }"
                @click="detailMode = m"
              >
                {{ MODE_LABELS[m] }}
              </button>
            </div>
            <p v-if="detailMode === 'full'" class="t-xs note warn">
              「完整」档每份默认上限 8000 tokens，批量生成耗时与额度消耗都会显著增加；
              可用下面的「单次请求 token 上限」压住总消耗。
            </p>
          </section>

          <!-- ⑤ 单份 token 上限（v2.5.0）：逐份独立，不再无限 token -->
          <section class="block">
            <h3 class="t-sm block-title">单次请求 token 上限</h3>
            <p class="t-xs note">
              每次 AI 请求（含自动续写）独立计算，N 份档案最多消耗约 N × 本值。填 0 表示不限制。
              触顶的解读会标注「可能不完整」且不写入缓存，调高后重跑即可。
              设置页的全局值：{{ settings.aiTokenBudget === 0 ? '不限制' : `${settings.aiTokenBudget} tokens` }}。
            </p>
            <p class="t-xs note warn">
              ⚠ 选「完整」档时不适用上面的估法：一份档案会拆成几十个分项 + 一次融合，
              每个分项与融合各自套用本上限，总消耗约为「请求数 × 本值」，可能高出一到两个数量级。
            </p>
            <div class="chips">
              <button
                v-for="b in BUDGET_PRESETS"
                :key="b"
                type="button"
                class="chip"
                :class="{ on: Number(tokenBudgetInput) === b }"
                @click="tokenBudgetInput = String(b)"
              >
                {{ b === 0 ? '不限制' : `${b} tokens` }}
              </button>
            </div>
            <input
              v-model="tokenBudgetInput"
              class="input"
              type="number"
              min="0"
              :max="MAX_TOKEN_BUDGET"
              inputmode="numeric"
              placeholder="0 = 不限制"
            />
            <p v-if="tokenBudgetError" class="t-xs note error">{{ tokenBudgetError }}</p>
          </section>

          <!-- ⑥ v3.0.0：保存位置 + 完成后自动导出，一人一份 -->
          <section class="block">
            <h3 class="t-sm block-title">保存位置 · 自动导出 md</h3>
            <p class="t-xs note">
              解读完成后每人一份 .md 自动落盘，文件名「档案名-范围-受众-时间」。
              同名文件不覆盖，自动加 -2；内容与单盘手动导出完全一致（含页眉与免责声明）。
            </p>
            <label class="t-xs auto-export">
              <input v-model="autoExport" type="checkbox" @change="updateAutoExport" />
              完成后自动导出（每人一份）
            </label>
            <div v-if="canPickDir" class="dir-row">
              <input class="input" :value="outputDir" readonly placeholder="尚未选择目录" />
              <HdButton size="sm" variant="ghost" @click="chooseDir">选择目录</HdButton>
            </div>
            <p v-else class="t-xs note warn">
              当前是网页 / 安卓环境，无法指定保存目录；导出会逐个下载到浏览器默认位置。
            </p>
            <p v-if="exporting" class="t-xs note">正在写入 md…</p>
            <p v-if="exportResult" class="t-xs note" :class="{ warn: exportResult.failed.length }">
              已导出 {{ exportResult.written.length }} 份<template v-if="exportResult.failed.length"
                >，失败 {{ exportResult.failed.length }} 份：{{
                  exportResult.failed.map((f) => f.name).join('、')
                }}</template
              ><template v-if="exportResult.dirPath"> · 目录：{{ exportResult.dirPath }}</template>
            </p>
          </section>

          <section class="block">
            <h3 class="t-sm block-title">面向人群</h3>
            <p class="t-xs note">
              当前：<b>{{ AUDIENCE_LABEL }}</b
              >。该选项在「设置 → AI 配置 → 面向人群」切换；专业版与简明版的解读分开保存、互不覆盖。
            </p>
          </section>

          <section class="block">
            <h3 class="t-sm block-title">已有解读的档案</h3>
            <div class="chips">
              <button
                type="button"
                class="chip"
                :class="{ on: onExisting === 'skip' }"
                @click="onExisting = 'skip'"
              >
                跳过，不重复消耗
              </button>
              <button
                type="button"
                class="chip"
                :class="{ on: onExisting === 'overwrite' }"
                @click="onExisting = 'overwrite'"
              >
                重新生成覆盖
              </button>
            </div>
          </section>

          <!-- 预检结论 -->
          <p v-if="plan" class="t-sm summary-line">
            将生成 <b>{{ plan.runnable }}</b> 份解读<span v-if="plan.skipped.length">，跳过
              <b>{{ plan.skipped.length }}</b> 份（缺盘面）</span><span
              v-if="onExisting === 'skip' && coveredInTarget"
            >，跳过 <b>{{ coveredInTarget }}</b> 份（已有该维度解读）</span
            >。
          </p>

          <p v-if="!configured" class="t-sm note error">
            尚未配置 AI 接口，请先到设置页填写接口地址、密钥与模型。
          </p>

          <!-- 运行中 / 已完成 -->
          <section v-if="running || batch.summary" class="progress-box">
            <div v-if="batch.total" class="bar" role="progressbar" :aria-valuenow="percent">
              <span class="bar-fill" :style="{ width: `${percent}%` }" />
            </div>
            <p class="t-sm">
              <template v-if="running">
                {{ batch.done }} / {{ batch.total }} · {{ batch.current }}
              </template>
              <template v-else>{{ batch.summary }}</template>
            </p>
            <p v-if="running" class="t-xs note">
              已用 {{ fmtMs(batch.elapsedMs) }}<template v-if="batch.etaMs !== null"> · 预计还需
                {{ fmtMs(batch.etaMs) }}</template>
            </p>
            <ul v-if="batch.failed.length" class="t-xs fails">
              <li v-for="(f, i) in batch.failed" :key="i">{{ f }}</li>
            </ul>
            <p v-if="truncatedNames.length" class="t-xs note warn">
              {{ truncatedNames.length }} 份输出触顶、结尾可能缺失：{{ truncatedNames.join('、') }}。
              调高「单次请求 token 上限」后重跑这几份即可。
            </p>
            <p v-if="!running && batch.skipped.length" class="t-xs note">
              跳过：{{ batch.skipped.join('、') }}
            </p>
          </section>
        </div>

        <footer class="foot">
          <HdButton v-if="running" variant="ghost" @click="abort">中断（已完成的会保留）</HdButton>
          <HdButton
            v-else-if="failedCount"
            variant="ghost"
            :disabled="!configured"
            @click="retry"
          >
            重跑失败的 {{ failedCount }} 份
          </HdButton>
          <span class="spacer" />
          <HdButton variant="ghost" @click="emit('close')">{{ running ? '后台运行' : '关闭' }}</HdButton>
          <HdButton :loading="starting" :disabled="!canRun" @click="start">
            {{ running ? '生成中…' : `开始生成 ${plan?.runnable ?? 0} 份` }}
          </HdButton>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(8, 20, 26, 0.42);
  z-index: var(--z-dialog);
}

.dialog {
  position: fixed;
  left: 50%;
  top: calc(50% + var(--chrome-h, 0px) / 2);
  transform: translate(-50%, -50%);
  width: min(560px, 94vw);
  max-height: min(88vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-radius: var(--radius-lg, 18px);
  box-shadow: var(--elev-dialog);
  z-index: calc(var(--z-dialog) + 1);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border);
}

.head h2 {
  flex: 1;
}

.close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  color: var(--text-muted);
}

.close:hover {
  background: var(--surface-2);
}

.body {
  padding: var(--sp-3) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  overflow-y: auto;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-secondary);
}

.link {
  color: var(--action-primary);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}

.chip:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.chip.on {
  background: rgba(124, 58, 237, 0.14);
  border-color: var(--owner-shared);
  color: var(--text-primary);
  font-weight: 600;
}

.chip:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.input {
  height: 36px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.summary-line {
  color: var(--text-secondary);
  line-height: 1.6;
}

.note {
  color: var(--text-muted);
  line-height: 1.6;
}

.note.warn {
  color: var(--status-warning);
}

.note.error {
  color: var(--status-error);
}

.progress-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.bar {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--border);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--action-primary);
  transition: width 240ms var(--ease-out, ease);
}

.fails {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--status-error);
  max-height: 120px;
  overflow-y: auto;
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--border);
}

.spacer {
  flex: 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms var(--ease-out);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.97);
}

/* v3.0.0：保存位置 */
.auto-export {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  cursor: pointer;
  color: var(--text-secondary);
}
.dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dir-row .input {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .dialog {
    width: 100vw;
    max-height: 92vh;
    left: 0;
    top: auto;
    bottom: 0;
    transform: none;
    border-radius: 22px 22px 0 0;
  }
  .pop-enter-from,
  .pop-leave-to {
    opacity: 0;
    transform: translateY(12px);
  }
  .foot {
    flex-wrap: wrap;
  }
}
</style>
