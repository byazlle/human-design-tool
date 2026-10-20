<script setup lang="ts">
/** 设置面板：AI 接口 / 外观 / 数据 / 计算精度（DESIGN.md §4.12） */
import { ref, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import HdField from '../base/HdField.vue'
import HdToggle from '../base/HdToggle.vue'
import HdButton from '../base/HdButton.vue'

const emit = defineEmits<{
  export: []
  import: [file: File]
  'clear-cache': []
  'clear-all': []
}>()

const settings = useSettingsStore()

const form = ref({
  baseUrl: settings.ai.baseUrl,
  apiKey: settings.ai.apiKey,
  model: settings.ai.model,
  timeoutMs: String(settings.ai.timeoutMs),
})

const saved = ref(false)

watch(
  () => settings.ai,
  (ai) => {
    form.value = {
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      model: ai.model,
      timeoutMs: String(ai.timeoutMs),
    }
  },
  { deep: true },
)

function save() {
  settings.saveAi({
    baseUrl: form.value.baseUrl.trim(),
    apiKey: form.value.apiKey.trim(),
    model: form.value.model.trim(),
    timeoutMs: Math.min(300000, Math.max(3000, Number(form.value.timeoutMs) || 60000)),
  })
  saved.value = true
  window.setTimeout(() => (saved.value = false), 2000)
}

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

const fontScaleLabel = () => {
  const s = settings.appearance.fontScale
  if (s <= 0.95) return '小'
  if (s >= 1.15) return '大'
  return '标准'
}
</script>

<template>
  <div class="settings">
    <!-- AI 接口 -->
    <section class="group">
      <header>
        <h2 class="t-title">AI 接口</h2>
        <p class="t-sm">
          仅保存配置、全局生效。应用不内置任何大模型服务，也不做连通性验证；调用失败会走错误态并允许重试。
        </p>
      </header>

      <div class="fields">
        <HdField
          v-model="form.baseUrl"
          label="接口地址"
          placeholder="https://example.com/v1"
          hint="兼容 OpenAI Chat Completions；可填基础地址或完整的 /chat/completions"
        />
        <HdField
          v-model="form.apiKey"
          label="API Key"
          type="password"
          placeholder="sk-..."
          autocomplete="off"
          hint="仅保存在本机 localStorage，不上传、不写日志"
        />
        <HdField v-model="form.model" label="模型名称" placeholder="gpt-4o-mini" />
        <HdField
          v-model="form.timeoutMs"
          label="超时（毫秒）"
          type="number"
          inputmode="numeric"
          hint="默认 60000，范围 3000–300000"
        />
      </div>

      <div class="row-between">
        <HdToggle
          label="启用本地缓存（相同盘面不重复请求）"
          :model-value="settings.ai.cacheEnabled"
          @update:model-value="settings.saveAi({ cacheEnabled: $event })"
        />
      </div>

      <div class="actions">
        <HdButton @click="save">{{ saved ? '已保存' : '保存配置' }}</HdButton>
        <HdButton variant="ghost" @click="emit('clear-cache')">清空 AI 缓存</HdButton>
      </div>
    </section>

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
        <div class="seg-ctl" role="group" aria-label="字号">
          <button type="button" :class="{ on: settings.appearance.fontScale <= 0.95 }" @click="settings.setFontScale(0.92)">
            小
          </button>
          <button
            type="button"
            :class="{ on: settings.appearance.fontScale > 0.95 && settings.appearance.fontScale < 1.15 }"
            @click="settings.setFontScale(1)"
          >
            标准
          </button>
          <button type="button" :class="{ on: settings.appearance.fontScale >= 1.15 }" @click="settings.setFontScale(1.2)">
            大
          </button>
        </div>
        <span class="t-xs t-muted">当前：{{ fontScaleLabel() }}</span>
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
</style>
