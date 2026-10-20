<script setup lang="ts">
defineProps<{ title: string; desc?: string; actionLabel?: string }>()
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="empty">
    <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
      <circle cx="60" cy="60" r="42" fill="none" stroke="var(--border)" stroke-width="2" />
      <circle cx="60" cy="60" r="8" fill="var(--border)" />
      <path d="M60 18v18M60 84v18M18 60h18M84 60h18" stroke="var(--border)" stroke-width="2" stroke-linecap="round" />
      <path d="M32 32l12 12M76 76l12 12M88 32 76 44M44 76 32 88" stroke="var(--border)" stroke-width="2" stroke-linecap="round" />
    </svg>
    <h3 class="t-title">{{ title }}</h3>
    <p v-if="desc" class="t-sm desc">{{ desc }}</p>
    <button v-if="actionLabel" type="button" class="action" @click="emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  padding: var(--sp-8) var(--sp-4);
  text-align: center;
}

.desc {
  max-width: 320px;
  color: var(--text-secondary);
}

.action {
  margin-top: var(--sp-2);
  min-height: 40px;
  padding: 0 var(--sp-4);
  border-radius: var(--radius-md);
  background: var(--action-primary);
  color: var(--surface);
  font-size: calc(var(--fs-body) * var(--font-scale));
}
:root[data-theme='dark'] .action {
  color: #16181d;
}
</style>
