// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Bookmark, Conversation, Message } from '../../../../shared/types'
import { ConversationView } from '../ConversationView'

const conversation: Conversation = {
  id: 'c1',
  subjectId: null,
  parentConversationId: null,
  sourceMessageId: null,
  sourceQuote: null,
  title: '数列极限',
  titleSource: 'local',
  model: 'deepseek-flash',
  createdAt: 0,
  updatedAt: 0
}

function message(id: string, content: string): Message {
  return {
    id,
    conversationId: 'c1',
    parentId: null,
    role: 'assistant',
    content,
    contentType: 'text',
    attachments: null,
    model: 'deepseek-flash',
    status: 'complete',
    createdAt: 0,
    updatedAt: 0
  }
}

function bookmark(id: string, messageId: string, summary: string, position: number): Bookmark {
  return {
    id,
    conversationId: 'c1',
    messageId,
    summary,
    summarySource: 'local',
    position,
    createdAt: 0,
    updatedAt: 0
  }
}

const scrollIntoView = vi.fn()

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect
})

afterEach(() => {
  cleanup()
  scrollIntoView.mockClear()
  window.localStorage.clear()
})

function renderView(
  options: { railCollapsed?: boolean; onToggleRail?: () => void } = {}
): void {
  render(
    <ConversationView
      conversation={conversation}
      levelLabel="主对话"
      onClose={() => {}}
      messages={[message('m1', '第一个要点'), message('m2', '第二个要点')]}
      bookmarks={[
        bookmark('b1', 'm1', '第一个要点', 0),
        bookmark('b2', 'm2', '第二个要点', 1)
      ]}
      branchSources={[]}
      railCollapsed={options.railCollapsed ?? false}
      onToggleRail={options.onToggleRail ?? (() => {})}
      streamingText=""
      streaming={false}
      error=""
      onSend={() => {}}
      onCancel={() => {}}
      onRetry={() => {}}
      onAsk={() => {}}
    />
  )
}

describe('ConversationView bookmarks rail', () => {
  it('lists one entry per bookmark in position order', () => {
    renderView()
    const rail = screen.getByRole('navigation', { name: '对话书签' })

    expect(rail.textContent).toContain('第一个要点')
    expect(rail.textContent).toContain('第二个要点')
    expect(rail.querySelectorAll('.bookmark-rail__item')).toHaveLength(2)
  })

  it('jumps to the bookmarked passage and highlights it', () => {
    renderView()

    fireEvent.click(screen.getByTitle('第二个要点'))

    // The transcript also auto-scrolls to the newest message on mount, so assert the jump's options.
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    const highlighted = document.querySelector('.message.is-highlighted')
    expect(highlighted?.getAttribute('data-message-id')).toBe('m2')
  })

  it('hides the entries when collapsed and asks the app to toggle', () => {
    // The collapsed state lives in App so every pane agrees; here we only assert the presentation.
    const onToggleRail = vi.fn()
    renderView({ railCollapsed: true, onToggleRail })

    expect(screen.queryByTitle('第一个要点')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开书签栏' }))
    expect(onToggleRail).toHaveBeenCalledTimes(1)
  })
})

describe('ConversationView branch markers', () => {
  it('outlines the passage a branch was opened from and counts the branches', () => {
    render(
      <ConversationView
        conversation={conversation}
        levelLabel="主对话"
        onClose={() => {}}
        messages={[message('m1', '第一段\n\n重点段落。\n\n第三段')]}
        bookmarks={[]}
        branchSources={[{ conversationId: 'b1', messageId: 'm1', quote: '重点段落。' }]}
        railCollapsed={false}
        onToggleRail={() => {}}
        streamingText=""
        streaming={false}
        error=""
        onSend={() => {}}
        onCancel={() => {}}
        onRetry={() => {}}
        onAsk={() => {}}
      />
    )

    expect(document.querySelector('.is-branch-source')?.textContent).toContain('重点段落')
    expect(screen.getByText('1 个子对话')).toBeTruthy()
  })

  it('leaves the transcript unmarked when the branch is gone', () => {
    render(
      <ConversationView
        conversation={conversation}
        levelLabel="主对话"
        onClose={() => {}}
        messages={[message('m1', '第一段\n\n重点段落。')]}
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
        onAsk={() => {}}
      />
    )

    expect(document.querySelector('.is-branch-source')).toBeNull()
    expect(screen.queryByText(/个子对话/)).toBeNull()
  })
})
