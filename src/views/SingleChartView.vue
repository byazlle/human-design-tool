<script setup lang="ts">
/** 单人盘页：桌面并排信息 + 右侧详情面板；手机折叠 + 底部抽屉（DESIGN.md §5.2 / §8） */
import { computed, ref, watch } from 'vue'
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
      <div class="main-col">
        <!-- 星体数据：左潜意识 / 右显意识，竖排可折叠（桌面两翼；手机在折叠区内） -->
        <div v-if="!isMobile" class="planet-wing">
          <PlanetColumn
            :stars="chart.design"
            side="design"
            :selected="selectedStars"
            @star-toggle="toggleStar('design', $event)"
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

          <div class="graph-wrap">
            <HumanDesignBodyGraph
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
        </section>

        <div v-if="!isMobile" class="planet-wing">
          <PlanetColumn
            :stars="chart.personality"
            side="personality"
            :selected="selectedStars"
            @star-toggle="toggleStar('personality', $event)"
          />
        </div>

        <!-- AI 解读角度条（桌面）：同一盘面按角度换提示词 -->
        <div v-if="!isMobile" class="angle-bar card">
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
        </div>

        <!-- 手机：折叠区 -->
        <section v-if="isMobile" class="card fold">
          <button type="button" class="fold-head" @click="starListOpen = !starListOpen">
            <span class="t-title">星体清单 / 盘面信息</span>
            <IconButton :label="starListOpen ? '收起' : '展开'" :icon="starListOpen ? 'chevron-up' : 'chevron-down'" size="sm" />
          </button>
          <div v-if="starListOpen" class="fold-body">
            <BoardMeta :chart="chart" dense />

            <!-- 星体双列：左潜意识 / 右显意识，竖排可折叠 -->
            <div class="mobile-planets">
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

            <ActivationPanels
              :chart="chart"
              compact
              @ai-read="onBulkAi"
              @gate-click="ui.openGate($event, 'single')"
              @channel-click="ui.openChannel($event, 'single')"
              @center-click="ui.openCenter($event, 'single')"
            />
          </div>
        </section>

        <!-- 模块行：可拖动调整顺序（盘面信息 / 闸门·中心 / 激活通道 / 人生轨迹） -->
        <div v-else class="module-row">
          <div
            v-for="m in moduleOrder"
            :key="m"
            class="module"
            :data-module="m"
            draggable="true"
            @dragstart="dragKey = m"
            @dragover.prevent
            @drop="onDrop(m)"
          >
            <div class="module-head">
              <span class="t-xs grip" title="拖动调整位置">⋮⋮</span>
              <span class="t-sm module-title">{{ MODULE_LABELS[m] }}</span>
            </div>

            <section v-if="m === 'meta'" class="card module-card">
              <BoardMeta :chart="chart" />
            </section>

            <div v-else-if="m === 'gates'" class="module-card-wrap">
              <ActivationPanels
                :chart="chart"
                :sections="['gates', 'centers']"
                @ai-read="onBulkAi"
                @gate-click="ui.openGate($event, 'single')"
                @channel-click="ui.openChannel($event, 'single')"
                @center-click="ui.openCenter($event, 'single')"
              />
            </div>

            <div v-else-if="m === 'channels'" class="module-card-wrap">
              <ActivationPanels
                :chart="chart"
                :sections="['channels']"
                @ai-read="onBulkAi"
                @gate-click="ui.openGate($event, 'single')"
                @channel-click="ui.openChannel($event, 'single')"
                @center-click="ui.openCenter($event, 'single')"
              />
            </div>

            <section v-else-if="m === 'destiny'" class="card module-card">
              <div class="destiny">
                <details v-for="d in destiny" :key="d.key" class="destiny-item">
                  <summary class="t-sm">
                    <strong>{{ d.title }}</strong>
                    <span class="t-xs d-desc">{{ d.desc }}</span>
                  </summary>
                  <p class="t-sm d-body">{{ d.text }}</p>
                </details>
              </div>
            </section>
          </div>
        </div>
      </div>

      <GateChannelPanel
        v-if="!isMobile"
        :selection="ui.panel"
        :open="panelOpen"
        :mobile="false"
        :chart="chart"
        :ai-loading="aiState.loading"
        @close="ui.closePanel()"
        @request-ai="requestAiForSelection"
        @open-channel="ui.openChannel($event, 'single')"
      />
    </main>

    <!-- 手机：底部固定操作 -->
    <div v-if="isMobile && chart" class="mobile-bar safe-bottom">
      <HdButton @click="router.push(`/compare/${id}`)">双盘对比</HdButton>
      <HdButton :loading="aiState.loading" @click="requestFullReading">全盘 AI 解读</HdButton>
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

.layout {
  flex: 1;
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--sp-4);
  gap: var(--sp-4);
  align-items: flex-start;
}

.layout.mobile {
  padding: var(--sp-3) var(--sp-3) 96px;
}

.layout.mobile .main-col {
  display: flex;
  flex-direction: column;
}

.main-col {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(180px, 230px) minmax(400px, 1fr) minmax(180px, 230px);
  grid-template-areas:
    'wingL chart wingR'
    'angle angle angle'
    'mods mods mods';
  gap: var(--sp-3);
  align-items: start;
}

/* 两翼星列 */
.main-col > .planet-wing {
  min-width: 0;
}
.main-col > .planet-wing:nth-of-type(1) {
  grid-area: wingL;
}
.main-col > .planet-wing:nth-of-type(2) {
  grid-area: wingR;
}

.chart-card {
  grid-area: chart;
}

/* 角度条 */
.angle-bar {
  grid-area: angle;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  flex-wrap: wrap;
}

.angle-label {
  color: var(--text-muted);
  white-space: nowrap;
}

.angle-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

/* 可拖动模块行 */
.module-row {
  grid-area: mods;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-3);
  align-items: start;
}

.module {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.module-head {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: grab;
  user-select: none;
}

.module-head:active {
  cursor: grabbing;
}

.grip {
  color: var(--text-muted);
  letter-spacing: -2px;
}

.module-title {
  color: var(--text-secondary);
  font-weight: 600;
}

.module-card {
  padding: var(--sp-3);
}

.module-card-wrap :deep(.activation) {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

/* 人生轨迹卡 */
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
}

/* 中屏：星列并排两列置顶 */
@media (max-width: 1180px) {
  .main-col {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'wingL wingR'
      'chart chart'
      'angle angle'
      'mods mods';
  }

  .module-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .module-row {
    grid-template-columns: 1fr;
  }
}

/* 手机折叠区星体双列 */
.mobile-planets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-3);
}

.side-col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.chart-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 人体图区域提高玻璃不透明度，保证浅色背景上的对比度 */
  background: var(--glass-bg-strong);
}

.chart-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.toggles {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.graph-wrap {
  display: flex;
  justify-content: center;
  padding: var(--sp-3);
}

.graph-wrap :deep(svg) {
  max-height: 760px;
  width: 100%;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
}

.fold {
  overflow: hidden;
}

.fold-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
}

.fold-body {
  padding: 0 var(--sp-4) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.tb-actions {
  display: inline-flex;
  gap: 6px;
}

@media (max-width: 768px) {
  .tb-actions {
    display: none;
  }
}

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

@media (max-width: 768px) {
  .graph-wrap {
    padding: var(--sp-2);
  }
  .graph-wrap :deep(svg) {
    max-height: none;
  }
}
</style>
