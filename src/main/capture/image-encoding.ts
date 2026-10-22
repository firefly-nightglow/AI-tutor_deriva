import { CaptureError, type CaptureImage, type NativeImageLike } from './types'

function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

/** Shared by the desktop and internal capture backends so their image output stays identical. */
export function encodeCaptureImage(
  image: NativeImageLike,
  kind: CaptureImage['kind'],
  maxEdge: number,
  quality: number
): CaptureImage {
  if (image.isEmpty()) throw new CaptureError('empty_capture', '截图内容为空')
  const size = image.getSize()
  const target = scaledDimensions(size.width, size.height, maxEdge)
  const resized =
    target.width === size.width && target.height === size.height
      ? image
      : image.resize({ width: target.width, height: target.height, quality: 'best' })
  let buffer: Buffer
  try {
    buffer = resized.toJPEG(quality)
  } catch (cause) {
    throw new CaptureError('encode_failed', `截图编码失败：${String(cause)}`)
  }
  if (buffer.byteLength === 0) throw new CaptureError('encode_failed', '截图编码结果为空')
  return {
    kind,
    name: `capture-${kind}.jpg`,
    mime: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
    width: target.width,
    height: target.height,
    bytes: buffer.byteLength
  }
}
