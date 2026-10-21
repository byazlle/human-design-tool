<script setup lang="ts">
/**
 * 录入页（DESIGN.md §5.4 / §4.11）
 * 桌面双栏「表单 + 实时预览」；手机单栏「身份证快捷 / 手动录入」二选一。
 * 关键约束：身份证不含出生时间，时分必须手填并给出 warning 提示。
 */
import { computed, reactive, ref, watch } from 'vue'

import { useDrawingEngine } from '../composables/useDrawingEngine'
const engine = useDrawingEngine()
import { useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import { parseIdCard } from '../services/idcard'
import { PROVINCES, CITIES, resolveRegion } from '../data/regions'
import { computeChart } from '../engine/bodygraph'
import { TYPE_LABELS, AUTHORITY_LABELS, type BodyGraph } from '../types/hd'
import AppToolbar from '../components/base/AppToolbar.vue'
import HdField from '../components/base/HdField.vue'
import HdButton from '../components/base/HdButton.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'

const router = useRouter()
const archiveStore = useArchiveStore()
const settings = useSettingsStore()
const ui = useUiStore()
const { isMobile } = useBreakpoint()

const TIMEZONES = [
  { value: 'Asia/Shanghai', label: '中国标准时间（UTC+8）' },
  { value: 'Asia/Hong_Kong', label: '中国香港（UTC+8）' },
  { value: 'Asia/Macau', label: '中国澳门（UTC+8）' },
  { value: 'Asia/Taipei', label: '中国台湾（UTC+8）' },
  { value: 'Asia/Tokyo', label: '日本（UTC+9）' },
  { value: 'Asia/Seoul', label: '韩国（UTC+9）' },
  { value: 'Asia/Singapore', label: '新加坡（UTC+8）' },
  { value: 'Europe/London', label: '英国（伦敦）' },
  { value: 'Europe/Paris', label: '中欧（巴黎）' },
  { value: 'Europe/Berlin', label: '中欧（柏林）' },
  { value: 'America/New_York', label: '美东（纽约）' },
  { value: 'America/Chicago', label: '美中（芝加哥）' },
  { value: 'America/Denver', label: '美山（丹佛）' },
  { value: 'America/Los_Angeles', label: '美西（洛杉矶）' },
  { value: 'Australia/Sydney', label: '澳洲（悉尼）' },
  { value: 'Pacific/Auckland', label: '新西兰（奥克兰）' },
  { value: 'UTC', label: 'UTC' },
]

const mode = ref<'manual' | 'id'>('manual')

const form = reactive({
  name: '',
  gender: 'other' as 'male' | 'female' | 'other',
  birthDate: '',
  birthTime: '',
  timezone: 'Asia/Shanghai',
  provinceCode: '31',
  cityCode: '3101',
  place: '',
  idNumber: '',
  consent: false,
})

const errors = reactive<Record<string, string>>({})
const parseNote = ref('')
const idWarning = ref(false)

const provinceCities = computed(() => CITIES.filter((c) => c.code.startsWith(form.provinceCode)))

watch(
  () => form.provinceCode,
  () => {
    const first = provinceCities.value[0]
    form.cityCode = first ? first.code : ''
  },
)

const location = computed(() => {
  const city = CITIES.find((c) => c.code === form.cityCode)
  if (city) return { lat: city.lat, lng: city.lng, place: form.place || `${city.name}` }
  const province = PROVINCES.find((p) => p.code === form.provinceCode)
  return province
    ? { lat: province.lat, lng: province.lng, place: form.place || province.name }
    : { lat: 0, lng: 0, place: form.place }
})

interface Draft {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parseDraft(): { draft: Draft | null; error?: string } {
  if (!form.birthDate) return { draft: null, error: '请选择出生日期' }
  const [y, m, d] = form.birthDate.split('-').map(Number)
  if (!form.birthTime) return { draft: null, error: '请填写出生时间（时分）' }
  const parts = form.birthTime.split(':').map(Number)
  const [hh, mm, ss] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  if ([hh, mm, ss].some((v) => Number.isNaN(v))) return { draft: null, error: '时间格式不正确' }
  if (hh > 23 || mm > 59 || ss > 59) return { draft: null, error: '时间超出范围' }

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth) {
    return { draft: null, error: '出生日期不合法（如 2 月 30 日）' }
  }
  if (y < 1900 || y > new Date().getFullYear()) {
    return { draft: null, error: '出生年份需在 1900 年至今之间' }
  }
  return { draft: { year: y, month: m, day: d, hour: hh, minute: mm, second: ss } }
}

/** 实时预览：输入合法即算，异常静默（不打扰输入过程） */
const preview = computed<BodyGraph | null>(() => {
  const { draft } = parseDraft()
  if (!draft) return null
  try {
    return computeChart({ ...draft, timezone: form.timezone, lat: location.value.lat, lng: location.value.lng })
  } catch {
    return null
  }
})

function onParseId() {
  const result = parseIdCard(form.idNumber)
  if (!result.ok) {
    parseNote.value = result.message ?? '解析失败'
    idWarning.value = false
    return
  }
  if (result.birth) {
    form.birthDate = `${result.birth.year}-${String(result.birth.month).padStart(2, '0')}-${String(result.birth.day).padStart(2, '0')}`
  }
  if (result.gender) form.gender = result.gender
  if (result.regionCode) {
    const region = resolveRegion(result.regionCode)
    if (region) {
      form.place = region.name
      const city = CITIES.find((c) => c.code === result.regionCode!.slice(0, 4))
      if (city) {
        form.provinceCode = city.code.slice(0, 2)
        form.cityCode = city.code
      } else {
        form.provinceCode = result.regionCode.slice(0, 2)
      }
      form.timezone = region.timezone
    }
  }
  parseNote.value = result.message ?? '已解析出出生日期与地区，出生时间需手动填写'
  idWarning.value = !form.birthTime
}

function submit() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = '请填写姓名或昵称'
  const { draft, error } = parseDraft()
  if (!draft) {
    errors.birthDate = error ?? '出生信息不完整'
    ui.notify(error ?? '出生信息不完整', 'error')
    return
  }
  if (mode.value === 'id' && !form.consent) {
    errors.consent = '请先阅读并同意隐私说明'
    return
  }

  try {
    const archive = archiveStore.create({
      name: form.name,
      gender: form.gender,
      birth: draft,
      timezone: form.timezone,
      location: location.value,
    })
    ui.notify('已生成人类图', 'success')
    if (isMobile.value) router.push(`/archive/${archive.id}`)
    else router.push(`/archive/${archive.id}`)
  } catch (err) {
    ui.notify(`生成失败：${(err as Error).message}`, 'error')
  }
}

function goBack() {
  router.push('/')
}

function goSettings() {
  router.push('/settings')
}
</script>

<template>
  <div class="page">
    <AppToolbar title="新建档案" back-label="返回" :search-value="''" @back="goBack" @new="() => {}" @settings="goSettings" @help="ui.notify('填写出生日期与时间即可生成人类图；时间越准确，结果越可靠。')" />

    <main class="content" :class="{ mobile: isMobile }">
      <div class="form-col">
        <div class="mode-switch">
          <button type="button" :class="{ on: mode === 'id' }" @click="mode = 'id'">身份证快捷</button>
          <button type="button" :class="{ on: mode === 'manual' }" @click="mode = 'manual'">手动录入</button>
        </div>

        <!-- 身份证 -->
        <section v-if="mode === 'id'" class="card block">
          <h2 class="t-title">身份证快捷录入</h2>
          <p class="t-sm muted">
            身份证只包含出生「日期」，不含出生时间；时与分必须由你手动补填，否则无法排盘。
            号码仅在本机内存中解析，不保存、不上传、不写日志。
          </p>
          <HdField
            v-model="form.idNumber"
            label="身份证号码（18 位）"
            placeholder="请输入 18 位号码"
            :maxlength="18"
            autocomplete="off"
            inputmode="numeric"
          >
            <template #suffix>
              <button type="button" class="parse-btn" @click="onParseId">解析</button>
            </template>
          </HdField>
          <p v-if="parseNote" class="t-sm" :class="parseNote.includes('已解析') ? 'msg-success' : 'msg-warning'">
            {{ parseNote }}
          </p>
          <label class="consent">
            <input v-model="form.consent" type="checkbox" />
            <span class="t-sm">
              我已阅读：身份证号仅用于在本机提取出生日期与地区，处理完即丢弃，不存储、不上传。
            </span>
          </label>
          <p v-if="errors.consent" class="t-sm msg-error">{{ errors.consent }}</p>
        </section>

        <!-- 基本信息 -->
        <section class="card block">
          <h2 class="t-title">基本信息</h2>
          <div class="grid2">
            <HdField v-model="form.name" label="姓名 / 昵称" placeholder="用于档案列表显示" required :error="errors.name" />
            <label class="gender">
              <span class="t-sm">性别</span>
              <span class="gender-ctl">
                <button type="button" :class="{ on: form.gender === 'female' }" @click="form.gender = 'female'">女</button>
                <button type="button" :class="{ on: form.gender === 'male' }" @click="form.gender = 'male'">男</button>
                <button type="button" :class="{ on: form.gender === 'other' }" @click="form.gender = 'other'">其他</button>
              </span>
            </label>
          </div>
        </section>

        <!-- 出生时间 -->
        <section class="card block">
          <h2 class="t-title">出生时间</h2>
          <div class="grid2">
            <HdField
              v-model="form.birthDate"
              label="出生日期"
              type="date"
              required
              :error="errors.birthDate"
            />
            <HdField
              v-model="form.birthTime"
              label="出生时间（时:分，可到秒）"
              type="time"
              required
              hint="按出生地当时的当地时间填写"
            />
          </div>
          <p class="t-sm msg-warning warn">
            ⚠ 出生分钟对闸门影响极大：约 4 分钟的误差即可能改变通道判定，请尽量准确填写。
          </p>
          <label class="tz">
            <span class="t-sm">时区</span>
            <select v-model="form.timezone">
              <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
            </select>
          </label>
          <p class="t-xs muted">
            已按 IANA 时区历史规则处理夏令时（例如中国 1986–1991 年曾实行夏令时，会自动加 1 小时）。
            若出生时刻落在夏令时切换点，系统会提示核实。
          </p>
        </section>

        <!-- 出生地 -->
        <section class="card block">
          <h2 class="t-title">出生地</h2>
          <div class="grid2">
            <label class="select-field">
              <span class="t-sm">省 / 直辖市</span>
              <select v-model="form.provinceCode">
                <option v-for="p in PROVINCES" :key="p.code" :value="p.code">{{ p.name }}</option>
              </select>
            </label>
            <label class="select-field">
              <span class="t-sm">城市</span>
              <select v-model="form.cityCode">
                <option v-for="c in provinceCities" :key="c.code" :value="c.code">{{ c.name }}</option>
                <option v-if="!provinceCities.length" value="">（该省暂未收录城市）</option>
              </select>
            </label>
          </div>
          <HdField v-model="form.place" label="出生地备注（可选）" placeholder="如：广东省深圳市南山区" />
          <p class="t-xs muted">
            说明：人类图只取决于出生的绝对时刻（行星地心位置），经纬度不参与排盘；
            此处信息仅用于档案标注。真正影响结果的是「时区 + 出生时间」。
          </p>
        </section>

        <div class="submit-bar">
          <HdButton block @click="submit">生成人类图</HdButton>
        </div>
      </div>

      <!-- 桌面实时预览 -->
      <aside v-if="!isMobile" class="preview-col">
        <div class="card preview">
          <header class="preview-head">
            <p class="t-xs">实时预览</p>
            <p v-if="preview" class="t-sm">
              {{ TYPE_LABELS[preview.type] }} · {{ preview.profile }} · {{ AUTHORITY_LABELS[preview.authority] }}
            </p>
            <p v-else class="t-sm muted">填写出生日期与时间后自动预览</p>
          </header>
          <div v-if="preview" class="preview-graph">
            <HumanDesignBodyGraph :engine="engine" :chart="preview" compact :interactive="false" />
          </div>
          <ul v-if="preview" class="preview-facts">
            <li><span class="t-xs">已定义中心</span><span class="t-data">{{ preview.centers.filter((c) => c.defined).length }} / 9</span></li>
            <li><span class="t-xs">通道</span><span class="t-data">{{ preview.channels.length }} 条</span></li>
            <li><span class="t-xs">激活闸门</span><span class="t-data">{{ preview.gates.length }} 个</span></li>
          </ul>
        </div>
      </aside>
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: var(--sp-4);
  padding: var(--sp-4);
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  align-items: start;
}

.content.mobile {
  grid-template-columns: 1fr;
  padding: var(--sp-3);
}

.form-col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.card.block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

.gender,
.tz,
.select-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.gender-ctl {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
}

.gender-ctl button {
  flex: 1;
  min-height: 36px;
  border-radius: 8px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.gender-ctl button.on {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: var(--elev-card);
}

select {
  height: 40px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: calc(var(--fs-body) * var(--font-scale));
}

.parse-btn {
  height: 28px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.consent {
  display: flex;
  gap: var(--sp-2);
  align-items: flex-start;
  color: var(--text-secondary);
}

.consent input {
  margin-top: 3px;
}

.warn {
  padding: var(--sp-2) var(--sp-3);
  background: rgba(217, 119, 6, 0.08);
  border-radius: var(--radius-sm);
}

.muted {
  color: var(--text-muted);
}

.mode-switch {
  display: inline-flex;
  padding: 3px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  gap: 2px;
}

.mode-switch button {
  flex: 1;
  min-height: 40px;
  border-radius: 8px;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.mode-switch button.on {
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: var(--elev-card);
}

.submit-bar {
  margin-top: var(--sp-2);
}

.preview-col {
  position: sticky;
  top: 72px;
}

.preview {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
}

.preview-graph {
  display: flex;
  justify-content: center;
  padding: var(--sp-3);
  max-height: 520px;
  overflow: hidden;
}

.preview-graph :deep(svg) {
  max-height: 500px;
  width: auto;
}

.preview-facts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-3);
  border-top: 1px solid var(--border);
}

.preview-facts li {
  display: flex;
  justify-content: space-between;
}

@media (max-width: 768px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
  select {
    height: 44px;
  }
}
</style>
