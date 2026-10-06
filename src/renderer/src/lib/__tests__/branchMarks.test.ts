import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../../../shared/types'
import { branchRanges, branchSources, overlaps } from '../branchMarks'

function conversation(partial: Partial<Conversation>): Conversation {
  return {
    id: 'c1',
    subjectId: null,
    parentConversationId: null,
    sourceMessageId: null,
    sourceQuote: null,
    title: 't',
    titleSource: 'local',
    model: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial
  }
}

describe('branch marks', () => {
  it('lists only branches that recorded an anchor and a quote', () => {
    const marks = branchSources([
      conversation({ id: 'root' }),
      conversation({ id: 'b1', sourceMessageId: 'm1', sourceQuote: '重点段落' }),
      conversation({ id: 'b2', sourceMessageId: 'm2' })
    ])

    expect(marks).toEqual([{ conversationId: 'b1', messageId: 'm1', quote: '重点段落' }])
  })

  it('locates a quote inside the same source the renderer parsed', () => {
    const content = '前言\n\n$$A = B$$\n\n重点段落。'
    const [range] = branchRanges(content, ['重点段落。'])

    expect(range).toBeDefined()
    // Offsets refer to the normalised source (the promoted formula added newlines).
    expect(range?.end).toBeGreaterThan(range?.start ?? 0)
  })

  it('skips quotes that no longer match instead of guessing', () => {
    expect(branchRanges('完全不同的正文', ['消失的段落'])).toEqual([])
  })

  it('detects block overlap the way the marker effect does', () => {
    expect(overlaps({ start: 10, end: 20 }, { start: 15, end: 25 })).toBe(true)
    expect(overlaps({ start: 10, end: 20 }, { start: 20, end: 30 })).toBe(false)
  })
})
