<script setup lang="ts">
/** 设置页：单栏分节，桌面与手机同一套（DESIGN.md §5.5） */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { consumeSettingsReturn, peekSettingsReturn } from '../router'
import { useArchiveStore } from '../stores/archive'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import AppToolbar from '../components/base/AppToolbar.vue'
import SettingsForm from '../components/settings/SettingsForm.vue'
import { parseBackup } from '../services/backupImport'
import { SCHEMA_VERSION } from '../engine/version'

const router = useRouter()
const archiveStore = useArchiveStore()
const settings = useSettingsStore()
const ui = useUiStore()

/** 返回按钮文案跟随来源页（#6：从完整盘进设置应「返回完整盘」） */
const returnLabel = computed(() => {
  const to = peekSettingsReturn()
  if (to.startsWith('/archive/')) return '返回完整盘'
  if (to.startsWith('/chiron/')) return '返回凯龙盘'
  if (to.startsWith('/composite/')) return '返回合盘'
  if (to.startsWith('/compare')) return '返回双盘对比'
  if (to === '/boards') return '返回多盘'
  return '返回档案库'
})

function exportAll() {
  const payload = {
    app: 'humandesign-tool',
    version: SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    archives: archiveStore.archives.map(({ chart, ...rest }) => rest),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `humandesign-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ui.notify('已导出备份（不含身份证号与 AI Key）', 'success')
}

interface RejectedItem {
  name: string
  reason: string
}

/** 导入明细面板：被拒条目逐条列出（U-16） */
const importReport = ref<{
  rejected: RejectedItem[]
  warning: string | null
  legacyNote: string | null
} | null>(null)

async function importFile(file: File) {
  try {
    const text = await file.text()
    const data = JSON.parse(text) as unknown
    const { accepted, rejected, schemaWarning, legacyNote } = parseBackup(data)

    // 高版本备份：给可见警告但继续导入，不丢弃任何数据。
    if (schemaWarning) console.warn('[import] ' + schemaWarning)

    if (!accepted.length) {
      // 全部被拒时也弹明细面板，列出每一份的原因
      importReport.value = { rejected, warning: schemaWarning, legacyNote }
      const first = rejected[0]
      throw new Error(
        `没有可用档案（共 ${rejected.length} 份被拒${first ? `，如「${first.name}」：${first.reason}` : ''}）`,
      )
    }

    archiveStore.importAll(accepted)
    accepted.forEach((a) => archiveStore.ensureChart(a.id))

    const parts = [`已导入 ${accepted.length} 份档案`]
    if (rejected.length) parts.push(`${rejected.length} 份被拒已跳过`)
    if (schemaWarning) parts.push('存在版本警告')
    if (legacyNote) parts.push('旧版备份，盘面已自动重算')
    ui.notify(parts.join('；'), rejected.length || schemaWarning || legacyNote ? 'info' : 'success')
    if (rejected.length) {
      const detail = rejected
        .slice(0, 5)
        .map((r: RejectedItem) => `${r.name}：${r.reason}`)
        .join('\n')
      console.warn('[import] 被拒条目：\n' + detail)
    }
    if (archiveStore.persistError) ui.notify(archiveStore.persistError, 'error')

    // 有问题才弹明细面板；全部成功保持原有 toast
    if (rejected.length || schemaWarning || legacyNote) {
      importReport.value = { rejected, warning: schemaWarning, legacyNote }
    }
  } catch (err) {
    ui.notify(`导入失败：${(err as Error).message}`, 'error')
  }
}

function clearAll() {
  const ok = window.confirm('确定清空全部本地档案与 AI 缓存？此操作不可撤销。')
  if (!ok) return
  archiveStore.clearAll()
  settings.clearCache()
  ui.notify(archiveStore.persistError ?? '已清空本地数据', archiveStore.persistError ? 'error' : 'success')
}

function clearCache() {
  settings.clearCache()
  ui.notify('已清空 AI 缓存', 'success')
}

function goBack() {
  router.push(consumeSettingsReturn() || '/')
}
function goNew() {
  router.push('/new')
}
</script>

<template>
  <div class="page">
    <AppToolbar title="设置" :back-label="returnLabel" @back="goBack" @new="goNew" @help="ui.notify('AI 配置仅保存在本机；不填也能正常排盘与查看离线释义。')" />
    <main class="content">
      <SettingsForm
        @export="exportAll"
        @import="importFile"
        @clear-cache="clearCache"
        @clear-all="clearAll"
      />
    </main>

    <!-- 导入明细（U-16）：被拒条目逐条列出 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="importReport" class="report-mask" @click="importReport = null" />
      </Transition>
      <Transition name="pop">
        <section
          v-if="importReport"
          class="report"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-report-title"
        >
          <h2 id="import-report-title" class="t-title">导入结果明细</h2>
          <p v-if="importReport.warning" class="t-sm msg-warning">{{ importReport.warning }}</p>
          <p v-if="importReport.legacyNote" class="t-sm msg-warning">{{ importReport.legacyNote }}</p>
          <p v-if="!importReport.rejected.length" class="t-sm t-muted">没有被拒条目。</p>
          <ul v-else class="report-list">
            <li v-for="(item, i) in importReport.rejected" :key="`${item.name}-${i}`">
              <strong>{{ item.name }}</strong>
              <span class="t-xs"> — {{ item.reason }}</span>
            </li>
          </ul>
          <div class="report-actions">
            <button type="button" class="report-btn" @click="importReport = null">关闭</button>
          </div>
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: var(--sp-4);
}

/* ── 导入明细面板（U-16）──────────────────────── */
.report-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  z-index: var(--z-dialog);
}

.report {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 480px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-dialog);
  z-index: calc(var(--z-dialog) + 1);
}

.report-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 1.1em;
  list-style: disc;
  line-height: 1.5;
}

.report-actions {
  display: flex;
  justify-content: flex-end;
}

.report-btn {
  min-height: 36px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
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
    opacity 140ms ease,
    transform 140ms ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -47%) scale(0.97);
}
</style>
