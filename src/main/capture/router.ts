import { createInternalCapture } from './internal-capture'
import type { ScreenCapture } from './screen-capture'
import type { InternalCaptureRegistry } from './types'

/** Keeps Deriva-owned surfaces off the desktop-capture path, including region sessions. */
export function createCaptureRouter(desktop: ScreenCapture, registry: InternalCaptureRegistry): ScreenCapture {
  const internal = createInternalCapture(registry)
  const isInternal = (id: string): boolean => id.startsWith('internal:')
  return {
    ...desktop,
    async listSources(filter = {}) {
      const panels = filter.types && !filter.types.includes('internal') ? [] : internal.listSources()
      const external = filter.types?.every((kind) => kind === 'internal')
        ? [] : await desktop.listSources(filter)
      return [...panels, ...external]
    },
    captureSource: (id, options) => isInternal(id)
      ? internal.captureSource(id, options) : desktop.captureSource(id, options),
    captureRegion: (id, rect, options) => isInternal(id)
      ? internal.captureRegion(id, rect, options) : desktop.captureRegion(id, rect, options),
    beginRegionCapture: (id) => isInternal(id)
      ? internal.beginRegionCapture(id) : desktop.beginRegionCapture(id),
    cropCapture: (id, rect, options) => isInternal(id)
      ? internal.cropCapture(id, rect, options) : desktop.cropCapture(id, rect, options),
    releaseCapture: (id) => isInternal(id) ? internal.releaseCapture(id) : desktop.releaseCapture(id)
  }
}
