<script setup lang="ts">
/**
 * 批量生成解读的常驻状态条（v2.4.0）。
 *
 * 放在 App.vue 顶层而不是弹窗里：批量生成可能跑几十份、耗时数分钟，
 * 用户发起后一定会切页或关弹窗；运行态存在 `ui.batch`，所以这里能一直显示。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui'
import { useAiStreams } from '../../composables/useAiStreams'

const ui = useUiStore()
const router = useRouter()
const streams = useAiStreams()

const batch = computed(() => ui.batch)
/** v3.0.0：每份档案一行；默认折叠，避免并发 128 时淹没界面 */
const rows = computed(() => streams.list.value.filter((s) => s.key.startsWith('batch:')))
const showRows = ref(false)

/** 有进度在跑，或刚跑完还留着结论 → 都显示 */
const visible = computed(() => batch.value.running || Boolean(batch.value.summary))

const percent = computed(() =>
  batch.value.total ? Math.round((batch.value.done / batch.value.total) * 100) : 0,
)

/** 本轮真正落库的份数 */
const storedCount = computed(() => batch.value.okIds.length)

function fmtMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} 秒`
  return `${Math.floor(total / 60)} 分 ${total % 60} 秒`
}

/** 已完成的档案里，只要有一个还存着解读就值得给「查看」入口 */
function openReadings() {
  const first = batch.value.okIds[0]
  ui.dismissBatchSummary()
  if (first) router.push(`/archive/${first}`)
}
</script>

<template>
  <Transition name="slide-up">
    <aside v-if="visible" class="batch-status" role="status" aria-live="polite">
      <div class="inner">
        <div class="line">
          <span class="dot" :class="batch.running ? 'busy' : batch.summaryOk ? 'ok' : 'warn'" />
          <span class="t-sm text">
            <template v-if="batch.running">
              正在批量生成解读 · {{ batch.done }} / {{ batch.total }}
              <span class="muted">· {{ batch.current || '准备中' }}</span>
            </template>
            <template v-else>{{ batch.summary }}</template>
          </span>

          <span v-if="batch.running" class="t-xs muted timing">
            {{ fmtMs(batch.elapsedMs) }}<template v-if="batch.etaMs !== null"> / 约剩 {{ fmtMs(batch.etaMs) }}</template>
          </span>
          <span v-else-if="storedCount" class="t-xs muted timing">
            已保存 {{ storedCount }} 份解读
          </span>

          <button v-if="!batch.running && storedCount" type="button" class="act" @click="openReadings">
            查看
          </button>
          <button
            v-if="!batch.running"
            type="button"
            class="act ghost"
            aria-label="关闭批量生成状态"
            @click="ui.dismissBatchSummary()"
          >
            关闭
          </button>
        </div>

        <div v-if="batch.running" class="bar" role="progressbar" :aria-valuenow="percent">
          <span class="bar-fill" :style="{ width: `${percent}%` }" />
        </div>

        <!-- v3.0.0 逐路流式明细：可折叠；每行显示连接态、已收字数与实时字/秒 -->
        <div v-if="rows.length" class="stream-detail" aria-live="off">
          <button type="button" class="act ghost stream-toggle" @click="showRows = !showRows">
            {{ showRows ? '收起' : '展开' }}逐路状态（{{ rows.length }} 份）
          </button>
          <ul v-if="showRows" class="stream-list" role="list">
            <li v-for="r in rows" :key="r.key" class="stream-item" role="listitem">
              <span class="sdot" :class="r.phase" />
              <span class="sname">{{ r.label }}</span>
              <span class="stext">{{ r.text }}</span>
              <span v-if="r.hint" class="shint">{{ r.hint }}</span>
            </li>
          </ul>
        </div>

        <p v-if="!batch.running && batch.failed.length" class="t-xs fails">
          失败 {{ batch.failed.length }} 份：{{ batch.failed.slice(0, 3).join('；')
          }}<template v-if="batch.failed.length > 3"> 等</template>
        </p>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.batch-status {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* 悬在底部浮动坞之上，避免互相遮挡 */
  bottom: calc(var(--dock-h, 72px) + var(--sp-3));
  width: min(680px, 94vw);
  z-index: var(--z-toast, 60);
  pointer-events: none;
}

.inner {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  background: var(--surface);
  box-shadow: var(--elev-2, 0 8px 28px rgba(8, 20, 26, 0.18));
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--text-muted);
}

.timing {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.busy {
  background: var(--action-primary);
  animation: pulse 1.2s ease-in-out infinite;
}
.dot.ok {
  background: var(--status-success);
}
.dot.warn {
  background: var(--status-warning);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.bar {
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--border);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--action-primary);
  transition: width 240ms ease;
}

.act {
  flex: none;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--action-primary);
}

.act.ghost {
  color: var(--text-muted);
}

.act:hover {
  border-color: var(--border-strong);
}

.fails {
  color: var(--status-error);
  line-height: 1.5;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 180ms ease,
    transform 200ms ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

@media (max-width: 768px) {
  .batch-status {
    width: 100vw;
    left: 0;
    transform: none;
    bottom: 0;
    border-radius: 0;
  }
  .slide-up-enter-from,
  .slide-up-leave-to {
    transform: translateY(10px);
  }
}
.stream-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stream-toggle {
  align-self: flex-start;
}
.stream-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stream-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--fs-xs, 11px);
  color: var(--text-secondary);
}
.sdot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--status-loading, #8a909c);
}
.sdot.connected,
.sdot.fallback {
  background: var(--status-warning, #d97706);
}
.sdot.receiving,
.sdot.done {
  background: var(--status-success, #1f9d55);
}
.sdot.failed {
  background: var(--status-error, #d92d20);
}
.sname {
  min-width: 72px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
.stext {
  flex: 1;
  min-width: 0;
}
.shint {
  color: var(--status-warning, #d97706);
}
</style>
