<script setup lang="ts">
/**
 * AI 配置状态标识（v2.3.0 · T-4 / R-4）。
 * 只读复用 settings.aiConfigured；不校验合法性（由 useAiReading.run 的 validateAiConfig 负责），
 * 不新增配置项、不探测网络。
 */
import { computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ settings: [] }>()

const settings = useSettingsStore()
const configured = computed(() => settings.aiConfigured)
</script>

<template>
  <span
    class="ai-config-badge"
    :class="{ compact }"
    :aria-label="configured ? 'AI 配置状态：已配置' : 'AI 配置状态：未配置'"
  >
    <span class="dot" :class="configured ? 'ok' : 'warn'" aria-hidden="true" />
    <span class="label">{{ configured ? 'AI 已配置' : 'AI 未配置' }}</span>
    <button
      v-if="!configured"
      type="button"
      class="go"
      aria-label="前往设置页配置 AI"
      @click="emit('settings')"
    >
      去设置
    </button>
  </span>
</template>

<style scoped>
.ai-config-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  white-space: nowrap;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.ok {
  background: var(--status-success);
}
.dot.warn {
  background: var(--status-warning);
}

.label {
  flex: none;
}

.go {
  flex: none;
  min-height: 28px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  color: var(--action-primary);
  font-size: calc(var(--fs-xs) * var(--font-scale));
}
.go:hover {
  background: rgba(124, 58, 237, 0.1);
}

/* 手机底部固定条用 compact；热区 ≥44×44 */
@media (max-width: 768px) {
  .ai-config-badge.compact {
    min-height: 44px;
  }
  .go {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
