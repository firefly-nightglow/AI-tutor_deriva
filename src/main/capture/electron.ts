import { BrowserWindow, desktopCapturer, screen } from 'electron'
import type { CaptureDisplay, CapturePlatform, PlatformCapturerSource } from './types'

function toDisplay(display: ReturnType<typeof screen.getAllDisplays>[number]): CaptureDisplay {
  return {
    id: display.id,
    size: { width: display.size.width, height: display.size.height },
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height
    },
    scaleFactor: display.scaleFactor
  }
}

/** Production adapter; the capture core is platform-injected so unit tests never load Electron. */
export function createElectronCapturePlatform(): CapturePlatform {
  return {
    async getSources(options): Promise<PlatformCapturerSource[]> {
      const sources = await desktopCapturer.getSources(options)
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id,
        thumbnail: source.thumbnail,
        appIcon: source.appIcon
      }))
    },
    getAllDisplays: () => screen.getAllDisplays().map(toDisplay),
    getPrimaryDisplay: () => toDisplay(screen.getPrimaryDisplay()),
    getOwnWindows: () => BrowserWindow.getAllWindows(),
    getOwnSourceIds: () => BrowserWindow.getAllWindows().map((window) => window.getMediaSourceId())
  }
}
