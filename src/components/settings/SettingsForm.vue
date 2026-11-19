<script setup lang="ts">
/** 设置面板：AI 配置（多套）/ 外观 / 数据 / 计算精度（DESIGN.md §4.12） */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useSettingsStore, takeConcurrencyMigrationNotice } from '../../stores/settings'
import { useArchiveStore } from '../../stores/archive'
import { useUiStore } from '../../stores/ui'
import { fetchAiModels, probeAiConfig, validateAiConfig } from '../../services/aiClient'
import { validateMaxConcurrency } from '../../services/aiConcurrency'
import type { AiDetailMode, AiProfile, AiStyle } from '../../types/hd'
import ConfirmDialog from '../base/ConfirmDialog.vue'
import HdField from '../base/HdField.vue'
import HdToggle from '../base/HdToggle.vue'
import HdButton from '../base/HdButton.vue'
import AiConcurrencyField from '../ai/AiConcurrencyField.vue'
import CustomLayoutEditor from './CustomLayoutEditor.vue'

const FONT_STEPS = [0.85, 0.92, 1, 1.1, 1.2, 1.35] as const
const FONT_LABELS = ['特小', '偏小', '标准', '稍大', '大', '特大'] as const
/** 超时预设档位（秒）：用户 Q4.3 确认 60/300/900/1800/3600 + 可手填 */
const TIMEOUT_PRESETS = [60, 300, 900, 1800, 3600] as const

const emit = defineEmits<{
  export: []
  import: [file: File]
  'clear-cache': []
  'clear-all': []
}>()

const settings = useSettingsStore()
const archiveStore = useArchiveStore()
const ui = useUiStore()

/* ── 最高并发数（v4.0.0 单旋钮）────────────────────────
 * v3.5.0 的「AI 并发数 + 并发上限」两个旋钮已合并为一个 aiMaxConcurrency（1–99）。
 * 唯一写入闸门是 stores/settings.ts 的 setAiMaxConcurrency；这里只做输入 + 行内反馈。
 */

const concurrencyInput = ref(settings.aiMaxConcurrency)
/** 与 detailModeError 分开管理，避免串台；错误条常驻直到用户处理（FB-3） */
const concurrencyError = ref('')
const concurrencyNotSaved = ref(false)

/** 失焦只做行内预校验：不写 store、不写 localStorage、不发 toast */
function validateConcurrencyField() {
  concurrencyError.value = validateMaxConcurrency(concurrencyInput.value) ?? ''
}

/** BT-5：300ms 内连点只生效 1 次 */
let lastConcurrencySaveAt = 0

function saveConcurrency() {
  const now = Date.now()
  if (now - lastConcurrencySaveAt < 300) return
  lastConcurrencySaveAt = now
  const error = validateMaxConcurrency(concurrencyInput.value)
  if (error) {
    concurrencyError.value = error
    concurrencyNotSaved.value = true
    ui.notify(`保存失败：${error}`, 'error')
    return
  }
  const ok = settings.setAiMaxConcurrency(concurrencyInput.value)
  if (!ok) {
    concurrencyError.value = settings.persistError || '保存失败，设置未生效'
    concurrencyNotSaved.value = true
    ui.notify(`保存失败：${concurrencyError.value}`, 'error')
    return
  }
  concurrencyError.value = ''
  concurrencyNotSaved.value = false
  ui.notify('最高并发数已保存', 'success')
}

// 用户输入变化时清掉上一次的错误 / 未保存标记，直到再次提交
watch(concurrencyInput, () => {
  concurrencyError.value = ''
  concurrencyNotSaved.value = false
})
// setter 生效后把输入同步为规范值
watch(
  () => settings.aiMaxConcurrency,
  (v) => {
    concurrencyInput.value = v
  },
)

// AC-C3 / ARCH §5.3：存量配置被归一后，给一次可见提示（消费即清）
onMounted(() => {
  const notice = takeConcurrencyMigrationNotice()
  if (notice) ui.notify(notice, 'info')
})

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

/* ── 解读详细度（v4.0.0 口径：精简只讲倾向 / 详细依据前置 / 完整分模块）── */

const DETAIL_MODES: Array<{ value: AiDetailMode; label: string; hint: string }> = [
  {
    value: 'concise',
    label: '精简',
    hint: '600–900 字，只描述日常倾向、不做事实性断言；一次覆盖多个模块时按条目数放大篇幅（默认）',
  },
  {
    value: 'detailed',
    label: '详细',
    hint: '5000–10000 字（硬上限 20000）：每条结论都必须前置依据，并写出对应的通道 / 闸门 / 中心',
  },
  {
    value: 'full',
    label: '完整',
    hint: '分模块多次请求、无字数上限：每个分项一篇，最后单独做一次融合；请求数见工作区的「预计请求数」',
  },
]

/** 写入失败（localStorage 不可用）时在这里提示，成功则清空 */
const detailModeError = ref('')

function setDetailMode(mode: AiDetailMode) {
  if (settings.aiDetailMode === mode) return
  const ok = settings.setAiDetailMode(mode)
  detailModeError.value = ok ? '' : settings.persistError || '保存失败，设置未生效'
}

/* ── 表达风格（v4.0.0：替代旧「面向人群」，值不变、语义反转）────────── */

const STYLES: Array<{ value: AiStyle; label: string; hint: string }> = [
  {
    value: 'plain',
    label: '零基础（大白话）',
    hint: '全程口语，每 200 字给一个具体例子或生活场景；结论不加不减，只是换成能听懂的话',
  },
  {
    value: 'pro',
    label: '专业（使用并阐释术语）',
    hint: '使用类型 / 权威 / 闸门 / 通道等术语，但每个术语第一次出现必须先定义并给出本盘取值',
  },
]

const styleError = ref('')

function setStyle(style: AiStyle) {
  if (settings.aiStyle === style) return
  const ok = settings.setAiStyle(style)
  styleError.value = ok ? '' : settings.persistError || '保存失败，设置未生效'
}

/* ── 自动获取模型列表（v2.5.0）────────────────────────── */

/** 'editor' 表示编辑表单里的配置，其余值为某条已保存配置的 id */
const modelPickerFor = ref<string | null>(null)
const modelOptions = ref<string[]>([])
const modelNote = ref('')
const modelLoading = ref<string | null>(null)

async function loadModels(target: string) {
  const cfg =
    target === 'editor'
      ? editor.value
        ? {
            baseUrl: editor.value.baseUrl,
            apiKey: editor.value.apiKey,
            timeoutMs: Math.round(Number(editor.value.timeoutSec) * 1000) || 15000,
          }
        : null
      : settings.aiProfiles.find((p) => p.id === target)
  if (!cfg) return
  modelPickerFor.value = target
  modelOptions.value = []
  modelNote.value = ''
  if (!cfg.baseUrl.trim() || !cfg.apiKey.trim()) {
    modelNote.value = '请先填写接口地址与 API Key'
    return
  }
  modelLoading.value = target
  try {
    const result = await fetchAiModels({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      timeoutMs: cfg.timeoutMs,
    })
    modelOptions.value = result.models
    modelNote.value = result.message
  } finally {
    modelLoading.value = null
  }
}

function pickModel(model: string) {
  const target = modelPickerFor.value
  if (!target) return
  if (target === 'editor') {
    if (editor.value) editor.value.model = model
  } else {
    const result = settings.updateAiProfile(target, { model })
    if (!result.ok || settings.persistError) {
      ui.notify(result.error ?? settings.persistError ?? '保存失败', 'error')
      return
    }
  }
  delete fieldErrors.model
  modelPickerFor.value = null
  ui.notify(`已选择模型 ${model}`, 'success')
}

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
    if (!Number.isFinite(sec) || sec < 3 || sec > 3600) {
      fieldErrors.timeoutSec = '超时需在 3–3600 秒之间'
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
  if (!Number.isFinite(sec) || sec < 3 || sec > 3600) return false
  const config = editorConfig()
  return config ? validateAiConfig(config) === null : false
})

function setTimeoutPreset(sec: number) {
  if (!editor.value) return
  editor.value.timeoutSec = String(sec)
  delete fieldErrors.timeoutSec
}

function submitEditor() {
  const e = editor.value
  if (!e) return
  clearFieldErrors()
  if (!e.name.trim()) {
    fieldErrors.name = '请填写配置名称'
    return
  }
  const sec = Number(e.timeoutSec)
  if (!Number.isFinite(sec) || sec < 3 || sec > 3600) {
    fieldErrors.timeoutSec = '超时需在 3–3600 秒之间'
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
  const message = `已按当前内核重新生成：成功 ${ok} 份 / 失败 ${failed} 份`
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
            <div v-if="modelPickerFor === profile.id && (modelNote || modelOptions.length)" class="model-picker">
              <p class="t-xs" :class="modelOptions.length ? 'msg-success' : 'msg-warning'">{{ modelNote }}</p>
              <div v-if="modelOptions.length" class="preset-row">
                <button
                  v-for="m in modelOptions"
                  :key="m"
                  type="button"
                  class="preset-btn"
                  :class="{ on: profile.model === m }"
                  :title="`设为模型 ${m}`"
                  @click="pickModel(m)"
                >
                  {{ m }}
                </button>
              </div>
            </div>
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
            <HdButton
              size="sm"
              variant="ghost"
              :loading="modelLoading === profile.id"
              @click="loadModels(profile.id)"
            >
              获取模型
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
            placeholder="可点右侧按钮自动获取，也可手填"
            :error="fieldErrors.model"
            @blur="validateField('model')"
          >
            <template #suffix>
              <button
                type="button"
                class="t-xs key-toggle"
                :disabled="modelLoading === 'editor'"
                @click="loadModels('editor')"
              >
                {{ modelLoading === 'editor' ? '获取中…' : '自动获取' }}
              </button>
            </template>
          </HdField>
          <div v-if="modelPickerFor === 'editor' && (modelNote || modelOptions.length)" class="field model-picker">
            <span class="t-xs" :class="modelOptions.length ? 'msg-success' : 'msg-warning'">{{ modelNote }}</span>
            <div v-if="modelOptions.length" class="preset-row">
              <button
                v-for="m in modelOptions"
                :key="m"
                type="button"
                class="preset-btn"
                :class="{ on: editor.model === m }"
                :title="`填入模型 ${m}`"
                @click="pickModel(m)"
              >
                {{ m }}
              </button>
            </div>
          </div>
          <HdField
            v-model="editor.timeoutSec"
            label="超时（秒）"
            type="number"
            inputmode="numeric"
            hint="范围 3–3600 秒；完整版多轮解读建议 ≥900 秒"
            :error="fieldErrors.timeoutSec"
            @blur="validateField('timeoutSec')"
          />
          <div class="field timeout-presets">
            <span class="t-xs">常用档位（秒）</span>
            <div class="preset-row">
              <button
                v-for="s in TIMEOUT_PRESETS"
                :key="s"
                type="button"
                class="preset-btn"
                :class="{ on: Number(editor.timeoutSec) === s }"
                @click="setTimeoutPreset(s)"
              >
                {{ s }}
              </button>
            </div>
          </div>
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

      <!-- 解读详细度：三档 + 表达风格 + 最高并发数（v4.0.0 单旋钮） -->
      <div class="detail-mode">
        <div class="dm-head">
          <strong class="t-sm">解读详细度</strong>
          <span class="t-xs t-muted">
            精简：只描述日常倾向、不做事实性断言；详细：5000–10000 字，每条结论前置依据与对应的通道 / 闸门 / 中心；
            完整：分模块多次请求、无字数上限，最后一个请求单独做融合（请求数见 AI 工作区的「预计请求数」）。
          </span>
        </div>
        <div class="dm-options">
          <button
            v-for="opt in DETAIL_MODES"
            :key="opt.value"
            type="button"
            class="dm-option"
            :class="{ on: settings.aiDetailMode === opt.value }"
            :aria-pressed="settings.aiDetailMode === opt.value"
            @click="setDetailMode(opt.value)"
          >
            <strong>{{ opt.label }}</strong>
            <span class="t-xs">{{ opt.hint }}</span>
          </button>
        </div>

        <!-- 表达风格（v4.0.0：替代旧「面向人群」两块；值不变、语义反转） -->
        <div class="style-settings">
          <span class="t-sm">表达风格</span>
          <span class="t-xs t-muted">
            只影响 AI 解读的用词与解释深度，结论判断与字数契约不变；切换后会另存一份缓存与解读记录，
            不会覆盖另一版的解读。
          </span>
          <div class="dm-options">
            <button
              v-for="s in STYLES"
              :key="s.value"
              type="button"
              class="dm-option"
              :class="{ on: settings.aiStyle === s.value }"
              :aria-pressed="settings.aiStyle === s.value"
              @click="setStyle(s.value)"
            >
              <strong>{{ s.label }}</strong>
              <span class="t-xs">{{ s.hint }}</span>
            </button>
          </div>
          <p v-if="styleError" class="t-xs msg-warning">{{ styleError }}</p>
        </div>

        <!-- 最高并发数（v4.0.0 单旋钮：同时是「同时跑几个」与「上限」）-->
        <div class="concurrency-settings">
          <span class="t-sm">最高并发数</span>
          <span class="t-xs t-muted">
            仅「完整」档的多模块请求与批量生成生效：每秒发起 1 个请求，达到上限后完成一个补一个；
            设为 1 就是串行。解读的 token 上限已取消，不再限制输出长度。
          </span>
          <div class="concurrency-field">
            <AiConcurrencyField v-model="concurrencyInput" :error="concurrencyError" />
          </div>
          <div class="actions">
            <HdButton size="sm" @click="saveConcurrency">保存最高并发数</HdButton>
          </div>
          <p v-if="concurrencyNotSaved" class="t-xs msg-warning">配置未保存</p>
        </div>

        <p v-if="detailModeError" class="t-xs msg-warning">{{ detailModeError }}</p>
      </div>
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
        <p class="t-sm">深浅色与字号全局生效，立即应用。</p>
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
        <span class="t-xs t-muted">在下方「样式设置」调整，提供 6 档。</span>
      </div>
    </section>

    <!-- 样式设置 -->
    <section class="group">
      <header>
        <h2 class="t-title">字号</h2>
        <p class="t-sm">字号全局生效，立即应用；页面模块排布请在「自定义页面布局」中调整。</p>
      </header>

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

    </section>

    <!-- 自定义页面布局（#4：唯一布局入口，替代原「完整盘布局 / 人体图幅面 / 首页缩放」） -->
    <section class="group">
      <header>
        <h2 class="t-title">自定义页面布局</h2>
        <p class="t-sm">
          自由摆放、缩放并固定单盘页的 7 个模块；配置全局一份、保存在本机，电脑端所有盘面统一生效。
          手机端固定退化为单列流，自定义坐标不生效。
        </p>
      </header>
      <CustomLayoutEditor />
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
        <HdButton variant="ghost" @click="emit('export')">导出备份（档案 JSON）</HdButton>
        <HdButton variant="ghost" @click="pickFile">导入备份</HdButton>
        <HdButton size="sm" variant="ghost" @click="regenerateAll">重新生成全部图表</HdButton>
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

/* ── 解读详细度 ─────────────────────────────── */
.detail-mode {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border);
}

.dm-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dm-head strong {
  color: var(--text-primary);
}

.dm-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-2);
}

.dm-option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--glass-bg-soft);
  text-align: left;
  color: var(--text-secondary);
  transition:
    border-color var(--dur-fast) ease,
    background var(--dur-fast) ease;
}

.dm-option strong {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
}

.dm-option:hover {
  border-color: var(--border-strong);
}

.dm-option.on {
  border-color: var(--action-primary);
  background: rgba(63, 58, 168, 0.1);
}

.step-mode,
.audience-settings,
.budget-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

/* ── v2.5.0：token 预算输入 / 模型选择列表 ───────────── */
.budget-field {
  display: grid;
  grid-template-columns: minmax(0, 280px);
}

.model-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 190px;
  overflow-y: auto;
}

/* ── 并发设置（T-C3）：复用既有变量与 HdField，不新增 CSS 变量 ── */
.concurrency-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
}

.concurrency-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

@media (max-width: 768px) {
  .concurrency-fields {
    grid-template-columns: 1fr;
  }
}

.timeout-presets {
  gap: 6px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-btn {
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}

.preset-btn.on {
  border-color: var(--action-primary);
  color: var(--text-primary);
  background: rgba(63, 58, 168, 0.1);
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
