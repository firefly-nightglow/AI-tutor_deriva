import { describe, expect, it } from 'vitest'
import { outerRectForVisibleTarget, visibleBoundsMatch } from '../win32-geometry'

describe('Win32 visible-window geometry', () => {
  it('compensates invisible native borders before requesting a visible rectangle', () => {
    expect(
      outerRectForVisibleTarget(
        { left: 100, top: 100, right: 1100, bottom: 900 },
        { left: 92, top: 100, right: 1108, bottom: 908 },
        { left: 0, top: 0, right: 1000, bottom: 800 }
      )
    ).toEqual({ left: 8, top: 0, right: 992, bottom: 792 })
  })

  it('accepts only a two-pixel readback difference', () => {
    const expected = { left: 0, top: 0, right: 1160, bottom: 1000 }
    expect(
      visibleBoundsMatch({ left: 2, top: 1, right: 1158, bottom: 998 }, expected)
    ).toBe(true)
    expect(
      visibleBoundsMatch({ left: 4, top: 0, right: 1160, bottom: 1000 }, expected)
    ).toBe(false)
  })
})
