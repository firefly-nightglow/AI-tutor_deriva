import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { DuplicateNameError, NotFoundError, ValidationError, isUniqueConstraintError } from '../errors'
import { mapSubject, type SubjectRow } from '../rows'
import type { CreateSubjectInput, Subject } from '../../../shared/types'

export interface SubjectsRepository {
  create(input: CreateSubjectInput): Subject
  get(id: string): Subject | null
  list(): Subject[]
  rename(id: string, name: string): Subject
  remove(id: string): void
}

export function createSubjectsRepository(db: Database): SubjectsRepository {
  const insert = db.prepare(
    `INSERT INTO subjects (id, name, created_at, updated_at)
     VALUES (@id, @name, @createdAt, @updatedAt)`
  )
  const selectById = db.prepare('SELECT * FROM subjects WHERE id = ?')
  const selectAll = db.prepare('SELECT * FROM subjects ORDER BY name COLLATE NOCASE ASC')
  const updateName = db.prepare('UPDATE subjects SET name = @name, updated_at = @updatedAt WHERE id = @id')
  const deleteById = db.prepare('DELETE FROM subjects WHERE id = ?')

  function get(id: string): Subject | null {
    const row = selectById.get(id) as SubjectRow | undefined
    return row ? mapSubject(row) : null
  }

  function requireExisting(id: string): Subject {
    const subject = get(id)
    if (!subject) throw new NotFoundError('Subject', id)
    return subject
  }

  // The renderer is not a trust boundary: names arriving over IPC are validated here.
  function normalizeName(name: string): string {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (trimmed === '') throw new ValidationError('科目名称不能为空')
    return trimmed
  }

  return {
    create(input) {
      const now = Date.now()
      const id = randomUUID()
      const name = normalizeName(input.name)
      try {
        insert.run({ id, name, createdAt: now, updatedAt: now })
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new DuplicateNameError('Subject', name)
        throw error
      }
      return requireExisting(id)
    },
    get,
    list() {
      return (selectAll.all() as SubjectRow[]).map(mapSubject)
    },
    rename(id, name) {
      requireExisting(id)
      const normalized = normalizeName(name)
      try {
        updateName.run({ id, name: normalized, updatedAt: Date.now() })
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new DuplicateNameError('Subject', normalized)
        throw error
      }
      return requireExisting(id)
    },
    remove(id) {
      // Conversations keep existing: the FK is ON DELETE SET NULL, so they fall back to 未分类.
      deleteById.run(id)
    }
  }
}
