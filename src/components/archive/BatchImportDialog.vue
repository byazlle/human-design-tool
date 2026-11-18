<script setup lang="ts">
/**
 * 批量导入 / 计算 / 导出（v3.3.0）。
 *
 * 流程：粘贴或上传表格 → 解析（A 序号 / B 名称 / C 出生时间 / D 性别 / E 省份 / F 地区）
 * → 逐行计算 → 预览 → 导出 CSV（A–T 共 20 列）+ 可选「同时存为档案」。
 *
 * 关键行为：
 * - C 列只有 8 位日期时，自动展开「当天所有不同的图」，每图一行，序号与名称后缀 -1/-2，
 *   备注写明共几个图、第几个、首次出现时间、与上一个图差在哪。
 * - 解析失败的行不丢弃，导出时带备注，避免用户误以为已入库。
 * - 全程本地计算，不联网。
 */
import { computed, ref, watch } from 'vue'
import HdButton from '../base/HdButton.vue'
import { useArchiveStore } from '../../stores/archive'
import { useUiStore } from '../../stores/ui'
import {
  BATCH_EXPORT_HEADER,
  parseBatchTable,
  parseBirthCell,
  toCsv,
  genderOf,
  type BatchInputRow,
  type ParseIssue,
} from '../../services/batchTable'
import { computeBatch, locationOf } from '../../services/batchChart'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const archiveStore = useArchiveStore()
const ui = useUiStore()

const SAMPLE = `序号,案主名称,出生时间,性别,省份,地区
1,张三,200001010101,男,浙江省,绍兴市
2,李四,20000101,女,浙江省,绍兴市
3,王五,199005211430,男,上海市,上海市`

const rawText = ref('')
const timezone = ref('Asia/Shanghai')
const saveAsArchive = ref(true)

const parsedRows = ref<BatchInputRow[]>([])
const issues = ref<ParseIssue[]>([])
const headerSkipped = ref(false)
const resultRows = ref<string[][]>([])
const dateExpanded = ref(0)
const computing = ref(false)
const progress = ref({ done: 0, total: 0 })
const fileName = ref('')

const canCompute = computed(() => rawText.value.trim().length > 0 && !computing.value)
const previewRows = computed(() => resultRows.value.slice(0, 60))
const okCount = computed(() => resultRows.value.filter((r) => !r[19]).length)
const failCount = computed(() => resultRows.value.filter((r) => r[19]).length)
const dateOnlyCount = computed(
  () => parsedRows.value.filter((r) => parseBirthCell(r.birthRaw)?.dateOnly).length,
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    if (!rawText.value) rawText.value = SAMPLE
  },
)

function reset() {
  rawText.value = ''
  parsedRows.value = []
  issues.value = []
  resultRows.value = []
  dateExpanded.value = 0
  progress.value = { done: 0, total: 0 }
  fileName.value = ''
  headerSkipped.value = false
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 4 * 1024 * 1024) {
    ui.notify('文件超过 4MB，请拆分后再导入', 'error')
    return
  }
  const text = await file.text()
  rawText.value = text.replace(/\uFEFF/g, '')
  fileName.value = file.name
  input.value = ''
}

async function run() {
  const parsed = parseBatchTable(rawText.value)
  parsedRows.value = parsed.rows
  issues.value = [...parsed.issues]
  headerSkipped.value = parsed.headerSkipped
  if (!parsed.rows.length) {
    ui.notify('没有可计算的合法行，请检查表格内容', 'error')
    return
  }
  computing.value = true
  progress.value = { done: 0, total: parsed.rows.length }
  resultRows.value = []
  dateExpanded.value = 0
  try {
    const res = await computeBatch(parsed.rows, {
      timezone: timezone.value.trim() || 'Asia/Shanghai',
      onProgress: (done, total) => {
        progress.value = { done, total }
      },
    })
    resultRows.value = res.rows
    issues.value = [...issues.value, ...res.issues]
    dateExpanded.value = res.expandedRows
    ui.notify(`已计算 ${res.rows.length} 行`, 'success')
  } catch (err) {
    ui.notify(`计算失败：${(err as Error).message || '未知错误'}`, 'error')
  } finally {
    computing.value = false
  }
}

function exportCsv() {
  if (!resultRows.value.length) return
  const csv = toCsv(resultRows.value)
  const stamp = new Date()
  const name = `人类图批量计算-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}.csv`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  ui.notify('已开始下载 CSV（Excel 可直接打开）', 'success')
}

/** 把算好的行存成档案：只存成功的行，按行里的具体出生时间建盘 */
function saveArchives() {
  let created = 0
  for (const row of resultRows.value) {
    const note = row[19]
    if (note && !note.startsWith('只给了日期')) continue
    const birth = parseBirthCell(row[2])
    if (!birth) continue
    const loc = locationOf(row[4], row[5])
    archiveStore.create({
      name: row[1],
      gender: genderOf(row[3]),
      birth: {
        year: birth.year,
        month: birth.month,
        day: birth.day,
        hour: birth.hour,
        minute: birth.minute,
      },
      timezone: timezone.value.trim() || 'Asia/Shanghai',
      location: loc,
    })
    created += 1
  }
  ui.notify(
    archiveStore.persistError ?? `已保存 ${created} 份档案`,
    archiveStore.persistError ? 'error' : 'success',
  )
  if (created) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('close')" />
    </Transition>
    <Transition name="pop">
      <section v-if="open" class="dialog" role="dialog" aria-modal="true" aria-label="批量导入与计算">
        <header class="head">
          <div>
            <h2 class="t-title">批量导入 · 计算 · 导出</h2>
            <p class="t-xs muted">
              A 序号｜B 案主名称｜C 出生时间｜D 性别｜E 省份｜F 地区；C 只写 8 位日期会自动展开当天所有不同的图
            </p>
          </div>
          <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="body">
          <section class="block">
            <div class="row">
              <label class="file">
                <input type="file" accept=".csv,.txt,.tsv" @change="onFile" />
                <span>选择文件（CSV / TXT，4MB 内）</span>
              </label>
              <span v-if="fileName" class="t-xs muted">{{ fileName }}</span>
              <button type="button" class="link" @click="rawText = SAMPLE">填入示例</button>
              <button v-if="resultRows.length" type="button" class="link" @click="reset">重新开始</button>
            </div>
            <textarea
              v-model="rawText"
              class="input"
              rows="7"
              spellcheck="false"
              placeholder="可以直接从 Excel 复制粘贴（制表符分隔），也可以粘贴 CSV 文本"
            />
            <div class="row">
              <label class="field">
                <span class="t-xs muted">时区</span>
                <input v-model="timezone" class="input inline" aria-label="时区" />
              </label>
              <label class="check">
                <input v-model="saveAsArchive" type="checkbox" />
                <span>算完同时存为档案</span>
              </label>
              <span class="grow" />
              <HdButton :disabled="!canCompute" :loading="computing" size="sm" @click="run">
                {{ computing ? `计算中 ${progress.done}/${progress.total}` : '解析并计算' }}
              </HdButton>
            </div>
          </section>

          <section v-if="issues.length" class="block">
            <h3 class="t-sm block-title">需要注意的 {{ issues.length }} 行</h3>
            <ul class="issues">
              <li v-for="(it, i) in issues.slice(0, 12)" :key="i" class="t-xs">
                第 {{ it.line }} 行：{{ it.message }}
              </li>
              <li v-if="issues.length > 12" class="t-xs muted">…另有 {{ issues.length - 12 }} 条</li>
            </ul>
          </section>

          <section v-if="resultRows.length" class="block">
            <h3 class="t-sm block-title">
              计算结果 · {{ resultRows.length }} 行
              <span class="t-xs muted">
                （成功 {{ okCount }}，带备注 {{ failCount }}；日期展开 {{ dateExpanded }} 行）
              </span>
            </h3>
            <div class="table-wrap">
              <table class="preview">
                <thead>
                  <tr>
                    <th v-for="h in BATCH_EXPORT_HEADER" :key="h">{{ h }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in previewRows" :key="i">
                    <td v-for="(cell, j) in row" :key="j" :class="{ note: j === 19 && cell }">
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="resultRows.length > previewRows.length" class="t-xs muted">
              预览前 {{ previewRows.length }} 行，导出的 CSV 含全部 {{ resultRows.length }} 行。
            </p>
          </section>
        </div>

        <footer class="foot">
          <span class="t-xs muted">
            全部在本机计算；导出列 A–T，C 列为 8 位的行已按分钟扫描展开
          </span>
          <span class="grow" />
          <HdButton
            v-if="saveAsArchive && resultRows.length"
            variant="ghost"
            size="sm"
            @click="saveArchives"
          >
            存为档案
          </HdButton>
          <HdButton :disabled="!resultRows.length" size="sm" @click="exportCsv">导出 CSV</HdButton>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(16, 18, 23, 0.42);
  z-index: var(--z-dialog);
}

.dialog {
  position: fixed;
  left: 50%;
  top: calc(50% + var(--chrome-h, 0px) / 2);
  transform: translate(-50%, -50%);
  width: min(1080px, 96vw);
  max-height: min(90vh, 860px);
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
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border);
}

.head h2 {
  margin-bottom: 2px;
}

.close {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  font-size: 18px;
  line-height: 1;
  color: var(--text-secondary);
}

.close:hover {
  background: var(--surface-2);
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--sp-3) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.block-title {
  font-weight: 600;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.grow {
  flex: 1;
}

.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  line-height: 1.5;
  resize: vertical;
}

.input.inline {
  width: 150px;
}

.file {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
  cursor: pointer;
}

.file:hover {
  border-color: var(--border-strong);
}

.file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.link {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--owner-shared);
}

.issues {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: rgba(217, 119, 6, 0.1);
  color: var(--text-primary);
}

.muted {
  color: var(--text-muted);
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  max-height: 320px;
}

.preview {
  border-collapse: collapse;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  white-space: nowrap;
}

.preview th,
.preview td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.preview th {
  position: sticky;
  top: 0;
  background: var(--surface-2);
  font-weight: 600;
  z-index: 1;
}

.preview td.note {
  color: var(--status-warning);
  white-space: normal;
  min-width: 220px;
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-fast) ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pop-enter-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-slow) var(--ease-out);
}
.pop-leave-active {
  transition:
    opacity var(--dur-fast) ease,
    transform var(--dur-fast) ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 12px)) scale(0.98);
}

@media (max-width: 640px) {
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
    transform: translateY(16px);
  }
}
</style>
