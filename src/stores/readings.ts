/**
 * AI 解读结果的持久化（v2.4.0 新增）。
 *
 * 为什么需要它：v2.3.0 及之前，AI 解读**从不落盘到档案**——唯一的「保存」是
 * `useAiResultActions.saveAiResult()` 把文本塞进 `hdt.ai.history.v1`（最多 50 条的全局流水）。
 * 手动看一次解读、关掉面板就没了；批量生成几十份解读将无处存放。
 * 这是「批量生成解读」必须先补的前置。
 *
 * 设计取舍：**不改 `Archive` 结构、不动 `SCHEMA_VERSION`**。
 * - 解读正文动辄 1000–3000 字，混进 `hdt.archives.v1` 会让档案列表的每次 persist
 *   都序列化几 MB 文本；档案与解读的读写时机、体积、失效条件都不同，分键存储更稳。
 * - 不进 `Archive` 也就不改变备份导出形状，`backupImport.ts` 与既有测试零改动。
 *
 * 键：`${archiveId}|${scope}|${ref}|${mode}` —— 语义维度与 `aiClient.cacheKey()` 对齐，
 * 因此「同一档案 + 同一范围 + 同一档位」只有一条记录，重跑是覆盖而非堆积。
 */
import { defineStore } from 'pinia'
import type { AiAudience, AiDetailMode } from '../types/hd'
import { ENGINE_VERSION } from '../engine/version'
import { PROMPT_VERSION } from '../services/aiClient'
import { loadJsonChecked, saveJson } from '../utils/storage'

export const READINGS_KEY = 'hdt.ai.readings.v1'

/** 单份档案最多保留多少条解读（超出按时间淘汰最旧） */
export const READINGS_PER_ARCHIVE_LIMIT = 12

export interface ReadingRecord {
  archiveId: string
  /** 解读范围：unified / single / selection / gate / channel / center / composite-* / chiron */
  scope: string
  /** 引用对象；unified 档为「维度:角度:自定义」拼串 */
  ref: string
  mode: AiDetailMode
  /** 面板标题，供列表展示 */
  title: string
  content: string
  /** 生成时刻（ISO） */
  at: string
  /** 生成时的提示词版本；与当前不一致表示提示词已升级，内容可能过期 */
  promptVersion: string
  /** 生成时的计算内核版本；与当前不一致表示盘面已重算，内容可能过期 */
  engineVersion: string
  /** v2.5.0 面向人群；旧记录缺省按专业版 */
  audience?: AiAudience
  /** v2.5.0 输出因 token 上限触顶，内容可能不完整 */
  truncated?: boolean
}

/**
 * 解读记录的稳定标识（store 索引键与去重键）。
 *
 * v2.5.0：面向人群参与键，但**只在简明版时追加一段**——
 * 专业版与所有旧记录仍用原来的 4 段键，存量数据、导出格式与既有测试全部不动；
 * 简明版另起一段，让同一张盘的专业版 / 简明版可以并存、互不覆盖。
 */
export function readingKey(
  archiveId: string,
  scope: string,
  ref: string,
  mode: AiDetailMode,
  audience: AiAudience = 'pro',
): string {
  const base = `${archiveId}|${scope}|${ref}|${mode}`
  return audience === 'plain' ? `${base}|plain` : base
}

export function keyOfReading(r: ReadingRecord): string {
  return readingKey(r.archiveId, r.scope, r.ref, r.mode, r.audience ?? 'pro')
}

/**
 * 记录是否已过期：提示词版本或内核版本变化后，旧解读口径可能不再准确。
 * 标为「已过期」而非删除——用户仍可查看历史内容，只是需重新生成才得到当前口径。
 */
export function isStale(r: ReadingRecord): boolean {
  return r.promptVersion !== PROMPT_VERSION || r.engineVersion !== ENGINE_VERSION
}

/** 组装一条记录（统一 fill 生成时的版本戳） */
export function makeReading(input: {
  archiveId: string
  scope: string
  ref: string
  mode: AiDetailMode
  title: string
  content: string
  /** 面向人群；不传按专业版 */
  audience?: AiAudience
  /** 输出是否因 token 上限触顶 */
  truncated?: boolean
}): ReadingRecord {
  return {
    ...input,
    at: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    engineVersion: ENGINE_VERSION,
  }
}

interface ReadingsState {
  list: ReadingRecord[]
  /** 启动读取失败时的错误；null 表示读取正常 */
  loadError: string | null
}

function isRecord(raw: unknown): raw is ReadingRecord {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Partial<ReadingRecord>
  return (
    typeof r.archiveId === 'string' &&
    typeof r.scope === 'string' &&
    typeof r.ref === 'string' &&
    typeof r.content === 'string' &&
    typeof r.at === 'string'
  )
}

/** 补全缺失字段：旧记录可能没有 mode / promptVersion，按保守值回填而不丢弃 */
function normalize(raw: ReadingRecord): ReadingRecord {
  return {
    archiveId: raw.archiveId,
    scope: raw.scope,
    ref: raw.ref,
    mode: raw.mode === 'detailed' || raw.mode === 'full' ? raw.mode : 'concise',
    title: typeof raw.title === 'string' && raw.title ? raw.title : 'AI 解读',
    content: raw.content,
    at: raw.at,
    promptVersion: typeof raw.promptVersion === 'string' ? raw.promptVersion : '',
    engineVersion: typeof raw.engineVersion === 'string' ? raw.engineVersion : '',
    audience: raw.audience === 'plain' ? 'plain' : 'pro',
    truncated: raw.truncated === true,
  }
}

export const useReadingsStore = defineStore('readings', {
  state: (): ReadingsState => {
    const loaded = loadJsonChecked<unknown>(READINGS_KEY, [])
    return {
      list: Array.isArray(loaded.value) ? loaded.value.filter(isRecord).map(normalize) : [],
      loadError: loaded.error,
    }
  },

  getters: {
    /** 某份档案的全部解读，新→旧 */
    ofArchive(state) {
      return (archiveId: string): ReadingRecord[] =>
        state.list.filter((r) => r.archiveId === archiveId).sort((a, b) => (a.at < b.at ? 1 : -1))
    },
    /** 最近生成的解读（跨档案），用于全局列表 */
    recent(state): ReadingRecord[] {
      return [...state.list].sort((a, b) => (a.at < b.at ? 1 : -1))
    },
    /** 已生成解读的档案 id 集合，批量页据此标记「已有解读」 */
    coveredIds(state): Set<string> {
      return new Set(state.list.map((r) => r.archiveId))
    },
    /** 查询单条（不存在返回 null）；v2.5.0 起按面向人群区分 */
    find(state) {
      return (
        archiveId: string,
        scope: string,
        ref: string,
        mode: AiDetailMode,
        audience: AiAudience = 'pro',
      ) => {
        const key = readingKey(archiveId, scope, ref, mode, audience)
        return state.list.find((r) => keyOfReading(r) === key) ?? null
      }
    },
  },

  actions: {
    /** @returns 是否写入成功（失败时读取侧数据仍更新，只是不落盘） */
    persist(): boolean {
      return saveJson(READINGS_KEY, this.list)
    },

    /** 写入或覆盖一条解读；返回是否成功落盘 */
    put(record: ReadingRecord): boolean {
      return this.putMany([record])
    },

    /**
     * 批量写入（批量生成时逐项完成后调用）。
     * 体量控制在这里统一做：按 archiveId 分组，每组按时间倒序保留前
     * `READINGS_PER_ARCHIVE_LIMIT` 条；只淘汰最旧，刚写入的因排在最前必然保留。
     */
    putMany(records: ReadingRecord[]): boolean {
      if (!records.length) return true
      const byKey = new Map<string, ReadingRecord>()
      for (const r of this.list) byKey.set(keyOfReading(r), r)
      for (const r of records) byKey.set(keyOfReading(r), r)

      const grouped = new Map<string, ReadingRecord[]>()
      for (const r of byKey.values()) {
        const bucket = grouped.get(r.archiveId)
        if (bucket) bucket.push(r)
        else grouped.set(r.archiveId, [r])
      }

      const kept: ReadingRecord[] = []
      for (const bucket of grouped.values()) {
        bucket.sort((a, b) => (a.at < b.at ? 1 : -1))
        kept.push(...bucket.slice(0, READINGS_PER_ARCHIVE_LIMIT))
      }
      kept.sort((a, b) => (a.at < b.at ? 1 : -1))
      this.list = kept
      return this.persist()
    },

    remove(id: string, scope: string, ref: string, mode: AiDetailMode, audience: AiAudience = 'pro') {
      const key = readingKey(id, scope, ref, mode, audience)
      const next = this.list.filter((r) => keyOfReading(r) !== key)
      if (next.length === this.list.length) return
      this.list = next
      this.persist()
    },

    /** 删除档案时同步清掉它的解读，避免孤儿数据长期占空间 */
    removeOfArchives(archiveIds: Iterable<string>) {
      const ids = new Set(archiveIds)
      if (!ids.size) return
      const next = this.list.filter((r) => !ids.has(r.archiveId))
      if (next.length === this.list.length) return
      this.list = next
      this.persist()
    },

    /**
     * 清理孤儿解读（档案已不存在的记录）。
     *
     * 只在启动时调用，而**不在删除档案时立即调用**：删除档案在 5 秒内可撤销，
     * 若删除瞬间就抹掉解读，撤销回来的档案会永久丢失它已生成的解读。
     * 推迟到下次启动再清理，既保住撤销语义，又不会让孤儿数据长期堆积。
     */
    pruneOrphans(keepIds: Iterable<string>) {
      const keep = new Set(keepIds)
      const next = this.list.filter((r) => keep.has(r.archiveId))
      if (next.length === this.list.length) return
      this.list = next
      this.persist()
    },

    clearAll() {
      this.list = []
      this.persist()
    },
  },
})
