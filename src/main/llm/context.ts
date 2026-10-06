import type { Repositories } from '../db/repositories'
import type { ChatMessage } from './types'
import { parseMessageAttachments } from '../../shared/attachments'

export interface ContextBlockInput {
  repositories: Repositories
  conversationId: string
}

/**
 * One source of context injected between the system prompt and nothing else.
 *
 * v1 registers only the conversation chain. Screenshots (v2) and the knowledge profile (v3) become
 * additional blocks and must not require a change to the client or the chat service (ADR-0004).
 */
export interface ContextBlock {
  readonly id: string
  build(input: ContextBlockInput): Promise<ChatMessage[]> | ChatMessage[]
}

export function createConversationHistoryBlock(): ContextBlock {
  return createConversationHistoryBlockWith({})
}

function historyOf(
  repositories: Repositories,
  conversationId: string,
  readAttachment?: (id: string) => string | null
): ChatMessage[] {
  return repositories.messages
    .listByConversation(conversationId)
    .filter((message) => message.content.trim() !== '' && message.status !== 'error')
    .map((message) => {
      const images =
        readAttachment === undefined
          ? []
          : parseMessageAttachments(message.attachments)
              .map((attachment) => readAttachment(attachment.id))
              .filter((url): url is string => url !== null)
      return images.length === 0
        ? { role: message.role, content: message.content }
        : { role: message.role, content: message.content, images }
    })
}

/**
 * Emits the excerpt a branch was opened from, before the conversation chain, so the model sees what
 * the student actually pointed at. Empty for a 主对话.
 */
export function createBranchAnchorBlock(): ContextBlock {
  return {
    id: 'branch-anchor',
    build({ repositories, conversationId }: ContextBlockInput) {
      const conversation = repositories.conversations.get(conversationId)
      if (!conversation?.sourceQuote) return []
      const quoted = conversation.sourceQuote.replace(/\n/g, '\n> ')
      return [
        {
          role: 'user',
          content: `我在上一轮回答里选中了下面这段内容，请针对它回答我接下来的问题：\n\n> ${quoted}`
        }
      ]
    }
  }
}

/** Root-first list of the conversations above this one; empty for a 主对话. */
function ancestorIds(repositories: Repositories, conversationId: string): string[] {
  const chain: string[] = []
  let current = repositories.conversations.get(conversationId)?.parentConversationId ?? null
  while (current !== null) {
    chain.unshift(current)
    current = repositories.conversations.get(current)?.parentConversationId ?? null
  }
  return chain
}

function createConversationHistoryBlockWith(options: {
  includeParentChain?: () => boolean
  readAttachment?: (id: string) => string | null
}): ContextBlock {
  return {
    id: 'conversation-history',
    build({ repositories, conversationId }: ContextBlockInput) {
      const messages: ChatMessage[] = []
      // OQ-2 default is excerpt-only; the full-chain strategy prepends the ancestors' turns.
      if (options.includeParentChain?.() === true) {
        for (const ancestorId of ancestorIds(repositories, conversationId)) {
          messages.push(...historyOf(repositories, ancestorId, options.readAttachment))
        }
      }
      messages.push(...historyOf(repositories, conversationId, options.readAttachment))
      return messages
    }
  }
}

export function createConversationHistoryBlockWithParentChain(
  includeParentChain: () => boolean,
  readAttachment?: (id: string) => string | null
): ContextBlock {
  return createConversationHistoryBlockWith({ includeParentChain, readAttachment })
}

export async function assembleContext(
  systemPrompt: string,
  blocks: readonly ContextBlock[],
  input: ContextBlockInput
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const block of blocks) {
    messages.push(...(await block.build(input)))
  }
  return messages
}
