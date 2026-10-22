import { describe, expect, it } from 'vitest'
import { isMeaningfulSelection, normalizeSelection, toPhysicalRect } from '../regionGeometry'

describe('region geometry', () => {
  it('normalizes a drag in any direction', () => {
    expect(normalizeSelection({ x: 40, y: 30 }, { x: 10, y: 80 })).toEqual({
      x: 10,
      y: 30,
      width: 30,
      height: 50
    })
  })

  it('maps overlay CSS pixels to physical source pixels', () => {
    expect(
      toPhysicalRect(
        { x: 100, y: 50, width: 200, height: 100 },
        { width: 1280, height: 720 },
        { width: 3840, height: 2160 }
      )
    ).toEqual({ x: 300, y: 150, width: 600, height: 300 })
  })

  it('rejects a selection below the minimum physical edge', () => {
    expect(isMeaningfulSelection({ x: 0, y: 0, width: 23, height: 100 })).toBe(false)
    expect(isMeaningfulSelection({ x: 0, y: 0, width: 24, height: 24 })).toBe(true)
  })
})
