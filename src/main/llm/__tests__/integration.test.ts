import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatStreamEvent } from '../../../shared/types'
import { openDatabase, type AppDatabase } from '../../db'
import { createChatService } from '../chat-service'
import { createOpenAiCompatibleClient } from '../client'
import { createConversationHistoryBlock } from '../context'
import { TUTOR_SYSTEM_PROMPT_V0 } from '../system-prompt'
import type { ChatMessage } from '../types'

let database: AppDatabase
let server: Server | null = null

async function startSseServer(handler: (messages: ChatMessage[]) => string[]): Promise<string> {
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const messages = (JSON.parse(body) as { messages: ChatMessage[] }).messages
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const frame of handler(messages)) response.write(frame)
      response.end()
    })
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('condition not reached in time')
}

beforeEach(() => {
  database = openDatabase(':memory:')
})

afterEach(async () => {
  database.close()
  if (server !== null) {
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = null
  }
})

describe('client + service against a real SSE endpoint', () => {
  it('keeps multi-byte characters intact when a UTF-8 sequence is split across network chunks', async () => {
    // "ε→∞" encodes to 2 + 3 + 3 bytes; slicing mid-character forces the decoder to buffer.
    const payload = Buffer.from(
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'ε→∞' } }] })}\n\ndata: [DONE]\n\n`,
      'utf8'
    )
    const splitAt = payload.indexOf(Buffer.from('ε', 'utf8')) + 1
    const firstHalf = payload.subarray(0, splitAt)
    const secondHalf = payload.subarray(splitAt)

    server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(firstHalf)
      setTimeout(() => {
        response.write(secondHalf)
        response.end()
      }, 20)
    })
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const deltas: string[] = []
    const service = createChatService({
      repositories: database.repositories,
      createClient: (config) =>
        createOpenAiCompatibleClient({ ...config, baseUrl, apiKey: 'sk-probe' }),
      readApiKey: () => 'sk-probe',
      readConfig: () => ({
        baseUrl,
        model: 'deepseek-flash',
        contextStrategy: 'excerpt',
        summarySource: 'local'
      }),
      emit: (event) => {
        if (event.type === 'delta' && event.text) deltas.push(event.text)
      },
      blocks: [createConversationHistoryBlock()]
    })

    const conversation = database.repositories.conversations.create({ title: '编码' })
    const started = await service.start({ conversationId: conversation.id, content: '符号' })
    await waitFor(() => service.activeCount() === 0)

    expect(deltas.join('')).toBe('ε→∞')
    expect(database.repositories.messages.get(started.assistantMessageId)?.content).toBe('ε→∞')
  })

  it('streams an answer over HTTP into the database and out as renderer events', async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: '先用' } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: '定义' } }] })}\n\n`,
      'data: [DONE]\n\n'
    ]
    const received: ChatMessage[][] = []
    const baseUrl = await startSseServer((messages) => {
      received.push(messages)
      return frames
    })

    const events: ChatStreamEvent[] = []
    const service = createChatService({
      repositories: database.repositories,
      createClient: (config) =>
        createOpenAiCompatibleClient({ ...config, baseUrl, apiKey: 'sk-probe' }),
      readApiKey: () => 'sk-probe',
      readConfig: () => ({
        baseUrl,
        model: 'deepseek-flash',
        contextStrategy: 'excerpt',
        summarySource: 'local'
      }),
      emit: (event) => events.push(event),
      blocks: [createConversationHistoryBlock()]
    })

    const conversation = database.repositories.conversations.create({ title: '数列极限' })
    const started = await service.start({ conversationId: conversation.id, content: '什么是 ε-N 定义' })
    await waitFor(() => service.activeCount() === 0)

    expect(events.map((event) => event.type)).toEqual(['delta', 'delta', 'done'])
    expect(events.filter((event) => event.type === 'delta').map((event) => event.text)).toEqual([
      '先用',
      '定义'
    ])
    expect(database.repositories.messages.get(started.assistantMessageId)).toMatchObject({
      content: '先用定义',
      status: 'complete',
      model: 'deepseek-flash'
    })

    // The prompt the model actually received: system prompt first, then the persisted chain.
    expect(received[0]?.[0]).toEqual({ role: 'system', content: TUTOR_SYSTEM_PROMPT_V0 })
    expect(received[0]?.at(-1)).toEqual({ role: 'user', content: '什么是 ε-N 定义' })
  })

  it('turns a 401 response into an auth failure that keeps the question', async () => {
    server = createServer((_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Authentication Fails' } }))
    })
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const events: ChatStreamEvent[] = []
    const service = createChatService({
      repositories: database.repositories,
      createClient: (config) =>
        createOpenAiCompatibleClient({ ...config, baseUrl, apiKey: 'sk-wrong' }),
      readApiKey: () => 'sk-wrong',
      readConfig: () => ({
        baseUrl,
        model: 'deepseek-flash',
        contextStrategy: 'excerpt',
        summarySource: 'local'
      }),
      emit: (event) => events.push(event),
      blocks: [createConversationHistoryBlock()]
    })

    const conversation = database.repositories.conversations.create({ title: '鉴权' })
    const started = await service.start({ conversationId: conversation.id, content: '问题' })
    await waitFor(() => service.activeCount() === 0)

    expect(events.at(-1)).toMatchObject({ type: 'error', errorKind: 'auth' })
    const messages = database.repositories.messages.listByConversation(conversation.id)
    expect(messages.map((message) => message.status)).toEqual(['complete', 'error'])
    expect(messages[0]?.content).toBe('问题')
    expect(database.repositories.messages.get(started.assistantMessageId)?.content).toBe('')
  })
})
