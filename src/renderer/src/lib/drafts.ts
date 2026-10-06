const DRAFT_PREFIX = 'deriva.draft.'

/** localStorage when one exists; null during server rendering or when storage is blocked. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function draftKey(conversationId: string): string {
  return `${DRAFT_PREFIX}${conversationId}`
}

/** Drafts live in localStorage so an unsent question survives switching conversations and restarts. */
export function readDraft(
  storage: Pick<Storage, 'getItem'> | null,
  conversationId: string
): string {
  try {
    return storage?.getItem(draftKey(conversationId)) ?? ''
  } catch {
    return ''
  }
}

export function saveDraft(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  conversationId: string,
  text: string
): void {
  try {
    if (text === '') storage?.removeItem(draftKey(conversationId))
    else storage?.setItem(draftKey(conversationId), text)
  } catch {
    // Storage unavailable: the draft still lives in component state for this session.
  }
}
