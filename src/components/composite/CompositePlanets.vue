<script setup lang="ts">
/**
 * 合图盘面扩容：A / B 双方 13 星完整落点表（个性侧 / 设计侧 · 闸门.爻）。
 */
import type { BodyGraph } from '../../types/hd'
import { PLANET_LABELS, PLANETS } from '../../types/hd'

const props = defineProps<{
  chartA: BodyGraph
  chartB: BodyGraph
  nameA: string
  nameB: string
}>()

function posOf(chart: BodyGraph, side: 'personality' | 'design', planet: string) {
  const p = chart[side].find((x) => x.planet === planet)
  return p ? `${p.gate}.${p.line}` : '—'
}
</script>

<template>
  <div class="pt">
    <div class="table-wrap">
      <table class="pt-table">
        <thead>
          <tr>
            <th class="t-xs">星体</th>
            <th class="t-xs" colspan="2">{{ nameA }}</th>
            <th class="t-xs" colspan="2">{{ nameB }}</th>
          </tr>
          <tr>
            <th />
            <th class="t-xs sub">显意识</th>
            <th class="t-xs sub">潜意识</th>
            <th class="t-xs sub">显意识</th>
            <th class="t-xs sub">潜意识</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="planet in PLANETS" :key="planet">
            <td class="t-sm planet">{{ PLANET_LABELS[planet] }}</td>
            <td class="t-mono cell p">{{ posOf(chartA, 'personality', planet) }}</td>
            <td class="t-mono cell d">{{ posOf(chartA, 'design', planet) }}</td>
            <td class="t-mono cell p">{{ posOf(chartB, 'personality', planet) }}</td>
            <td class="t-mono cell d">{{ posOf(chartB, 'design', planet) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="t-xs note">数值为 闸门.爻（gate.line）；显意识 = 个性侧（Personality），潜意识 = 设计侧（Design）。</p>
  </div>
</template>

<style scoped>
.pt {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.table-wrap {
  overflow-x: auto;
}

.pt-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 360px;
}

.pt-table th {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.pt-table th.sub {
  color: var(--text-muted);
  font-weight: 500;
}

.pt-table td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.planet {
  color: var(--text-secondary);
}

.cell {
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.cell.p {
  color: var(--hd-line-p);
  font-weight: 600;
}

.cell.d {
  color: var(--hd-line-d);
  font-weight: 600;
}

.note {
  color: var(--text-muted);
}
</style>
