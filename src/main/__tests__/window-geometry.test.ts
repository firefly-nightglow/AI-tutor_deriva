import { describe, expect, it } from 'vitest'
import {
  BUBBLE_SIZE,
  bubbleBounds,
  clampDrawerWidth,
  clampToWorkArea,
  drawerBounds,
  nearestDrawerEdge
} from '../window-geometry'

const AREA = { x: 0, y: 0, width: 1920, height: 1080 }

describe('window geometry', () => {
  it('clamps drawer width to the readable range and the work area', () => {
    expect(clampDrawerWidth(200, AREA)).toBe(360)
    expect(clampDrawerWidth(440, AREA)).toBe(440)
    expect(clampDrawerWidth(900, AREA)).toBe(720)
    expect(clampDrawerWidth(500, { ...AREA, width: 300 })).toBe(300)
  })

  it('places a full-height drawer against the requested edge', () => {
    expect(drawerBounds(AREA, 'right', 440)).toEqual({
      x: 1480,
      y: 0,
      width: 440,
      height: 1080
    })
    expect(drawerBounds(AREA, 'left', 440)).toEqual({
      x: 0,
      y: 0,
      width: 440,
      height: 1080
    })
  })

  it('chooses the edge by the half of the display the drawer overlaps', () => {
    expect(nearestDrawerEdge({ x: 10, y: 0, width: 440, height: 1080 }, AREA)).toBe('left')
    expect(nearestDrawerEdge({ x: 1400, y: 0, width: 440, height: 1080 }, AREA)).toBe('right')
  })

  it('keeps the bubble on the edge and inside the work area', () => {
    expect(bubbleBounds(AREA, 'right', 500)).toEqual({
      x: 1920 - BUBBLE_SIZE,
      y: 500,
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE
    })
    expect(bubbleBounds(AREA, 'left', -40).y).toBe(0)
    expect(bubbleBounds(AREA, 'left', 5000).y).toBe(1080 - BUBBLE_SIZE)
  })

  it('clamps an off-screen normal window back into the work area', () => {
    expect(clampToWorkArea({ x: 2000, y: 1200, width: 400, height: 600 }, AREA)).toEqual({
      x: 1520,
      y: 480,
      width: 400,
      height: 600
    })
  })
})
