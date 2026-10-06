import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { Conversation } from '../../../shared/types'

export const GRAPH_NODE_WIDTH = 200
export const GRAPH_NODE_HEIGHT = 64
/** Beyond this many nodes the graph renders a prefix and offers to show the rest (NFR-4). */
export const GRAPH_NODE_BUDGET = 300

export interface ConversationGraphNodeData extends Record<string, unknown> {
  label: string
  level: number
  isCurrent: boolean
}

export type ConversationGraphNode = Node<ConversationGraphNodeData, 'conversation'>

export interface ConversationGraph {
  /** Depth-first order, so truncating the array keeps the shallowest part of the tree. */
  nodes: ConversationGraphNode[]
  edges: Edge[]
}

/** The root's own subtree in depth-first order, each entry tagged with its depth. */
export function conversationSubtree(
  all: Conversation[],
  rootId: string
): Array<{ conversation: Conversation; depth: number }> {
  const root = all.find((item) => item.id === rootId)
  if (root === undefined) return []

  const childrenByParent = new Map<string, Conversation[]>()
  for (const conversation of all) {
    const parentId = conversation.parentConversationId
    if (parentId === null) continue
    const siblings = childrenByParent.get(parentId)
    if (siblings === undefined) childrenByParent.set(parentId, [conversation])
    else siblings.push(conversation)
  }

  const items: Array<{ conversation: Conversation; depth: number }> = []
  const visit = (conversation: Conversation, depth: number): void => {
    items.push({ conversation, depth })
    for (const child of childrenByParent.get(conversation.id) ?? []) visit(child, depth + 1)
  }
  visit(root, 0)
  return items
}

/**
 * Lays the subtree out with dagre (React Flow itself does not lay out — see GROUND-0008) and converts
 * dagre's centre coordinates into React Flow's top-left positions.
 */
export function layoutConversationTree(
  all: Conversation[],
  rootId: string,
  currentId: string | null = null
): ConversationGraph {
  const items = conversationSubtree(all, rootId)
  if (items.length === 0) return { nodes: [], edges: [] }

  const ids = new Set(items.map((item) => item.conversation.id))
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'TB', nodesep: 28, ranksep: 56 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const id of ids) graph.setNode(id, { width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT })

  const edges: Edge[] = []
  for (const { conversation } of items) {
    const parentId = conversation.parentConversationId
    if (parentId === null || !ids.has(parentId)) continue
    graph.setEdge(parentId, conversation.id)
    edges.push({ id: `${parentId}->${conversation.id}`, source: parentId, target: conversation.id })
  }

  dagre.layout(graph)

  const nodes: ConversationGraphNode[] = items.map(({ conversation, depth }) => {
    const placed = graph.node(conversation.id) as { x: number; y: number }
    return {
      id: conversation.id,
      type: 'conversation',
      // React Flow only draws an edge once it knows both node sizes. We already fixed the size for
      // dagre, so declaring it here too means edges exist on the first paint instead of waiting for a
      // ResizeObserver measurement (which is what left the graph looking like boxes with no links).
      width: GRAPH_NODE_WIDTH,
      height: GRAPH_NODE_HEIGHT,
      position: {
        x: placed.x - GRAPH_NODE_WIDTH / 2,
        y: placed.y - GRAPH_NODE_HEIGHT / 2
      },
      data: {
        label: conversation.title,
        level: depth,
        isCurrent: conversation.id === currentId
      }
    }
  })

  return { nodes, edges }
}

/**
 * Caps how much of a large tree is handed to React Flow. dagre still lays the whole subtree out (that
 * is the cheap part); what this saves is mounting thousands of nodes, edges and handles at once.
 */
export function limitConversationGraph(
  graph: ConversationGraph,
  budget: number = GRAPH_NODE_BUDGET
): { graph: ConversationGraph; hiddenCount: number } {
  if (graph.nodes.length <= budget) return { graph, hiddenCount: 0 }

  const nodes = graph.nodes.slice(0, budget)
  const visible = new Set(nodes.map((node) => node.id))
  return {
    graph: {
      nodes,
      edges: graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target))
    },
    hiddenCount: graph.nodes.length - nodes.length
  }
}
