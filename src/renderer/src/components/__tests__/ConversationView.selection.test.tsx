// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Conversation, Message } from '../../../../shared/types'
import { ConversationView } from '../ConversationView'

const conversation: Conversation = {
  id: 'c1',
  subjectId: null,
  parentConversationId: null,
  sourceMessageId: null,
  sourceQuote: null,
  title: '张量 CP 分解',
  titleSource: 'local',
  model: 'deepseek-flash',
  createdAt: 0,
  updatedAt: 0
}

/** A promoted single-line $$ block sits between the two paragraphs: the drift case from the bug report. */
const ANSWER = '第一个段落。\n\n$$A = B$$\n\n第二个段落。'

const messages: Message[] = [
  {
    id: 'm1',
    conversationId: 'c1',
    parentId: null,
    role: 'assistant',
    content: ANSWER,
    contentType: 'text',
    attachments: null,
    model: 'deepseek-flash',
    status: 'complete',
    createdAt: 0,
    updatedAt: 0
  }
]

beforeAll(() => {
  // jsdom has no layout: give ranges a rect so the floating button has somewhere to go.
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 120, left: 40, right: 260, bottom: 140, width: 220, height: 20, x: 40, y: 120 }) as DOMRect
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  window.getSelection()?.removeAllRanges()
})

function renderView(onAsk = vi.fn()): ReturnType<typeof render> {
  return render(
    <ConversationView
      conversation={conversation}
      levelLabel="主对话"
      onClose={() => {}}
      messages={messages}
      bookmarks={[]}
      branchSources={[]}
      railCollapsed={false}
      onToggleRail={() => {}}
      streamingText=""
      streaming={false}
      error=""
      onSend={() => {}}
      onCancel={() => {}}
      onRetry={() => {}}
      onAsk={onAsk}
    />
  )
}

function fireMouseUpOnTranscript(): void {
  fireEvent.mouseUp(document.querySelector('.conversation__messages') as HTMLElement)
}

describe('ConversationView selection to branch', () => {
  it('quotes the paragraph after a promoted formula without drifting', () => {
    const onAsk = vi.fn()
    renderView(onAsk)
    const paragraphs = document.querySelectorAll('.markdown p')
    const last = paragraphs[paragraphs.length - 1]
    const text = last.firstChild as Text

    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, text.length)
    const selection = window.getSelection() as Selection
    selection.removeAllRanges()
    selection.addRange(range)
    fireMouseUpOnTranscript()

    const button = screen.getByRole('button', { name: '追问' })
    fireEvent.click(button)

    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk.mock.calls[0]?.[0]).toBe('第二个段落。')
    expect(onAsk.mock.calls[0]?.[1]).toBe('m1')
  })

  it('does not offer the button for a collapsed caret or no selection at all', () => {
    renderView()
    const paragraph = document.querySelector('.markdown p') as HTMLElement
    const text = paragraph.firstChild as Text

    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 1)
    const selection = window.getSelection() as Selection
    selection.removeAllRanges()
    selection.addRange(range)
    fireMouseUpOnTranscript()
    expect(screen.queryByRole('button', { name: '追问' })).toBeNull()

    selection.removeAllRanges()
    fireMouseUpOnTranscript()
    expect(screen.queryByRole('button', { name: '追问' })).toBeNull()
  })

  it('keeps the Formula source intact when the selection covers a display formula', () => {
    const onAsk = vi.fn()
    renderView(onAsk)
    const transcript = document.querySelector('.conversation__messages') as HTMLElement
    const selection = window.getSelection() as Selection
    const range = document.createRange()
    range.selectNodeContents(transcript.querySelector('.katex') as HTMLElement)
    selection.removeAllRanges()
    selection.addRange(range)
    fireMouseUpOnTranscript()

    const button = screen.queryByRole('button', { name: '追问' })
    expect(button).not.toBeNull()
    fireEvent.click(button as HTMLElement)

    expect(onAsk.mock.calls[0]?.[0]).toContain('A = B')
  })
})
