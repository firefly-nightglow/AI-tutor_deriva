import { describe, expect, it, vi } from 'vitest'
import { createInternalCapture } from '../internal-capture'
import type { CaptureRect, InternalCaptureRegistry, InternalCaptureTarget, NativeImageLike } from '../types'

class FakeImage implements NativeImageLike {
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly bytes = 128
  ) {}

  isEmpty(): boolean {
    return false
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height }
  }

  crop(rect: CaptureRect): NativeImageLike {
    return new FakeImage(rect.width, rect.height, this.bytes)
  }

  resize(options: { width?: number; height?: number }): NativeImageLike {
    return new FakeImage(options.width ?? this.width, options.height ?? this.height, this.bytes)
  }

  toJPEG(): Buffer {
    return Buffer.alloc(this.bytes)
  }

  toDataURL(): string {
    return 'data:image/png;base64,preview'
  }
}

function target(id: string, destroyed = false): InternalCaptureTarget & { capture: ReturnType<typeof vi.fn> } {
  const capture = vi.fn(async (rect?: CaptureRect) => new FakeImage(rect?.width ?? 2000, rect?.height ?? 1200))
  return {
    id,
    label: '当前资料面板',
    isDestroyed: () => destroyed,
    capturePage: capture,
    capture
  }
}

function registry(...targets: InternalCaptureTarget[]): InternalCaptureRegistry {
  return {
    list: () => targets,
    get: (id) => targets.find((item) => item.id === id)
  }
}

describe('internal capture backend', () => {
  it('lists live Deriva panel sources as internal capture sources', () => {
    const capture = createInternalCapture(registry(target('panel:1'), target('panel:2', true)))
    expect(capture.listSources()).toEqual([
      expect.objectContaining({ id: 'panel:1', kind: 'internal', name: '当前资料面板' })
    ])
  })

  it('captures the whole panel and optional original without desktop capture', async () => {
    const panel = target('panel:1')
    const capture = createInternalCapture(registry(panel))

    const result = await capture.captureSource('panel:1', { keepOriginal: true })

    expect(panel.capture).toHaveBeenCalledWith()
    expect(result.thumbnail).toMatchObject({ width: 1280, height: 768 })
    expect(result.original).toMatchObject({ width: 2000, height: 1200 })
  })

  it('crops a region from a full physical panel snapshot', async () => {
    const panel = target('panel:1')
    const capture = createInternalCapture(registry(panel))
    const rect = { x: 10, y: 20, width: 300, height: 150 }

    const result = await capture.captureRegion('panel:1', rect)

    expect(panel.capture).toHaveBeenCalledWith()
    expect(result.thumbnail).toMatchObject({ width: 300, height: 150 })
  })

  it('fails with a classified error when the panel is gone', async () => {
    const capture = createInternalCapture(registry(target('panel:1', true)))
    await expect(capture.captureSource('panel:1')).rejects.toMatchObject({ kind: 'empty_capture' })
  })

  it('crops the frozen physical image without recapturing a changing panel', async () => {
    const panel = target('panel:1')
    const capture = createInternalCapture(registry(panel))
    const session = await capture.beginRegionCapture('panel:1')
    expect(session).toMatchObject({ imageWidth: 2000, imageHeight: 1200 })
    const result = await capture.cropCapture(session.captureId, { x: 100, y: 150, width: 300, height: 200 })
    expect(result.thumbnail).toMatchObject({ width: 300, height: 200 })
    expect(panel.capture).toHaveBeenCalledTimes(1)
    capture.releaseCapture(session.captureId)
    await expect(capture.cropCapture(session.captureId, { x: 0, y: 0, width: 100, height: 100 }))
      .rejects.toMatchObject({ kind: 'session_expired' })
  })

  it('keeps unavailable panels listed but rejects capture and tiny or non-finite crop regions', async () => {
    let reason: string | undefined = '资料正在加载'
    const panel = { ...target('panel:1'), unavailableReason: () => reason }
    const capture = createInternalCapture(registry(panel))
    expect(capture.listSources()[0].unavailableReason).toBe(reason)
    await expect(capture.captureSource(panel.id)).rejects.toThrow(reason)
    reason = undefined
    const session = await capture.beginRegionCapture(panel.id)
    for (const rect of [{ x: 0, y: 0, width: 1, height: 100 }, { x: NaN, y: 0, width: 100, height: 100 }]) {
      await expect(capture.cropCapture(session.captureId, rect)).rejects.toMatchObject({ kind: 'too_small' })
    }
    reason = '资料已关闭'
    await expect(capture.cropCapture(session.captureId, { x: 0, y: 0, width: 100, height: 100 })).rejects.toThrow(reason)
    capture.releaseCapture(session.captureId)
  })

  it('expires frozen internal snapshots and downgrades oversized originals', async () => {
    const capture = createInternalCapture(registry(target('panel:1')), { captureAttachmentMaxBytes: 1 })
    const result = await capture.captureSource('panel:1', { keepOriginal: true })
    expect(result.originalDowngraded).toBe(true)
    expect(result.original).toBeUndefined()
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      const session = await capture.beginRegionCapture('panel:1')
      now.mockReturnValue(5 * 60 * 1000 + 1)
      await expect(capture.cropCapture(session.captureId, { x: 0, y: 0, width: 100, height: 100 }))
        .rejects.toMatchObject({ kind: 'session_expired' })
    } finally { now.mockRestore() }
  })
})
