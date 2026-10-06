import type { Conversation, Subject } from '../../../shared/types'

export interface SidebarItem {
  conversation: Conversation
  /** 0 for a 主对话, 1 for its 子对话, and so on. */
  depth: number
  hasChildren: boolean
}

export interface ConversationGroup {
  /** null is the 未分类 bucket: conversations that are not attached to any subject. */
  subject: Subject | null
  items: SidebarItem[]
}

/**
 * Builds the sidebar model: subjects in the order the repository returned them (by name), then 未分类,
 * and inside each group every 主对话 followed by its descendants in depth-first order.
 *
 * The incoming list is expected oldest-first (as `conversations.listAll` returns it), so siblings keep
 * their creation order. Indentation is capped by the sidebar's styling, not here.
 */
export function groupConversations(
  subjects: Subject[],
  all: Conversation[],
  collapsed: ReadonlySet<string> = new Set()
): ConversationGroup[] {
  const childrenByParent = new Map<string, Conversation[]>()
  for (const conversation of all) {
    const parentId = conversation.parentConversationId
    if (parentId === null) continue
    const siblings = childrenByParent.get(parentId)
    if (siblings === undefined) childrenByParent.set(parentId, [conversation])
    else siblings.push(conversation)
  }

  const roots = all.filter((conversation) => conversation.parentConversationId === null)

  function flatten(root: Conversation): SidebarItem[] {
    const items: SidebarItem[] = []
    const visit = (conversation: Conversation, depth: number): void => {
      const children = childrenByParent.get(conversation.id) ?? []
      items.push({ conversation, depth, hasChildren: children.length > 0 })
      // Skipping a collapsed subtree is what keeps the rendered node count proportional to what the
      // student can actually see (see GROUND-0005).
      if (collapsed.has(conversation.id)) return
      for (const child of children) visit(child, depth + 1)
    }
    visit(root, 0)
    return items
  }

  const groups: ConversationGroup[] = subjects.map((subject) => ({
    subject,
    items: roots.filter((root) => root.subjectId === subject.id).flatMap(flatten)
  }))
  groups.push({
    subject: null,
    items: roots.filter((root) => root.subjectId === null).flatMap(flatten)
  })
  return groups
}

/** Ids from the given node up to its root, so callers can reveal a node hidden by a collapsed parent. */
export function ancestorIds(all: Conversation[], id: string): string[] {
  const byId = new Map(all.map((conversation) => [conversation.id, conversation]))
  const chain: string[] = []
  let current = byId.get(id)?.parentConversationId ?? null
  while (current !== null) {
    chain.push(current)
    current = byId.get(current)?.parentConversationId ?? null
  }
  return chain
}

/** 0 for a 主对话, 1 for a 子对话, and so on — used for the pane's level badge. */
export function depthOf(all: Conversation[], id: string): number {
  return ancestorIds(all, id).length
}

/**
 * How many conversations hang below each node, counted in one pass. Used by the delete confirmation
 * so it can state exactly what a cascade would destroy (FR-11).
 */
export function descendantCounts(all: Conversation[]): Record<string, number> {
  const childrenByParent = new Map<string, string[]>()
  for (const conversation of all) {
    const parentId = conversation.parentConversationId
    if (parentId === null) continue
    const children = childrenByParent.get(parentId)
    if (children === undefined) childrenByParent.set(parentId, [conversation.id])
    else children.push(conversation.id)
  }

  const counts: Record<string, number> = {}
  const count = (id: string): number => {
    let total = 0
    for (const child of childrenByParent.get(id) ?? []) total += 1 + count(child)
    counts[id] = total
    return total
  }
  for (const conversation of all) count(conversation.id)
  return counts
}
