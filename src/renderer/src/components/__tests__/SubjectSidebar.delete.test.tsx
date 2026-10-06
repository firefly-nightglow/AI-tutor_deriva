// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Conversation, Subject } from '../../../../shared/types'
import type { ConversationGroup } from '../../lib/grouping'
import { SubjectSidebar } from '../SubjectSidebar'

function conversation(id: string, title: string): Conversation {
  return {
    id,
    subjectId: null,
    parentConversationId: null,
    sourceMessageId: null,
    sourceQuote: null,
    title,
    titleSource: 'manual',
    model: null,
    createdAt: 0,
    updatedAt: 0
  }
}

const subject: Subject = { id: 's1', name: '线性代数', createdAt: 0, updatedAt: 0 }

const groups: ConversationGroup[] = [
  {
    subject,
    items: [{ conversation: conversation('c1', '特征值是什么'), depth: 0, hasChildren: true }]
  }
]

afterEach(() => {
  cleanup()
})

function renderSidebar(
  counts: Record<string, number>,
  onDeleteConversation = vi.fn()
): ReturnType<typeof vi.fn> {
  render(
    <SubjectSidebar
      groups={groups}
      selectedConversationId={null}
      collapsedIds={new Set()}
      descendantCounts={counts}
      onToggleCollapsed={() => {}}
      onSelectConversation={() => {}}
      onCreateConversation={() => {}}
      onRenameConversation={() => {}}
      onDeleteConversation={onDeleteConversation}
      onCreateSubject={() => {}}
      onRenameSubject={() => {}}
      onDeleteSubject={() => {}}
    />
  )
  return onDeleteConversation
}

describe('SubjectSidebar delete confirmation', () => {
  it('states how many descendants a cascade would destroy', () => {
    renderSidebar({ c1: 2 })

    fireEvent.click(document.querySelector('.sidebar__item-actions button.danger') as HTMLElement)

    expect(screen.getByText('删除「特征值是什么」？')).toBeTruthy()
    expect(screen.getByText(/将同时删除 2 个子对话。删除后无法恢复。/)).toBeTruthy()
  })

  it('says so when the conversation has no descendants', () => {
    renderSidebar({ c1: 0 })

    fireEvent.click(document.querySelector('.sidebar__item-actions button.danger') as HTMLElement)

    expect(screen.getByText(/这条对话没有子对话。删除后无法恢复。/)).toBeTruthy()
  })

  it('deletes only after the confirmation', () => {
    const onDeleteConversation = renderSidebar({ c1: 1 })

    fireEvent.click(document.querySelector('.sidebar__item-actions button.danger') as HTMLElement)
    expect(onDeleteConversation).not.toHaveBeenCalled()

    // jsdom keeps a closed <dialog> out of the accessibility tree, so target it by selector.
    fireEvent.click(document.querySelector('.confirm button.danger') as HTMLElement)
    expect(onDeleteConversation).toHaveBeenCalledWith('c1')
  })
})
