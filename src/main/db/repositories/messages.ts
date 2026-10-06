import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { NotFoundError, ValidationError } from '../errors'
import { mapMessage, type MessageRow } from '../rows'
import type { CreateMessageInput, Message, MessageStatus } from '../../../shared/types'

export interface MessagesRepository {
  append(input: CreateMessageInput): Message
  get(id: string): Message | null
  listByConversation(conversationId: string): Message[]
  listChildren(parentId: string): Message[]
  updateContent(id: string, content: string, status?: MessageStatus): Message
  remove(id: string): void
}

export function createMessagesRepository(db: Database): MessagesRepository {
  const insert = db.prepare(
    `INSERT INTO messages (
       id, conversation_id, parent_id, role, content, content_type,
       attachments, model, status, created_at, updated_at
     ) VALUES (
       @id, @conversationId, @parentId, @role, @content, @contentType,
       @attachments, @model, @status, @createdAt, @updatedAt
     )`
  )
  const selectById = db.prepare('SELECT * FROM messages WHERE id = ?')
  const selectByConversation = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC'
  )
  const selectChildren = db.prepare(
    'SELECT * FROM messages WHERE parent_id = ? ORDER BY created_at ASC, rowid ASC'
  )
  const selectParent = db.prepare('SELECT conversation_id FROM messages WHERE id = ?')
  const updateContent = db.prepare(
    'UPDATE messages SET content = @content, status = @status, updated_at = @updatedAt WHERE id = @id'
  )
  const deleteById = db.prepare('DELETE FROM messages WHERE id = ?')
  const touchConversation = db.prepare('UPDATE conversations SET updated_at = @updatedAt WHERE id = @id')

  function get(id: string): Message | null {
    const row = selectById.get(id) as MessageRow | undefined
    return row ? mapMessage(row) : null
  }

  function requireExisting(id: string): Message {
    const message = get(id)
    if (!message) throw new NotFoundError('Message', id)
    return message
  }

  return {
    append(input) {
      const now = Date.now()
      const id = randomUUID()
      const parentId = input.parentId ?? null
      if (parentId !== null) {
        const parent = selectParent.get(parentId) as { conversation_id: string } | undefined
        if (!parent) throw new NotFoundError('Message', parentId)
        // Message lineage never crosses conversations; a branch records its anchor on the
        // conversation row (source_message_id) instead of reparenting the message tree.
        if (parent.conversation_id !== input.conversationId) {
          throw new ValidationError('父消息必须属于同一个对话')
        }
      }
      const appendMessage = db.transaction(() => {
        insert.run({
          id,
          conversationId: input.conversationId,
          parentId,
          role: input.role,
          content: input.content,
          contentType: input.contentType ?? 'text',
          attachments: input.attachments ?? null,
          model: input.model ?? null,
          status: input.status ?? 'complete',
          createdAt: now,
          updatedAt: now
        })
        touchConversation.run({ id: input.conversationId, updatedAt: now })
      })
      appendMessage()
      return requireExisting(id)
    },
    get,
    listByConversation(conversationId) {
      return (selectByConversation.all(conversationId) as MessageRow[]).map(mapMessage)
    },
    listChildren(parentId) {
      return (selectChildren.all(parentId) as MessageRow[]).map(mapMessage)
    },
    updateContent(id, content, status = 'complete') {
      requireExisting(id)
      updateContent.run({ id, content, status, updatedAt: Date.now() })
      return requireExisting(id)
    },
    remove(id) {
      // Descendant messages are removed by the ON DELETE CASCADE self-reference on parent_id.
      deleteById.run(id)
    }
  }
}
