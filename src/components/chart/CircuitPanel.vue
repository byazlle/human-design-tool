<script setup lang="ts">
/**
 * 回路分布卡（v3.2.0）：完整盘里直接说明「这张盘的能量以哪一组回路为主」。
 *
 * 只做计数与归档展示，不参与类型 / 权威 / 定义判定（见 `engine/circuitData.ts`）。
 * 视觉沿用 v3.1.0 的静音外壳：单一强调色 + 三级透明度区分回路组，
 * 不引入新的配色令牌。
 */
import { computed } from 'vue'
import type { BodyGraph } from '../../types/hd'
import { CHANNEL_BY_KEY } from '../../engine/gateData'
import {
  CIRCUIT_NOTE,
  GROUP_BY_ID,
  analyzeCircuitry,
  circuitryBrief,
  type CircuitGroupId,
} from '../../engine/circuitData'

const props = withDefaults(
  defineProps<{
    chart?: BodyGraph | null
    /** 紧凑模式：默认折叠各组说明 */
    compact?: boolean
  }>(),
  { chart: null, compact: false },
)

const emit = defineEmits<{
  'channel-click': [key: string]
}>()

const analysis = computed(() =>
  analyzeCircuitry((props.chart?.channels ?? []).map((c) => c.key)),
)

const activeGroups = computed(() => analysis.value.groups.filter((g) => g.count > 0))

const verdict = computed(() => {
  const a = analysis.value
  if (!a.total) return '这张盘没有形成完整通道，回路暂时无法统计'
  if (a.tied) return '本盘有两组回路条数并列，不取单一主导'
  if (!a.dominantGroup) return '本盘回路分布无主导项'
  const g = GROUP_BY_ID[a.dominantGroup]
  const stat = a.groups.find((x) => x.id === a.dominantGroup)
  const pct = stat ? Math.round(stat.share * 100) : 0
  return `本盘以${g.label.replace('回路组', '')}回路为主：${stat?.count ?? 0} / ${a.total} 条已定义通道（${pct}%），主题是「${g.theme}」`
})

const summaryLine = computed(() => circuitryBrief(analysis.value))

/** 组内已激活通道 → 「1-8 启发」这样的展示串 */
function channelLabel(key: string): string {
  const def = CHANNEL_BY_KEY[key]
  return def ? `${key} ${def.nameZh}` : key
}

function groupClass(id: CircuitGroupId): string {
  return `g-${id}`
}

function shareText(count: number, total: number): string {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : '0%'
}
</script>

<template>
  <section class="card circuit-card">
    <header class="head">
      <div class="head-main">
        <h3 class="t-title">回路分布</h3>
        <p class="t-xs muted">
          共 {{ analysis.total }} 条已定义通道 · 回路按「能量目的」归组，只是补充视角，不改变类型与权威
        </p>
      </div>
      <p v-if="analysis.unknown.length" class="t-xs warn-line">
        有 {{ analysis.unknown.length }} 条通道不在回路表内：{{ analysis.unknown.join('、') }}
      </p>
    </header>

    <p v-if="!analysis.total" class="empty t-sm">
      这张盘没有形成完整通道（需要通道两端闸门都被激活），因此没有可统计的回路能量。
    </p>

    <template v-else>
      <!-- 三组占比：一条堆叠比例条 + 图例（无颜色也能读，靠文字计数） -->
      <div class="dist" role="img" :aria-label="summaryLine">
        <span
          v-for="g in activeGroups"
          :key="g.id"
          class="seg"
          :class="groupClass(g.id)"
          :style="{ flexGrow: g.count }"
        />
      </div>

      <p class="verdict t-sm">{{ verdict }}</p>

      <ul class="legend">
        <li v-for="g in analysis.groups" :key="g.id" :class="{ off: !g.count }">
          <span class="dot" :class="groupClass(g.id)" aria-hidden="true" />
          <span class="lg-label">{{ g.label.replace('回路组', '') }}</span>
          <span class="lg-count t-mono">{{ g.count }} / {{ g.total }}</span>
          <span class="lg-pct t-mono">{{ shareText(g.count, analysis.total) }}</span>
        </li>
      </ul>

      <!-- 每组一段：哪些子回路被点亮、具体是哪几条通道 -->
      <div class="groups">
        <details
          v-for="g in analysis.groups"
          :key="g.id"
          class="group"
          :class="groupClass(g.id)"
          :open="!compact && g.count > 0"
        >
          <summary>
            <span class="swatch" :class="groupClass(g.id)" aria-hidden="true" />
            <span class="g-name">
              {{ g.label }}
              <em class="g-en">{{ GROUP_BY_ID[g.id].en }}</em>
              <span v-if="g.alias" class="g-alias">俗称{{ g.alias }}</span>
            </span>
            <span class="g-theme t-xs">{{ g.theme }}</span>
            <span class="g-count t-mono">{{ g.count }} / {{ g.total }}</span>
          </summary>

          <div class="g-body">
            <p class="g-summary t-sm">{{ GROUP_BY_ID[g.id].summary }}</p>

            <ul class="subs">
              <li v-for="c in g.circuits" :key="c.id" class="sub" :class="{ on: c.active.length }">
                <div class="sub-head">
                  <strong class="sub-name">{{ c.label }}</strong>
                  <span class="sub-theme t-xs">{{ c.theme }}</span>
                  <span class="sub-count t-mono">{{ c.active.length }} / {{ c.total }}</span>
                </div>

                <ul v-if="c.active.length" class="chips">
                  <li v-for="key in c.active" :key="key">
                    <button type="button" class="chip" @click="emit('channel-click', key)">
                      {{ channelLabel(key) }}
                    </button>
                  </li>
                </ul>
                <p v-else class="sub-empty t-xs">本盘没有该子回路的完整通道</p>

                <p v-if="c.active.length && c.idle.length" class="idle t-xs">
                  未激活：{{ c.idle.join('、') }}
                </p>

                <p v-if="c.active.length" class="sub-read t-xs">{{ c.essence }}</p>
                <p v-if="c.active.length" class="sub-more t-xs">
                  <span class="k">礼物</span>{{ c.gift }}
                </p>
                <p v-if="c.active.length" class="sub-more t-xs">
                  <span class="k">卡点</span>{{ c.shadow }}
                </p>
              </li>
            </ul>

            <dl v-if="g.count" class="facts">
              <div>
                <dt>礼物</dt>
                <dd>{{ GROUP_BY_ID[g.id].gift }}</dd>
              </div>
              <div>
                <dt>卡点</dt>
                <dd>{{ GROUP_BY_ID[g.id].shadow }}</dd>
              </div>
              <div>
                <dt>用法</dt>
                <dd>{{ GROUP_BY_ID[g.id].live }}</dd>
              </div>
              <div>
                <dt>能量形态</dt>
                <dd>{{ GROUP_BY_ID[g.id].energy }}</dd>
              </div>
            </dl>
          </div>
        </details>
      </div>

      <p class="note t-xs">{{ CIRCUIT_NOTE }}</p>
    </template>
  </section>
</template>

<style scoped>
.circuit-card {
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.head-main h3 {
  margin-bottom: 2px;
}

.muted {
  color: var(--text-muted);
}

.warn-line {
  color: var(--status-warning);
}

.empty {
  color: var(--text-muted);
}

/* 占比条：单色三级透明度，不引入新配色 */
.dist {
  display: flex;
  height: 8px;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.seg {
  min-width: 4px;
  background: var(--owner-shared);
}

.seg.g-collective,
.dot.g-collective,
.swatch.g-collective {
  opacity: 0.62;
}

.seg.g-tribal,
.dot.g-tribal,
.swatch.g-tribal {
  opacity: 0.34;
}

.verdict {
  color: var(--text-primary);
  line-height: 1.6;
}

/* 图例 */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--sp-3);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}

.legend li.off {
  color: var(--text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--owner-shared);
}

.lg-count {
  font-weight: 600;
}

.lg-pct {
  color: var(--text-muted);
}

/* 分组明细 */
.groups {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.group {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.group summary {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 8px 10px;
  cursor: pointer;
  list-style: none;
  border-radius: var(--radius-md);
}

.group summary::-webkit-details-marker {
  display: none;
}

.group summary:hover {
  background: var(--surface-2);
}

.swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--owner-shared);
}

.g-name {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
  min-width: 0;
}

.g-en {
  font-style: normal;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 4px;
}

.g-alias {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-muted);
  font-weight: 400;
  font-size: calc(var(--fs-xs) * var(--font-scale));
}

.g-theme {
  flex: 1;
  min-width: 0;
  color: var(--text-muted);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.g-count {
  flex: none;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}

.g-body {
  padding: 0 10px 10px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.g-summary {
  color: var(--text-secondary);
  line-height: 1.7;
}

.subs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.sub {
  border-left: 2px solid var(--border);
  padding-left: var(--sp-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sub.on {
  border-left-color: var(--owner-shared);
}

.sub-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.sub-name {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-primary);
}

.sub-theme {
  color: var(--text-muted);
}

.sub-count {
  margin-left: auto;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(124, 58, 237, 0.4);
  background: rgba(124, 58, 237, 0.1);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-primary);
  transition: border-color var(--dur-fast) ease;
}

.chip:hover {
  border-color: var(--owner-shared);
}

.sub-empty,
.idle {
  color: var(--text-muted);
}

.sub-read {
  color: var(--text-secondary);
  line-height: 1.65;
}

.sub-more {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-muted);
  line-height: 1.65;
}

.sub-more .k {
  flex: none;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-secondary);
}

.facts {
  display: grid;
  gap: 4px;
  margin: 0;
}

.facts > div {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: var(--sp-2);
}

.facts dt {
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-muted);
}

.facts dd {
  margin: 0;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  line-height: 1.6;
}

.note {
  color: var(--text-muted);
  line-height: 1.6;
  border-top: 1px dashed var(--border);
  padding-top: var(--sp-2);
}
</style>
