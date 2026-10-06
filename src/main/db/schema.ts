import type { Database } from 'better-sqlite3'

/**
 * Schema migrations, applied in order. Index N upgrades the database from user_version N to N+1.
 * `PRAGMA user_version` is the ledger, so no extra bookkeeping table is needed.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
    parent_conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    title_source TEXT NOT NULL DEFAULT 'local'
      CHECK (title_source IN ('local', 'model', 'manual')),
    model TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'text',
    attachments TEXT,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'complete'
      CHECK (status IN ('complete', 'streaming', 'error', 'aborted')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE bookmarks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    summary_source TEXT NOT NULL DEFAULT 'local'
      CHECK (summary_source IN ('local', 'model')),
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (conversation_id, message_id)
  );

  CREATE INDEX idx_conversations_subject ON conversations(subject_id);
  CREATE INDEX idx_conversations_parent ON conversations(parent_conversation_id);
  CREATE INDEX idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX idx_messages_parent ON messages(parent_id);
  CREATE INDEX idx_bookmarks_conversation ON bookmarks(conversation_id, position);
  `,
  // Migration 2: the quoted excerpt a branch conversation was opened from.
  `ALTER TABLE conversations ADD COLUMN source_quote TEXT;`
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function applyMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const migrate = db.transaction(() => {
      db.exec(MIGRATIONS[version])
      db.pragma(`user_version = ${version + 1}`)
    })
    migrate()
  }
}
