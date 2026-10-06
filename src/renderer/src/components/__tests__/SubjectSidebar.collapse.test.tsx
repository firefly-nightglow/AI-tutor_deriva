import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../../../shared/types'
import type { ConversationGroup } from '../../lib/grouping'
import { SubjectSidebar } from '../SubjectSidebar'

function conversation(id: string, parentConversationId: string | null): Conversation {
  return {
    id,
    subjectId: null,
    parentConversationId,
    sourceMessageId: null,
    sourceQuote: null,
    title: id,
    titleSource: 'local',
    model: null,
    createdAt: 0,
    updatedAt: 0
  }
}

const groups: ConversationGroup[] = [
  {
    subject: null,
    items: [
      { conversation: conversation('root', null), depth: 0, hasChildren: true },
      { conversation: conversation('child', 'root'), depth: 1, hasChildren: false }
    ]
  }
]

function render(collapsedIds: ReadonlySet<string>): string {
  return renderToStaticMarkup(
    <SubjectSidebar
      groups={groups}
      selectedConversationId="root"
      collapsedIds={collapsedIds}
      descendantCounts={{}}
      onToggleCollapsed={() => {}}
      onSelectConversation={() => {}}
      onCreateConversation={() => {}}
      onRenameConversation={() => {}}
      onDeleteConversation={() => {}}
      onCreateSubject={() => {}}
      onRenameSubject={() => {}}
      onDeleteSubject={() => {}}
    />
  )
}

describe('SubjectSidebar collapse affordance', () => {
  it('caps the indentation at five levels while still labelling the depth', () => {
    const deepGroups: ConversationGroup[] = [
      {
        subject: null,
        items: [{ conversation: conversation('deep', 'root'), depth: 7, hasChildren: false }]
      }
    ]
    const html = renderToStaticMarkup(
      <SubjectSidebar
        groups={deepGroups}
        selectedConversationId={null}
        collapsedIds={new Set()}
        descendantCounts={{}}
        onToggleCollapsed={() => {}}
        onSelectConversation={() => {}}
        onCreateConversation={() => {}}
        onRenameConversation={() => {}}
        onDeleteConversation={() => {}}
        onCreateSubject={() => {}}
        onRenameSubject={() => {}}
        onDeleteSubject={() => {}}
      />
    )

    // 6px base + five capped steps of 14px, not seven.
    expect(html).toContain('padding-left:76px')
    expect(html).toContain('L7')
  })

  it('offers a toggle only for nodes that have children, expanded by default', () => {
    const html = render(new Set())

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('▾')
    expect(html).toContain('折叠子对话')
    expect(html.match(/sidebar__toggle"/g) ?? []).toHaveLength(1)
  })

  it('shows the collapsed state on the toggle', () => {
    const html = render(new Set(['root']))

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('▸')
    expect(html).toContain('展开子对话')
  })
})
