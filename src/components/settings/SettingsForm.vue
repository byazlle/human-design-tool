<script setup lang="ts">
/** 设置面板：AI 配置（多套）/ 外观 / 数据 / 计算精度（DESIGN.md §4.12） */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useArchiveStore } from '../../stores/archive'
import { useUiStore } from '../../stores/ui'
import { DRAWING_ENGINES } from '../chart/layouts'
import type { GraphSize, LayoutDensity } from '../../stores/settings'
import { probeAiConfig, validateAiConfig } from '../../services/aiClient'
import type { AiProfile } from '../../types/hd'
import ConfirmDialog from '../base/ConfirmDialog.vue'
import HdField from '../base/HdField.vue'
import HdToggle from '../base/HdToggle.vue'
import HdButton from '../base/HdButton.vue'

const FONT_STEPS = [0.85, 0.92, 1, 1.1, 1.2, 1.35] as const
const FONT_LABELS = ['特小', '偏小', '标准', '稍大', '大', '特大'] as const
const DENSITIES: Array<{ value: LayoutDensity; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'standard', label: '标准' },
  { value: 'spacious', label: '宽松' },
]
const GRAPH_SIZES: Array<{ value: GraphSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'normal', label: '标准' },
  { value: 'large', label: '大' },
]

const emit = defineEmits<{
  export: []
  import: [file: File]
  'clear-cache': []
  'clear-all': []
}>()

const settings = useSettingsStore()
const archiveStore = useArchiveStore()
const ui = useUiStore()

/* ── 多 AI 配置 ──────────────────────────────────────── */

interface EditorState {
  id: string | null
  name: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutSec: string
  cacheEnabled: boolean
}

const editor = ref<EditorState | null>(null)
const fieldErrors = reactive<Record<string, string>>({})
const showKey = ref(false)
const testingId = ref<string | null>(null)
const probeNotes = reactive<Record<string, string>>({})
const confirmDeleteId = ref<string | null>(null)
const deleteTarget = computed(() => settings.aiProfiles.find((p) => p.id === confirmDeleteId.value) ?? null)
const activeProfile = computed(() => settings.activeAiProfile)

function clearFieldErrors() {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k])
}

function openCreate() {
  clearFieldErrors()
  showKey.value = false
  editor.value = {
    id: null,
    name: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    timeoutSec: '60',
    cacheEnabled: true,
  }
}

function openEdit(profile: AiProfile) {
  clearFieldErrors()
  showKey.value = false
  editor.value = {
    id: profile.id,
    name: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeoutSec: String(Math.round(profile.timeoutMs / 1000)),
    cacheEnabled: profile.cacheEnabled,
  }
}

function closeEditor() {
  editor.value = null
  clearFieldErrors()
}

function editorConfig() {
  const e = editor.value
  if (!e) return null
  return {
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
    model: e.model,
    timeoutMs: Math.round(Number(e.timeoutSec) * 1000),
    cacheEnabled: e.cacheEnabled,
  }
}

/**
 * 字段级校验用一个「其余字段都合法」的基线配置，复用 validateAiConfig 的同一套规则，
 * 避免把校验规则复制两份导致漂移。
 */
const VALID_BASELINE = {
  baseUrl: 'https://baseline.example.com/v1',
  apiKey: 'sk-baseline-0000',
  model: 'baseline-model',
  timeoutMs: 60000,
  cacheEnabled: true,
}

function validateField(key: 'name' | 'baseUrl' | 'apiKey' | 'model' | 'timeoutSec') {
  const e = editor.value
  if (!e) return
  delete fieldErrors[key]
  if (key === 'name') {
    if (!e.name.trim()) fieldErrors.name = '请填写配置名称'
    return
  }
  if (key === 'timeoutSec') {
    const sec = Number(e.timeoutSec)
    if (!Number.isFinite(sec) || sec < 3 || sec > 600) {
      fieldErrors.timeoutSec = '超时需在 3–600 秒之间'
    }
    return
  }
  const config = {
    ...VALID_BASELINE,
    [key]: e[key],
  }
  const msg = validateAiConfig(config)
  if (msg) fieldErrors[key] = msg
}

const editorValid = computed(() => {
  const e = editor.value
  if (!e) return false
  if (!e.name.trim()) return false
  const sec = Number(e.timeoutSec)
  if (!Number.isFinite(sec) || sec < 3 || sec > 600) return false
  const config = editorConfig()
  return config ? validateAiConfig(config) === null : false
})

function submitEditor() {
  const e = editor.value
  if (!e) return
  clearFieldErrors()
  if (!e.name.trim()) {
    fieldErrors.name = '请填写配置名称'
    return
  }
  const sec = Number(e.timeoutSec)
  if (!Number.isFinite(sec) || sec < 3 || sec > 600) {
    fieldErrors.timeoutSec = '超时需在 3–600 秒之间'
    return
  }
  const input = {
    name: e.name,
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
    model: e.model,
    timeoutMs: Math.round(sec * 1000),
    cacheEnabled: e.cacheEnabled,
  }
  const result = e.id ? settings.updateAiProfile(e.id, input) : settings.addAiProfile(input)
  if (!result.ok) {
    const msg = result.error ?? '保存失败'
    if (msg.includes('名称')) fieldErrors.name = msg
    else if (msg.includes('接口地址') || msg.includes('http')) fieldErrors.baseUrl = msg
    else if (msg.includes('API Key')) fieldErrors.apiKey = msg
    else if (msg.includes('模型')) fieldErrors.model = msg
    else if (msg.includes('超时')) fieldErrors.timeoutSec = msg
    ui.notify(msg, 'error')
    return
  }
  if (settings.persistError) {
    ui.notify(settings.persistError, 'error')
    return
  }
  ui.notify(e.id ? '配置已更新' : '已新增配置并设为当前', 'success')
  closeEditor()
}

function toggleActiveCache(value: boolean) {
  const profile = activeProfile.value
  if (!profile) return
  const result = settings.updateAiProfile(profile.id, { cacheEnabled: value })
  if (!result.ok) {
    ui.notify(result.error ?? '保存失败', 'error')
    return
  }
  if (settings.persistError) ui.notify(settings.persistError, 'error')
}

function activateProfile(profile: AiProfile) {
  settings.activateAiProfile(profile.id)
  if (settings.persistError) {
    ui.notify(settings.persistError, 'error')
    return
  }
  ui.notify(`已切换到「${profile.name}」`, 'success')
}

async function testProfile(profile: AiProfile) {
  testingId.value = profile.id
  delete probeNotes[profile.id]
  const result = await probeAiConfig({
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    cacheEnabled: profile.cacheEnabled,
  })
  testingId.value = null
  probeNotes[profile.id] =
    result.latencyMs !== undefined ? `${result.message}（${result.latencyMs} ms）` : result.message
  ui.notify(`「${profile.name}」${result.message}`, result.ok ? 'success' : 'error')
}

function duplicateProfile(profile: AiProfile) {
  const id = settings.duplicateAiProfile(profile.id)
  if (!id) {
    ui.notify('复制失败：配置不存在', 'error')
    return
  }
  if (settings.persistError) {
    ui.notify(settings.persistError, 'error')
    return
  }
  ui.notify(`已复制「${profile.name}」`, 'success')
}

function askRemove(profile: AiProfile) {
  confirmDeleteId.value = profile.id
}

function confirmRemove() {
  const target = deleteTarget.value
  confirmDeleteId.value = null
  if (!target) return
  settings.removeAiProfile(target.id)
  if (editor.value?.id === target.id) closeEditor()
  if (settings.persistError) {
    ui.notify(settings.persistError, 'error')
    return
  }
  ui.notify(`已删除「${target.name}」`, 'success')
}

/** API Key 掩码：前 3 + **** + 后 4；不把明文放进 DOM 的 title/aria */
function maskKey(key: string): string {
  const k = key.trim()
  if (!k) return '（未填写）'
  if (k.length <= 7) return '****'
  return `${k.slice(0, 3)}****${k.slice(-4)}`
}

function onKeydown(event: KeyboardEvent) {
  const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
  if (!isSave || !editor.value) return
  event.preventDefault()
  submitEditor()
}

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
})

const fileInput = ref<HTMLInputElement | null>(null)

function pickFile() {
  fileInput.value?.click()
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('import', file)
  input.value = ''
}

function regenerateAll() {
  const { total, failed } = archiveStore.regenerateAll()
  const ok = total - failed
  const message = `已按当前绘图程序重新生成：成功 ${ok} 份 / 失败 ${failed} 份`
  const storageError = archiveStore.persistError
  ui.notify(storageError ? `${message}；${storageError}` : message, failed || storageError ? 'error' : 'success')
}
</script>

<template>
  <div class="settings">
    <!-- AI 配置（多套） -->
    <section class="group">
      <header>
        <h2 class="t-title">AI 配置</h2>
        <p class="t-sm">
          可保存多套接口配置并随时切换；配置仅保存在本机 localStorage。应用不内置任何大模型服务，
          调用失败会走错误态并允许重试。
        </p>
      </header>

      <div class="ai-head">
        <p class="t-sm">
          当前配置：<strong>{{ activeProfile?.name ?? '未配置' }}</strong>
        </p>
        <div class="actions">
          <HdToggle
            v-if="activeProfile"
            label="启用本地缓存"
            :model-value="activeProfile.cacheEnabled"
            @update:model-value="toggleActiveCache($event)"
          />
          <HdButton size="sm" @click="openCreate">新增配置</HdButton>
          <HdButton size="sm" variant="ghost" @click="emit('clear-cache')">清空 AI 缓存</HdButton>
        </div>
      </div>

      <p v-if="!settings.aiProfiles.length" class="t-sm ai-empty">
        还没有 AI 配置，新增一条即可在解读面板使用。
      </p>

      <ul v-else class="ai-list">
        <li v-for="profile in settings.aiProfiles" :key="profile.id" class="ai-item">
          <div class="ai-info">
            <div class="ai-title">
              <strong class="ellipsis">{{ profile.name }}</strong>
              <span v-if="profile.id === settings.activeAiId" class="badge">当前</span>
            </div>
            <p class="t-xs t-mono ellipsis">
              {{ profile.model || '（未填模型）' }} · {{ profile.baseUrl || '（未填地址）' }}
            </p>
            <p class="t-xs t-muted">
              Key：{{ maskKey(profile.apiKey) }} · 超时 {{ Math.round(profile.timeoutMs / 1000) }} 秒
            </p>
            <p
              v-if="probeNotes[profile.id]"
              class="t-xs"
              :class="probeNotes[profile.id].startsWith('连通正常') ? 'msg-success' : 'msg-warning'"
            >
              {{ probeNotes[profile.id] }}
            </p>
          </div>
          <div class="ai-actions">
            <HdButton
              size="sm"
              variant="ghost"
              :disabled="profile.id === settings.activeAiId"
              @click="activateProfile(profile)"
            >
              设为当前
            </HdButton>
            <HdButton
              size="sm"
              variant="ghost"
              :loading="testingId === profile.id"
              @click="testProfile(profile)"
            >
              测试
            </HdButton>
            <HdButton size="sm" variant="ghost" @click="openEdit(profile)">编辑</HdButton>
            <HdButton size="sm" variant="ghost" @click="duplicateProfile(profile)">复制</HdButton>
            <HdButton size="sm" variant="danger" @click="askRemove(profile)">删除</HdButton>
          </div>
        </li>
      </ul>

      <!-- 内联新增 / 编辑 -->
      <form v-if="editor" class="ai-editor" @submit.prevent="submitEditor">
        <h3 class="t-sm">{{ editor.id ? '编辑配置' : '新增配置' }}</h3>
        <div class="fields">
          <HdField
            v-model="editor.name"
            label="名称"
            placeholder="例如：公司网关"
            :error="fieldErrors.name"
            @blur="validateField('name')"
          />
          <HdField
            v-model="editor.baseUrl"
            label="接口地址"
            placeholder="https://example.com/v1"
            hint="兼容 OpenAI Chat Completions；可填基础地址或完整的 /chat/completions"
            :error="fieldErrors.baseUrl"
            @blur="validateField('baseUrl')"
          />
          <HdField
            v-model="editor.apiKey"
            label="API Key"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-..."
            autocomplete="off"
            hint="仅保存在本机 localStorage，不上传、不写日志"
            :error="fieldErrors.apiKey"
            @blur="validateField('apiKey')"
          >
            <template #suffix>
              <button type="button" class="t-xs key-toggle" @click="showKey = !showKey">
                {{ showKey ? '隐藏' : '显示' }}
              </button>
            </template>
          </HdField>
          <HdField
            v-model="editor.model"
            label="模型名称"
            placeholder="gpt-4o-mini"
            :error="fieldErrors.model"
            @blur="validateField('model')"
          />
          <HdField
            v-model="editor.timeoutSec"
            label="超时（秒）"
            type="number"
            inputmode="numeric"
            hint="范围 3–600 秒"
            :error="fieldErrors.timeoutSec"
            @blur="validateField('timeoutSec')"
          />
          <div class="field">
            <span class="t-xs">本地缓存</span>
            <HdToggle
              label="相同盘面不重复请求"
              :model-value="editor.cacheEnabled"
              @update:model-value="editor.cacheEnabled = $event"
            />
          </div>
        </div>
        <div class="actions">
          <HdButton type="submit" :disabled="!editorValid">
            {{ editor.id ? '保存修改' : '新增并设为当前' }}
          </HdButton>
          <HdButton variant="ghost" @click="closeEditor">取消</HdButton>
          <span class="t-xs t-muted">快捷键 Ctrl / Cmd + S 保存</span>
        </div>
      </form>
    </section>

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除 AI 配置"
      :desc="deleteTarget ? `确定删除「${deleteTarget.name}」？删除后无法恢复。` : ''"
      confirm-text="删除"
      danger
      @confirm="confirmRemove"
      @cancel="confirmDeleteId = null"
    />

    <!-- 外观 -->
    <section class="group">
      <header>
        <h2 class="t-title">外观</h2>
        <p class="t-sm">深浅色、字号与人体图配色全局生效，立即应用。</p>
      </header>

      <div class="seg">
        <span class="t-sm seg-label">主题</span>
        <div class="seg-ctl" role="group" aria-label="主题">
          <button
            type="button"
            :class="{ on: settings.appearance.theme === 'light' }"
            @click="settings.setTheme('light')"
          >
            浅色
          </button>
          <button
            type="button"
            :class="{ on: settings.appearance.theme === 'dark' }"
            @click="settings.setTheme('dark')"
          >
            深色
          </button>
        </div>
      </div>

      <div class="seg">
        <span class="t-sm seg-label">字号</span>
        <span class="t-xs t-muted">字号已移至下方「样式设置」，提供 6 档可调。</span>
      </div>

      <div class="seg">
        <span class="t-sm seg-label">人体图配色</span>
        <div class="seg-ctl" role="group" aria-label="人体图配色">
          <button
            type="button"
            :class="{ on: settings.appearance.bodyGraphPalette === 'default' }"
            @click="settings.setPalette('default')"
          >
            标准
          </button>
          <button
            type="button"
            :class="{ on: settings.appearance.bodyGraphPalette === 'high-contrast' }"
            @click="settings.setPalette('high-contrast')"
          >
            高对比
          </button>
        </div>
      </div>
    </section>

    <!-- 样式设置 -->
    <section class="group">
      <header>
        <h2 class="t-title">样式设置</h2>
        <p class="t-sm">九中心状态、专业关键字配色与布局全局生效，立即应用。</p>
      </header>

      <!-- 九中心定义 / 开放 -->
      <div class="style-rows">
        <div class="style-row">
          <span class="t-sm row-label">九中心 · 已定义</span>
          <label class="color-pick">
            <input
              type="color"
              :value="settings.appearance.centerDefinedColor"
              @input="settings.setStyle({ centerDefinedColor: ($event.target as HTMLInputElement).value })"
            />
            <span class="t-xs">{{ settings.appearance.centerDefinedColor }}</span>
          </label>
          <HdToggle
            compact
            label="加粗"
            :model-value="settings.appearance.centerDefinedBold"
            @update:model-value="settings.setStyle({ centerDefinedBold: $event })"
          />
        </div>

        <div class="style-row">
          <span class="t-sm row-label">九中心 · 开放</span>
          <label class="color-pick">
            <input
              type="color"
              :value="settings.appearance.centerOpenColor"
              @input="settings.setStyle({ centerOpenColor: ($event.target as HTMLInputElement).value })"
            />
            <span class="t-xs">{{ settings.appearance.centerOpenColor }}</span>
          </label>
          <HdToggle
            compact
            label="加粗"
            :model-value="settings.appearance.centerOpenBold"
            @update:model-value="settings.setStyle({ centerOpenBold: $event })"
          />
        </div>

        <div class="style-row">
          <span class="t-sm row-label">专业关键字<br /><span class="t-xs">（策略、内在权威等）</span></span>
          <label class="color-pick">
            <input
              type="color"
              :value="settings.appearance.keywordColor"
              @input="settings.setStyle({ keywordColor: ($event.target as HTMLInputElement).value })"
            />
            <span class="t-xs">{{ settings.appearance.keywordColor }}</span>
          </label>
        </div>
      </div>

      <!-- 字号：6 档 -->
      <div class="seg">
        <span class="t-sm seg-label">字号</span>
        <div class="seg-ctl" role="group" aria-label="字号档位">
          <button
            v-for="(s, i) in FONT_STEPS"
            :key="s"
            type="button"
            :class="{ on: settings.appearance.fontScale === s }"
            @click="settings.setFontStep(i)"
          >
            {{ FONT_LABELS[i] }}
          </button>
        </div>
      </div>

      <!-- 布局密度 -->
      <div class="seg">
        <span class="t-sm seg-label">完整盘布局</span>
        <div class="seg-ctl" role="group" aria-label="布局密度">
          <button
            v-for="d in DENSITIES"
            :key="d.value"
            type="button"
            :class="{ on: settings.appearance.layoutDensity === d.value }"
            @click="settings.setStyle({ layoutDensity: d.value })"
          >
            {{ d.label }}
          </button>
        </div>
      </div>

      <!-- 图幅档位 -->
      <div class="seg">
        <span class="t-sm seg-label">人体图幅面</span>
        <div class="seg-ctl" role="group" aria-label="图幅档位">
          <button
            v-for="g in GRAPH_SIZES"
            :key="g.value"
            type="button"
            :class="{ on: settings.appearance.graphSize === g.value }"
            @click="settings.setStyle({ graphSize: g.value })"
          >
            {{ g.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- 绘图程序（多版本一键切换） -->
    <section class="group">
      <header>
        <h2 class="t-title">绘图程序</h2>
        <p class="t-sm">
          切换后所有已生成的人类图会立即按新版本重绘；可再点「重新生成全部图表」按新版本重建全部档案数据。
        </p>
      </header>

      <div class="engine-list">
        <button
          v-for="e in DRAWING_ENGINES"
          :key="e.id"
          type="button"
          class="engine"
          :class="{ on: settings.appearance.drawingEngine === e.id }"
          @click="settings.setDrawingEngine(e.id)"
        >
          <strong>{{ e.label }}</strong>
          <span class="t-xs">{{ e.note }}</span>
        </button>
      </div>

      <div class="engine-actions">
        <HdButton size="sm" variant="ghost" @click="regenerateAll">
          重新生成全部图表
        </HdButton>
        <span class="t-xs t-muted">共 {{ archiveStore.archives.length }} 份档案</span>
      </div>
    </section>

    <!-- 数据 -->
    <section class="group">
      <header>
        <h2 class="t-title">数据</h2>
        <p class="t-sm">
          所有档案保存在本机浏览器存储中。导出文件包含出生时间与地点，请自行保管；不含身份证号。
        </p>
      </header>

      <div class="actions">
        <HdButton variant="ghost" @click="emit('export')">导出备份</HdButton>
        <HdButton variant="ghost" @click="pickFile">导入备份</HdButton>
        <HdButton variant="danger" @click="emit('clear-all')">清空全部档案</HdButton>
        <input ref="fileInput" type="file" accept="application/json" hidden @change="onFile" />
      </div>
    </section>

    <!-- 计算精度 -->
    <section class="group">
      <header>
        <h2 class="t-title">计算精度</h2>
      </header>
      <dl class="precision">
        <div>
          <dt class="t-sm">星体度数</dt>
          <dd class="t-data">保留 2 位小数（xx.xx°）</dd>
        </div>
        <div>
          <dt class="t-sm">闸门内细分</dt>
          <dd class="t-data">爻 1–6 / 颜色 1–6 / 音调 1–6 / 基底 1–5 全量输出</dd>
        </div>
        <div>
          <dt class="t-sm">时间基准</dt>
          <dd class="t-data">本地民用时 → IANA 时区（含历史夏令时）→ UTC</dd>
        </div>
        <div>
          <dt class="t-sm">Design 时刻</dt>
          <dd class="t-data">太阳视黄经回推 88°（精确求解，非固定 88 天）</dd>
        </div>
        <div>
          <dt class="t-sm">星历</dt>
          <dd class="t-data">astronomy-engine（VSOP87），真交点用 Meeus 47 章解析式</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  max-width: 720px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

header h2 {
  margin-bottom: 4px;
}

header p {
  color: var(--text-secondary);
  max-width: 60ch;
}

.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.seg {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.seg-label {
  width: 84px;
  color: var(--text-secondary);
  flex: none;
}

.seg-ctl {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  gap: 2px;
}

.seg-ctl button {
  min-height: 30px;
  padding: 0 var(--sp-3);
  border-radius: 7px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.seg-ctl button.on {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: var(--elev-card);
}

.precision {
  display: grid;
  gap: var(--sp-2);
  margin: 0;
}

.precision div {
  display: flex;
  gap: var(--sp-3);
  align-items: baseline;
  flex-wrap: wrap;
}

.precision dt {
  width: 96px;
  flex: none;
  color: var(--text-secondary);
}

.precision dd {
  margin: 0;
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .fields {
    grid-template-columns: 1fr;
  }
  .seg-label {
    width: 100%;
  }
}

.engine-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--sp-2);
}

.engine {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--sp-3);
  text-align: left;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-soft);
  transition:
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}

.engine:hover {
  border-color: var(--border-strong);
}

.engine.on {
  border-color: var(--owner-shared);
  background: rgba(124, 58, 237, 0.1);
}

.engine strong {
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.engine .t-xs {
  color: var(--text-muted);
  line-height: 1.5;
}

.engine-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

/* 样式设置 */
.style-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.style-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.row-label {
  width: 132px;
  flex: none;
  color: var(--text-secondary);
  line-height: 1.3;
}

.color-pick {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.color-pick input[type='color'] {
  width: 34px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
}

/* ── 多 AI 配置 ─────────────────────────────── */
.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.ai-head strong {
  color: var(--text-primary);
}

.ai-empty {
  padding: var(--sp-3);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.ai-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.ai-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.ai-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.ai-title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}

.ai-title strong {
  font-size: calc(var(--fs-body) * var(--font-scale));
}

.badge {
  flex: none;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--action-primary);
  color: var(--surface);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
:root[data-theme='dark'] .badge {
  color: #16181d;
}

.ai-info .ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-actions {
  display: flex;
  gap: var(--sp-1);
  flex-wrap: wrap;
  flex: none;
}

.ai-editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.key-toggle {
  flex: none;
  min-height: 28px;
  padding: 0 var(--sp-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

</style>
