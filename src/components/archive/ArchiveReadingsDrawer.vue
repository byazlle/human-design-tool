<script setup lang="ts">
/**
 * 某份档案的「AI 解读记录」（v2.4.0）。
 *
 * 存在的理由：v2.3.0 之前解读看完即散，批量生成几十份更无处安放。
 * 这里把 `readings` store 里属于本档案的记录列出来，可按需展开、复制、删除。
 *
 * 过期判定交给 `isStale()`（提示词版本或内核版本已变），只标「口径已更新」
 * 而不删除——旧内容仍有参考价值，重跑由用户决定。
 */
import { computed, ref } from 'vue'
import { isStale, useReadingsStore, type ReadingRecord } from '../../stores/readings'
import { useUiStore } from '../../stores/ui'
import { copyAiResult } from '../../composables/useAiResultActions'
import HdDrawer from '../base/HdDrawer.vue'
import HdButton from '../base/HdButton.vue'
import EmptyState from '../base/EmptyState.vue'
import ConfirmDialog from '../base/ConfirmDialog.vue'

const props = defineProps<{ open: boolean; archiveId: string }>()
const emit = defineEmits<{ close: []; regenerate: [record: ReadingRecord] }>()

const readings = useReadingsStore()
const ui = useUiStore()

const list = computed(() => (props.archiveId ? readings.ofArchive(props.archiveId) : []))

const MODE_LABELS: Record<string, string> = { concise: '精简', detailed: '详细', full: '完整' }

/** 当前展开的记录 key（一次只展开一条，避免抽屉过长） */
const expanded = ref<string | null>(null)

function keyOf(r: ReadingRecord): string {
  return `${r.scope}|${r.ref}|${r.mode}|${r.audience ?? 'pro'}`
}

function toggle(r: ReadingRecord) {
  const k = keyOf(r)
  expanded.value = expanded.value === k ? null : k
}

function preview(r: ReadingRecord): string {
  const flat = r.content.replace(/\s+/g, ' ').trim()
  return flat.length > 110 ? `${flat.slice(0, 110)}…` : flat
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function copy(r: ReadingRecord) {
  void copyAiResult(r.content)
}

const pendingDelete = ref<ReadingRecord | null>(null)

function askDelete(r: ReadingRecord) {
  pendingDelete.value = r
}

function doDelete() {
  const r = pendingDelete.value
  pendingDelete.value = null
  if (!r) return
  readings.remove(r.archiveId, r.scope, r.ref, r.mode, r.audience ?? 'pro')
  if (expanded.value === keyOf(r)) expanded.value = null
  ui.notify('已删除该条解读')
}

const exportAll = computed(() => {
  const parts = list.value.map(
    (r) =>
      `# ${r.title}\n（${MODE_LABELS[r.mode] ?? r.mode} · ${
        r.audience === 'plain' ? '简明版' : '专业版'
      } · ${fmtTime(r.at)}${isStale(r) ? ' · 口径已更新' : ''}${
        r.truncated ? ' · 内容可能不完整（已达 token 上限）' : ''
      }）\n\n${r.content}`,
  )
  return parts.join('\n\n---\n\n')
})

function copyAll() {
  if (!exportAll.value) return
  void copyAiResult(exportAll.value)
}
</script>

<template>
  <HdDrawer :open="open" :title="`AI 解读记录（${list.length}）`" max-height="82vh" @close="emit('close')">
    <EmptyState
      v-if="!list.length"
      title="还没有保存的解读"
      desc="单盘 AI 解读完成后点「保存」，或在档案库用「批量解读」为多份档案一次生成，结果都会归到这里。"
    />

    <template v-else>
      <div class="toolbar">
        <span class="t-xs t-muted">共 {{ list.length }} 条，按生成时间倒序</span>
        <HdButton size="sm" variant="ghost" @click="copyAll">全部复制</HdButton>
      </div>

      <ul class="records">
        <li v-for="r in list" :key="keyOf(r)" class="record">
          <div class="row">
            <button type="button" class="head-btn" @click="toggle(r)">
              <span class="title ellipsis">{{ r.title }}</span>
              <span class="tags">
                <span class="tag">{{ MODE_LABELS[r.mode] ?? r.mode }}</span>
                <span class="tag ghost">{{ r.audience === 'plain' ? '简明版' : '专业版' }}</span>
                <span v-if="r.truncated" class="tag warn" title="本次输出已达到单次请求 token 上限，结尾可能缺失；可调高上限后重新生成">可能不完整</span>
                <span v-if="isStale(r)" class="tag warn" title="提示词或计算内核已更新，该解读口径可能已过时">口径已更新</span>
                <span class="tag ghost">{{ fmtTime(r.at) }}</span>
              </span>
            </button>
          </div>

          <p v-if="expanded !== keyOf(r)" class="preview t-xs">{{ preview(r) }}</p>
          <pre v-else class="full">{{ r.content }}</pre>

          <div class="actions">
            <button type="button" class="mini" @click="toggle(r)">
              {{ expanded === keyOf(r) ? '收起' : '展开全文' }}
            </button>
            <button type="button" class="mini" @click="copy(r)">复制</button>
            <button type="button" class="mini" @click="emit('regenerate', r)">重新生成</button>
            <button type="button" class="mini danger" @click="askDelete(r)">删除</button>
          </div>
        </li>
      </ul>
    </template>
  </HdDrawer>

  <ConfirmDialog
    :open="Boolean(pendingDelete)"
    title="删除这条解读"
    desc="删除后无法恢复，需要重新生成才能再得到。"
    confirm-text="删除"
    danger
    @confirm="doDelete"
    @cancel="pendingDelete = null"
  />
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding-bottom: var(--sp-2);
}

.records {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  list-style: none;
}

.record {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.row {
  display: flex;
  min-width: 0;
}

.head-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  width: 100%;
  text-align: left;
  min-width: 0;
}

.title {
  flex: 1;
  min-width: 0;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
}

.tags {
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.tag {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  white-space: nowrap;
}

.tag.warn {
  border-color: var(--status-warning);
  color: var(--status-warning);
}

.tag.ghost {
  border-color: transparent;
  color: var(--text-muted);
}

.preview {
  color: var(--text-muted);
  line-height: 1.6;
}

.full {
  max-height: 320px;
  overflow: auto;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  font-family: inherit;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mini {
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}

.mini:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.mini.danger {
  border-color: transparent;
  color: var(--status-error);
}

.mini.danger:hover {
  border-color: var(--status-error);
}
</style>
