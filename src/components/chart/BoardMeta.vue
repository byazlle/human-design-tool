<script setup lang="ts">
/** 盘面基础信息：类型 / 策略 / 权威 / 人生角色 / 轮回交叉 / 定义型 / 九中心状态 */
import { computed, ref } from 'vue'
import type { BodyGraph, CenterId } from '../../types/hd'
import {
  AUTHORITY_LABELS,
  CENTER_LABELS,
  DEFINITION_LABELS,
  TYPE_LABELS,
} from '../../types/hd'
import { AUTHORITY_TEXT, TYPE_TEXT } from '../../services/interpretations'
import { TYPE_DETAIL } from '../../services/typeDetail'

const props = defineProps<{ chart: BodyGraph; dense?: boolean }>()

const typeText = computed(() => TYPE_TEXT[props.chart.type])
const typeDetail = computed(() => TYPE_DETAIL[props.chart.type])
const detailOpen = ref(false)
const authorityText = computed(() => AUTHORITY_TEXT[props.chart.authority])
const definedCenters = computed(() =>
  props.chart.centers.filter((c) => c.defined).map((c) => c.id),
)
const openCenters = computed(() => props.chart.centers.filter((c) => !c.defined).map((c) => c.id))

const SHORT_CENTER: Record<CenterId, string> = {
  head: '头顶',
  ajna: '眉心',
  throat: '喉咙',
  g: 'G',
  heart: '心',
  spleen: '脾',
  sacral: '骶骨',
  solar: '情绪',
  root: '根',
}

function centerLabel(id: CenterId) {
  return SHORT_CENTER[id]
}

function centerFull(id: CenterId) {
  return CENTER_LABELS[id]
}
</script>

<template>
  <section class="meta" :class="{ dense }">
    <div class="hero">
      <div>
        <p class="t-xs">类型 TYPE</p>
        <h2 class="type">{{ TYPE_LABELS[chart.type] }}</h2>
        <p class="t-sm en">{{ chart.type }}</p>
      </div>
      <div class="profile">
        <p class="t-xs">人生角色</p>
        <p class="profile-val t-mono">{{ chart.profile }}</p>
      </div>
    </div>

    <p class="t-body desc" v-if="!dense">{{ typeText.desc }}</p>

    <dl class="facts">
      <div>
        <dt class="t-xs">策略</dt>
        <dd class="t-body">{{ chart.strategy || typeText.strategy }}</dd>
      </div>
      <div>
        <dt class="t-xs">内在权威</dt>
        <dd class="t-body">{{ AUTHORITY_LABELS[chart.authority] }}</dd>
      </div>
      <div>
        <dt class="t-xs">定义</dt>
        <dd class="t-body">{{ DEFINITION_LABELS[chart.definition] }}</dd>
      </div>
      <div>
        <dt class="t-xs">轮回交叉</dt>
        <dd class="t-body t-mono small">{{ chart.incarnationCross }}</dd>
      </div>
    </dl>

    <p v-if="!dense" class="t-sm authority-desc">
      <span class="dot" />{{ authorityText.desc }}
    </p>

    <div v-if="!dense" class="type-detail">
      <button type="button" class="detail-toggle" @click="detailOpen = !detailOpen">
        <span class="tag">{{ typeDetail.tagline }}</span>
        <span class="chev" :class="{ on: detailOpen }" aria-hidden="true">▾</span>
      </button>

      <div v-if="detailOpen" class="detail-body">
        <section>
          <h4>能量机制</h4>
          <p>{{ typeDetail.mechanism }}</p>
        </section>
        <section>
          <h4>策略 · {{ chart.strategy || typeText.strategy }}</h4>
          <p>{{ typeDetail.strategyDetail }}</p>
        </section>
        <section>
          <h4>签名 · {{ typeText.signature }}</h4>
          <p>{{ typeDetail.signatureDetail }}</p>
        </section>
        <section>
          <h4>非自我主题 · {{ typeText.notSelf }}</h4>
          <p>{{ typeDetail.notSelfDetail }}</p>
        </section>
        <section>
          <h4>权威提示</h4>
          <p>{{ typeDetail.authorityNote }}</p>
        </section>
        <section>
          <h4>常见误区</h4>
          <ul class="list warn">
            <li v-for="(item, i) in typeDetail.misconceptions" :key="`m-${i}`">{{ item }}</li>
          </ul>
        </section>
        <section>
          <h4>落地建议</h4>
          <ul class="list">
            <li v-for="(item, i) in typeDetail.practice" :key="`p-${i}`">{{ item }}</li>
          </ul>
        </section>
      </div>
    </div>

    <div class="centers">
      <p class="t-xs">九中心</p>
      <ul class="chips">
        <li
          v-for="c in chart.centers"
          :key="c.id"
          class="chip"
          :class="c.defined ? 'on' : 'off'"
          :title="`${centerFull(c.id)} · ${c.defined ? '已定义' : '开放'}`"
        >
          {{ centerLabel(c.id) }}
        </li>
      </ul>
      <p class="t-xs muted">
        已定义 {{ definedCenters.length }} / 开放 {{ openCenters.length }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.meta {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
}

.type {
  font-size: calc(22px * var(--font-scale));
  line-height: 1.3;
  font-weight: 600;
}

.en {
  color: var(--text-muted);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  letter-spacing: 0.02em;
}

.profile {
  text-align: right;
  flex: none;
}

.profile-val {
  font-size: calc(20px * var(--font-scale));
  font-weight: 600;
}

.desc {
  color: var(--text-secondary);
}

.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2) var(--sp-3);
  margin: 0;
}

.facts div {
  min-width: 0;
}

.facts dt {
  margin-bottom: 2px;
}

.facts dd {
  margin: 0;
}

.facts .small {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  color: var(--text-secondary);
}

.authority-desc {
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--text-muted);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}

.chip {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  border: 1px solid var(--border);
}

.chip.on {
  background: var(--hd-center-defined);
  border-color: var(--hd-center-defined);
  color: var(--surface);
}
:root[data-theme='dark'] .chip.on {
  color: #16181d;
}

.chip.off {
  color: var(--text-muted);
  border-style: dashed;
}

.muted {
  color: var(--text-muted);
}

.dense .desc,
.dense .authority-desc,
.dense .type-detail {
  display: none;
}

/* 类型详解 */
.type-detail {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-2);
}

.detail-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
}

.detail-toggle:hover {
  background: rgba(124, 58, 237, 0.06);
}

.tag {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  font-weight: 600;
  color: var(--text-primary);
}

.chev {
  flex: none;
  color: var(--text-muted);
  transition: transform var(--dur-base) var(--ease-out);
}
.chev.on {
  transform: rotate(180deg);
}

.detail-body {
  padding: 0 var(--sp-3) var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  animation: rise-in var(--dur-base) var(--ease-out) both;
}

.detail-body h4 {
  margin: 0 0 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 600;
  color: var(--owner-shared);
  letter-spacing: 0.02em;
}

.detail-body p {
  margin: 0;
  font-size: calc(var(--fs-sm) * var(--font-scale));
  line-height: 1.65;
  color: var(--text-secondary);
}

.list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.list li {
  font-size: calc(var(--fs-sm) * var(--font-scale));
  line-height: 1.6;
  color: var(--text-secondary);
  list-style: disc;
}

.list.warn li {
  color: var(--text-secondary);
}

.list.warn li::marker {
  color: var(--status-warning);
}
</style>
