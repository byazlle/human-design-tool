<script setup lang="ts">
/**
 * 轮回交叉完整模块：标准名称、核心释义、人生使命解读、
 * 活出状态（高阶）、未活出状态（低频卡点）、四闸门角色分解。
 */
import { computed, ref } from 'vue'
import type { BodyGraph } from '../../types/hd'
import { crossReadingOf } from '../../services/crossData'

const props = defineProps<{ chart: BodyGraph }>()

const reading = computed(() =>
  crossReadingOf(props.chart.personality, props.chart.design, props.chart.profile),
)

const detailOpen = ref(true)
</script>

<template>
  <section class="cross">
    <header class="cross-head">
      <div>
        <p class="t-xs">轮回交叉 INCARNATION CROSS</p>
        <h3 class="t-title name">{{ reading.name }}</h3>
        <p class="t-xs en">{{ reading.angle.en }} · {{ reading.angle.key === 'juxtaposition' ? 'Fixed Fate' : reading.angle.key === 'left' ? 'Transpersonal' : 'Personal Destiny' }}</p>
      </div>
      <button type="button" class="chev" :class="{ on: detailOpen }" aria-label="展开/收起" @click="detailOpen = !detailOpen">▾</button>
    </header>

    <template v-if="detailOpen">
      <!-- 四闸门角色分解 -->
      <ul class="gates-grid">
        <li v-for="g in reading.gates" :key="g.role" class="gate-role" :class="g.side">
          <div class="gr-top">
            <span class="gr-role">{{ g.role }}</span>
            <span class="gr-val t-mono">{{ g.gate }}.{{ g.line }}</span>
          </div>
          <p class="t-xs gr-desc">{{ g.roleDesc }}</p>
          <p class="gr-theme">
            <strong>{{ g.theme.keyword }}</strong>
            <span class="t-xs">{{ g.theme.mission }}</span>
          </p>
        </li>
      </ul>

      <!-- 角度说明 -->
      <div class="angle-box">
        <p class="t-sm"><strong>{{ reading.angle.label }}</strong>：{{ reading.angle.desc }}</p>
        <p class="t-xs">{{ reading.angle.purpose }}</p>
      </div>

      <!-- 核心释义 -->
      <section class="sec">
        <h4>核心释义</h4>
        <p v-for="(p, i) in reading.summary.split('\n')" :key="`s-${i}`" class="t-sm">{{ p }}</p>
      </section>

      <!-- 人生使命解读 -->
      <section class="sec">
        <h4>人生使命解读</h4>
        <p v-for="(p, i) in reading.mission.split('\n')" :key="`m-${i}`" class="t-sm">{{ p }}</p>
      </section>

      <!-- 活出状态 -->
      <section class="sec high">
        <h4>活出状态（高阶）</h4>
        <p v-for="(p, i) in reading.highState.split('\n')" :key="`h-${i}`" class="t-sm">{{ p }}</p>
      </section>

      <!-- 未活出状态 -->
      <section class="sec low">
        <h4>未活出状态（低频卡点）</h4>
        <p v-for="(p, i) in reading.lowState.split('\n')" :key="`l-${i}`" class="t-sm">{{ p }}</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.cross {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.cross-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
}

.name {
  margin-top: 2px;
  letter-spacing: 0.01em;
}

.en {
  color: var(--text-muted);
}

.chev {
  flex: none;
  color: var(--text-muted);
  transition: transform var(--dur-base) var(--ease-out);
  padding: 4px 8px;
}
.chev.on {
  transform: rotate(180deg);
}

/* 四闸门 2×2 */
.gates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

.gate-role {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-2);
  min-width: 0;
}

.gate-role.p {
  border-left: 3px solid var(--hd-line-p);
}

.gate-role.d {
  border-left: 3px solid var(--hd-line-d);
}

.gr-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}

.gr-role {
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-muted);
  font-weight: 600;
}

.gr-val {
  font-weight: 700;
  color: var(--text-primary);
}

.gr-desc {
  margin: 2px 0 6px;
  color: var(--text-muted);
}

.gr-theme {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.gr-theme strong {
  font-size: calc(var(--fs-body) * var(--font-scale));
  color: var(--text-primary);
}

.gr-theme .t-xs {
  color: var(--text-secondary);
  line-height: 1.5;
}

.angle-box {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  background: rgba(124, 58, 237, 0.07);
  border: 1px solid rgba(124, 58, 237, 0.18);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sec h4 {
  margin: 0 0 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--owner-shared);
}

.sec p {
  line-height: 1.7;
  color: var(--text-secondary);
}

.sec.high h4 {
  color: var(--status-success);
}

.sec.low h4 {
  color: var(--status-warning);
}

@media (max-width: 768px) {
  .gates-grid {
    grid-template-columns: 1fr;
  }
}
</style>
