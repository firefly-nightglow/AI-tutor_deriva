import type { ExternalWindowRect } from '../../shared/types'

export function outerRectForVisibleTarget(
  window: ExternalWindowRect,
  visible: ExternalWindowRect,
  target: ExternalWindowRect
): ExternalWindowRect {
  return {
    left: target.left + window.left - visible.left,
    top: target.top + window.top - visible.top,
    right: target.right + window.right - visible.right,
    bottom: target.bottom + window.bottom - visible.bottom
  }
}

export function visibleBoundsMatch(
  actual: ExternalWindowRect,
  expected: ExternalWindowRect,
  tolerance = 2
): boolean {
  return (
    Math.abs(actual.left - expected.left) <= tolerance &&
    Math.abs(actual.top - expected.top) <= tolerance &&
    Math.abs(actual.right - expected.right) <= tolerance &&
    Math.abs(actual.bottom - expected.bottom) <= tolerance
  )
}
