import { describe, expect, it } from 'vitest'
import type { Conversation, Subject } from '../../../../shared/types'
import { ancestorIds, depthOf, descendantCounts, groupConversations } from '../grouping'

function subject(id: string, name: string): Subject {
  return { id, name, createdAt: 0, updatedAt: 0 }
}

function conversation(
  id: string,
  subjectId: string | null,
  parentConversationId: string | null = null
): Conversation {
  return {
    id,
    subjectId,
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

describe('groupConversations', () => {
  it('puts each conversation under its subject and 未分类 last', () => {
    const groups = groupConversations(
      [subject('s1', '线性代数'), subject('s2', '高数')],
      [conversation('a', 's1'), conversation('b', null), conversation('c', 's2')]
    )

    expect(groups.map((group) => group.subject?.name ?? '未分类')).toEqual([
      '线性代数',
      '高数',
      '未分类'
    ])
    expect(groups.map((group) => group.items.map((item) => item.conversation.id))).toEqual([
      ['a'],
      ['c'],
      ['b']
    ])
  })

  it('preserves the newest-first order inside a group', () => {
    const groups = groupConversations(
      [subject('s1', '线性代数')],
      [conversation('newer', 's1'), conversation('older', 's1')]
    )

    expect(groups[0]?.items.map((item) => item.conversation.id)).toEqual(['newer', 'older'])
  })

  it('still renders the empty 未分类 bucket when there are no subjects', () => {
    const groups = groupConversations([], [conversation('a', null)])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.subject).toBeNull()
    expect(groups[0]?.items.map((item) => item.conversation.id)).toEqual(['a'])
  })

  it('nests branches under their parent with an increasing depth', () => {
    const groups = groupConversations(
      [],
      [
        conversation('root', null),
        conversation('child', null, 'root'),
        conversation('grandchild', null, 'child')
      ]
    )

    expect(groups[0]?.items.map((item) => [item.conversation.id, item.depth])).toEqual([
      ['root', 0],
      ['child', 1],
      ['grandchild', 2]
    ])
  })

  it('hides the subtree of a collapsed node and flags which nodes have children', () => {
    const groups = groupConversations(
      [],
      [
        conversation('root', null),
        conversation('child', null, 'root'),
        conversation('grandchild', null, 'child')
      ],
      new Set(['root'])
    )

    expect(groups[0]?.items.map((item) => item.conversation.id)).toEqual(['root'])
    expect(groups[0]?.items[0]?.hasChildren).toBe(true)

    const expanded = groupConversations([], [
      conversation('root', null),
      conversation('child', null, 'root')
    ])
    expect(expanded[0]?.items.map((item) => item.hasChildren)).toEqual([true, false])
  })

  it('flattens a 1000-node tree well inside the interaction budget', () => {
    // Smoke signal only: vitest runs outside production mode, so the real NFR-4 measurement needs
    // the packaged app (see GROUND-0005, Limitations).
    const nodes: Conversation[] = [conversation('n0', null)]
    for (let index = 1; index < 1000; index += 1) {
      nodes.push(conversation(`n${index}`, null, `n${Math.floor((index - 1) / 4)}`))
    }

    const started = performance.now()
    const groups = groupConversations([], nodes)
    const elapsed = performance.now() - started

    expect(groups[0]?.items).toHaveLength(1000)
    expect(elapsed).toBeLessThan(500)
  })

  it('walks up to the root so a selected node can be revealed', () => {
    const all = [
      conversation('root', null),
      conversation('child', null, 'root'),
      conversation('grandchild', null, 'child')
    ]

    expect(ancestorIds(all, 'grandchild')).toEqual(['child', 'root'])
    expect(ancestorIds(all, 'root')).toEqual([])
    expect(depthOf(all, 'root')).toBe(0)
    expect(depthOf(all, 'child')).toBe(1)
    expect(depthOf(all, 'grandchild')).toBe(2)
  })

  it('counts every descendant once for the delete confirmation', () => {
    const all = [
      conversation('root', null),
      conversation('a', null, 'root'),
      conversation('a1', null, 'a'),
      conversation('a2', null, 'a'),
      conversation('other', null)
    ]

    expect(descendantCounts(all)).toEqual({ root: 3, a: 2, a1: 0, a2: 0, other: 0 })
  })
})
