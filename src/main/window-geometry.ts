import type { Rectangle } from 'electron'
import type { WindowEdge } from '../shared/types'

export const DEFAULT_DRAWER_WIDTH = 440
export const MIN_DRAWER_WIDTH = 360
export const MAX_DRAWER_WIDTH = 720
export const BUBBLE_SIZE = 64

export type DrawerEdge = Exclude<WindowEdge, null>

export function clampToWorkArea(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height
  }
}

/**
 * The drawer is width-constrained, not position-constrained: it always owns a full-height strip
 * against one edge. Area width wins on very small displays so the window never exceeds the work area.
 */
export function clampDrawerWidth(
  width: number,
  area: Rectangle,
  constrainedMax: number | null = null
): number {
  const max = Math.min(MAX_DRAWER_WIDTH, area.width, constrainedMax ?? MAX_DRAWER_WIDTH)
  const min = Math.min(MIN_DRAWER_WIDTH, max)
  return Math.round(Math.min(Math.max(width, min), max))
}

export function drawerBounds(
  area: Rectangle,
  edge: DrawerEdge,
  width: number,
  constrainedMax: number | null = null
): Rectangle {
  const clampedWidth = clampDrawerWidth(width, area, constrainedMax)
  return {
    x: edge === 'left' ? area.x : area.x + area.width - clampedWidth,
    y: area.y,
    width: clampedWidth,
    height: area.height
  }
}

/** The edge is chosen by which half of the display the dragged drawer overlaps most. */
export function nearestDrawerEdge(bounds: Rectangle, area: Rectangle): DrawerEdge {
  const center = bounds.x + bounds.width / 2
  return center < area.x + area.width / 2 ? 'left' : 'right'
}

export function bubbleBounds(
  area: Rectangle,
  edge: DrawerEdge,
  y: number,
  size: number = BUBBLE_SIZE
): Rectangle {
  const maxY = Math.max(area.y, area.y + area.height - size)
  return {
    x: edge === 'left' ? area.x : area.x + area.width - size,
    y: Math.min(Math.max(Math.round(y), area.y), maxY),
    width: size,
    height: size
  }
}
