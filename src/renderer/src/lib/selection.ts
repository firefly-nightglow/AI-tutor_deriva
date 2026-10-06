export interface SourceRange {
  start: number
  end: number
}

/** Normalised text of the current selection; empty when nothing meaningful is selected. */
export function selectionText(selection: Selection | null): string {
  return selection?.toString().replace(/\s+/g, ' ').trim() ?? ''
}

/** Viewport rect of the selection, used to place the floating ask button. */
export function selectionRect(selection: Selection | null): DOMRect | null {
  if (!selection || selection.rangeCount === 0) return null
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  return rect.width === 0 && rect.height === 0 ? null : rect
}

/**
 * Maps a selection inside a rendered answer back to offsets in the original Markdown.
 *
 * Walks up from each endpoint to the nearest element carrying `data-source-*` (emitted by
 * `remarkSourceOffsets`). Text inside KaTeX output has no such ancestor of its own, so it resolves to
 * the enclosing block — which is exactly what keeps a quoted formula complete.
 */
export function sourceRangeFromSelection(
  selection: Selection | null,
  container: HTMLElement
): SourceRange | null {
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null

  const start = nearestOffset(range.startContainer, container, 'sourceStart')
  const end = nearestOffset(range.endContainer, container, 'sourceEnd')
  if (start === null || end === null) return null
  return start <= end ? { start, end } : { start: end, end: start }
}

export function sliceSource(source: string, range: SourceRange): string {
  return source.slice(range.start, range.end).trim()
}

function nearestOffset(
  node: Node | null,
  container: HTMLElement,
  attribute: 'sourceStart' | 'sourceEnd'
): number | null {
  let current: Node | null = node
  while (current !== null && current !== container) {
    if (current instanceof HTMLElement) {
      const raw = current.dataset[attribute]
      if (raw !== undefined) {
        const value = Number(raw)
        if (Number.isFinite(value)) return value
      }
    }
    current = current.parentNode
  }
  return null
}
