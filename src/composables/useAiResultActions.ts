/**
 * AI 解读结果的复制 / 保存动作：各视图共用，避免出现空函数按钮。
 * 保存写入 hdt.ai.history.v1（最多 50 条）。
 */
import { useUiStore } from '../stores/ui'

const HISTORY_KEY = 'hdt.ai.history.v1'
const HISTORY_LIMIT = 50

export interface AiResultSnapshot {
  title: string
  content: string
}

export async function copyAiResult(content: string): Promise<void> {
  const ui = useUiStore()
  try {
    await navigator.clipboard.writeText(content)
    ui.notify('已复制', 'success')
  } catch {
    ui.notify('复制失败，请手动选择文本', 'error')
  }
}

export function saveAiResult(snapshot: AiResultSnapshot): void {
  const ui = useUiStore()
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown[]
    list.unshift({
      title: snapshot.title,
      content: snapshot.content,
      at: new Date().toISOString(),
    })
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)))
    ui.notify('已保存到本地记录', 'success')
  } catch {
    ui.notify('保存失败', 'error')
  }
}
