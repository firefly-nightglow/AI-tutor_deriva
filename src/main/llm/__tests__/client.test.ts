import { describe, expect, it, vi } from 'vitest'
import { createOpenAiCompatibleClient } from '../client'
import { LlmError } from '../errors'
import type { ChatStreamChunk, FetchLike } from '../types'

function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
  return new Response(body, { status: 200 })
}

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
}

async function collect(client: ReturnType<typeof createOpenAiCompatibleClient>, signal?: AbortSignal) {
  const chunks: ChatStreamChunk[] = []
  for await (const chunk of client.streamChat([{ role: 'user', content: 'hi' }], { signal })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('OpenAI-compatible streaming client', () => {
  it('yields delta text and a done chunk, ignoring keep-alives and reasoning deltas', async () => {
    const fetchImpl: FetchLike = async () =>
      streamOf([
        ': keep-alive\n\n',
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: '思考中' } }] })}\n\n`,
        sseChunk('数列'),
        sseChunk('极限'),
        'data: [DONE]\n\n'
      ])
    const client = createOpenAiCompatibleClient({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      fetchImpl
    })

    expect(await collect(client)).toEqual([
      { type: 'delta', text: '数列' },
      { type: 'delta', text: '极限' },
      { type: 'done' }
    ])
  })

  it('posts an OpenAI-compatible streaming body with the model and bearer token', async () => {
    const fetchImpl = vi.fn(async () => streamOf(['data: [DONE]\n\n'])) as unknown as FetchLike
    const client = createOpenAiCompatibleClient({
      baseUrl: 'https://api.deepseek.com/',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      fetchImpl
    })
    await collect(client)

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ model: 'deepseek-flash', stream: true })
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it.each([
    [401, 'auth'],
    [402, 'insufficient_balance'],
    [429, 'rate_limit'],
    [400, 'bad_request'],
    [503, 'server'],
    [418, 'unknown']
  ])('classifies HTTP %i as %s', async (status, kind) => {
    const fetchImpl: FetchLike = async () => new Response('nope', { status })
    const client = createOpenAiCompatibleClient({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      fetchImpl
    })

    await expect(collect(client)).rejects.toMatchObject({ name: 'LlmError', kind })
  })

  it('times out when the server never responds', async () => {
    const fetchImpl: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    const client = createOpenAiCompatibleClient({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      timeoutMs: 20,
      fetchImpl
    })

    await expect(collect(client)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('sends attached images as OpenAI-style content parts', async () => {
    const fetchImpl = vi.fn(async () => streamOf(['data: [DONE]\n\n'])) as unknown as FetchLike
    const client = createOpenAiCompatibleClient({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      fetchImpl
    })

    for await (const _chunk of client.streamChat([
      { role: 'user', content: '这张图里是什么', images: ['data:image/png;base64,AAA'] }
    ])) {
      // drain
    }

    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: unknown }> }
    expect(body.messages[0]?.content).toEqual([
      { type: 'text', text: '这张图里是什么' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA', detail: 'high' } }
    ])
  })

  it('reports a caller cancellation as aborted rather than timeout', async () => {
    const controller = new AbortController()
    const fetchImpl: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    const client = createOpenAiCompatibleClient({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-flash',
      timeoutMs: 5_000,
      fetchImpl
    })

    const pending = collect(client, controller.signal)
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(LlmError)
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })
})
