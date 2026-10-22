import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureSession } from '../types'
import type { ScreenCapture } from '../screen-capture'

const mocks = vi.hoisted(() => ({ windows: [] as any[], displays: vi.fn(), load: vi.fn() }))
vi.mock('electron', () => ({
  screen: { getAllDisplays: mocks.displays },
  BrowserWindow: class extends EventEmitter {
    options: unknown
    closed = false
    constructor(options: unknown) { super(); this.options = options; mocks.windows.push(this) }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    show() {}
    focus() {}
    loadFile = mocks.load
    loadURL = mocks.load
    isDestroyed() { return this.closed }
    close() { this.closed = true; this.emit('closed') }
  }
}))
import { createRegionSelector } from '../region-selector'

const session: CaptureSession = { captureId: 'internal:test',
  source: { id: 'internal:material', name: 'Material', kind: 'internal', displayId: null, previewDataUrl: '' },
  imageWidth: 750, imageHeight: 450, previewDataUrl: 'data:image/jpeg;base64,preview', previewWidth: 750, previewHeight: 450 }

function fixture() {
  const capture = { listSources: vi.fn(async () => [session.source]),
    beginRegionCapture: vi.fn(async () => session), releaseCapture: vi.fn(), cropCapture: vi.fn() } as unknown as ScreenCapture
  const bounds = { x: -1000, y: 180, width: 500, height: 300 }
  const target = { id: 'internal:material', label: 'Material', isDestroyed: () => false,
    getBounds: () => bounds, capturePage: vi.fn() }
  const selector = createRegionSelector(capture, { list: () => [target], get: () => target })
  return { capture, selector, bounds }
}

beforeEach(() => { mocks.windows.length = 0; mocks.displays.mockReset(); mocks.load.mockReset().mockResolvedValue(undefined) })

describe('internal region selection lifecycle', () => {
  it('positions one overlay on current panel bounds without desktop display enumeration', async () => {
    const { selector, capture, bounds } = fixture()
    const result = selector.start('internal:material')
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(1))
    expect(mocks.windows[0].options).toMatchObject(bounds)
    expect(selector.init('-1')).toMatchObject({ imageWidth: 750, imageHeight: 450 })
    expect(mocks.displays).not.toHaveBeenCalled()
    await selector.cancel()
    expect(await result).toBeNull()
    expect(capture.releaseCapture).toHaveBeenCalledWith(session.captureId)
    expect(mocks.windows[0].closed).toBe(true)
  })

  it('releases a snapshot that finishes after cancellation without opening an orphan overlay', async () => {
    const { selector, capture } = fixture()
    let finish!: (value: CaptureSession) => void
    vi.mocked(capture.beginRegionCapture).mockImplementation(() => new Promise((done) => { finish = done }))
    const result = selector.start('internal:material')
    await vi.waitFor(() => expect(capture.beginRegionCapture).toHaveBeenCalled())
    await selector.cancel()
    finish(session)
    expect(await result).toBeNull()
    expect(mocks.windows).toHaveLength(0)
    expect(capture.releaseCapture).toHaveBeenCalledWith(session.captureId)
  })

  it('rejects and releases the session if the selection renderer cannot load', async () => {
    const { selector, capture } = fixture()
    mocks.load.mockRejectedValue(new Error('Selection unavailable'))
    await expect(selector.start('internal:material')).rejects.toThrow('Selection unavailable')
    expect(capture.releaseCapture).toHaveBeenCalledWith(session.captureId)
    expect(mocks.windows[0].closed).toBe(true)
  })
})
