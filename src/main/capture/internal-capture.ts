import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ScreenCapture } from './screen-capture'
import { encodeCaptureImage } from './image-encoding'
import {
  DEFAULT_CAPTURE_ATTACHMENT_MAX_BYTES,
  DEFAULT_CAPTURE_SESSION_TTL_MS,
  DEFAULT_MINIMUM_REGION_EDGE,
  DEFAULT_ORIGINAL_MAX_EDGE,
  DEFAULT_ORIGINAL_QUALITY,
  DEFAULT_THUMBNAIL_MAX_EDGE,
  DEFAULT_THUMBNAIL_QUALITY
} from './screen-capture'
import {
  CaptureError,
  type CaptureRect,
  type CaptureSource,
  type CaptureSourceOptions,
  type CapturedSource,
  type InternalCaptureRegistry,
  type InternalCaptureTarget,
  type NativeImageLike,
  type ScreenCaptureOptions
} from './types'

export interface InternalCapture extends Pick<ScreenCapture, 'beginRegionCapture' | 'cropCapture' | 'releaseCapture'> {
  listSources(): CaptureSource[]
  captureSource(id: string, options?: CaptureSourceOptions): Promise<CapturedSource>
  captureRegion(id: string, rect: CaptureRect, options?: CaptureSourceOptions): Promise<CapturedSource>
}

function encodeResult(
  source: CaptureSource,
  image: NativeImageLike,
  keepOriginal: boolean,
  options: ScreenCaptureOptions
): CapturedSource {
  const thumbnail = encodeCaptureImage(
    image,
    'thumbnail',
    options.thumbnailMaxEdge ?? DEFAULT_THUMBNAIL_MAX_EDGE,
    options.thumbnailQuality ?? DEFAULT_THUMBNAIL_QUALITY
  )
  if (!keepOriginal) return { source, thumbnail, originalDowngraded: false }

  const original = encodeCaptureImage(
    image,
    'original',
    options.originalMaxEdge ?? DEFAULT_ORIGINAL_MAX_EDGE,
    options.originalQuality ?? DEFAULT_ORIGINAL_QUALITY
  )
  if (original.bytes > (options.captureAttachmentMaxBytes ?? DEFAULT_CAPTURE_ATTACHMENT_MAX_BYTES)) {
    return { source, thumbnail, originalDowngraded: true }
  }
  return { source, thumbnail, original, originalDowngraded: false }
}

/** Capture backend for Deriva-owned panel content; no desktop capture or window hiding is involved. */
export function createInternalCapture(
  registry: InternalCaptureRegistry,
  options: ScreenCaptureOptions = {}
): InternalCapture {
  const sessions = new Map<string, { image: NativeImageLike; source: CaptureSource; createdAt: number }>()
  function prune(): void {
    for (const [id, entry] of sessions) {
      if (Date.now() - entry.createdAt > DEFAULT_CAPTURE_SESSION_TTL_MS) sessions.delete(id)
    }
  }
  function targetFor(id: string): InternalCaptureTarget {
    const target = registry.get(id)
    if (target === undefined) throw new CaptureError('missing_source', '找不到资料面板来源')
    if (target.isDestroyed()) {
      throw new CaptureError('empty_capture', '资料面板已关闭，无法截图')
    }
    const reason = target.unavailableReason?.()
    if (reason) throw new CaptureError('empty_capture', reason)
    return target
  }

  function sourceFor(target: InternalCaptureTarget): CaptureSource {
    return {
      id: target.id,
      name: target.label,
      kind: 'internal',
      displayId: null,
      previewDataUrl: '',
      unavailableReason: target.unavailableReason?.()
    }
  }

  async function beginRegionCapture(id: string) {
    prune()
    const target = targetFor(id)
    const source = sourceFor(target)
    const image = await target.capturePage()
    const size = image.getSize()
    if (image.isEmpty() || size.width <= 0 || size.height <= 0) {
      throw new CaptureError('empty_capture', '资料面板截图为空，请稍后重试')
    }
    const preview = encodeResult(source, image, false, options).thumbnail
    const captureId = `internal:${randomUUID()}`
    sessions.set(captureId, { image, source, createdAt: Date.now() })
    return { captureId, source, imageWidth: size.width, imageHeight: size.height,
      previewDataUrl: preview.dataUrl, previewWidth: preview.width, previewHeight: preview.height }
  }

  async function cropCapture(id: string, rect: CaptureRect, captureOptions: CaptureSourceOptions = {}) {
    prune()
    const entry = sessions.get(id)
    if (!entry) throw new CaptureError('session_expired', '资料框选会话已结束，请重新截图')
    targetFor(entry.source.id)
    if (!Object.values(rect).every(Number.isFinite)) throw new CaptureError('too_small', '选区无效，请重新框选')
    const size = entry.image.getSize()
    const x = Math.max(0, Math.round(rect.x))
    const y = Math.max(0, Math.round(rect.y))
    const width = Math.min(size.width - x, Math.round(rect.width))
    const height = Math.min(size.height - y, Math.round(rect.height))
    const minimum = options.minimumRegionEdge ?? DEFAULT_MINIMUM_REGION_EDGE
    if (width < minimum || height < minimum) throw new CaptureError('too_small', '选区太小，请重新框选')
    return encodeResult(entry.source, entry.image.crop({ x, y, width, height }), captureOptions.keepOriginal === true, options)
  }

  return {
    listSources: () => registry.list().filter((target) => !target.isDestroyed()).map(sourceFor),
    async captureSource(id, captureOptions = {}) {
      const target = targetFor(id)
      const image = await target.capturePage()
      return encodeResult(sourceFor(target), image, captureOptions.keepOriginal === true, options)
    },
    async captureRegion(id, rect, captureOptions = {}) {
      const session = await beginRegionCapture(id)
      try { return await cropCapture(session.captureId, rect, captureOptions) }
      finally { sessions.delete(session.captureId) }
    },
    beginRegionCapture,
    cropCapture,
    releaseCapture(id) { sessions.delete(id) }
  }
}

export function createWebContentsCaptureTarget(
  id: string,
  label: string,
  webContents: WebContents
): InternalCaptureTarget {
  return {
    id,
    label,
    isDestroyed: () => webContents.isDestroyed(),
    async capturePage(rect) {
      const { nativeImage } = await import('electron')
      const image = await webContents.capturePage(undefined, { stayHidden: true })
      // Capture representations may carry a device scale; decode the highest-resolution PNG
      // as a 1x image so getSize/crop/encoding all operate on the same physical-pixel grid.
      const physical = nativeImage.createFromBuffer(image.toPNG({ scaleFactor: Math.max(1, ...image.getScaleFactors()) }))
      return rect ? physical.crop(rect) : physical
    }
  }
}
