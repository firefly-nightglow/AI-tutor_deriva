import { useMemo, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Conversation } from '../../../shared/types'
import {
  limitConversationGraph,
  layoutConversationTree,
  type ConversationGraphNode
} from '../lib/graphLayout'

function ConversationNode({ data }: NodeProps<ConversationGraphNode>): React.JSX.Element {
  return (
    <div className={`graph-node${data.isCurrent ? ' is-current' : ''}`}>
      {/* React Flow anchors every edge to a handle; a custom node without them renders no links. */}
      <Handle type="target" position={Position.Top} className="graph-node__handle" />
      <span className="graph-node__level">
        {data.level === 0 ? '主对话' : `子对话 L${data.level}`}
      </span>
      <span className="graph-node__label">{data.label}</span>
      <Handle type="source" position={Position.Bottom} className="graph-node__handle" />
    </div>
  )
}

const NODE_TYPES = { conversation: ConversationNode }

/** Obsidian-style tree of one 主对话; clicking a node opens it in the pane area (FR-7). */
export function ConversationGraph({
  conversations,
  rootId,
  currentId,
  onOpen
}: {
  conversations: Conversation[]
  rootId: string
  currentId: string | null
  onOpen(id: string): void
}): React.JSX.Element {
  const graph = useMemo(
    () => layoutConversationTree(conversations, rootId, currentId),
    [conversations, rootId, currentId]
  )
  const [showAll, setShowAll] = useState(false)
  const { graph: visibleGraph, hiddenCount } = useMemo(
    () => (showAll ? { graph, hiddenCount: 0 } : limitConversationGraph(graph)),
    [graph, showAll]
  )

  return (
    <div className="graph">
      {hiddenCount > 0 && (
        <div className="graph__notice">
          <span>树较大，已显示前 300 个节点，还有 {hiddenCount} 个未显示。</span>
          <button type="button" className="link" onClick={() => setShowAll(true)}>
            全部显示
          </button>
        </div>
      )}
      <ReactFlow
        nodes={visibleGraph.nodes}
        edges={visibleGraph.edges}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_event, node) => onOpen(node.id)}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
