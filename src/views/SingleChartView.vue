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
import { copyAiResult, saveAiResult } from '../composables/useAiResultActions'
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
import { AUTHORITY_LABELS, CENTER_LABELS, DEFINITION_LABELS, TYPE_LABELS, type AiDetailMode, type CenterId } from '../types/hd'
import { gateInsightOf } from '../services/gateInsight'
import { angleOf } from '../services/readingAngles'
import { crossReadingOf } from '../services/crossData'
import { AUTHORITY_TEXT, TYPE_TEXT, getChannel, getGate } from '../services/interpretations'
import { GATE_NAMES } from '../engine/gateData'
import { destinyReadings } from '../services/destinyText'
import PlanetColumn from '../components/chart/PlanetColumn.vue'
import DetailCard from '../components/chart/DetailCard.vue'
import CrossPanel from '../components/chart/CrossPanel.vue'
import AiComposer, { type DimKey } from '../components/panel/AiComposer.vue'
import ArchiveEditDialog from '../components/archive/ArchiveEditDialog.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import CustomLayoutCanvas from '../components/layout/CustomLayoutCanvas.vue'
import { usePageLayoutStore } from '../stores/pageLayout'

const route = useRoute()
const router = useRouter()
const archiveStore = useArchiveStore()
const ui = useUiStore()
const settings = useSettingsStore()
const { isMobile } = useBreakpoint()
const layout = usePageLayoutStore()
const {
  state: aiState,
  run: runAi,
  retry: retryAi,
  abort: abortAi,
  configured: aiConfigured,
} = useAiReading()

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
  ui.notify(archiveStore.persistError ?? '已创建副本，可在副本上继续调整', archiveStore.persistError ? 'error' : 'success')
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

/* ── 全维度统一 AI 综合解读 ──────────────────────────── */
function firstSentence(text: string, max = 52): string {
  const clean = text.replace(/\s+/g, '')
  const m = clean.match(/^[^。！？;；]+[。！？]?/)
  const s = m ? m[0] : clean
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function buildUnifiedOffline(dims: DimKey[]): string {
  if (!chart.value) return ''
  const c = chart.value
  const parts: string[] = []

  if (dims.includes('profile')) {
    parts.push(
      `【人生角色 / 能量类型】类型：${TYPE_LABELS[c.type]}（${c.type}）；人生角色：${c.profile}；${TYPE_TEXT[c.type].desc}`,
    )
  }
  if (dims.includes('strategy')) {
    parts.push(`【人生策略】${c.strategy || TYPE_TEXT[c.type].strategy}`)
  }
  if (dims.includes('authority')) {
    parts.push(
      `【内在权威】${AUTHORITY_LABELS[c.authority]}：${AUTHORITY_TEXT[c.authority].desc}`,
    )
  }
  if (dims.includes('definition')) {
    parts.push(`【整体定义】${DEFINITION_LABELS[c.definition]}（已定义中心 ${c.centers.filter((x) => x.defined).length} 个）`)
  }
  if (dims.includes('cross')) {
    const cr = crossReadingOf(c.personality, c.design, c.profile)
    parts.push(
      `【轮回交叉】${cr.name}\n核心释义：${cr.summary.replace(/\n/g, ' ')}\n人生使命：${cr.mission.replace(/\n/g, ' ')}\n活出状态：${cr.highState.replace(/\n/g, ' ')}\n未活出状态：${cr.lowState.replace(/\n/g, ' ')}`,
    )
  }
  if (dims.includes('channels')) {
    const lines = c.channels.map((ch) => {
      const t = getChannel(ch.key)
      return `${ch.key} ${t.title.split(' · ').slice(1).join(' · ') || ch.key}：${firstSentence(t.text)}`
    })
    parts.push(`【已激活通道】（共 ${lines.length} 条）\n${lines.join('\n') || '无'}`)
  }
  if (dims.includes('gates')) {
    const lines = c.gates.map((g) => {
      const ins = gateInsightOf(g.gate)
      return `闸门 ${g.gate} ${GATE_NAMES[g.gate]?.zh ?? ''}（${ins.trait}；由 ${g.stars.join('/')} 激活）`
    })
    parts.push(`【已激活闸门】（共 ${lines.length} 个）\n${lines.join('；')}`)
  }
  if (dims.includes('centers')) {
    const lines = c.centers.map((ct) => {
      const t = CENTER_TEXT[ct.id]
      return `${CENTER_LABELS[ct.id]}：${ct.defined ? '已定义' : '开放'}——${firstSentence(ct.defined ? t.defined : t.open)}`
    })
    parts.push(`【九大能量中心状态】\n${lines.join('\n')}`)
  }
  return parts.join('\n\n')
}

async function requestUnifiedAi(payload: {
  dimensions: DimKey[]
  angleKey: string
  customDirection: string
}) {
  if (!chart.value || !archive.value) return
  angleKey.value = payload.angleKey
  const angleInfo = angleOf(payload.angleKey)
  // 三档（Q3.1）：精简 / 详细 / 完整；完整档走 #9 多轮分步编排
  const AI_MODE_LABELS: Record<AiDetailMode, string> = {
    concise: '精简',
    detailed: '详细',
    full: '完整',
  }
  const modeLabel = AI_MODE_LABELS[settings.aiDetailMode]
  const direction = payload.customDirection
    ? `【自定义解读方向】用户希望重点从「${payload.customDirection}」的角度解读，请围绕该方向展开，同时保持术语准确。`
    : `【解读角度】${angleInfo.label}：${angleInfo.prompt}`

  await runAi({
    scope: 'unified',
    ref: `${payload.dimensions.join('+')}:${payload.angleKey}:${payload.customDirection || '-'}`,
    title: payload.customDirection
      ? `${archive.value.name} · AI 综合解读 · ${payload.customDirection}`
      : `${archive.value.name} · 整体解读（${modeLabel}） · ${angleInfo.label}`,
    offline: `${buildUnifiedOffline(payload.dimensions)}\n\n${direction}\n\n请把以上所有勾选维度作为一个整体来综合解读：先给出整体画像结论，再分别说明各维度如何相互影响，最后给落地建议。`,
    chart: chart.value,
    detailMode: settings.aiDetailMode,
    full: settings.aiDetailMode === 'full',
    stepMode: settings.aiStepMode,
    angle: payload.customDirection || angleInfo.label,
  })
}

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
  // payload.offline 已是「一份整体事实块 + 所选对象释义要点」（规范 §1.3），
  // 直接作为【盘面事实】注入；不再同时用 chartSummaryOf 注入第二次，避免同一信息重复喂给模型。
  const facts = selectedStars.value.size
    ? `${payload.offline}\n\n【联动选中的星体】\n${starBrief()}`
    : payload.offline
  await runAi({
    scope: 'selection',
    ref,
    title: `${archive.value?.name ?? ''} · ${payload.title}`,
    offline: '',
    chartSummary: facts,
    detailMode: settings.aiDetailMode,
    angle: '整体解读',
  })
}

async function requestFullReading() {
  await requestUnifiedAi({ dimensions: ['channels', 'gates', 'centers', 'strategy', 'definition', 'authority', 'cross', 'profile'], angleKey: angleKey.value, customDirection: '' })
}

function copyAi() {
  void copyAiResult(aiState.value.content)
}

function saveAi() {
  saveAiResult({ title: aiState.value.title, content: aiState.value.content })
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

/* ── 删除档案 ─────────────────────────────────────── */
const confirmDelete = ref(false)

function askDelete() {
  if (!archive.value) return
  confirmDelete.value = true
}

function doDelete() {
  confirmDelete.value = false
  const name = archive.value?.name ?? ''
  const removed = archiveStore.remove(id.value)
  if (archiveStore.persistError) {
    ui.notify(archiveStore.persistError, 'error')
    return
  }
  if (!removed) {
    ui.notify('档案不存在或已被删除', 'error')
    return
  }
  ui.notify(`已删除「${name}」`, 'info', {
    duration: 5000,
    action: {
      label: '撤销',
      onClick: () => {
        archiveStore.restore(removed)
        ui.notify(
          archiveStore.persistError ?? `已撤销删除「${name}」`,
          archiveStore.persistError ? 'error' : 'success',
        )
        router.replace(`/archive/${removed.id}`)
      },
    },
  })
  router.replace('/')
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
          <HdButton size="sm" variant="ghost" @click="router.push(`/chiron/${id}`)"> 凯龙回归 </HdButton>
          <HdButton size="sm" @click="router.push(`/compare/${id}`)"> 双盘对比 </HdButton>
          <HdButton size="sm" variant="danger" @click="askDelete">删除</HdButton>
          <HdButton size="sm" :loading="aiState.loading" @click="requestFullReading">
            全盘 AI 解读
          </HdButton>
        </span>
      </template>
    </AppToolbar>

    <EmptyState
      v-if="!archive"
      title="没有找到这份档案"
      desc="它可能已被删除，或链接不完整。"
      action-label="返回档案库"
      @action="goBack"
    />

    <EmptyState
      v-else-if="!chart"
      :title="archive.chartError ? '这张盘重算失败' : '盘面数据尚未生成'"
      :desc="
        archive.chartError
          ? `重算失败原因：${archive.chartError}。可返回档案库后重新打开，或在设置页「重新生成全部图表」重试。`
          : '可能仍在计算中，请稍候；也可在设置页「重新生成全部图表」重建。'
      "
      action-label="返回档案库"
      @action="goBack"
    />

    <main v-else class="layout" :class="{ mobile: isMobile, 'layout-custom': !isMobile && layout.preset !== 'single' }">
      <div v-if="chart.meta?.warning" class="notice warn" role="status">
        <span class="t-sm">{{ chart.meta.warning }}</span>
      </div>

      <CustomLayoutCanvas :mobile="isMobile">
        <template #angles>
      <!-- AI 全维度组合解读（电脑端 / 手机端同一组件） -->
      <div class="angle-bar card">
        <span class="t-xs angle-label">AI 综合解读</span>
        <AiComposer :loading="aiState.loading" @run="requestUnifiedAi" />
      </div>

        </template>
        <template #chart>
      <!-- ① 人体图（星列在图上方的内侧左右） -->
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

          <!-- 图上方内侧左右：显意识 / 潜意识（桌面浮层） -->
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

        </template>
        <template #meta>
      <!-- ② 盘面信息（类型 / 权威 / 定义 / 角色） -->
      <section class="card module-card">
        <BoardMeta :chart="chart" />
      </section>

        </template>
        <template #activation>
      <!-- ③ 激活通道 / 闸门 / 九中心 -->
      <ActivationPanels
        :chart="chart"
        :sections="['channels', 'gates', 'centers']"
        @ai-read="onBulkAi"
        @gate-click="ui.openGate($event, 'single')"
        @channel-click="ui.openChannel($event, 'single')"
        @center-click="ui.openCenter($event, 'single')"
      />

        </template>
        <template #cross>
      <!-- ④ 轮回交叉 -->
      <section class="card module-card">
        <CrossPanel :chart="chart" />
      </section>

        </template>
        <template #destiny>
      <!-- ⑤ 人生轨迹 -->
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

        </template>
        <template #detail>
      <!-- 详情（点击闸门/通道/中心后在下方展开） -->
      <DetailCard
        :selection="ui.panel"
        :chart="chart"
        @close="ui.closePanel()"
        @request-ai="requestAiForSelection"
      />
        </template>
      </CustomLayoutCanvas>
    </main>

    <!-- 手机：底部固定操作 -->
    <div v-if="isMobile && chart" class="mobile-bar safe-bottom">
      <HdButton size="sm" variant="ghost" @click="editOpen = true">编辑</HdButton>
      <HdButton size="sm" variant="ghost" @click="router.push(`/chiron/${id}`)">凯龙</HdButton>
      <HdButton size="sm" variant="ghost" @click="router.push(`/compare/${id}`)">对比</HdButton>
      <HdButton size="sm" variant="danger" @click="askDelete">删除</HdButton>
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

    <ConfirmDialog
      :open="confirmDelete"
      title="删除档案"
      :desc="archive ? `确定删除「${archive.name}」？删除后可在 5 秒内撤销。` : ''"
      confirm-text="删除"
      danger
      @confirm="doDelete"
      @cancel="confirmDelete = false"
    />

    <AiReadingPanel
      :open="aiState.open"
      :title="aiState.title"
      :content="aiState.content"
      :loading="aiState.loading"
      :error="aiState.error"
      :configured="aiConfigured"
      :mode="settings.aiDetailMode"
      :report="aiState.report"
      :progress="aiState.progress"
      :meta="{ chartName: archive?.name }"
      @close="ui.closeAi()"
      @copy="copyAi"
      @save="saveAi"
      @regenerate="retryAi"
      @cancel="abortAi"
      @settings="goSettings"
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

/* 全宽提示条（DST 提醒 / 重算失败原因） */
.notice {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid rgba(217, 119, 6, 0.4);
  background: rgba(217, 119, 6, 0.12);
  color: var(--text-primary);
}

/* 单列纵向流：宽度正好容纳一张人类图（不再四列并排） */
.layout {
  display: flex;
  flex-direction: column;
  gap: var(--layout-gap, var(--sp-4));
  width: 100%;
  /* 默认 840（收窄后的阅读宽度）；「图谱尺寸=large(1000)」时列宽自动放宽到 1000 而不溢出 */
  max-width: max(840px, var(--graph-max-width, 840px));
  margin: 0 auto;
  padding: 8px var(--layout-pad, var(--sp-4)) 96px;
  box-sizing: border-box;
}

/* 自定义布局（双列 / 三列 / 手动调整）放宽画布宽度 */
.layout.layout-custom {
  max-width: min(1400px, 100%);
}

/* AI 角度条 */
.angle-bar {
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

.chart-stage {
  position: relative;
  display: block;
}

/* 人图完整显示：随容器等比缩放，不裁切、不出现内部滚动 */
.graph-wrap {
  width: 100%;
  /* 保留「图谱尺寸」设置（small/normal/large → 560/780/1000），
     外层单列已限制 840，large 时以列宽为准 */
  max-width: var(--graph-max-width, 840px);
  margin: 0 auto;
  display: block;
  min-width: 0;
}

.graph-wrap :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
  max-height: none;
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

/* 手机：同一套单列（无需额外栅格） */
.layout.mobile {
  padding: var(--sp-3) var(--sp-3) 96px;
  max-width: 100%;
}

/* 中屏：星列停靠在图上方（两列），不覆盖盘面 */
@media (max-width: 1400px) {
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
  }
}
</style>
