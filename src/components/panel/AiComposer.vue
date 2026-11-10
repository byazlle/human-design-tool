<script setup lang="ts">
/**
 * AI 全维度组合解读（电脑端 / 手机端同一组件，功能完全一致）：
 * - 八大维度自由勾选（默认全选），一键统一 AI 综合解读
 * - 解读角度：固定维度 + 自定义方向输入框（事业、感情、修行、性格卡点、财富…）
 */
import { computed, ref } from 'vue'
import HdButton from '../base/HdButton.vue'
import { READING_ANGLES } from '../../services/readingAngles'

export type DimKey =
  | 'channels'
  | 'gates'
  | 'centers'
  | 'strategy'
  | 'definition'
  | 'authority'
  | 'cross'
  | 'profile'

const DIMENSIONS: Array<{ key: DimKey; label: string; desc: string }> = [
  { key: 'channels', label: '已激活通道', desc: '全部已定义通道及其作用' },
  { key: 'gates', label: '已激活闸门', desc: '全部激活闸门及主题' },
  { key: 'centers', label: '九大能量中心', desc: '各中心的定义 / 开放状态' },
  { key: 'strategy', label: '人生策略', desc: '能量类型对应的策略' },
  { key: 'definition', label: '整体定义类型', desc: '一分人 / 二分人…' },
  { key: 'authority', label: '内在权威', desc: '骶骨 / 情绪 / 直觉等' },
  { key: 'cross', label: '轮回交叉', desc: '使命与人生主题' },
  { key: 'profile', label: '人生角色类型', desc: '2/4、1/4 等及生产者类型' },
]

const props = defineProps<{ loading?: boolean }>()

const emit = defineEmits<{
  run: [payload: { dimensions: DimKey[]; angleKey: string; customDirection: string }]
}>()

const selected = ref<Set<DimKey>>(new Set(DIMENSIONS.map((d) => d.key)))
const angleKey = ref('comprehensive')
const customDirection = ref('')
const showCustom = ref(false)

function toggle(key: DimKey) {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

const allOn = computed(() => selected.value.size === DIMENSIONS.length)

function toggleAll() {
  selected.value = allOn.value ? new Set() : new Set(DIMENSIONS.map((d) => d.key))
}

const countLabel = computed(() => {
  const n = selected.value.size
  return n ? `${n} 个维度` : '请至少选择一个维度'
})

function run() {
  if (!selected.value.size || props.loading) return
  emit('run', {
    dimensions: DIMENSIONS.filter((d) => selected.value.has(d.key)).map((d) => d.key),
    angleKey: angleKey.value,
    customDirection: customDirection.value.trim(),
  })
}
</script>

<template>
  <div class="composer">
    <!-- 维度勾选 -->
    <div class="dims">
      <button
        type="button"
        class="dim-chip all"
        :class="{ on: allOn }"
        :title="'全选 / 清空'"
        @click="toggleAll"
      >
        {{ allOn ? '全选' : '清空' }}
      </button>
      <button
        v-for="d in DIMENSIONS"
        :key="d.key"
        type="button"
        class="dim-chip"
        :class="{ on: selected.has(d.key) }"
        :title="d.desc"
        @click="toggle(d.key)"
      >
        {{ d.label }}
      </button>
    </div>

    <!-- 解读角度 -->
    <div class="angles">
      <button
        v-for="a in READING_ANGLES"
        :key="a.key"
        type="button"
        class="angle-chip"
        :class="{ on: angleKey === a.key && !showCustom }"
        :title="a.desc"
        @click="
          () => {
            angleKey = a.key
            showCustom = false
          }
        "
      >
        {{ a.label }}
      </button>
      <button
        type="button"
        class="angle-chip"
        :class="{ on: showCustom }"
        @click="showCustom = !showCustom"
      >
        自定义方向
      </button>
    </div>

    <input
      v-if="showCustom"
      v-model="customDirection"
      class="custom-input"
      type="text"
      maxlength="60"
      placeholder="输入想要的解读角度，例如：事业、感情、修行、性格卡点、财富…"
      @keydown.enter="run"
    />

    <HdButton size="sm" :loading="loading" :disabled="!selected.size" @click="run">
      统一 AI 综合解读 · {{ countLabel }}
    </HdButton>
  </div>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 100%;
}

.dims,
.angles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.dim-chip,
.angle-chip {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface-2);
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  transition:
    background var(--dur-fast) ease,
    color var(--dur-fast) ease,
    border-color var(--dur-fast) ease;
}

.dim-chip:hover,
.angle-chip:hover {
  border-color: var(--border-strong);
}

.dim-chip.on,
.angle-chip.on {
  background: rgba(124, 58, 237, 0.14);
  border-color: var(--owner-shared);
  color: var(--text-primary);
  font-weight: 600;
}

.dim-chip.all {
  border-style: dashed;
}

.custom-input {
  height: 36px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: calc(var(--fs-sm) * var(--font-scale));
}

.custom-input:focus {
  outline: 2px solid rgba(124, 58, 237, 0.28);
  outline-offset: 1px;
  border-color: rgba(124, 58, 237, 0.4);
}

.composer :deep(.hd-btn) {
  align-self: flex-start;
}
</style>
