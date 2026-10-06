import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { NotFoundError, ValidationError } from '../errors'
import { mapBookmark, type BookmarkRow } from '../rows'
import type { Bookmark, CreateBookmarkInput } from '../../../shared/types'

export interface BookmarksRepository {
  create(input: CreateBookmarkInput): Bookmark
  get(id: string): Bookmark | null
  getByMessage(conversationId: string, messageId: string): Bookmark | null
  listByConversation(conversationId: string): Bookmark[]
  updateSummary(id: string, summary: string, summarySource?: Bookmark['summarySource']): Bookmark
  remove(id: string): void
}

export function createBookmarksRepository(db: Database): BookmarksRepository {
  const insert = db.prepare(
    `INSERT INTO bookmarks (
       id, conversation_id, message_id, summary, summary_source, position, created_at, updated_at
     ) VALUES (
       @id, @conversationId, @messageId, @summary, @summarySource, @position, @createdAt, @updatedAt
     )`
  )
  const selectById = db.prepare('SELECT * FROM bookmarks WHERE id = ?')
  const selectByMessage = db.prepare(
    'SELECT * FROM bookmarks WHERE conversation_id = ? AND message_id = ?'
  )
  const selectMessageConversation = db.prepare('SELECT conversation_id FROM messages WHERE id = ?')
  const selectByConversation = db.prepare(
    'SELECT * FROM bookmarks WHERE conversation_id = ? ORDER BY position ASC, created_at ASC'
  )
  const updateSummary = db.prepare(
    'UPDATE bookmarks SET summary = @summary, summary_source = @summarySource, updated_at = @updatedAt WHERE id = @id'
  )
  const deleteById = db.prepare('DELETE FROM bookmarks WHERE id = ?')

  function get(id: string): Bookmark | null {
    const row = selectById.get(id) as BookmarkRow | undefined
    return row ? mapBookmark(row) : null
  }

  return {
    create(input) {
      const owner = selectMessageConversation.get(input.messageId) as
        | { conversation_id: string }
        | undefined
      if (!owner) throw new NotFoundError('Message', input.messageId)
      if (owner.conversation_id !== input.conversationId) {
        throw new ValidationError('书签的消息必须属于同一个对话')
      }
      const now = Date.now()
      const id = randomUUID()
      insert.run({
        id,
        conversationId: input.conversationId,
        messageId: input.messageId,
        summary: input.summary,
        summarySource: input.summarySource ?? 'local',
        position: input.position,
        createdAt: now,
        updatedAt: now
      })
      const bookmark = get(id)
      if (!bookmark) throw new NotFoundError('Bookmark', id)
      return bookmark
    },
    get,
    getByMessage(conversationId, messageId) {
      const row = selectByMessage.get(conversationId, messageId) as BookmarkRow | undefined
      return row ? mapBookmark(row) : null
    },
    listByConversation(conversationId) {
      return (selectByConversation.all(conversationId) as BookmarkRow[]).map(mapBookmark)
    },
    updateSummary(id, summary, summarySource = 'local') {
      const existing = get(id)
      if (!existing) throw new NotFoundError('Bookmark', id)
      updateSummary.run({ id, summary, summarySource, updatedAt: Date.now() })
      const updated = get(id)
      if (!updated) throw new NotFoundError('Bookmark', id)
      return updated
    },
    remove(id) {
      deleteById.run(id)
    }
  }
}
