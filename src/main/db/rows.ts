import type { Bookmark, Conversation, Message, MessageRole, MessageStatus, Subject } from '../../shared/types'

export interface SubjectRow {
  id: string
  name: string
  created_at: number
  updated_at: number
}

export interface ConversationRow {
  id: string
  subject_id: string | null
  parent_conversation_id: string | null
  source_message_id: string | null
  source_quote: string | null
  title: string
  title_source: Conversation['titleSource']
  model: string | null
  created_at: number
  updated_at: number
}

export interface MessageRow {
  id: string
  conversation_id: string
  parent_id: string | null
  role: MessageRole
  content: string
  content_type: string
  attachments: string | null
  model: string | null
  status: MessageStatus
  created_at: number
  updated_at: number
}

export interface BookmarkRow {
  id: string
  conversation_id: string
  message_id: string
  summary: string
  summary_source: Bookmark['summarySource']
  position: number
  created_at: number
  updated_at: number
}

export function mapSubject(row: SubjectRow): Subject {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    subjectId: row.subject_id,
    parentConversationId: row.parent_conversation_id,
    sourceMessageId: row.source_message_id,
    sourceQuote: row.source_quote,
    title: row.title,
    titleSource: row.title_source,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    parentId: row.parent_id,
    role: row.role,
    content: row.content,
    contentType: row.content_type,
    attachments: row.attachments,
    model: row.model,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    summary: row.summary,
    summarySource: row.summary_source,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
