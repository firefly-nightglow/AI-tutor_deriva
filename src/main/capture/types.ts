export type CaptureSourceKind = 'screen' | 'window' | 'internal'
export type DesktopCaptureSourceKind = 'screen' | 'window'

export interface CaptureDisplay {
  id: number
  size: { width: number; height: number }
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

export interface CaptureSource {
  id: string
  name: string
  kind: CaptureSourceKind
  displayId: string | null
  previewDataUrl: string
  unavailableReason?: string
}

export interface CaptureSourceFilter {
  types?: CaptureSourceKind[]
  excludedDisplayIds?: string[]
  excludedWindowTitles?: string[]
}

export interface CaptureImage {
  kind: 'thumbnail' | 'original'
  name: string
  mime: 'image/jpeg'
  dataUrl: string
  width: number
  height: number
  bytes: number
}

export interface CapturedSource {
  source: CaptureSource
  thumbnail: CaptureImage
  original?: CaptureImage
  /** True when keepOriginal was requested but the encoded JPEG exceeded the capture attachment limit. */
  originalDowngraded: boolean
}

/**
 * A full screen capture held in the main process while the overlay renderer lets the user choose a
 * region. The image is deliberately not sent back through IPC; only this view + session id are.
 */
export interface CaptureSession {
  captureId: string
  source: CaptureSource
  imageWidth: number
  imageHeight: number
  previewDataUrl: string
  previewWidth: number
  previewHeight: number
}

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface NativeImageLike {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
  crop(rect: CaptureRect): NativeImageLike
  resize(options: {
    width?: number
    height?: number
    quality?: 'good' | 'better' | 'best'
  }): NativeImageLike
  toJPEG(quality: number): Buffer
  toDataURL(): string
}

export interface PlatformCapturerSource {
  id: string
  name: string
  displayId: string
  thumbnail: NativeImageLike
  appIcon?: NativeImageLike | null
}

export interface CaptureWindow {
  hide(): void
  show(): void
  isDestroyed(): boolean
  isVisible(): boolean
}

export interface CapturePlatform {
  getSources(options: {
    types: DesktopCaptureSourceKind[]
    thumbnailSize: { width: number; height: number }
    fetchWindowIcons?: boolean
  }): Promise<PlatformCapturerSource[]>
  getAllDisplays(): CaptureDisplay[]
  getPrimaryDisplay(): CaptureDisplay
  getOwnWindows(): CaptureWindow[]
  /** Media source ids belonging to Deriva itself; these must never appear as capture targets. */
  getOwnSourceIds(): string[]
}

/** A Deriva-owned surface (material panel, document view) captured through its WebContents. */
export interface InternalCaptureTarget {
  id: string
  label: string
  isDestroyed(): boolean
  unavailableReason?(): string | undefined
  /** Current screen coordinates in DIP, not cached layout coordinates. */
  getBounds?(): CaptureRect | null
  capturePage(rect?: CaptureRect): Promise<NativeImageLike>
}

export interface InternalCaptureRegistry {
  list(): InternalCaptureTarget[]
  get(id: string): InternalCaptureTarget | undefined
}

export interface ScreenCaptureOptions {
  sleep?: (milliseconds: number) => Promise<void>
  thumbnailMaxEdge?: number
  thumbnailQuality?: number
  originalMaxEdge?: number
  originalQuality?: number
  captureAttachmentMaxBytes?: number
  minimumRegionEdge?: number
}

export interface CaptureSourceOptions {
  keepOriginal?: boolean
}

export type CaptureErrorKind =
  | 'missing_source'
  | 'session_expired'
  | 'empty_capture'
  | 'too_small'
  | 'encode_failed'
  | 'unsupported'

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind

  constructor(kind: CaptureErrorKind, message: string) {
    super(message)
    this.name = 'CaptureError'
    this.kind = kind
  }
}
