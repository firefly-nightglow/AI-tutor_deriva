import type { Conversation } from '../../../shared/types'
import { markdownSource } from './markdownSource'

export interface BranchSource {
  conversationId: string
  messageId: string
  quote: string
}

/** Every branch that was opened from a passage, flattened for the transcript to mark up. */
export function branchSources(all: Conversation[]): BranchSource[] {
  return all
    .filter(
      (conversation) => conversation.sourceMessageId !== null && conversation.sourceQuote !== null
    )
    .map((conversation) => ({
      conversationId: conversation.id,
      messageId: conversation.sourceMessageId as string,
      quote: conversation.sourceQuote as string
    }))
}

export interface OffsetRange {
  start: number
  end: number
}

/**
 * Locates each quote inside the rendered message's source, so the transcript can outline the passage a
 * branch came from. Quotes were sliced out of this exact string when the branch was created, so a plain
 * search finds them; a quote that no longer matches (edited content) is skipped rather than guessed.
 */
export function branchRanges(content: string, quotes: readonly string[]): OffsetRange[] {
  const source = markdownSource(content)
  const ranges: OffsetRange[] = []
  for (const quote of quotes) {
    if (quote.trim() === '') continue
    const start = source.indexOf(quote)
    if (start === -1) continue
    ranges.push({ start, end: start + quote.length })
  }
  return ranges
}

export function overlaps(range: OffsetRange, other: OffsetRange): boolean {
  return range.start < other.end && other.start < range.end
}
