import { describe, expect, it, vi } from 'vitest'
import { createCaptureRouter } from '../router'
import type { ScreenCapture } from '../screen-capture'
import type { NativeImageLike } from '../types'

function image(width = 900, height = 600): NativeImageLike {
  return {
    isEmpty: () => false, getSize: () => ({ width, height }),
    crop: (rect) => image(rect.width, rect.height),
    resize: (size) => image(size.width ?? width, size.height ?? height),
    toJPEG: () => Buffer.from('image'), toDataURL: () => 'data:image/png;base64,aW1hZ2U='
  }
}

describe('capture router', () => {
  it('keeps every internal operation off the desktop backend including source-only enumeration', async () => {
    const desktop = {
      listSources: vi.fn(async () => []), captureSource: vi.fn(), beginRegionCapture: vi.fn(),
      cropCapture: vi.fn(), releaseCapture: vi.fn(), captureRegion: vi.fn(), cropImage: vi.fn()
    } satisfies ScreenCapture
    const panel = { id: 'internal:material', label: 'Deriva 资料面板 — 公式',
      isDestroyed: () => false, capturePage: vi.fn(async () => image()) }
    const capture = createCaptureRouter(desktop, { list: () => [panel], get: (id) => id === panel.id ? panel : undefined })
    expect(await capture.listSources({ types: ['internal'] })).toEqual([expect.objectContaining({ name: panel.label, kind: 'internal' })])
    expect((await capture.captureSource(panel.id, { keepOriginal: true })).original).toMatchObject({ width: 900, height: 600 })
    const session = await capture.beginRegionCapture(panel.id)
    expect((await capture.cropCapture(session.captureId, { x: 5, y: 10, width: 200, height: 100 })).thumbnail)
      .toMatchObject({ width: 200, height: 100 })
    capture.releaseCapture(session.captureId)
    await expect(capture.cropCapture(session.captureId, { x: 0, y: 0, width: 20, height: 20 })).rejects.toMatchObject({ kind: 'session_expired' })
    for (const method of Object.values(desktop)) expect(method).not.toHaveBeenCalled()
  })

  it('preserves filters and dispatches external operations unchanged', async () => {
    const desktop = { listSources: vi.fn(async () => []), captureSource: vi.fn(), beginRegionCapture: vi.fn(),
      cropCapture: vi.fn(), releaseCapture: vi.fn(), captureRegion: vi.fn(), cropImage: vi.fn() } satisfies ScreenCapture
    const capture = createCaptureRouter(desktop, { list: () => [], get: () => undefined })
    const filter = { types: ['window' as const], excludedWindowTitles: ['private'] }
    await capture.listSources(filter)
    await capture.captureSource('window:1', { keepOriginal: true })
    await capture.beginRegionCapture('screen:1')
    expect(desktop.listSources).toHaveBeenCalledWith(filter)
    expect(desktop.captureSource).toHaveBeenCalledWith('window:1', { keepOriginal: true })
    expect(desktop.beginRegionCapture).toHaveBeenCalledWith('screen:1')
  })
})
