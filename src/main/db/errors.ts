const ENTITY_LABELS: Record<string, string> = {
  Subject: '科目',
  Conversation: '对话',
  Message: '消息',
  Bookmark: '书签'
}

function label(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`找不到${label(entity)}（${id}）`)
    this.name = 'NotFoundError'
  }
}

export class DuplicateNameError extends Error {
  constructor(entity: string, name: string) {
    super(`${label(entity)}「${name}」已存在，请换一个名字。`)
    this.name = 'DuplicateNameError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  )
}
