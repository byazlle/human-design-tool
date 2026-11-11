/**
 * AI 解读结果的复制 / 保存动作：各视图共用，避免出现空函数按钮。
 *
 * v2.4.0 起「保存」同时落两处：
 * - `hdt.ai.history.v1`：全局流水（最多 50 条），保留原有行为，不依赖档案；
 * - `readings` store：按「档案 + 范围 + 档位」归档，可以被档案页回看，
 *   也让批量生成能识别「这份档案已经有该维度的解读」而不重复消耗额度。
 *
 * 调用方知道 archiveId / scope / ref 时传进来，就能落进档案；不传则只写流水。
 */
import { useUiStore } from '../stores/ui'
import { makeReading, useReadingsStore } from '../stores/readings'
import type { AiAudience, AiDetailMode } from '../types/hd'

const HISTORY_KEY = 'hdt.ai.history.v1'
const HISTORY_LIMIT = 50

export interface AiResultSnapshot {
  title: string
  content: string
  /** 归属档案；缺省时只写全局流水，不进档案 */
  archiveId?: string
  /** 解读范围（unified / single / selection / …），需与 scope 一起给 */
  scope?: string
  /** 引用对象；与 aiClient.cacheKey 同口径 */
  ref?: string
  /**
   * 生成档位；缺省回落到本次请求锁定的 `ui.aiReading.resultMode`，再兜底 detailed。
   * v3.0.0 之前无条件缺省 detailed，导致其余 4 个视图存进档案的档位是错的。
   */
  mode?: AiDetailMode
  /** 面向人群；缺省回落到生成时锁定的受众（不是设置页当前值） */
  audience?: AiAudience
  /** 输出是否因 token 上限触顶；缺省回落到生成时记录的标记 */
  truncated?: boolean
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
  } catch {
    ui.notify('保存失败', 'error')
    return
  }

  // 有档案归属时额外落进 readings；写盘失败不算保存失败（流水已存住）
  if (snapshot.archiveId) {
    const readings = useReadingsStore()
    // scope / ref 缺省取当前面板正在展示的解读——调用方只需给出档案归属
    const scope = snapshot.scope ?? ui.aiReading.scope ?? 'single'
    const ref = snapshot.ref ?? ui.aiReading.ref ?? '-'
    const meta = ui.aiReading
    const ok = readings.put(
      makeReading({
        archiveId: snapshot.archiveId,
        scope,
        ref,
        mode: snapshot.mode ?? meta.resultMode ?? 'detailed',
        audience: snapshot.audience ?? meta.resultAudience ?? 'pro',
        truncated: snapshot.truncated ?? meta.resultTruncated ?? false,
        title: snapshot.title,
        content: snapshot.content,
      }),
    )
    ui.notify(ok ? '已保存到该档案的解读' : '已保存到本地记录（档案写入失败）', ok ? 'success' : 'error')
    return
  }

  ui.notify('已保存到本地记录', 'success')
}
