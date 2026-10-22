import type { ScreenCaptureRect } from '../../../shared/types'
import { MIN_REGION_EDGE } from '../../../shared/capture'

export interface Point {
  x: number
  y: number
}

export function normalizeSelection(start: Point, current: Point): ScreenCaptureRect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y)
  }
}

/** Maps an overlay-window selection to the physical pixels of the captured source image. */
export function toPhysicalRect(
  selection: ScreenCaptureRect,
  viewport: { width: number; height: number },
  image: { width: number; height: number }
): ScreenCaptureRect {
  const scaleX = image.width / Math.max(1, viewport.width)
  const scaleY = image.height / Math.max(1, viewport.height)
  return {
    x: Math.round(selection.x * scaleX),
    y: Math.round(selection.y * scaleY),
    width: Math.round(selection.width * scaleX),
    height: Math.round(selection.height * scaleY)
  }
}

export function isMeaningfulSelection(
  rect: ScreenCaptureRect,
  minimumEdge = MIN_REGION_EDGE
): boolean {
  return rect.width >= minimumEdge && rect.height >= minimumEdge
}
