<script setup lang="ts">
/** 设置页：单栏分节，桌面与手机同一套（DESIGN.md §5.5） */
import { useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import AppToolbar from '../components/base/AppToolbar.vue'
import SettingsForm from '../components/settings/SettingsForm.vue'
import type { Archive } from '../types/hd'

const router = useRouter()
const archiveStore = useArchiveStore()
const settings = useSettingsStore()
const ui = useUiStore()

function exportAll() {
  const payload = {
    app: 'humandesign-tool',
    version: 1,
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
  ui.notify('已导出备份（不含身份证号）', 'success')
}

async function importFile(file: File) {
  try {
    const text = await file.text()
    const data = JSON.parse(text) as { archives?: Archive[] }
    if (!Array.isArray(data.archives)) throw new Error('文件格式不正确')
    const valid = data.archives.filter(
      (a) => a && a.id && a.name && a.birth && a.timezone,
    )
    if (!valid.length) throw new Error('文件中没有可用档案')
    archiveStore.importAll(valid)
    valid.forEach((a) => archiveStore.ensureChart(a.id))
    ui.notify(`已导入 ${valid.length} 份档案`, 'success')
  } catch (err) {
    ui.notify(`导入失败：${(err as Error).message}`, 'error')
  }
}

function clearAll() {
  const ok = window.confirm('确定清空全部本地档案与 AI 缓存？此操作不可撤销。')
  if (!ok) return
  archiveStore.clearAll()
  settings.clearCache()
  ui.notify('已清空本地数据', 'success')
}

function clearCache() {
  settings.clearCache()
  ui.notify('已清空 AI 缓存', 'success')
}

function goBack() {
  router.push('/')
}
function goNew() {
  router.push('/new')
}
</script>

<template>
  <div class="page">
    <AppToolbar title="设置" back-label="档案库" @back="goBack" @new="goNew" @settings="() => {}" @help="ui.notify('AI 配置仅保存在本机；不填也能正常排盘与查看离线释义。')" />
    <main class="content">
      <SettingsForm
        @export="exportAll"
        @import="importFile"
        @clear-cache="clearCache"
        @clear-all="clearAll"
      />
    </main>
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
</style>
