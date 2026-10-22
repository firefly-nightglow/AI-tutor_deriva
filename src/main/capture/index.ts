export {
  createScreenCapture,
  DEFAULT_CAPTURE_ATTACHMENT_MAX_BYTES,
  DEFAULT_CAPTURE_SESSION_TTL_MS,
  DEFAULT_MINIMUM_REGION_EDGE,
  DEFAULT_ORIGINAL_MAX_EDGE,
  DEFAULT_ORIGINAL_QUALITY,
  DEFAULT_REPAINT_WAIT_MS,
  DEFAULT_THUMBNAIL_MAX_EDGE,
  DEFAULT_THUMBNAIL_QUALITY
} from './screen-capture'
export type { ScreenCapture } from './screen-capture'
export { createInternalCapture, createWebContentsCaptureTarget } from './internal-capture'
export type { InternalCapture } from './internal-capture'
export type {
  CaptureDisplay,
  CaptureErrorKind,
  CaptureImage,
  CapturePlatform,
  CaptureRect,
  CaptureSource,
  CaptureSourceFilter,
  CaptureSourceKind,
  CaptureSourceOptions,
  CaptureSession,
  DesktopCaptureSourceKind,
  InternalCaptureRegistry,
  InternalCaptureTarget,
  CapturedSource,
  NativeImageLike,
  PlatformCapturerSource,
  ScreenCaptureOptions
} from './types'
export { CaptureError } from './types'
