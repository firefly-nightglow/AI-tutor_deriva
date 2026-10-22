const { test } = require('node:test')
const assert = require('node:assert/strict')
const { tileRect, outerRect, equalRect } = require('./geometry.cjs')

for (const scale of [1, 1.25, 1.5]) {
  for (const edge of ['left', 'right']) {
    test(`physical partition ${scale} ${edge} on negative-origin monitor`, () => {
      const area = { left: -2560, top: -400, right: 0, bottom: 1040 }
      const rect = tileRect(area, 440, scale, edge)
      const width = Math.round(440 * scale)
      assert.deepEqual(rect, {
        left: edge === 'left' ? area.left + width : area.left,
        right: edge === 'right' ? area.right - width : area.right,
        top: area.top, bottom: area.bottom
      })
    })
  }
}
test('visible target compensates invisible native borders on every edge', () => {
  assert.deepEqual(outerRect(
    { left: 0, top: 0, right: 1000, bottom: 800 },
    { left: 92, top: 100, right: 908, bottom: 708 },
    { left: 100, top: 100, right: 900, bottom: 700 }
  ), { left: -8, top: 0, right: 1008, bottom: 808 })
})
test('insufficient work area refuses rather than violating application minimum', () => {
  assert.throws(() => tileRect({ left: 0, top: 0, right: 800, bottom: 600 }, 440, 1, 'right'), /insufficient-space/)
})
test('invalid geometry is rejected before native calls', () => {
  for (const width of [NaN, Infinity, -1, 0]) {
    assert.throws(() => tileRect({ left: 0, top: 0, right: 2560, bottom: 1440 }, width, 1, 'right'), /invalid-geometry/)
  }
  assert.equal(equalRect({ left: 0, top: 0, right: 3, bottom: 4 }, { left: 0, top: 0, right: 6, bottom: 4 }), false)
})
