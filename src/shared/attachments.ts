import type { MessageAttachment } from './types'

/** Reads the attachment metadata stored on a message row; a malformed value degrades to no images. */
export function parseMessageAttachments(raw: string | null): MessageAttachment[] {
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is MessageAttachment =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as MessageAttachment).id === 'string' &&
        typeof (item as MessageAttachment).mime === 'string'
    )
  } catch {
    return []
  }
}
