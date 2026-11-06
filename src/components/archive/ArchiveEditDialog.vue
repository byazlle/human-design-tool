<script setup lang="ts">
/** 档案编辑弹窗：改名 / 调整出生日期时间 / 修改出生地经纬度与地点 */
import { computed, reactive, watch } from 'vue'
import type { Archive } from '../../types/hd'
import { useArchiveStore } from '../../stores/archive'
import { useUiStore } from '../../stores/ui'
import { validateBirth } from '../../services/validate'
import HdButton from '../base/HdButton.vue'

const props = defineProps<{ open: boolean; archive: Archive | null }>()
const emit = defineEmits<{ close: [] }>()

const archiveStore = useArchiveStore()
const ui = useUiStore()

const form = reactive({
  name: '',
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  timezone: 'Asia/Shanghai',
  place: '',
  lat: 31.23,
  lng: 121.47,
})

watch(
  () => props.open,
  (open) => {
    if (!open || !props.archive) return
    const a = props.archive
    form.name = a.name
    form.year = a.birth.year
    form.month = a.birth.month
    form.day = a.birth.day
    form.hour = a.birth.hour
    form.minute = a.birth.minute
    form.timezone = a.timezone
    form.place = a.location.place
    form.lat = a.location.lat
    form.lng = a.location.lng
  },
  { immediate: true },
)

/**
 * 校验统一走 `validateBirth`（与导入/计算层同一套规则）：
 * 含按月天数（2 月 31 日会被拒）、年份 1900–2100、时区可识别等。
 */
const birthIssues = computed<string[]>(() =>
  validateBirth({
    year: Number(form.year),
    month: Number(form.month),
    day: Number(form.day),
    hour: Number(form.hour),
    minute: Number(form.minute),
    second: props.archive?.birth.second ?? 0,
    timezone: form.timezone,
  }),
)

/** 把整体校验结果按字段归位，供行内提示使用 */
const fieldErrors = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const msg of birthIssues.value) {
    if (msg.includes('年份')) map.year ??= msg
    else if (msg.includes('月份')) map.month ??= msg
    else if (msg.includes('日期')) map.day ??= msg
    else if (msg.includes('小时')) map.hour ??= msg
    else if (msg.includes('分钟')) map.minute ??= msg
    else if (msg.includes('时区')) map.timezone ??= msg
    else map.common ??= msg
  }
  return map
})

const nameError = computed(() => (form.name.trim() ? '' : '请填写名称'))
const valid = computed(() => !nameError.value && birthIssues.value.length === 0)

function save() {
  if (!props.archive || !valid.value) return
  archiveStore.update(props.archive.id, {
    name: form.name.trim(),
    birth: {
      year: Number(form.year),
      month: Number(form.month),
      day: Number(form.day),
      hour: Number(form.hour),
      minute: Number(form.minute),
      second: props.archive.birth.second ?? 0,
    },
    timezone: form.timezone.trim() || 'Asia/Shanghai',
    location: {
      place: form.place.trim() || '未知地点',
      lat: Number(form.lat),
      lng: Number(form.lng),
    },
  })
  ui.notify(archiveStore.persistError ?? '已保存，盘面已按新出生信息重算', archiveStore.persistError ? 'error' : 'success')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="mask" @click="emit('close')" />
    </Transition>
    <Transition name="pop">
      <section v-if="open" class="dialog" role="dialog" aria-modal="true" aria-label="编辑档案">
        <header class="head">
          <h2 class="t-title">编辑档案</h2>
          <button type="button" class="close" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="body">
          <label class="field" :class="{ 'has-error': nameError }">
            <span class="t-xs">姓名 / 标题</span>
            <input v-model="form.name" type="text" maxlength="24" />
            <span v-if="nameError" class="t-xs msg-error">{{ nameError }}</span>
          </label>

          <div class="grid3">
            <label class="field" :class="{ 'has-error': fieldErrors.year }">
              <span class="t-xs">年</span>
              <input v-model.number="form.year" type="number" min="1901" max="2099" />
              <span v-if="fieldErrors.year" class="t-xs msg-error">{{ fieldErrors.year }}</span>
            </label>
            <label class="field" :class="{ 'has-error': fieldErrors.month }">
              <span class="t-xs">月</span>
              <input v-model.number="form.month" type="number" min="1" max="12" />
              <span v-if="fieldErrors.month" class="t-xs msg-error">{{ fieldErrors.month }}</span>
            </label>
            <label class="field" :class="{ 'has-error': fieldErrors.day }">
              <span class="t-xs">日</span>
              <input v-model.number="form.day" type="number" min="1" max="31" />
              <span v-if="fieldErrors.day" class="t-xs msg-error">{{ fieldErrors.day }}</span>
            </label>
          </div>

          <div class="grid2">
            <label class="field" :class="{ 'has-error': fieldErrors.hour }">
              <span class="t-xs">时</span>
              <input v-model.number="form.hour" type="number" min="0" max="23" />
              <span v-if="fieldErrors.hour" class="t-xs msg-error">{{ fieldErrors.hour }}</span>
            </label>
            <label class="field" :class="{ 'has-error': fieldErrors.minute }">
              <span class="t-xs">分</span>
              <input v-model.number="form.minute" type="number" min="0" max="59" />
              <span v-if="fieldErrors.minute" class="t-xs msg-error">{{ fieldErrors.minute }}</span>
            </label>
          </div>

          <label class="field" :class="{ 'has-error': fieldErrors.timezone }">
            <span class="t-xs">时区</span>
            <input v-model="form.timezone" type="text" placeholder="Asia/Shanghai" />
            <span v-if="fieldErrors.timezone" class="t-xs msg-error">{{ fieldErrors.timezone }}</span>
          </label>

          <p v-if="fieldErrors.common" class="t-xs msg-error">{{ fieldErrors.common }}</p>

          <label class="field">
            <span class="t-xs">出生地</span>
            <input v-model="form.place" type="text" placeholder="城市名" />
          </label>

          <div class="grid2">
            <label class="field">
              <span class="t-xs">纬度</span>
              <input v-model.number="form.lat" type="number" step="0.01" />
            </label>
            <label class="field">
              <span class="t-xs">经度</span>
              <input v-model.number="form.lng" type="number" step="0.01" />
            </label>
          </div>

          <p class="t-xs hint">修改出生信息后会重新计算整张盘；如需保留原图，请先「复制为副本」。</p>
        </div>

        <footer class="foot">
          <HdButton variant="ghost" @click="emit('close')">取消</HdButton>
          <HdButton :disabled="!valid" @click="save">保存并重算</HdButton>
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
  top: calc(50% + var(--chrome-h) / 2);
  transform: translate(-50%, -50%);
  width: min(460px, 92vw);
  max-height: min(86vh, 720px);
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

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* 行内校验失败：输入框描边变红（U-24） */
.field.has-error input {
  border-color: var(--status-error);
}

.field input {
  height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: calc(var(--fs-sm) * var(--font-scale));
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

.grid3 {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: var(--sp-2);
}

.hint {
  color: var(--text-muted);
  line-height: 1.6;
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--border);
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
</style>
