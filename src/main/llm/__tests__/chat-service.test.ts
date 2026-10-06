import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatStreamEvent } from '../../../shared/types'
import { openDatabase, type AppDatabase } from '../../db'
import { ValidationError } from '../../db/errors'
import { createChatService, type ChatService } from '../chat-service'
import { createConversationHistoryBlock } from '../context'
import { LlmError } from '../errors'
import type { ChatClient } from '../types'

let database: AppDatabase
let events: ChatStreamEvent[]

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('condition not reached in time')
}

function serviceWith(client: ChatClient, apiKey: string | null = 'sk-test'): ChatService {
  return createChatService({
    repositories: database.repositories,
    createClient: () => client,
    readApiKey: () => apiKey,
    readConfig: () => ({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      contextStrategy: 'excerpt',
      summarySource: 'local'
    }),
    emit: (event) => events.push(event),
    blocks: [createConversationHistoryBlock()]
  })
}

function clientOf(chunks: () => AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done' }>): ChatClient {
  return { model: 'deepseek-flash', streamChat: chunks }
}

beforeEach(() => {
  database = openDatabase(':memory:')
  events = []
})

afterEach(() => {
  database.close()
})

describe('chat service', () => {
  it('persists the question and a streaming placeholder before the answer arrives', async () => {
    const conversation = database.repositories.conversations.create({ title: '数列极限' })
    const service = serviceWith(
      clientOf(async function* () {
        yield { type: 'done' as const }
      })
    )

    const started = await service.start({ conversationId: conversation.id, content: '  什么是 ε-N 定义  ' })

    const messages = database.repositories.messages.listByConversation(conversation.id)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: '什么是 ε-N 定义', status: 'complete' })
    expect(messages[1]).toMatchObject({
      id: started.assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: 'deepseek-flash'
    })
    await waitFor(() => service.activeCount() === 0)
  })

  it('streams deltas to the renderer and lands the full text as complete', async () => {
    const conversation = database.repositories.conversations.create({ title: '极限' })
    const service = serviceWith(
      clientOf(async function* () {
        yield { type: 'delta' as const, text: '先看' }
        yield { type: 'delta' as const, text: '定义' }
        yield { type: 'done' as const }
      })
    )

    const started = await service.start({ conversationId: conversation.id, content: '讲讲极限' })
    await waitFor(() => service.activeCount() === 0)

    expect(events.filter((event) => event.type === 'delta').map((event) => event.text)).toEqual([
      '先看',
      '定义'
    ])
    expect(events.at(-1)).toMatchObject({ type: 'done', messageId: started.assistantMessageId })
    expect(database.repositories.messages.get(started.assistantMessageId)).toMatchObject({
      content: '先看定义',
      status: 'complete'
    })
    // FR-6: a finished answer earns exactly one bookmark, derived locally by default.
    const bookmarks = database.repositories.bookmarks.listByConversation(conversation.id)
    expect(bookmarks).toHaveLength(1)
    expect(bookmarks[0]).toMatchObject({ messageId: started.assistantMessageId, summary: '先看定义', summarySource: 'local' })
  })

  it('keeps the partial answer and marks it failed when the provider rejects the call', async () => {
    const conversation = database.repositories.conversations.create({ title: '限流' })
    const service = serviceWith(
      clientOf(async function* () {
        yield { type: 'delta' as const, text: '已经生成的前半段' }
        throw new LlmError('rate_limit')
      })
    )

    const started = await service.start({ conversationId: conversation.id, content: '问题' })
    await waitFor(() => service.activeCount() === 0)

    expect(events.at(-1)).toMatchObject({ type: 'error', errorKind: 'rate_limit' })
    expect(database.repositories.messages.get(started.assistantMessageId)).toMatchObject({
      content: '已经生成的前半段',
      status: 'error'
    })
  })

  it('marks a cancelled answer as aborted and keeps what was already streamed', async () => {
    const conversation = database.repositories.conversations.create({ title: '取消' })
    const service = serviceWith({
      model: 'deepseek-flash',
      async *streamChat(_messages, options) {
        yield { type: 'delta', text: '部分内容' }
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) {
            resolve()
            return
          }
          options?.signal?.addEventListener('abort', () => resolve())
        })
        throw new LlmError('aborted')
      }
    })

    const started = await service.start({ conversationId: conversation.id, content: '问题' })
    await waitFor(() => events.some((event) => event.type === 'delta'))
    service.cancel(started.requestId)
    await waitFor(() => service.activeCount() === 0)

    expect(events.at(-1)).toMatchObject({ type: 'error', errorKind: 'aborted' })
    expect(database.repositories.messages.get(started.assistantMessageId)).toMatchObject({
      content: '部分内容',
      status: 'aborted'
    })
  })

  it('retries a failed answer in place without adding another question', async () => {
    const conversation = database.repositories.conversations.create({ title: '重试' })
    const failing = serviceWith(
      clientOf(async function* () {
        throw new LlmError('server')
      })
    )
    const started = await failing.start({ conversationId: conversation.id, content: '问题' })
    await waitFor(() => failing.activeCount() === 0)

    const recovering = serviceWith(
      clientOf(async function* () {
        yield { type: 'delta' as const, text: '成功后' }
        yield { type: 'done' as const }
      })
    )
    await recovering.retry(started.assistantMessageId)
    await waitFor(() => recovering.activeCount() === 0)

    const messages = database.repositories.messages.listByConversation(conversation.id)
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ content: '成功后', status: 'complete' })
  })

  it('refuses to start without a stored key and leaves no half-written conversation', async () => {
    const conversation = database.repositories.conversations.create({ title: '无 Key' })
    const service = serviceWith(
      clientOf(async function* () {
        yield { type: 'done' as const }
      }),
      null
    )

    await expect(service.start({ conversationId: conversation.id, content: '问题' })).rejects.toMatchObject({
      kind: 'missing_key'
    })
    expect(database.repositories.messages.listByConversation(conversation.id)).toEqual([])
  })

  it('rejects blank content and unknown conversations', async () => {
    const conversation = database.repositories.conversations.create({ title: '校验' })
    const service = serviceWith(
      clientOf(async function* () {
        yield { type: 'done' as const }
      })
    )

    await expect(service.start({ conversationId: conversation.id, content: '   ' })).rejects.toBeInstanceOf(
      ValidationError
    )
    await expect(service.start({ conversationId: 'missing', content: '问题' })).rejects.toThrow()
  })

  it('stamps each answer with the model in force and leaves earlier messages untouched (FR-13)', async () => {
    const conversation = database.repositories.conversations.create({ title: '模型切换' })
    let model = 'deepseek-flash'
    const client: ChatClient = {
      model,
      async *streamChat() {
        yield { type: 'done' as const }
      }
    }
    const service = createChatService({
      repositories: database.repositories,
      createClient: () => client,
      readApiKey: () => 'sk-test',
      readConfig: () => ({
        baseUrl: 'https://api.deepseek.com',
        model,
        contextStrategy: 'excerpt',
        summarySource: 'local'
      }),
      emit: () => {},
      blocks: [createConversationHistoryBlock()]
    })

    await service.start({ conversationId: conversation.id, content: '第一个问题' })
    await waitFor(() => service.activeCount() === 0)
    model = 'deepseek-v4-pro'
    await service.start({ conversationId: conversation.id, content: '第二个问题' })
    await waitFor(() => service.activeCount() === 0)

    // Only answers carry a model: the question was not produced by one.
    expect(
      database.repositories.messages
        .listByConversation(conversation.id)
        .map((message) => [message.role, message.model])
    ).toEqual([
      ['user', null],
      ['assistant', 'deepseek-flash'],
      ['user', null],
      ['assistant', 'deepseek-v4-pro']
    ])
  })
})
