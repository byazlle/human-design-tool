/**
 * AI 解读「中断」的跨实例语义回归（v2.4.0）。
 *
 * 背景：v2.4.0 把 5 个视图里重复的 `<AiReadingPanel>` 绑定收敛进
 * `components/panel/AiReadingHost.vue` 之后，同一个 AI 面板会由**两个**组件
 * 分别调用 `useAiReading()`：
 * - 视图负责**发起**（`run`）；
 * - host 负责面板上的「中断」按钮与关闭（`abort`）。
 *
 * 如果 `AbortController` 是 `useAiReading()` 的闭包变量，host 侧的 `abort()`
 * 看到的是它自己的 `null`，会判定「没有在途请求」直接返回——**中断按钮静默失效**。
 * 所以它必须是模块级的。这个文件就是钉住这条不变量：
 * 「A 实例发起的请求，B 实例能中断」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'

const explainMock = vi.hoisted(() => vi.fn())
vi.mock('../src/services/aiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/aiClient')>()
  return { ...actual, explain: explainMock }
})

import { useAiReading } from '../src/composables/useAiReading'
import { useSettingsStore } from '../src/stores/settings'
import { useUiStore } from '../src/stores/ui'
import type { AiConfig } from '../src/types/hd'
import type { AiExplainArgs } from '../src/services/aiClient'

const CFG: AiConfig = {
  baseUrl: 'https://host.example.test/v1',
  apiKey: 'host-test-key-1234',
  model: 'host-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

/** 一个直到 signal 被 abort 才 reject 的假请求，用来观察「中断是否真的到达在途请求」 */
function pendingUntilAborted(args: AiExplainArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    if (args.signal?.aborted) {
      reject(Object.assign(new Error('已取消'), { kind: 'cancelled' }))
      return
    }
    args.signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('已取消'), { kind: 'cancelled' })),
    )
  })
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  })
  setActivePinia(createPinia())
  explainMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function runOn(run: (r: ReturnType<typeof useAiReading>) => Promise<void>) {
  const scope = effectScope()
  const reading = scope.run(() => useAiReading())!
  return { scope, promise: run(reading) }
}

describe('中断的跨实例语义', () => {
  it('★ 甲实例发起的请求，乙实例的 abort() 能中断它', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    explainMock.mockImplementation(pendingUntilAborted)

    // 甲：像视图那样发起请求
    const a = runOn((r) => r.run({ scope: 'gate', ref: '1', title: '闸门 1', offline: '离线事实' }))
    // 乙：像 AiReadingHost 那样只负责中断
    const bScope = effectScope()
    const b = bScope.run(() => useAiReading())!

    expect(explainMock).toHaveBeenCalledTimes(1)
    b.abort()

    await a.promise
    a.scope.stop()
    bScope.stop()

    // 面板必须退出 loading，而不是永远停在骨架屏
    const ui = useUiStore()
    expect(ui.aiReading.loading).toBe(false)
    // 中断不算错误，也不写入伪造内容
    expect(ui.aiReading.content).toBe('')
    expect(ui.aiReading.error).toBeNull()
  })

  it('空闲时 abort() 是幂等的（不误标取消、不写错误）', () => {
    const a = effectScope()
    const r = a.run(() => useAiReading())!
    r.abort()
    r.abort()
    const ui = useUiStore()
    expect(ui.aiReading.loading).toBe(false)
    expect(ui.aiReading.error).toBeNull()
    a.stop()
  })

  it('面板关闭会中断在途请求（watch 仍在同一份 controller 上生效）', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    explainMock.mockImplementation(pendingUntilAborted)

    const a = runOn((r) => r.run({ scope: 'gate', ref: '1', title: '闸门 1', offline: '离线事实' }))
    const ui = useUiStore()
    expect(ui.aiReading.open).toBe(true)

    // 必须先让 open=true 落地一次：watch 比较的是「冲刷时的旧值 vs 新值」，
    // 若在同一 tick 内 true→false，两值相等会被 Vue 合并掉而不触发回调。
    await nextTick()
    expect(ui.aiReading.loading).toBe(true)

    ui.closeAi() // 触发 useAiReading 里的 watch(open) → abort
    await nextTick()

    await a.promise
    a.scope.stop()

    expect(ui.aiReading.loading).toBe(false)
    expect(explainMock).toHaveBeenCalledTimes(1)
  })

  it('后发起的请求接管 controller，中断作用于新的那一次', async () => {
    const settings = useSettingsStore()
    settings.saveAi({ ...CFG })
    explainMock.mockImplementation(pendingUntilAborted)

    const a = effectScope()
    const r = a.run(() => useAiReading())!
    const first = r.run({ scope: 'gate', ref: '1', title: '第一次', offline: '离线事实' })
    const second = r.run({ scope: 'gate', ref: '2', title: '第二次', offline: '离线事实' })

    // 第一次被 run() 内部的 abort() 主动打断
    await first
    expect(explainMock.mock.calls.length).toBeGreaterThanOrEqual(2)

    r.abort()
    await second
    a.stop()

    expect(useUiStore().aiReading.loading).toBe(false)
  })
})
