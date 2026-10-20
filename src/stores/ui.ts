import { defineStore } from 'pinia'
import type { CenterId } from '../types/hd'

export type PanelKind = 'gate' | 'channel' | 'center'
export type PanelSource = 'a' | 'b' | 'merged' | 'single'

export interface PanelSelection {
  kind: PanelKind
  ref: string | number
  source: PanelSource
}

export interface AiReadingState {
  open: boolean
  scope: string
  ref?: string
  title: string
  content: string
  loading: boolean
  error: string | null
}

interface UiState {
  panel: PanelSelection | null
  drawerOpen: boolean
  aiReading: AiReadingState
  toast: { text: string; kind: 'info' | 'success' | 'error' } | null
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    panel: null,
    drawerOpen: false,
    aiReading: {
      open: false,
      scope: 'single',
      ref: undefined,
      title: 'AI 深度解读',
      content: '',
      loading: false,
      error: null,
    },
    toast: null,
  }),

  actions: {
    openGate(gate: number, source: PanelSource = 'single') {
      this.panel = { kind: 'gate', ref: gate, source }
      this.drawerOpen = true
    },
    openChannel(key: string, source: PanelSource = 'single') {
      this.panel = { kind: 'channel', ref: key, source }
      this.drawerOpen = true
    },
    openCenter(id: CenterId, source: PanelSource = 'single') {
      this.panel = { kind: 'center', ref: id, source }
      this.drawerOpen = true
    },
    closePanel() {
      this.panel = null
      this.drawerOpen = false
    },

    openAi(scope: string, ref?: string, title = 'AI 深度解读') {
      this.aiReading = {
        open: true,
        scope,
        ref,
        title,
        content: '',
        loading: false,
        error: null,
      }
    },
    setAiLoading(loading: boolean) {
      this.aiReading.loading = loading
    },
    setAiContent(content: string) {
      this.aiReading.content = content
      this.aiReading.loading = false
      this.aiReading.error = null
    },
    setAiError(message: string) {
      this.aiReading.error = message
      this.aiReading.loading = false
    },
    closeAi() {
      this.aiReading.open = false
    },

    notify(text: string, kind: 'info' | 'success' | 'error' = 'info') {
      this.toast = { text, kind }
      window.setTimeout(() => {
        if (this.toast?.text === text) this.toast = null
      }, 2600)
    },
  },
})
