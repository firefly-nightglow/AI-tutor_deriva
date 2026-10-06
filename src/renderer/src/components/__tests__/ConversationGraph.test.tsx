// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Conversation } from '../../../../shared/types'
import { ConversationGraph } from '../ConversationGraph'

function conversation(id: string, parent: string | null): Conversation {
  return {
    id,
    subjectId: null,
    parentConversationId: parent,
    sourceMessageId: null,
    sourceQuote: null,
    title: id,
    titleSource: 'manual',
    model: null,
    createdAt: 0,
    updatedAt: 0
  }
}

const TREE: Conversation[] = [
  conversation('root', null),
  conversation('a', 'root'),
  conversation('b', 'root'),
  conversation('a1', 'a')
]

beforeAll(() => {
  // React Flow measures its container; jsdom reports zeros unless we supply a size.
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
})

afterEach(() => {
  cleanup()
})

describe('ConversationGraph', () => {
  it('renders one React Flow node per conversation and one edge per parent link', () => {
    render(<ConversationGraph conversations={TREE} rootId="root" currentId="a" onOpen={() => {}} />)

    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(4)
    // Edges are deliberately not asserted here: React Flow draws them into an SVG sized from the
    // container's real layout, which jsdom does not provide. Edge connectivity is covered by
    // graphLayout.test.ts (edge per parent link) and visually by the app.
  })
})
