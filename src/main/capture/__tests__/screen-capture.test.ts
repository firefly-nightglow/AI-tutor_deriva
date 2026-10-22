import { describe, expect, it, vi } from 'vitest'
import { createScreenCapture } from '../screen-capture'
import type {
  CaptureDisplay,
  CapturePlatform,
  CaptureRect,
  CaptureWindow,
  NativeImageLike,
  PlatformCapturerSource
} from '../types'
import { CaptureError } from '../types'

class FakeImage implements NativeImageLike {
  readonly cropCalls: CaptureRect[] = []
  readonly resizeCalls: Array<{ width?: number; height?: number; quality?: string }> = []

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly jpegSize = 128
  ) {}

  isEmpty(): boolean {
    return false
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  crop(rect: CaptureRect): NativeImageLike {
    this.cropCalls.push(rect)
    return new FakeImage(rect.width, rect.height, this.jpegSize)
  }

  resize(options: { width?: number; height?: number; quality?: string }): NativeImageLike {
    this.resizeCalls.push(options)
    return new FakeImage(options.width ?? this.width, options.height ?? this.height, this.jpegSize)
  }

  toJPEG(): Buffer {
    return Buffer.alloc(this.jpegSize)
  }

  toDataURL(): string {
    return 'data:image/png;base64,preview'
  }
}

function display(overrides: Partial<CaptureDisplay> = {}): CaptureDisplay {
  return {
    id: 1,
    size: { width: 2560, height: 1440 },
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    scaleFactor: 1.5,
    ...overrides
  }
}

function platform(
  sources: PlatformCapturerSource[],
  windows: CaptureWindow[] = []
): CapturePlatform & {
  getSources: ReturnType<typeof vi.fn>
} {
  return {
    getSources: vi.fn(async () => sources),
    getAllDisplays: () => [display()],
    getPrimaryDisplay: () => display(),
    getOwnWindows: () => windows,
    getOwnSourceIds: () => ['window:own']
  }
}

describe('screen capture pipeline', () => {
  it('lists screen and window sources with previews and applies privacy filters', async () => {
    const capture = createScreenCapture(
      platform([
        { id: 'screen:1', name: '主显示器', displayId: '1', thumbnail: new FakeImage(320, 180) },
        { id: 'window:7', name: '私人笔记', displayId: '', thumbnail: new FakeImage(320, 180) },
        { id: 'window:8', name: '线性代数.pdf', displayId: '', thumbnail: new FakeImage(320, 180) },
        { id: 'window:own', name: 'Deriva', displayId: '', thumbnail: new FakeImage(320, 180) }
      ])
    )

    const all = await capture.listSources()
    expect(all).toHaveLength(3)
    expect(all[0]).toMatchObject({
      id: 'screen:1',
      kind: 'screen',
      displayId: '1',
      previewDataUrl: 'data:image/png;base64,preview'
    })
    expect(
      await capture.listSources({
        types: ['window'],
        excludedWindowTitles: ['私人']
      })
    ).toEqual([expect.objectContaining({ id: 'window:8' })])
    expect(await capture.listSources({ excludedDisplayIds: ['1'] })).toHaveLength(2)
  })

  it('captures a source at its display physical resolution and hides Deriva windows', async () => {
    const source = { id: 'screen:1', name: '主显示器', displayId: '1', thumbnail: new FakeImage(3840, 2160) }
    const fakePlatform = platform([source])
    const events: string[] = []
    const window: CaptureWindow = {
      hide: () => events.push('hide'),
      show: () => events.push('show'),
      isDestroyed: () => false,
      isVisible: () => true
    }
    fakePlatform.getOwnWindows = () => [window]
    const sleep = vi.fn(async () => {
      events.push('sleep')
    })
    const capture = createScreenCapture(fakePlatform, { sleep })

    const result = await capture.captureSource('screen:1')

    expect(fakePlatform.getSources).toHaveBeenCalledTimes(2)
    expect(fakePlatform.getSources.mock.calls[1]?.[0].thumbnailSize).toEqual({
      width: 3840,
      height: 2160
    })
    expect(events).toEqual(['hide', 'sleep', 'show'])
    expect(result.thumbnail).toMatchObject({ mime: 'image/jpeg', width: 1280, height: 720 })
    expect(result.thumbnail.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(result.original).toBeUndefined()
  })

  it('encodes a kept original at full resolution and caps an oversized edge', async () => {
    const source = { id: 'screen:1', name: '主显示器', displayId: '1', thumbnail: new FakeImage(10000, 5000) }
    const capture = createScreenCapture(platform([source]), { sleep: async () => {} })

    const result = await capture.captureSource('screen:1', { keepOriginal: true })

    expect(result.thumbnail).toMatchObject({ width: 1280, height: 640 })
    expect(result.original).toMatchObject({ width: 8192, height: 4096 })
    expect(result.originalDowngraded).toBe(false)
  })

  it('drops an oversized original and returns the downgrade marker', async () => {
    const source = {
      id: 'screen:1',
      name: '主显示器',
      displayId: '1',
      thumbnail: new FakeImage(2560, 1440, 9 * 1024 * 1024)
    }
    const capture = createScreenCapture(platform([source]), { sleep: async () => {} })

    const result = await capture.captureSource('screen:1', { keepOriginal: true })

    expect(result.original).toBeUndefined()
    expect(result.originalDowngraded).toBe(true)
    expect(result.thumbnail.bytes).toBe(9 * 1024 * 1024)
  })

  it('crops a region in physical pixels and rejects tiny selections', async () => {
    const source = { id: 'screen:1', name: '主显示器', displayId: '1', thumbnail: new FakeImage(3840, 2160) }
    const capture = createScreenCapture(platform([source]), { sleep: async () => {} })

    const result = await capture.captureRegion('screen:1', { x: 40, y: 60, width: 400, height: 200 })
    expect(result.thumbnail).toMatchObject({ width: 400, height: 200 })

    await expect(
      capture.captureRegion('screen:1', { x: 0, y: 0, width: 4, height: 4 })
    ).rejects.toMatchObject({ kind: 'too_small' })
  })

  it('crops the same captured image through a region-selection session', async () => {
    const image = new FakeImage(3840, 2160)
    const source = { id: 'screen:1', name: '主显示器', displayId: '1', thumbnail: image }
    const fakePlatform = platform([source])
    const capture = createScreenCapture(fakePlatform, { sleep: async () => {} })

    const session = await capture.beginRegionCapture('screen:1')
    expect(session).toMatchObject({
      imageWidth: 3840,
      imageHeight: 2160,
      previewWidth: 1280,
      previewHeight: 720
    })
    expect(fakePlatform.getSources).toHaveBeenCalledTimes(2)

    const result = await capture.cropCapture(session.captureId, {
      x: 100,
      y: 200,
      width: 640,
      height: 360
    })

    expect(fakePlatform.getSources).toHaveBeenCalledTimes(2)
    expect(image.cropCalls).toEqual([{ x: 100, y: 200, width: 640, height: 360 }])
    expect(result.thumbnail).toMatchObject({ width: 640, height: 360 })

    capture.releaseCapture(session.captureId)
    await expect(
      capture.cropCapture(session.captureId, { x: 0, y: 0, width: 100, height: 100 })
    ).rejects.toMatchObject({ kind: 'session_expired' })
  })

  it('classifies missing and empty sources', async () => {
    const capture = createScreenCapture(platform([]))

    await expect(capture.captureSource('missing')).rejects.toEqual(
      expect.objectContaining<Partial<CaptureError>>({ kind: 'missing_source' })
    )

    const emptyImage: NativeImageLike = {
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      crop: () => emptyImage,
      resize: () => emptyImage,
      toJPEG: () => Buffer.alloc(0),
      toDataURL: () => ''
    }
    const emptyCapture = createScreenCapture(
      platform([
        { id: 'screen:1', name: '主显示器', displayId: '1', thumbnail: emptyImage }
      ]),
      { sleep: async () => {} }
    )
    await expect(emptyCapture.captureSource('screen:1')).rejects.toEqual(
      expect.objectContaining<Partial<CaptureError>>({ kind: 'empty_capture' })
    )
  })

  it('falls back to the source name when the second enumeration returns a new id', async () => {
    const first = { id: 'window:7', name: '线性代数.pdf', displayId: '', thumbnail: new FakeImage(320, 180) }
    const second = { id: 'window:99', name: '线性代数.pdf', displayId: '', thumbnail: new FakeImage(2560, 1440) }
    const fakePlatform = platform([first])
    fakePlatform.getSources = vi
      .fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second])

    const capture = createScreenCapture(fakePlatform, { sleep: async () => {} })
    const result = await capture.captureSource('window:7')

    expect(result.thumbnail).toMatchObject({ width: 1280, height: 720 })
  })
})
