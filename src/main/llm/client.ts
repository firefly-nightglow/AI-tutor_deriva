import { LlmError, classifyHttpStatus } from './errors'
import { SseDecoder } from './sse'
import type { ChatClient, ChatMessage, ChatStreamChunk, FetchLike } from './types'

export interface OpenAiCompatibleClientConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** Idle budget: time allowed for response headers, then for each gap between chunks. */
  timeoutMs?: number
  fetchImpl?: FetchLike
}

const DONE_SENTINEL = '[DONE]'

/**
 * Minimal OpenAI-compatible streaming client.
 *
 * Deliberately not the `openai` SDK: the transport is a documented wire format, and owning it keeps
 * the 30 second idle budget and the 401/402/429 classification explicit (see GROUND-0002, deviation 1).
 */
export function createOpenAiCompatibleClient(config: OpenAiCompatibleClientConfig): ChatClient {
  const timeoutMs = config.timeoutMs ?? 30_000
  const fetchImpl: FetchLike = config.fetchImpl ?? ((input, init) => fetch(input, init))
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

  async function* streamChat(
    messages: ChatMessage[],
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<ChatStreamChunk> {
    const controller = new AbortController()
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const armIdleTimer = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
    }
    const abortFromCaller = (): void => controller.abort()
    options.signal?.addEventListener('abort', abortFromCaller)
    armIdleTimer()

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages.map((message) => ({
            role: message.role,
            content: wireContent(message)
          })),
          stream: true,
          stream_options: { include_usage: true }
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new LlmError(classifyHttpStatus(response.status), `HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
      }
      if (!response.body) throw new LlmError('network', '响应没有可读取的流')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const sse = new SseDecoder()

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        armIdleTimer()
        for (const event of sse.push(decoder.decode(value, { stream: true }))) {
          const payload = event.data.trim()
          if (payload === '') continue
          if (payload === DONE_SENTINEL) {
            yield { type: 'done' }
            return
          }
          const text = extractDeltaText(payload)
          if (text !== null) yield { type: 'delta', text }
        }
      }

      for (const event of sse.flush()) {
        const payload = event.data.trim()
        if (payload === DONE_SENTINEL) {
          yield { type: 'done' }
          return
        }
        const text = extractDeltaText(payload)
        if (text !== null) yield { type: 'delta', text }
      }
      yield { type: 'done' }
    } catch (error) {
      if (error instanceof LlmError) throw error
      if (timedOut) throw new LlmError('timeout')
      if (isAbortError(error)) {
        throw new LlmError(options.signal?.aborted ? 'aborted' : 'timeout')
      }
      throw new LlmError('network', error instanceof Error ? error.message : String(error))
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', abortFromCaller)
    }
  }

  return { model: config.model, streamChat }
}

/** A message with images becomes OpenAI-style content parts; text-only stays a plain string. */
function wireContent(message: ChatMessage): string | Array<Record<string, unknown>> {
  const images = message.images ?? []
  if (images.length === 0) return message.content

  const parts: Array<Record<string, unknown>> = []
  if (message.content.trim() !== '') parts.push({ type: 'text', text: message.content })
  // `high` keeps the original pixels: these are usually formulas or textbook pages, where a
  // downsample to 512x512 would make symbols unreadable.
  for (const url of images) parts.push({ type: 'image_url', image_url: { url, detail: 'high' } })
  return parts
}

/** Pulls the visible delta text out of one SSE payload; returns null for keep-alives and reasoning. */
function extractDeltaText(payload: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const choices = (parsed as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const delta = (choices[0] as { delta?: unknown }).delta
  if (typeof delta !== 'object' || delta === null) return null
  const content = (delta as { content?: unknown }).content
  return typeof content === 'string' && content !== '' ? content : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
