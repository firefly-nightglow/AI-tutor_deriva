import { describe, expect, it } from 'vitest'
import { closePane, focusAfterClose, openPane, paneWidthFor, resizePanes } from '../paneList'

describe('pane list', () => {
  it('appends a pane once and keeps the open order', () => {
    expect(openPane([], 'a')).toEqual(['a'])
    expect(openPane(['a'], 'b')).toEqual(['a', 'b'])
    expect(openPane(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('removes a pane without touching the rest', () => {
    expect(closePane(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
    expect(closePane(['a'], 'missing')).toEqual(['a'])
  })

  it('focuses the right neighbour, then the left one, and nothing when empty', () => {
    expect(focusAfterClose(['a', 'b', 'c'], 'b')).toBe('c')
    expect(focusAfterClose(['a', 'b'], 'b')).toBe('a')
    expect(focusAfterClose(['a'], 'a')).toBeNull()
    expect(focusAfterClose(['a', 'b'], 'missing')).toBe('b')
  })

  it('resizes neighbouring panes and clamps at the readable minimum', () => {
    expect(resizePanes(400, 400, 60)).toEqual({ left: 460, right: 340 })
    expect(resizePanes(400, 400, -60)).toEqual({ left: 340, right: 460 })
    // Dragging past the minimum stops at 280 instead of collapsing a pane.
    expect(resizePanes(300, 300, -200)).toEqual({ left: 280, right: 320 })
    // Clamping the shrink side hands the remainder back: the pair still totals 600.
    expect(resizePanes(300, 300, 200)).toEqual({ left: 320, right: 280 })
  })

  it('ignores a stored width for a lone pane and for unknown panes', () => {
    const widths = { a: 700, b: 400 }

    expect(paneWidthFor(widths, 'a', 1)).toBeUndefined()
    expect(paneWidthFor(widths, 'a', 2)).toBe(700)
    expect(paneWidthFor(widths, 'c', 2)).toBeUndefined()
  })

  it('redistributes between neighbours even when both start at the three-column basis', () => {
    // Regression: with the basis as the floor, a three-pane drag clamped back to the original widths.
    expect(resizePanes(512, 512, 100, 280)).toEqual({ left: 612, right: 412 })
    expect(resizePanes(512, 512, -100, 280)).toEqual({ left: 412, right: 612 })
  })
})
