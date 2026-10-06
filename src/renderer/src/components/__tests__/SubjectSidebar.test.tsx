import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Conversation, Subject } from '../../../../shared/types'
import type { ConversationGroup } from '../../lib/grouping'
import { SubjectSidebar } from '../SubjectSidebar'

const subject: Subject = { id: 's1', name: '线性代数', createdAt: 0, updatedAt: 0 }

function conversation(id: string, title: string, subjectId: string | null): Conversation {
  return {
    id,
    subjectId,
    parentConversationId: null,
    sourceMessageId: null,
    sourceQuote: null,
    title,
    titleSource: 'local',
    model: 'deepseek-flash',
    createdAt: 0,
    updatedAt: 0
  }
}

const groups: ConversationGroup[] = [
  {
    subject,
    items: [{ conversation: conversation('c1', '特征值是什么', 's1'), depth: 0, hasChildren: true }]
  },
  {
    subject: null,
    items: [
      { conversation: conversation('c2', '未归类的问题', null), depth: 0, hasChildren: true },
      { conversation: conversation('c3', '追问一句', null), depth: 1, hasChildren: false }
    ]
  }
]

function render(): string {
  return renderToStaticMarkup(
    <SubjectSidebar
      groups={groups}
      selectedConversationId="c1"
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
}

describe('SubjectSidebar', () => {
  it('groups conversations under their subject and under 未分类', () => {
    const html = render()

    expect(html).toContain('<h2>线性代数</h2>')
    expect(html).toContain('特征值是什么')
    expect(html).toContain('<h2>未分类</h2>')
    expect(html).toContain('未归类的问题')
  })

  it('marks the open conversation and offers per-subject creation', () => {
    const html = render()

    expect(html).toContain('is-selected')
    expect(html).toContain('新建对话')
  })

  it('hides rename and delete for the 未分类 bucket', () => {
    const html = renderToStaticMarkup(
      <SubjectSidebar
        groups={[{ subject: null, items: [] }]}
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

    expect(html).toContain('<h2>未分类</h2>')
    expect(html).not.toContain('重命名')
    expect(html).not.toContain('删除')
  })
})
