<script setup lang="ts">
/**
 * 批量生成解读的常驻状态条（v2.4.0）。
 *
 * 放在 App.vue 顶层而不是弹窗里：批量生成可能跑几十份、耗时数分钟，
 * 用户发起后一定会切页或关弹窗；运行态存在 `ui.batch`，所以这里能一直显示。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '../../stores/ui'

const ui = useUiStore()
const router = useRouter()

const batch = computed(() => ui.batch)

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
</style>
