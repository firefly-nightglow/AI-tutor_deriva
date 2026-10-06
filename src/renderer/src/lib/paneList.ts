/** Appends a pane if it is not already open; the input order is the visual order. */
export function openPane(open: readonly string[], id: string): string[] {
  return open.includes(id) ? [...open] : [...open, id]
}

export function closePane(open: readonly string[], id: string): string[] {
  return open.filter((item) => item !== id)
}

/** After closing a pane, focus its right neighbour, else its left, else nothing. */
export function focusAfterClose(open: readonly string[], closedId: string): string | null {
  const index = open.indexOf(closedId)
  const remaining = closePane(open, closedId)
  if (remaining.length === 0) return null
  if (index === -1) return remaining[remaining.length - 1] ?? null
  return remaining[Math.min(index, remaining.length - 1)] ?? null
}

export const MIN_PANE_WIDTH = 280

/**
 * Widths for the two panes adjacent to a divider after dragging it by `delta` pixels: the left pane
 * grows and the right one shrinks, each clamped so neither collapses below the readable minimum.
 */
export function resizePanes(
  leftWidth: number,
  rightWidth: number,
  delta: number,
  min: number = MIN_PANE_WIDTH
): { left: number; right: number } {
  // The pair keeps its combined width, so clamping one side hands the remainder to the other instead
  // of silently changing the total.
  const total = leftWidth + rightWidth
  let left = leftWidth + delta
  let right = rightWidth - delta
  if (left < min) {
    left = min
    right = total - left
  }
  if (right < min) {
    right = min
    left = total - right
  }
  return { left, right }
}

/**
 * The width to apply to one pane. A lone pane always fills the area, and a width chosen for a
 * different pane set must not leak into the current one.
 */
export function paneWidthFor(
  widths: Readonly<Record<string, number>>,
  paneId: string,
  openCount: number
): number | undefined {
  if (openCount < 2) return undefined
  return widths[paneId]
}
