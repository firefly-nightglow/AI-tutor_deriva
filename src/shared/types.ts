export type TitleSource = 'local' | 'model' | 'manual'
export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'complete' | 'streaming' | 'error' | 'aborted'
export type BookmarkSummarySource = 'local' | 'model'

/** A subject groups top-level conversations; conversations without a subject sit in "未分类". */
export interface Subject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

/**
 * A conversation is one node of the user-facing tree: a 主对话 when parentConversationId is null,
 * otherwise a 子对话. sourceMessageId records the AI answer the branch was spawned from.
 */
export interface Conversation {
  id: string
  subjectId: string | null
  parentConversationId: string | null
  sourceMessageId: string | null
  /** The excerpt the student selected to open this branch; null for a 主对话. */
  sourceQuote: string | null
  title: string
  titleSource: TitleSource
  model: string | null
  createdAt: number
  updatedAt: number
}

/**
 * A message is one turn inside a conversation. parentId links the message to the turn it responds
 * to, so message lineage stays a tree even though a conversation reads as a linear transcript.
 */
export interface Message {
  id: string
  conversationId: string
  parentId: string | null
  role: MessageRole
  content: string
  /** Reserved by ADR-0004 for v2 screenshot answers and v3 generated artifacts; 'text' in v1. */
  contentType: string
  /** Reserved by ADR-0004: JSON string of attachment descriptors, null in v1. */
  attachments: string | null
  model: string | null
  status: MessageStatus
  createdAt: number
  updatedAt: number
}

export interface Bookmark {
  id: string
  conversationId: string
  messageId: string
  summary: string
  summarySource: BookmarkSummarySource
  position: number
  createdAt: number
  updatedAt: number
}

export interface ConversationNode {
  conversation: Conversation
  children: ConversationNode[]
}

export interface CreateSubjectInput {
  name: string
}

export interface CreateConversationInput {
  subjectId?: string | null
  parentConversationId?: string | null
  sourceMessageId?: string | null
  sourceQuote?: string | null
  title: string
  titleSource?: TitleSource
  model?: string | null
}

export interface CreateMessageInput {
  conversationId: string
  parentId?: string | null
  role: MessageRole
  content: string
  contentType?: string
  attachments?: string | null
  model?: string | null
  status?: MessageStatus
}

export interface CreateBookmarkInput {
  conversationId: string
  messageId: string
  summary: string
  summarySource?: BookmarkSummarySource
  position: number
}

/** Failure classes the UI can act on; mirrors DeepSeek's documented status codes (see GROUND-0002). */
export type ChatErrorKind =
  | 'auth'
  | 'insufficient_balance'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'missing_key'
  | 'unknown'

/**
 * One message pushed from the main process while an answer streams. Kept to plain, structured
 * cloneable values because Electron serializes webContents.send payloads.
 */
export interface ChatStreamEvent {
  requestId: string
  type: 'delta' | 'done' | 'error'
  text?: string
  model?: string
  messageId?: string
  errorKind?: ChatErrorKind
  errorMessage?: string
}

export interface ApiKeyStatus {
  hasKey: boolean
  encryptionAvailable: boolean
}

export interface LlmConfig {
  baseUrl: string
  model: string
  /** How much of the parent conversation a branch question carries into the prompt. */
  contextStrategy: ContextStrategy
  /** FR-16: how bookmark summaries and derived titles are produced. */
  summarySource: SummarySource
}

export type ContextStrategy = 'excerpt' | 'full-chain'
export type SummarySource = 'local' | 'model'

export interface StartChatInput {
  conversationId: string
  content: string
  parentId?: string | null
  images?: OutgoingImage[]
}

/** An image the student attached in the composer, before it is persisted. */
export interface OutgoingImage {
  name: string
  mime: string
  dataUrl: string
}

/** What is stored on the message row and used to reload the picture later. */
export interface MessageAttachment {
  id: string
  name: string
  mime: string
  bytes: number
}

export interface StartChatResult {
  requestId: string
  userMessageId: string
  assistantMessageId: string
}
