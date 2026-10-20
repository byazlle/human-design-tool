<script setup lang="ts">
/** 档案首页：桌面自由画布 / 手机竖向列表（DESIGN.md §5 / §8） */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useArchiveStore } from '../stores/archive'
import { useBoardStore, useCompositeStore } from '../stores/board'
import { useUiStore } from '../stores/ui'
import { useBreakpoint } from '../composables/useBreakpoint'
import AppToolbar from '../components/base/AppToolbar.vue'
import ArchiveCanvas from '../components/archive/ArchiveCanvas.vue'
import MobileArchiveList from '../components/archive/MobileArchiveList.vue'
import BulkActionBar from '../components/archive/BulkActionBar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import HdButton from '../components/base/HdButton.vue'

const router = useRouter()
const archiveStore = useArchiveStore()
const board = useBoardStore()
const composite = useCompositeStore()
const ui = useUiStore()
const { isMobile } = useBreakpoint()

const zoom = ref(1)
const list = computed(() => archiveStore.filtered)
const selected = computed(() => archiveStore.selectedIds)

function open(id: string) {
  router.push(`/archive/${id}`)
}

function toggleSelect(id: string) {
  archiveStore.toggleSelect(id)
}

function addToComposite(id: string) {
  if (!archiveStore.selectedIds.includes(id)) archiveStore.toggleSelect(id)
  if (archiveStore.selectedIds.length === 2) {
    const [a, b] = archiveStore.selectedIds
    composite.setPair(a, b)
    router.push(`/composite/${a}/${b}`)
  } else {
    ui.notify('已选中，请再选择一份档案生成合盘')
  }
}

function openBoards() {
  const ids = archiveStore.selectedIds
  if (!ids.length) return
  board.open(ids)
  if (isMobile.value) {
    router.push(`/archive/${ids[0]}`)
  } else {
    router.push(`/boards?ids=${ids.join(',')}`)
  }
}

function makeComposite() {
  const ids = archiveStore.selectedIds
  if (ids.length !== 2) {
    ui.notify('请选择恰好 2 份档案', 'error')
    return
  }
  composite.setPair(ids[0], ids[1])
  router.push(`/composite/${ids[0]}/${ids[1]}`)
}

function closeCard(id: string) {
  archiveStore.toggleSelect(id)
  ui.notify('已取消选择（档案仍保留在库中）')
}

function goNew() {
  router.push('/new')
}
function goSettings() {
  router.push('/settings')
}

function loadSamples() {
  const added = archiveStore.seedSamples()
  ui.notify(added ? `已载入 ${added} 份示例档案` : '示例档案已存在', added ? 'success' : undefined)
}
</script>

<template>
  <div class="page">
    <AppToolbar
      :title="isMobile ? '人类图' : '档案库'"
      show-search
      :search-value="archiveStore.keyword"
      @update:search-value="archiveStore.setKeyword($event)"
      @new="goNew"
      @settings="goSettings"
      @help="ui.notify('点击卡片「加入合盘」，选两份即可生成合盘。双击卡片打开完整盘。')"
    >
      <template #left>
        <div v-if="!isMobile" class="zoom">
          <button v-for="z in [1, 1.5, 2]" :key="z" type="button" :class="{ on: zoom === z }" @click="zoom = z">
            {{ z }}×
          </button>
        </div>
      </template>
    </AppToolbar>

    <main class="content">
      <EmptyState
        v-if="!list.length"
        title="还没有档案"
        desc="填写出生日期与出生时间，即可在本机生成完整人体图。所有计算与数据都留在这台设备上。"
        action-label="新建档案"
        @action="goNew"
      >
        <template #extra>
          <HdButton variant="ghost" size="sm" @click="loadSamples">载入示例档案</HdButton>
        </template>
      </EmptyState>

      <template v-else>
        <ArchiveCanvas
          v-if="!isMobile"
          :archives="list"
          :selected-ids="selected"
          :zoom="zoom"
          @open="open"
          @add-to-composite="addToComposite"
          @close="closeCard"
          @toggle-select="toggleSelect"
        />
        <MobileArchiveList
          v-else
          :archives="list"
          :selected-ids="selected"
          @open="open"
          @toggle-select="toggleSelect"
        />
      </template>
    </main>

    <!-- 桌面：尾部批量条 -->
    <div v-if="!isMobile && selected.length" class="bulk-dock">
      <BulkActionBar
        :count="selected.length"
        @open="openBoards"
        @composite="makeComposite"
        @clear="archiveStore.clearSelect()"
      />
    </div>

    <!-- 手机：底部固定动作 -->
    <div v-if="isMobile && list.length" class="mobile-dock safe-bottom">
      <span class="t-sm dock-hint">已选 {{ selected.length }} / 2</span>
      <HdButton :disabled="selected.length !== 2" @click="makeComposite">生成合盘</HdButton>
      <HdButton variant="ghost" @click="goNew">新建</HdButton>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: var(--sp-3) var(--sp-4) 96px;
}

.zoom {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
}

.zoom button {
  min-width: 34px;
  height: 26px;
  border-radius: 4px;
  font-size: calc(var(--fs-xs) * var(--font-scale));
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.zoom button.on {
  background: var(--glass-bg-float);
  color: var(--text-primary);
  box-shadow: 0 2px 8px -4px rgba(16, 24, 40, 0.4);
}

.bulk-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--sp-4);
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: var(--z-toolbar);
}

.bulk-dock > :deep(*) {
  pointer-events: auto;
}

.mobile-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  background: var(--surface);
  border-top: 1px solid var(--border);
  z-index: var(--z-toolbar);
}

.dock-hint {
  flex: 1;
  color: var(--text-secondary);
}
</style>
