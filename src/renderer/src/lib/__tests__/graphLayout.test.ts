import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../../../shared/types'
import {
  conversationSubtree,
  layoutConversationTree,
  limitConversationGraph
} from '../graphLayout'

function conversation(id: string, parent: string | null, title = id): Conversation {
  return {
    id,
    subjectId: null,
    parentConversationId: parent,
    sourceMessageId: null,
    sourceQuote: null,
    title,
    titleSource: 'manual',
    model: null,
    createdAt: 0,
    updatedAt: 0
  }
}

const TREE: Conversation[] = [
  conversation('root', null, '主对话'),
  conversation('a', 'root', '子对话 A'),
  conversation('b', 'root', '子对话 B'),
  conversation('a1', 'a', '子对话 A1'),
  conversation('other', null, '别的主对话')
]

describe('conversation graph layout', () => {
  it('walks only the requested root subtree', () => {
    expect(conversationSubtree(TREE, 'root').map((item) => [item.conversation.id, item.depth])).toEqual([
      ['root', 0],
      ['a', 1],
      ['a1', 2],
      ['b', 1]
    ])
    expect(conversationSubtree(TREE, 'missing')).toEqual([])
  })

  it('produces one node per subtree conversation plus an edge per parent link', () => {
    const graph = layoutConversationTree(TREE, 'root')

    expect(graph.nodes).toHaveLength(4)
    expect(graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort()).toEqual([
      'a->a1',
      'root->a',
      'root->b'
    ])
  })

  it('marks the open conversation and gives every node a finite position', () => {
    const graph = layoutConversationTree(TREE, 'root', 'a1')

    expect(graph.nodes.find((node) => node.id === 'a1')?.data.isCurrent).toBe(true)
    expect(graph.nodes.filter((node) => node.data.isCurrent)).toHaveLength(1)
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
  })

  it('places children below their parent', () => {
    const graph = layoutConversationTree(TREE, 'root')
    const positions = new Map(graph.nodes.map((node) => [node.id, node.position.y]))

    expect(positions.get('a')).toBeGreaterThan(positions.get('root') ?? 0)
    expect(positions.get('a1')).toBeGreaterThan(positions.get('a') ?? 0)
  })

  it('returns an empty graph for an unknown root', () => {
    expect(layoutConversationTree(TREE, 'missing')).toEqual({ nodes: [], edges: [] })
  })

  it('caps a large graph and drops edges that point outside the visible prefix', () => {
    const graph = layoutConversationTree(TREE, 'root')
    const { graph: limited, hiddenCount } = limitConversationGraph(graph, 2)

    expect(hiddenCount).toBe(2)
    expect(limited.nodes.map((node) => node.id)).toEqual(['root', 'a'])
    // root->b and a->a1 both leave the visible prefix.
    expect(limited.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(['root->a'])
  })

  it('leaves a graph at or below the budget untouched', () => {
    const graph = layoutConversationTree(TREE, 'root')
    expect(limitConversationGraph(graph, 4)).toEqual({ graph, hiddenCount: 0 })
  })
})
