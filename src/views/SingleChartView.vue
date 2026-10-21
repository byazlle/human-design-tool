<script setup lang="ts">
/** 单人盘页：桌面并排信息 + 右侧详情面板；手机折叠 + 底部抽屉（DESIGN.md §5.2 / §8） */
import { computed, ref, watch } from 'vue'

import { useDrawingEngine } from '../composables/useDrawingEngine'
const engine = useDrawingEngine()
import { useRoute, useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAiReading } from '../composables/useAiReading'
import { getChannel, getGate } from '../services/interpretations'
import { CENTER_LABELS, type CenterId } from '../types/hd'
import AppToolbar from '../components/base/AppToolbar.vue'
import HumanDesignBodyGraph from '../components/chart/HumanDesignBodyGraph.vue'
import BoardMeta from '../components/chart/BoardMeta.vue'
import ActivationPanels from '../components/chart/ActivationPanels.vue'
import GateChannelPanel from '../components/panel/GateChannelPanel.vue'
import AiReadingPanel from '../components/panel/AiReadingPanel.vue'
import HdButton from '../components/base/HdButton.vue'
import EmptyState from '../components/base/EmptyState.vue'
import IconButton from '../components/base/IconButton.vue'
import HdToggle from '../components/base/HdToggle.vue'
import { CENTER_TEXT } from '../services/interpretations'
import { gateInsightOf } from '../services/gateInsight'
import { READING_ANGLES, angleOf } from '../services/readingAngles'
import { destinyReadings } from '../services/destinyText'
import PlanetColumn from '../components/chart/PlanetColumn.vue'
import DetailCard from '../components/chart/DetailCard.vue'
import ArchiveEditDialog from '../components/archive/ArchiveEditDialog.vue'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()
const settings = useSettingsStore()
const { isMobile } = useBreakpoint()
const { state: aiState, run: runAi } = useAiReading()

const id = computed(() => String(route.params.id ?? ''))
const archive = computed(() => archiveStore.byId(id.value))
const chart = computed(() => archive.value?.chart ?? null)

watch(
  id,
  (value) => {
    if (value) archiveStore.ensureChart(value)
  },
  { immediate: true },
)

const filter = ref({ showDecimals: true, showColorToneBase: true, sharedOnly: false })
const panelOpen = computed(() => Boolean(ui.panel))

/* 编辑 / 复制副本 */
const editOpen = ref(false)

function duplicateChart() {
  const copy = archiveStore.duplicate(id.value)
  if (!copy) return
  ui.notify('已创建副本，可在副本上继续调整', 'success')
  router.push(`/archive/${copy.id}`)
}

/* ── 星级选择（与闸门联动，供 AI 组合解读）────────────── */
const selectedStars = ref(new Set<string>())

function toggleStar(side: 'design' | 'personality', planet: string) {
  const key = `${side}:${planet}`
  const next = new Set(selectedStars.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedStars.value = next
}

function starBrief(): string {
  if (!chart.value || !selectedStars.value.size) return ''
  const bits: string[] = []
  for (const key of selectedStars.value) {
    const [side, planet] = key.split(':')
    const list = side === 'design' ? chart.value.design : chart.value.personality
    const sp = list.find((x) => x.planet === planet)
    if (sp) {
      bits.push(
        `${side === 'design' ? '潜意识' : '显意识'}${planet} ${sp.gate}.${sp.line}` +
          `（洞察：${gateInsightOf(sp.gate).trait}）`,
      )
    }
  }
  return bits.join('\n')
}

/* ── AI 解读角度 ──────────────────────────────────────── */
const angleKey = ref('comprehensive')
const angle = computed(() => angleOf(angleKey.value))

/* ── 人生轨迹（离线模板）──────────────────────────────── */
const destiny = computed(() => (chart.value ? destinyReadings(chart.value) : []))

/* ── 模块拖拽顺序（桌面端）────────────────────────────── */
type ModuleKey = 'meta' | 'gates' | 'channels' | 'destiny'
const MODULE_LABELS: Record<ModuleKey, string> = {
  meta: '盘面信息',
  gates: '闸门 · 中心',
  channels: '激活通道',
  destiny: '人生轨迹',
}
const ORDER_KEY = 'hdt.module.order.v1'
const defaultOrder: ModuleKey[] = ['meta', 'gates', 'channels', 'destiny']
const moduleOrder = ref<ModuleKey[]>((() => {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as string[]
    const valid = raw.filter((k) => defaultOrder.includes(k as ModuleKey)) as ModuleKey[]
    const missing = defaultOrder.filter((k) => !valid.includes(k))
    if (valid.length) return [...valid, ...missing]
  } catch {
    /* ignore */
  }
  return defaultOrder
})())

const dragKey = ref<ModuleKey | null>(null)
function onDrop(target: ModuleKey) {
  const from = moduleOrder.value.indexOf(dragKey.value as ModuleKey)
  const to = moduleOrder.value.indexOf(target)
  if (from < 0 || to < 0 || from === to) return
  const next = [...moduleOrder.value]
  next.splice(to, 0, ...next.splice(from, 1))
  moduleOrder.value = next
  localStorage.setItem(ORDER_KEY, JSON.stringify(next))
}

const offlineText = computed(() => {
  const sel = ui.panel
  if (!sel) return ''
  if (sel.kind === 'gate') return `${getGate(Number(sel.ref)).title}\n\n${getGate(Number(sel.ref)).text}`
  if (sel.kind === 'channel') return `${getChannel(String(sel.ref)).title}\n\n${getChannel(String(sel.ref)).text}`
  const id = String(sel.ref) as CenterId
  const text = CENTER_TEXT[id]
  const defined = chart.value?.centers.find((c) => c.id === id)?.defined
  return `${CENTER_LABELS[id]}\n\n${defined ? text.defined : text.open}`
})

async function requestAiForSelection() {
  const sel = ui.panel
  if (!sel || !chart.value) return
  const title =
    sel.kind === 'gate'
      ? getGate(Number(sel.ref)).title
      : sel.kind === 'channel'
        ? getChannel(String(sel.ref)).title
        : CENTER_LABELS[String(sel.ref) as CenterId]
  await runAi({
    scope: sel.kind,
    ref: String(sel.ref),
    title: `${title} · AI 深度解读`,
    offline: offlineText.value,
    chart: chart.value,
  })
}

interface BulkPayload {
  gates: number[]
  channels: string[]
  centers: CenterId[]
  offline: string
  title: string
}

/** 选中多个闸门/通道/中心（可含星级）后一次性解读：缓存键由选择内容决定 */
async function onBulkAi(payload: BulkPayload) {
  if (!chart.value) return
  const ref = [
    ...payload.channels,
    ...payload.gates.map((g) => `g${g}`),
    ...payload.centers.map((c) => `c-${c}`),
    ...[...selectedStars.value].sort(),
  ].join('|')
  const offline = selectedStars.value.size
    ? `${payload.offline}\n\n【联动选中的星体】\n${starBrief()}`
    : payload.offline
  await runAi({
    scope: 'selection',
    ref,
    title: `${archive.value?.name ?? ''} · ${payload.title}`,
    offline,
    chart: chart.value,
  })
}

async function requestFullReading() {
  if (!chart.value || !archive.value) return
  const offline = [
    `类型：${chart.value.type}`,
    `人生角色：${chart.value.profile}`,
    `内在权威：${chart.value.authority}`,
    `定义：${chart.value.definition}`,
    `轮回交叉：${chart.value.incarnationCross}`,
    `已定义通道：${chart.value.channels.map((c) => c.key).join('、') || '无'}`,
    `激活闸门：${chart.value.gates.map((g) => g.gate).join('、')}`,
    '',
    `【解读角度】${angle.value.label}：${angle.value.prompt}`,
  ]
  if (selectedStars.value.size) offline.push(`【联动选中的星体】\n${starBrief()}`)
  await runAi({
    scope: 'single',
    ref: angleKey.value,
    title: `${archive.value.name} · 全盘 AI 解读 · ${angle.value.label}`,
    offline: offline.join('\n'),
    chart: chart.value,
  })
}

async function copyAi() {
  try {
    await navigator.clipboard.writeText(aiState.value.content)
    ui.notify('已复制', 'success')
  } catch {
    ui.notify('复制失败，请手动选择文本', 'error')
  }
}

function saveAi() {
  try {
    const key = 'hdt.ai.history.v1'
    const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
    list.unshift({
      title: aiState.value.title,
      content: aiState.value.content,
      at: new Date().toISOString(),
    })
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)))
    ui.notify('已保存到本地记录', 'success')
  } catch {
    ui.notify('保存失败', 'error')
  }
}

function goBack() {
  router.push('/')
}
function goNew() {
  router.push('/new')
}
function goSettings() {
  router.push('/settings')
}

const starListOpen = ref(false)
</script>

<template>
  <div class="page">
    <AppToolbar
      :title="archive?.name ?? '未找到'"
      back-label="档案库"
      @back="goBack"
      @new="goNew"
      @settings="goSettings"
      @help="ui.notify('点击人体图上的闸门或通道圆点，即可查看离线释义；右侧面板底部可按需调用 AI。')"
    >
      <template #right>
        <span class="tb-actions">
          <HdButton size="sm" variant="ghost" @click="editOpen = true">编辑</HdButton>
          <HdButton size="sm" variant="ghost" @click="duplicateChart">复制副本</HdButton>
          <HdButton size="sm" @click="router.push(`/compare/${id}`)"> 双盘对比 </HdButton>
          <HdButton size="sm" :loading="aiState.loading" @click="requestFullReading">
            全盘 AI 解读
          </HdButton>
        </span>
      </template>
    </AppToolbar>

    <EmptyState
      v-if="!archive || !chart"
      title="没有找到这份档案"
      desc="它可能已被删除，或链接不完整。"
      action-label="返回档案库"
      @action="goBack"
    />

    <main v-else class="layout" :class="{ mobile: isMobile }">
      <!-- AI 解读角度（整行） -->
      <div class="angle-bar card">
        <span class="t-xs angle-label">AI 解读角度</span>
        <div class="angle-chips">
          <button
            v-for="a in READING_ANGLES"
            :key="a.key"
            type="button"
            class="angle-chip"
            :class="{ on: angleKey === a.key }"
            :title="a.desc"
            @click="angleKey = a.key"
          >
            {{ a.label }}
          </button>
        </div>
        <HdButton size="sm" :loading="aiState.loading" @click="requestFullReading">
          全盘 AI 解读
        </HdButton>
      </div>

      <!-- ① 第一列：图（星列内嵌于图上方内侧左右） -->
      <div class="col col-chart">
        <!-- 手机：星列双列置顶 -->
        <div v-if="isMobile" class="card mobile-planets">
          <PlanetColumn
            :stars="chart.design"
            side="design"
            :selected="selectedStars"
            @star-toggle="toggleStar('design', $event)"
          />
          <PlanetColumn
            :stars="chart.personality"
            side="personality"
            :selected="selectedStars"
            @star-toggle="toggleStar('personality', $event)"
          />
        </div>

        <section class="card chart-card">
          <header class="chart-head">
            <div class="grow">
              <p class="t-xs">
                {{ archive.birth.year }}-{{ String(archive.birth.month).padStart(2, '0') }}-{{
                  String(archive.birth.day).padStart(2, '0')
                }}
                {{ String(archive.birth.hour).padStart(2, '0') }}:{{
                  String(archive.birth.minute).padStart(2, '0')
                }}
                · {{ archive.timezone }} · {{ archive.location.place }}
              </p>
            </div>
            <div class="toggles">
              <HdToggle
                compact
                label="小度数"
                :model-value="filter.showDecimals"
                @update:model-value="filter.showDecimals = $event"
              />
              <HdToggle
                compact
                label="色/调/基"
                :model-value="filter.showColorToneBase"
                @update:model-value="filter.showColorToneBase = $event"
              />
            </div>
          </header>

          <div class="chart-stage">
            <div class="graph-wrap">
              <HumanDesignBodyGraph :engine="engine"
                :chart="chart"
                mode="single"
                :filter="filter"
                :highlight="{
                  gates: ui.panel?.kind === 'gate' ? [Number(ui.panel.ref)] : [],
                  channels: ui.panel?.kind === 'channel' ? [String(ui.panel.ref)] : [],
                }"
                @gate-click="ui.openGate($event, 'single')"
                @channel-click="ui.openChannel($event, 'single')"
                @center-click="ui.openCenter($event, 'single')"
              />
            </div>

            <!-- 图上方内侧左右：显意识 / 潜意识（桌面浮层，眉心上侧、脾与情绪上侧区域） -->
            <template v-if="!isMobile">
              <div class="planet-float left">
                <PlanetColumn
                  :stars="chart.design"
                  side="design"
                  :selected="selectedStars"
                  @star-toggle="toggleStar('design', $event)"
                />
              </div>
              <div class="planet-float right">
                <PlanetColumn
                  :stars="chart.personality"
                  side="personality"
                  :selected="selectedStars"
                  @star-toggle="toggleStar('personality', $event)"
                />
              </div>
            </template>
          </div>
        </section>
      </div>

      <!-- ② 第二列：盘面信息 + 激活通道 -->
      <div class="col">
        <section class="card module-card">
          <BoardMeta :chart="chart" />
        </section>
        <ActivationPanels
          :chart="chart"
          :sections="['channels']"
          @ai-read="onBulkAi"
          @gate-click="ui.openGate($event, 'single')"
          @channel-click="ui.openChannel($event, 'single')"
          @center-click="ui.openCenter($event, 'single')"
        />
      </div>

      <!-- ③ 第三列：闸门 + 能量中心 -->
      <div class="col">
        <ActivationPanels
          :chart="chart"
          :sections="['gates', 'centers']"
          @ai-read="onBulkAi"
          @gate-click="ui.openGate($event, 'single')"
          @channel-click="ui.openChannel($event, 'single')"
          @center-click="ui.openCenter($event, 'single')"
        />
      </div>

      <!-- ④ 第四列：人生轨迹 + 详情（点击闸门/通道后显示在轨迹下方） -->
      <div class="col">
        <section class="card module-card">
          <h3 class="t-title destiny-title">人生轨迹</h3>
          <div class="destiny">
            <details v-for="d in destiny" :key="d.key" class="destiny-item">
              <summary class="t-sm">
                <strong>{{ d.title }}</strong>
                <span class="t-xs d-desc">{{ d.desc }}</span>
              </summary>
              <div class="d-body">
                <section v-for="(sec, i) in d.sections" :key="i" class="d-sec">
                  <h4 class="d-h">{{ sec.h }}</h4>
                  <p class="t-sm">{{ sec.p }}</p>
                </section>
              </div>
            </details>
          </div>
        </section>

        <DetailCard
          :selection="ui.panel"
          :chart="chart"
          @close="ui.closePanel()"
          @request-ai="requestAiForSelection"
        />
      </div>
    </main>

    <!-- 手机：底部固定操作 -->
    <div v-if="isMobile && chart" class="mobile-bar safe-bottom">
      <HdButton size="sm" variant="ghost" @click="editOpen = true">编辑</HdButton>
      <HdButton size="sm" variant="ghost" @click="duplicateChart">副本</HdButton>
      <HdButton size="sm" variant="ghost" @click="router.push(`/compare/${id}`)">对比</HdButton>
      <HdButton size="sm" :loading="aiState.loading" @click="requestFullReading">全盘 AI</HdButton>
    </div>

    <GateChannelPanel
      v-if="isMobile"
      :selection="ui.panel"
      :open="panelOpen"
      :mobile="true"
      :chart="chart ?? undefined"
      :ai-loading="aiState.loading"
      @close="ui.closePanel()"
      @request-ai="requestAiForSelection"
      @open-channel="ui.openChannel($event, 'single')"
    />

    <ArchiveEditDialog :open="editOpen" :archive="archive ?? null" @close="editOpen = false" />

    <AiReadingPanel
      :open="aiState.open"
      :title="aiState.title"
      :content="aiState.content"
      :loading="aiState.loading"
      :error="aiState.error"
      @close="ui.closeAi()"
      @copy="copyAi"
      @save="saveAi"
      @regenerate="requestFullReading"
    />
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* 工具栏文字按钮：桌面显示，手机隐藏（入口移至底部栏） */
.tb-actions {
  display: inline-flex;
  gap: 6px;
}

@media (max-width: 768px) {
  .tb-actions {
    display: none;
  }
}

/* 工具栏文字按钮：桌面显示，手机隐藏（入口移至底部栏） */
.tb-actions {
  display: inline-flex;
  gap: 6px;
}

@media (max-width: 768px) {
  .tb-actions {
    display: none;
  }
}

/* 四列布局 */
.layout {
  display: grid;
  padding-top: 8px;
  grid-template-columns:
    minmax(560px, 1.85fr) minmax(215px, 0.7fr) minmax(215px, 0.7fr)
    minmax(240px, 0.8fr);
  gap: var(--sp-3);
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
  padding: 8px var(--sp-4) 96px;
  box-sizing: border-box;
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

/* AI 角度条（整行） */
.angle-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px var(--sp-3);
  flex-wrap: wrap;
  row-gap: 6px;
}

.angle-label {
  color: var(--text-muted);
  white-space: nowrap;
}

.angle-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.angle-chip {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-soft);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}

.angle-chip:hover {
  border-color: var(--border-strong);
}

.angle-chip.on {
  background: rgba(124, 58, 237, 0.14);
  border-color: var(--owner-shared);
  color: var(--text-primary);
  font-weight: 600;
}

/* 图卡与内嵌星列 */
.chart-card {
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.chart-head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.chart-head .grow {
  flex: 1;
  min-width: 0;
}

.toggles {
  display: flex;
  gap: var(--sp-2);
  flex: none;
}

/* 完整盘一屏展示：卡片高度锁定为可用视口，内部等比缩放，绝不裁切、无需滚动 */
.col-chart .chart-card {
  height: calc(100vh - var(--chrome-h) - 152px);
  min-height: 420px;
  max-height: 1180px;
  overflow: hidden;
}

.chart-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.graph-wrap {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.graph-wrap :deep(svg) {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  margin: 0 auto;
}

/* 星列浮层：图上方内侧左右（不遮盖图形本体），整体上移贴近顶部 */
.planet-float {
  position: absolute;
  top: 1.2%;
  width: 146px;
  z-index: 3;
  min-width: 0;
}

.planet-float.left {
  left: 2px;
}

.planet-float.right {
  right: 2px;
}

/* 模块卡 */
.module-card {
  padding: var(--sp-3);
}

.module-card-wrap :deep(.activation) {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.destiny-title {
  margin-bottom: var(--sp-2);
}

.destiny {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.destiny-item summary {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  list-style: none;
}

.destiny-item summary::-webkit-details-marker {
  display: none;
}

.destiny-item summary:hover {
  background: rgba(124, 58, 237, 0.08);
}

.d-desc {
  color: var(--text-muted);
}

.d-body {
  color: var(--text-secondary);
  line-height: 1.7;
  padding: 4px 8px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.d-sec {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.d-h {
  margin: 0;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 700;
  color: var(--owner-shared);
  letter-spacing: 0.02em;
}

/* 手机折叠区星体双列 */
.mobile-planets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
  padding: var(--sp-3);
}

/* 手机底部操作 */
.mobile-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-3);
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: var(--z-toolbar);
}

.mobile-bar > * {
  flex: 1;
}

/* 手机：单列 */
.layout.mobile {
  grid-template-columns: 1fr;
  padding: var(--sp-3) var(--sp-3) 96px;
  max-width: 100%;
}

.layout.mobile .angle-bar {
  grid-column: auto;
}

.layout.mobile .col-chart .chart-card {
  height: auto;
  max-height: none;
}

.layout.mobile .chart-stage {
  display: block;
}

.layout.mobile .graph-wrap {
  height: auto;
}

.layout.mobile .graph-wrap :deep(svg) {
  height: auto;
  width: 100%;
}

/* 中屏：三列，第四列下移整行 */
@media (max-width: 1400px) {
  .layout {
    grid-template-columns: minmax(440px, 1.3fr) minmax(235px, 0.8fr) minmax(235px, 0.8fr);
  }

  .layout > .col:nth-of-type(5) {
    grid-column: 1 / -1;
  }

  /* 窄屏：星列停靠在图上方（两列），不覆盖盘面 */
  .chart-stage {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-items: start;
  }

  .planet-float {
    position: static;
    width: auto;
    order: 0;
  }

  .graph-wrap {
    grid-column: 1 / -1;
    height: auto;
  }

  .graph-wrap :deep(svg) {
    height: auto;
    max-height: none;
  }
}

@media (max-width: 1080px) {
  .layout {
    grid-template-columns: 1fr 1fr;
  }

  .layout > .col-chart {
    grid-column: 1 / -1;
  }

  .layout > .col:nth-of-type(5) {
    grid-column: 1 / -1;
  }
}
</style>
