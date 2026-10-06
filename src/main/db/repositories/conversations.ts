import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { NotFoundError, ValidationError } from '../errors'
import { mapConversation, type ConversationRow } from '../rows'
import type {
  Conversation,
  ConversationNode,
  CreateConversationInput,
  TitleSource
} from '../../../shared/types'

export interface ConversationsRepository {
  create(input: CreateConversationInput): Conversation
  get(id: string): Conversation | null
  listRoots(): Conversation[]
  /** Every conversation, roots and branches, oldest first: the sidebar builds the tree from this. */
  listAll(): Conversation[]
  listBySubject(subjectId: string | null): Conversation[]
  listChildren(parentConversationId: string): Conversation[]
  listTree(rootId: string): ConversationNode
  rename(id: string, title: string, titleSource?: TitleSource): Conversation
  moveToSubject(id: string, subjectId: string | null): Conversation
  touch(id: string): void
  remove(id: string): void
}

const TITLE_SOURCES: readonly TitleSource[] = ['local', 'model', 'manual']

function normalizeTitle(title: string): string {
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (trimmed === '') throw new ValidationError('对话标题不能为空')
  return trimmed
}

export function createConversationsRepository(db: Database): ConversationsRepository {
  const insert = db.prepare(
    `INSERT INTO conversations (
       id, subject_id, parent_conversation_id, source_message_id, source_quote,
       title, title_source, model, created_at, updated_at
     ) VALUES (
       @id, @subjectId, @parentConversationId, @sourceMessageId, @sourceQuote,
       @title, @titleSource, @model, @createdAt, @updatedAt
     )`
  )
  const selectById = db.prepare('SELECT * FROM conversations WHERE id = ?')
  const selectSubject = db.prepare('SELECT id FROM subjects WHERE id = ?')
  const selectMessageConversation = db.prepare('SELECT conversation_id FROM messages WHERE id = ?')
  const selectRoots = db.prepare(
    'SELECT * FROM conversations WHERE parent_conversation_id IS NULL ORDER BY updated_at DESC, rowid DESC'
  )
  const selectBySubject = db.prepare(
    `SELECT * FROM conversations
     WHERE parent_conversation_id IS NULL AND subject_id IS @subjectId
     ORDER BY updated_at DESC, rowid DESC`
  )
  const selectChildren = db.prepare(
    'SELECT * FROM conversations WHERE parent_conversation_id = ? ORDER BY created_at ASC, rowid ASC'
  )
  const selectSubtree = db.prepare(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM conversations WHERE id = @rootId
       UNION ALL
       SELECT c.id FROM conversations c JOIN subtree s ON c.parent_conversation_id = s.id
     )
     SELECT * FROM conversations WHERE id IN (SELECT id FROM subtree)
     ORDER BY created_at ASC, rowid ASC`
  )
  const selectAll = db.prepare('SELECT * FROM conversations ORDER BY created_at ASC, rowid ASC')
  const updateTitle = db.prepare(
    'UPDATE conversations SET title = @title, title_source = @titleSource, updated_at = @updatedAt WHERE id = @id'
  )
  const updateSubject = db.prepare(
    'UPDATE conversations SET subject_id = @subjectId, updated_at = @updatedAt WHERE id = @id'
  )
  const touch = db.prepare('UPDATE conversations SET updated_at = @updatedAt WHERE id = @id')
  const deleteById = db.prepare('DELETE FROM conversations WHERE id = ?')

  function get(id: string): Conversation | null {
    const row = selectById.get(id) as ConversationRow | undefined
    return row ? mapConversation(row) : null
  }

  function requireExisting(id: string): Conversation {
    const conversation = get(id)
    if (!conversation) throw new NotFoundError('Conversation', id)
    return conversation
  }

  return {
    create(input) {
      const title = normalizeTitle(input.title)
      const titleSource = input.titleSource ?? 'local'
      if (!TITLE_SOURCES.includes(titleSource)) {
        throw new ValidationError('标题来源不合法')
      }
      const subjectId = input.subjectId ?? null
      const parentConversationId = input.parentConversationId ?? null
      const sourceMessageId = input.sourceMessageId ?? null
      const sourceQuote =
        typeof input.sourceQuote === 'string' && input.sourceQuote.trim() !== ''
          ? input.sourceQuote.trim()
          : null
      if (input.sourceQuote != null && sourceQuote === null) {
        throw new ValidationError('引用内容不能为空')
      }

      if (subjectId !== null && selectSubject.get(subjectId) === undefined) {
        throw new NotFoundError('Subject', subjectId)
      }
      if (parentConversationId !== null) requireExisting(parentConversationId)
      if (sourceMessageId !== null) {
        const source = selectMessageConversation.get(sourceMessageId) as
          | { conversation_id: string }
          | undefined
        if (!source) throw new NotFoundError('Message', sourceMessageId)
        if (parentConversationId !== null && source.conversation_id !== parentConversationId) {
          throw new ValidationError('子对话引用的消息必须属于它的父对话')
        }
      }

      const now = Date.now()
      const id = randomUUID()
      insert.run({
        id,
        subjectId,
        parentConversationId,
        sourceMessageId,
        sourceQuote,
        title,
        titleSource,
        model: input.model ?? null,
        createdAt: now,
        updatedAt: now
      })
      return requireExisting(id)
    },
    get,
    listRoots() {
      return (selectRoots.all() as ConversationRow[]).map(mapConversation)
    },
    listAll() {
      return (selectAll.all() as ConversationRow[]).map(mapConversation)
    },
    listBySubject(subjectId) {
      return (selectBySubject.all({ subjectId }) as ConversationRow[]).map(mapConversation)
    },
    listChildren(parentConversationId) {
      return (selectChildren.all(parentConversationId) as ConversationRow[]).map(mapConversation)
    },
    listTree(rootId) {
      const rows = (selectSubtree.all({ rootId }) as ConversationRow[]).map(mapConversation)
      const byId = new Map<string, ConversationNode>()
      for (const conversation of rows) {
        byId.set(conversation.id, { conversation, children: [] })
      }
      let root: ConversationNode | null = null
      for (const conversation of rows) {
        const node = byId.get(conversation.id)
        if (!node) continue
        const parentId = conversation.parentConversationId
        if (parentId !== null && byId.has(parentId)) {
          byId.get(parentId)?.children.push(node)
        } else if (conversation.id === rootId) {
          root = node
        }
      }
      if (!root) throw new NotFoundError('Conversation', rootId)
      return root
    },
    rename(id, title, titleSource = 'manual') {
      requireExisting(id)
      if (!TITLE_SOURCES.includes(titleSource)) {
        throw new ValidationError('标题来源不合法')
      }
      updateTitle.run({ id, title: normalizeTitle(title), titleSource, updatedAt: Date.now() })
      return requireExisting(id)
    },
    moveToSubject(id, subjectId) {
      requireExisting(id)
      if (subjectId !== null && selectSubject.get(subjectId) === undefined) {
        throw new NotFoundError('Subject', subjectId)
      }
      updateSubject.run({ id, subjectId, updatedAt: Date.now() })
      return requireExisting(id)
    },
    touch(id) {
      touch.run({ id, updatedAt: Date.now() })
    },
    remove(id) {
      // Child conversations, their messages and bookmarks are removed by ON DELETE CASCADE.
      deleteById.run(id)
    }
  }
}
