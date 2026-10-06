import Database from 'better-sqlite3'
import type { Database as DatabaseHandle } from 'better-sqlite3'
import { applyMigrations } from './schema'
import { createRepositories, type Repositories } from './repositories'

export interface AppDatabase {
  readonly filePath: string
  /** Raw better-sqlite3 handle, used by tests and by features that need a bespoke statement. */
  readonly connection: DatabaseHandle
  readonly repositories: Repositories
  close(): void
}

/**
 * Opens the SQLite database, turns on the two pragmas the schema depends on and applies migrations.
 * Foreign keys are off by default in SQLite, so ON DELETE CASCADE only works once enabled per connection.
 */
export function openDatabase(filePath: string): AppDatabase {
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applyMigrations(db)
  return {
    filePath,
    connection: db,
    repositories: createRepositories(db),
    close: () => db.close()
  }
}

export { SCHEMA_VERSION } from './schema'
export * from '../../shared/types'
export type { Repositories } from './repositories'
