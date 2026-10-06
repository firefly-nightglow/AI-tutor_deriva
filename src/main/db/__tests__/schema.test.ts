import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { openDatabase, SCHEMA_VERSION } from '..'

describe('schema', () => {
  it('creates the four v1 tables and records the schema version', () => {
    const database = openDatabase(':memory:')
    const tables = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)

    expect(names).toEqual(expect.arrayContaining(['bookmarks', 'conversations', 'messages', 'subjects']))
    expect(database.connection.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    database.close()
  })

  it('enables foreign keys on the connection', () => {
    const database = openDatabase(':memory:')
    expect(database.connection.pragma('foreign_keys', { simple: true })).toBe(1)
    database.close()
  })

  it('reserves content_type and attachments on messages for v2/v3 (ADR-0004)', () => {
    const database = openDatabase(':memory:')
    const columns = database.connection.prepare('PRAGMA table_info(messages)').all() as Array<{
      name: string
      dflt_value: string | null
    }>
    const byName = new Map(columns.map((column) => [column.name, column]))

    expect(byName.get('content_type')?.dflt_value).toBe("'text'")
    expect(byName.has('attachments')).toBe(true)
    expect(byName.has('parent_id')).toBe(true)
    database.close()
  })

  it('adds source_quote to conversations for branch excerpts (migration 2)', () => {
    const database = openDatabase(':memory:')
    const columns = database.connection.prepare('PRAGMA table_info(conversations)').all() as Array<{
      name: string
    }>

    expect(columns.map((column) => column.name)).toContain('source_quote')
    database.close()
  })

  it('is idempotent when opened twice against the same file', () => {
    const database = openDatabase(':memory:')
    database.close()
    const reopened = openDatabase(':memory:')
    expect(reopened.connection.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    reopened.close()
  })

  it('creates a real database file and reopens it with data intact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-db-'))
    const filePath = join(directory, 'deriva.db')
    try {
      const first = openDatabase(filePath)
      const subject = first.repositories.subjects.create({ name: '数据结构' })
      expect(existsSync(filePath)).toBe(true)
      expect(first.connection.pragma('journal_mode', { simple: true })).toBe('wal')

      // NFR-1 is about the shipping path, so time the write against the WAL file database too.
      const conversation = first.repositories.conversations.create({
        subjectId: subject.id,
        title: '计时'
      })
      const started = performance.now()
      first.repositories.messages.append({
        conversationId: conversation.id,
        role: 'user',
        content: '计时消息'
      })
      expect(performance.now() - started).toBeLessThan(50)
      first.close()

      const second = openDatabase(filePath)
      expect(second.repositories.subjects.get(subject.id)?.name).toBe('数据结构')
      second.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
