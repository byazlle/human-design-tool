/**
 * 完整版截断修复回归：
 * - 响应 finish_reason === 'length' 时必须自动续写并拼接，不能把半句话当完整内容返回；
 * - 续写次数有上限，达到上限后停止（内容仍返回，但会告警）；
 * - 完整版融合/分项的 maxTokens 必须覆盖提示词的字数契约。
 * fetch 用 stub 替换，不发真实请求。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_CONTINUATIONS,
  PROMPT_VERSION,
  explain,
  resolveRequestParams,
} from '../src/services/aiClient'
import type { AiConfig } from '../src/types/hd'

const CFG: AiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 60000,
  cacheEnabled: false,
}

function reply(content: string, finishReason: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

const args = { cfg: CFG, scope: 'full-fusion', ref: 'fusion', offline: '盘面事实', detailMode: 'full' as const }

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI 输出截断续写', () => {
  it('finish_reason=stop 时只请求一次', async () => {
    fetchMock.mockResolvedValueOnce(reply('完整内容', 'stop'))
    const out = await explain(args)
    expect(out).toBe('完整内容')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('finish_reason=length 时自动续写并拼接，且第二次请求带 assistant 前缀', async () => {
    fetchMock
      .mockResolvedValueOnce(reply('第一段', 'length'))
      .mockResolvedValueOnce(reply('第二段', 'stop'))

    const out = await explain(args)
    expect(out).toBe('第一段\n\n第二段')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(secondBody.messages.some((m) => m.role === 'assistant' && m.content === '第一段')).toBe(true)
    expect(secondBody.messages[secondBody.messages.length - 1].role).toBe('user')
    expect(secondBody.messages[secondBody.messages.length - 1].content).toContain('中断处继续')
  })

  it('连续触顶时续写不超过 MAX_CONTINUATIONS 次', async () => {
    for (let i = 0; i <= MAX_CONTINUATIONS; i += 1) {
      fetchMock.mockResolvedValueOnce(reply(`段${i + 1}`, 'length'))
    }
    const out = await explain(args)
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONTINUATIONS + 1)
    expect(out.split('\n\n')).toHaveLength(MAX_CONTINUATIONS + 1)
  })

  it('续写过程中用户取消不写伪造内容', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementationOnce(async () => {
      controller.abort()
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    })
    await expect(explain({ ...args, signal: controller.signal })).rejects.toMatchObject({
      kind: 'cancelled',
    })
  })
})

describe('完整版采样额度覆盖字数契约', () => {
  it('融合与分项的 maxTokens 足以覆盖契约字数', () => {
    // 融合契约约 2900–4500 字，分项契约 900–1400 字（中文按 ≥1 token/字 估）
    expect(resolveRequestParams('full-fusion', 'full').maxTokens).toBeGreaterThanOrEqual(8000)
    expect(resolveRequestParams('full-gate', 'full').maxTokens).toBeGreaterThanOrEqual(4000)
    expect(resolveRequestParams('full-channel', 'full').maxTokens).toBeGreaterThanOrEqual(4000)
  })

  it('提示词版本已升，避免命中旧的截断缓存', () => {
    expect(PROMPT_VERSION).toBe('3.2')
  })
})
