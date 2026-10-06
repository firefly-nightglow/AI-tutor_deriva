// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Conversation } from '../../../../shared/types'
import { ConversationView } from '../ConversationView'

const conversation: Conversation = {
  id: 'c1',
  subjectId: null,
  parentConversationId: null,
  sourceMessageId: null,
  sourceQuote: null,
  title: '斯特林公式是怎么来的',
  titleSource: 'local',
  model: 'deepseek-flash',
  createdAt: 0,
  updatedAt: 0
}

afterEach(() => {
  cleanup()
})

beforeAll(() => {
  // jsdom has no layout: the transcript auto-scroll needs a stub.
  Element.prototype.scrollIntoView = vi.fn()
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) as DOMRect
})

function renderPane(levelLabel: string, onClose = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <ConversationView
      conversation={conversation}
      levelLabel={levelLabel}
      onClose={onClose}
      messages={[]}
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
  return onClose
}

describe('ConversationView pane header', () => {
  it('labels the pane with its level so a wall of panes stays readable', () => {
    renderPane('子对话 L2')
    expect(screen.getByText('子对话 L2')).toBeTruthy()
  })

  it('closes the pane from its own control', () => {
    const onClose = renderPane('主对话')
    fireEvent.click(screen.getByRole('button', { name: '关闭面板' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
