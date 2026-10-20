<script setup lang="ts">
defineProps<{
  label: string
  /** 图标名：plus / settings / help / close / back / chevron / layers / grid / copy / save / refresh / trash / download / upload / sun / moon / user */
  icon: string
  size?: 'sm' | 'md'
  active?: boolean
}>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="icon-btn"
    :class="[size ?? 'md', { active }]"
    :aria-label="label"
    :title="label"
    @click="emit('click')"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <template v-if="icon === 'plus'">
        <path d="M12 5v14M5 12h14" />
      </template>
      <template v-else-if="icon === 'settings'">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
      </template>
      <template v-else-if="icon === 'help'">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
        <path d="M12 17.5h.01" />
      </template>
      <template v-else-if="icon === 'close'">
        <path d="M6 6l12 12M18 6 6 18" />
      </template>
      <template v-else-if="icon === 'back'">
        <path d="M15 5l-7 7 7 7" />
      </template>
      <template v-else-if="icon === 'chevron-down'">
        <path d="M6 9l6 6 6-6" />
      </template>
      <template v-else-if="icon === 'chevron-up'">
        <path d="M6 15l6-6 6 6" />
      </template>
      <template v-else-if="icon === 'layers'">
        <path d="M12 3 3 8l9 5 9-5-9-5z" />
        <path d="M3 13l9 5 9-5" />
      </template>
      <template v-else-if="icon === 'grid'">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </template>
      <template v-else-if="icon === 'copy'">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
      </template>
      <template v-else-if="icon === 'save'">
        <path d="M5 4h11l3 3v13H5z" />
        <path d="M8 4v6h7V4M8 20v-6h8v6" />
      </template>
      <template v-else-if="icon === 'refresh'">
        <path d="M20 11a8 8 0 1 0-2.3 6.3" />
        <path d="M20 5v6h-6" />
      </template>
      <template v-else-if="icon === 'trash'">
        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      </template>
      <template v-else-if="icon === 'download'">
        <path d="M12 4v11M8 11l4 4 4-4M4 20h16" />
      </template>
      <template v-else-if="icon === 'upload'">
        <path d="M12 20V9M8 13l4-4 4 4M4 4h16" />
      </template>
      <template v-else-if="icon === 'sun'">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
      </template>
      <template v-else-if="icon === 'moon'">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </template>
      <template v-else-if="icon === 'user'">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
      </template>
      <template v-else-if="icon === 'chart'">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v8l5 3" />
      </template>
      <template v-else>
        <circle cx="12" cy="12" r="8" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.icon-btn.sm {
  width: 28px;
  height: 28px;
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.icon-btn.active {
  background: var(--surface-2);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .icon-btn {
    width: 44px;
    height: 44px;
  }
}
</style>
