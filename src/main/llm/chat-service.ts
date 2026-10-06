import { randomUUID } from 'node:crypto'
import type { ChatStreamEvent, StartChatInput, StartChatResult } from '../../shared/types'
import { NotFoundError, ValidationError } from '../db/errors'
import type { Repositories } from '../db/repositories'
import { assembleContext, type ContextBlock } from './context'
import { LlmError } from './errors'
import { TUTOR_SYSTEM_PROMPT_V0 } from './system-prompt'
import type { ChatClient } from './types'
import type { AttachmentStore } from '../attachments'
import { summarizeBookmark } from '../../shared/text'
import type { LlmConfig, SummarySource } from '../../shared/types'
import type { ChatMessage } from './types'

export interface ChatClientConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface ChatServiceDeps {
  repositories: Repositories
  createClient: (config: ChatClientConfig) => ChatClient
  readApiKey: () => string | null
  readConfig: () => LlmConfig
  emit: (event: ChatStreamEvent) => void
  /** Required only when a caller actually sends images; tests may omit it. */
  attachmentStore?: AttachmentStore
  systemPrompt?: string
  blocks?: readonly ContextBlock[]
}

export interface ChatService {
  start(input: StartChatInput): Promise<StartChatResult>
  retry(assistantMessageId: string): Promise<{ requestId: string }>
  cancel(requestId: string): void
  activeCount(): number
}

/**
 * Owns one streaming answer end to end: persist the question, persist a streaming placeholder,
 * pump deltas to the renderer, then land the final content with the right status. Partial text is
 * always persisted, so an interrupted or failed answer keeps what the student already saw.
 */
export function createChatService(deps: ChatServiceDeps): ChatService {
  const systemPrompt = deps.systemPrompt ?? TUTOR_SYSTEM_PROMPT_V0
  const blocks = deps.blocks ?? []
  const active = new Map<string, AbortController>()

  async function run(
    requestId: string,
    conversationId: string,
    assistantMessageId: string
  ): Promise<void> {
    const controller = new AbortController()
    active.set(requestId, controller)
    let accumulated = ''
    let model = ''

    try {
      const apiKey = deps.readApiKey()
      if (!apiKey) throw new LlmError('missing_key')
      const config = deps.readConfig()
      model = config.model
      const client = deps.createClient({ apiKey, baseUrl: config.baseUrl, model: config.model })
      const messages = await assembleContext(systemPrompt, blocks, {
        repositories: deps.repositories,
        conversationId
      })

      for await (const chunk of client.streamChat(messages, { signal: controller.signal })) {
        if (chunk.type !== 'delta') continue
        accumulated += chunk.text
        deps.emit({
          requestId,
          type: 'delta',
          text: chunk.text,
          messageId: assistantMessageId,
          model
        })
      }

      deps.repositories.messages.updateContent(assistantMessageId, accumulated, 'complete')
      deps.emit({ requestId, type: 'done', messageId: assistantMessageId, model })
      // The answer is already on screen, so bookmark generation (which may cost a second model call in
      // FR-16's model mode) must not delay the terminal signal that unlocks the composer.
      await recordBookmark(deps, client, conversationId, assistantMessageId, accumulated)
    } catch (error) {
      const llm =
        error instanceof LlmError
          ? error
          : new LlmError('unknown', error instanceof Error ? error.message : String(error))
      deps.repositories.messages.updateContent(
        assistantMessageId,
        accumulated,
        llm.kind === 'aborted' ? 'aborted' : 'error'
      )
      deps.emit({
        requestId,
        type: 'error',
        messageId: assistantMessageId,
        model,
        errorKind: llm.kind,
        errorMessage: llm.message
      })
    } finally {
      active.delete(requestId)
    }
  }

  return {
    async start(input) {
      const content = typeof input.content === 'string' ? input.content.trim() : ''
      const images = input.images ?? []
      // An attached picture on its own is a valid question.
      if (content === '' && images.length === 0) throw new ValidationError('消息内容不能为空')
      const conversation = deps.repositories.conversations.get(input.conversationId)
      if (!conversation) throw new NotFoundError('Conversation', input.conversationId)
      if (deps.readApiKey() === null) throw new LlmError('missing_key')

      const { model } = deps.readConfig()
      const userMessage = deps.repositories.messages.append({
        conversationId: input.conversationId,
        parentId: input.parentId ?? null,
        role: 'user',
        content,
        attachments: serializeAttachments(saveImages(deps, images))
      })
      const assistantMessage = deps.repositories.messages.append({
        conversationId: input.conversationId,
        parentId: userMessage.id,
        role: 'assistant',
        content: '',
        model,
        status: 'streaming'
      })

      const requestId = randomUUID()
      void run(requestId, input.conversationId, assistantMessage.id)
      return { requestId, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id }
    },
    async retry(assistantMessageId) {
      const message = deps.repositories.messages.get(assistantMessageId)
      if (!message) throw new NotFoundError('Message', assistantMessageId)
      if (message.role !== 'assistant') throw new ValidationError('只能重试助手的回答')
      if (message.status === 'complete') throw new ValidationError('这条回答已经完成，无需重试')
      if (deps.readApiKey() === null) throw new LlmError('missing_key')

      deps.repositories.messages.updateContent(assistantMessageId, '', 'streaming')
      const requestId = randomUUID()
      void run(requestId, message.conversationId, assistantMessageId)
      return { requestId }
    },
    cancel(requestId) {
      active.get(requestId)?.abort()
    },
    activeCount() {
      return active.size
    }
  }
}

function serializeAttachments(attachments: { id: string }[]): string | null {
  return attachments.length === 0 ? null : JSON.stringify(attachments)
}

function saveImages(
  deps: ChatServiceDeps,
  images: StartChatInput['images']
): { id: string }[] {
  if (images === undefined || images.length === 0) return []
  if (deps.attachmentStore === undefined) throw new ValidationError('附件存储不可用')
  return deps.attachmentStore.save(images)
}

/**
 * One bookmark per answer (FR-6). Default is a local truncation costing nothing; when the student
 * switches FR-16 to model summaries the same client is asked for a one-line summary, with a local
 * fallback so a failed summary never loses the bookmark.
 */
async function recordBookmark(
  deps: ChatServiceDeps,
  client: ChatClient,
  conversationId: string,
  messageId: string,
  answer: string
): Promise<void> {
  try {
    const { summary, source } = await buildSummary(deps, client, answer)
    const existing = deps.repositories.bookmarks.getByMessage(conversationId, messageId)
    if (existing) {
      deps.repositories.bookmarks.updateSummary(existing.id, summary, source)
      return
    }
    const assistants = deps.repositories.messages
      .listByConversation(conversationId)
      .filter((message) => message.role === 'assistant')
    const position = Math.max(0, assistants.findIndex((message) => message.id === messageId))
    deps.repositories.bookmarks.create({
      conversationId,
      messageId,
      summary,
      summarySource: source,
      position
    })
  } catch (error) {
    console.warn('[deriva] 生成对话书签失败', error)
  }
}

async function buildSummary(
  deps: ChatServiceDeps,
  client: ChatClient,
  answer: string
): Promise<{ summary: string; source: SummarySource }> {
  if (deps.readConfig().summarySource === 'model') {
    try {
      const prompt: ChatMessage[] = [
        {
          role: 'system',
          content: '用一句不超过 30 字的中文概括下面这段讲解的要点，只输出摘要本身。'
        },
        { role: 'user', content: answer }
      ]
      let text = ''
      for await (const chunk of client.streamChat(prompt)) {
        if (chunk.type === 'delta') text += chunk.text
      }
      const summary = summarizeBookmark(text)
      if (summary !== '未命名要点') return { summary, source: 'model' }
    } catch (error) {
      console.warn('[deriva] 模型摘要失败，回退本地截断', error)
    }
  }
  return { summary: summarizeBookmark(answer), source: 'local' }
}
