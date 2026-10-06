/** Longest derived title before it is truncated; short enough for the sidebar, long enough to identify. */
export const TITLE_MAX_LENGTH = 24
export const BOOKMARK_MAX_LENGTH = 40

/**
 * Derives a conversation title from its first question without calling the model (OQ-1/OQ-5 default).
 * Leading markdown markers are stripped so a question that opens with a heading or bold text still
 * reads as a title; the original text is untouched.
 */
export function summarizeTitle(text: string, maxLength: number = TITLE_MAX_LENGTH): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized === '') return '新对话'

  const stripped = stripMarkupForTitle(normalized)
  // Never fall back to the raw markup: a formula-only question would otherwise become a LaTeX title.
  const source = stripped === '' ? '新对话' : stripped

  return source.length <= maxLength ? source : `${source.slice(0, maxLength)}…`
}

/**
 * Removes the markup that would look like noise in a title. When a quote is used for the title the
 * caller passes the text the student actually sees (so ε stays ε); this is the safety net for the
 * case where only Markdown/LaTeX source is available.
 */
export function stripMarkupForTitle(text: string): string {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/^[#>\-*\s]+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One-line summary used for a conversation bookmark (FR-6). Prefers the first sentence so the label
 * matches how a student would describe the passage, and falls back to a hard truncation.
 */
export function summarizeBookmark(text: string, maxLength: number = BOOKMARK_MAX_LENGTH): string {
  const plain = stripMarkupForTitle(text.replace(/\s+/g, ' ').trim())
  if (plain === '') return '未命名要点'

  const sentenceEnd = plain.search(/[。！？!?；;]/)
  const sentence = sentenceEnd === -1 ? plain : plain.slice(0, sentenceEnd)
  const source = sentence.trim() === '' ? plain : sentence.trim()

  return source.length <= maxLength ? source : `${source.slice(0, maxLength)}…`
}
