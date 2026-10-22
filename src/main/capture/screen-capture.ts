import { randomUUID } from 'node:crypto'
import { MIN_REGION_EDGE } from '../../shared/capture'
import { encodeCaptureImage } from './image-encoding'
import {
  CaptureError,
  type CaptureDisplay,
  type DesktopCaptureSourceKind,
  type CapturePlatform,
  type CaptureRect,
  type CaptureSource,
  type CaptureSourceFilter,
  type CaptureSourceOptions,
  type CaptureSession,
  type CapturedSource,
  type NativeImageLike,
  type ScreenCaptureOptions
} from './types'

export const DEFAULT_THUMBNAIL_MAX_EDGE = 1280
export const DEFAULT_THUMBNAIL_QUALITY = 80
export const DEFAULT_ORIGINAL_MAX_EDGE = 8192
export const DEFAULT_ORIGINAL_QUALITY = 90
export const DEFAULT_CAPTURE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024
export const DEFAULT_MINIMUM_REGION_EDGE = MIN_REGION_EDGE
export const DEFAULT_REPAINT_WAIT_MS = 180
export const DEFAULT_CAPTURE_SESSION_TTL_MS = 5 * 60 * 1000

export interface ScreenCapture {
  listSources(filter?: CaptureSourceFilter): Promise<CaptureSource[]>
  captureSource(sourceId: string, options?: CaptureSourceOptions): Promise<CapturedSource>
  beginRegionCapture(sourceId: string): Promise<CaptureSession>
  cropCapture(
    captureId: string,
    rect: CaptureRect,
    options?: CaptureSourceOptions
  ): Promise<CapturedSource>
  releaseCapture(captureId: string): void
  captureRegion(
    sourceId: string,
    rect: CaptureRect,
    options?: CaptureSourceOptions
  ): Promise<CapturedSource>
  cropImage(image: NativeImageLike, rect: CaptureRect): NativeImageLike
}

interface CaptureSettings {
  sleep: (milliseconds: number) => Promise<void>
  thumbnailMaxEdge: number
  thumbnailQuality: number
  originalMaxEdge: number
  originalQuality: number
  captureAttachmentMaxBytes: number
  minimumRegionEdge: number
  captureSessionTtlMs: number
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function settingsWithDefaults(options: ScreenCaptureOptions): CaptureSettings {
  return {
    sleep: options.sleep ?? sleep,
    thumbnailMaxEdge: options.thumbnailMaxEdge ?? DEFAULT_THUMBNAIL_MAX_EDGE,
    thumbnailQuality: options.thumbnailQuality ?? DEFAULT_THUMBNAIL_QUALITY,
    originalMaxEdge: options.originalMaxEdge ?? DEFAULT_ORIGINAL_MAX_EDGE,
    originalQuality: options.originalQuality ?? DEFAULT_ORIGINAL_QUALITY,
    captureAttachmentMaxBytes:
      options.captureAttachmentMaxBytes ?? DEFAULT_CAPTURE_ATTACHMENT_MAX_BYTES,
    minimumRegionEdge: options.minimumRegionEdge ?? DEFAULT_MINIMUM_REGION_EDGE,
    captureSessionTtlMs: DEFAULT_CAPTURE_SESSION_TTL_MS
  }
}

function physicalSize(display: CaptureDisplay): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
    height: Math.max(1, Math.round(display.size.height * display.scaleFactor))
  }
}

function sourceKind(id: string): CaptureSource['kind'] {
  return id.startsWith('screen:') ? 'screen' : 'window'
}

function displayIdOf(raw: string): string | null {
  return raw === '' ? null : raw
}

function matchesFilter(source: CaptureSource, filter: CaptureSourceFilter): boolean {
  if (filter.types !== undefined && !filter.types.includes(source.kind)) return false
  if (
    filter.excludedDisplayIds !== undefined &&
    source.displayId !== null &&
    filter.excludedDisplayIds.includes(source.displayId)
  ) {
    return false
  }
  if (filter.excludedWindowTitles !== undefined && source.kind === 'window') {
    const title = source.name.toLocaleLowerCase()
    if (filter.excludedWindowTitles.some((item) => title.includes(item.toLocaleLowerCase()))) {
      return false
    }
  }
  return true
}

export function createScreenCapture(
  platform: CapturePlatform,
  options: ScreenCaptureOptions = {}
): ScreenCapture {
  const settings = settingsWithDefaults(options)
  const sessions = new Map<
    string,
    { image: NativeImageLike; source: CaptureSource; createdAt: number }
  >()

  function pruneExpiredSessions(): void {
    const now = Date.now()
    for (const [captureId, session] of sessions) {
      if (now - session.createdAt > settings.captureSessionTtlMs) sessions.delete(captureId)
    }
  }

  function sessionFor(captureId: string): { image: NativeImageLike; source: CaptureSource } {
    pruneExpiredSessions()
    const session = sessions.get(captureId)
    if (session === undefined) {
      throw new CaptureError('session_expired', '截图选择会话已过期，请重新截图')
    }
    return session
  }

  async function rawSources(
    types: DesktopCaptureSourceKind[],
    thumbnailSize: { width: number; height: number }
  ) {
    return platform.getSources({ types, thumbnailSize, fetchWindowIcons: false })
  }

  async function sourceList(filter: CaptureSourceFilter = {}): Promise<CaptureSource[]> {
    const types = (filter.types ?? ['screen', 'window']).filter(
      (kind): kind is DesktopCaptureSourceKind => kind !== 'internal'
    )
    if (types.length === 0) return []
    const raw = await rawSources(types, { width: 320, height: 180 })
    const ownSourceIds = new Set(platform.getOwnSourceIds())
    return raw
      .filter((source) => !ownSourceIds.has(source.id))
      .map((source) => ({
        id: source.id,
        name: source.name,
        kind: sourceKind(source.id),
        displayId: displayIdOf(source.displayId),
        previewDataUrl: source.thumbnail.toDataURL()
      }))
      .filter((source) => matchesFilter(source, filter))
  }

  function resolveDisplay(source: CaptureSource): CaptureDisplay {
    if (source.displayId !== null) {
      const numericId = Number(source.displayId)
      const display = platform.getAllDisplays().find((item) => item.id === numericId)
      if (display !== undefined) return display
    }
    if (source.kind === 'window') {
      const displays = platform.getAllDisplays()
      const largest = displays.reduce<CaptureDisplay | undefined>((best, current) => {
        if (best === undefined) return current
        const bestArea = best.size.width * best.size.height * best.scaleFactor ** 2
        const currentArea = current.size.width * current.size.height * current.scaleFactor ** 2
        return currentArea > bestArea ? current : best
      }, undefined)
      if (largest !== undefined) return largest
    }
    return platform.getPrimaryDisplay()
  }

  async function withOwnWindowsHidden<T>(task: () => Promise<T>): Promise<T> {
    const hidden = platform
      .getOwnWindows()
      .filter((window) => !window.isDestroyed() && window.isVisible())
    for (const window of hidden) window.hide()
    if (hidden.length > 0) await settings.sleep(DEFAULT_REPAINT_WAIT_MS)
    try {
      return await task()
    } finally {
      for (const window of hidden) {
        if (!window.isDestroyed()) window.show()
      }
    }
  }

  async function captureNative(source: CaptureSource): Promise<NativeImageLike> {
    const display = resolveDisplay(source)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const raw = await withOwnWindowsHidden(() =>
        rawSources(['screen', 'window'], physicalSize(display))
      )
      const match =
        raw.find((item) => item.id === source.id) ?? raw.find((item) => item.name === source.name)
      if (match !== undefined && !match.thumbnail.isEmpty()) return match.thumbnail
      if (attempt < 2) await settings.sleep(120)
    }
    throw new CaptureError(
      'empty_capture',
      `屏幕来源没有可用内容：${source.name}。目标窗口可能已最小化或关闭，请恢复后重试。`
    )
  }

  function encodeResult(source: CaptureSource, image: NativeImageLike, keepOriginal: boolean): CapturedSource {
    const thumbnail = encodeCaptureImage(
      image,
      'thumbnail',
      settings.thumbnailMaxEdge,
      settings.thumbnailQuality
    )
    if (!keepOriginal) return { source, thumbnail, originalDowngraded: false }

    const original = encodeCaptureImage(
      image,
      'original',
      settings.originalMaxEdge,
      settings.originalQuality
    )
    if (original.bytes > settings.captureAttachmentMaxBytes) {
      return { source, thumbnail, originalDowngraded: true }
    }
    return { source, thumbnail, original, originalDowngraded: false }
  }

  function cropImage(image: NativeImageLike, rect: CaptureRect): NativeImageLike {
    if (image.isEmpty()) throw new CaptureError('empty_capture', '截图内容为空')
    const size = image.getSize()
    const x = Math.max(0, Math.round(rect.x))
    const y = Math.max(0, Math.round(rect.y))
    const width = Math.min(size.width - x, Math.round(rect.width))
    const height = Math.min(size.height - y, Math.round(rect.height))
    if (width < settings.minimumRegionEdge || height < settings.minimumRegionEdge) {
      throw new CaptureError('too_small', '选择的屏幕区域太小，请重新框选')
    }
    return image.crop({ x, y, width, height })
  }

  async function beginRegionCapture(sourceId: string): Promise<CaptureSession> {
    pruneExpiredSessions()
    const source = (await sourceList()).find((item) => item.id === sourceId)
    if (source === undefined) throw new CaptureError('missing_source', `找不到屏幕来源：${sourceId}`)
    const image = await captureNative(source)
    const size = image.getSize()
    if (size.width <= 0 || size.height <= 0) {
      throw new CaptureError('empty_capture', `屏幕来源没有可用内容：${sourceId}`)
    }
    const preview = encodeCaptureImage(
      image,
      'thumbnail',
      settings.thumbnailMaxEdge,
      settings.thumbnailQuality
    )
    const captureId = randomUUID()
    sessions.set(captureId, { image, source, createdAt: Date.now() })
    return {
      captureId,
      source,
      imageWidth: size.width,
      imageHeight: size.height,
      previewDataUrl: preview.dataUrl,
      previewWidth: preview.width,
      previewHeight: preview.height
    }
  }

  async function cropCapture(
    captureId: string,
    rect: CaptureRect,
    captureOptions: CaptureSourceOptions = {}
  ): Promise<CapturedSource> {
    const session = sessionFor(captureId)
    return encodeResult(
      session.source,
      cropImage(session.image, rect),
      captureOptions.keepOriginal === true
    )
  }

  function releaseCapture(captureId: string): void {
    sessions.delete(captureId)
  }

  return {
    listSources: sourceList,
    async captureSource(sourceId, captureOptions = {}) {
      const source = (await sourceList()).find((item) => item.id === sourceId)
      if (source === undefined) throw new CaptureError('missing_source', `找不到屏幕来源：${sourceId}`)
      const image = await captureNative(source)
      return encodeResult(source, image, captureOptions.keepOriginal === true)
    },
    beginRegionCapture,
    cropCapture,
    releaseCapture,
    async captureRegion(sourceId, rect, captureOptions = {}) {
      const session = await beginRegionCapture(sourceId)
      try {
        return await cropCapture(session.captureId, rect, captureOptions)
      } finally {
        releaseCapture(session.captureId)
      }
    },
    cropImage
  }
}
