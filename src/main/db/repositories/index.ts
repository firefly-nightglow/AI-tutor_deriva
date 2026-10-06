import type { Database } from 'better-sqlite3'
import { createBookmarksRepository, type BookmarksRepository } from './bookmarks'
import { createConversationsRepository, type ConversationsRepository } from './conversations'
import { createMessagesRepository, type MessagesRepository } from './messages'
import { createSubjectsRepository, type SubjectsRepository } from './subjects'

export interface Repositories {
  subjects: SubjectsRepository
  conversations: ConversationsRepository
  messages: MessagesRepository
  bookmarks: BookmarksRepository
}

export function createRepositories(db: Database): Repositories {
  return {
    subjects: createSubjectsRepository(db),
    conversations: createConversationsRepository(db),
    messages: createMessagesRepository(db),
    bookmarks: createBookmarksRepository(db)
  }
}

export type {
  BookmarksRepository,
  ConversationsRepository,
  MessagesRepository,
  SubjectsRepository
}
