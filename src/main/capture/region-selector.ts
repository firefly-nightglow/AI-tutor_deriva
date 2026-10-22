import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { RegionOverlayInit } from '../../shared/types'
import type { ScreenCapture } from './screen-capture'
import { CaptureError, type CaptureDisplay, type CaptureRect, type CaptureSession, type CapturedSource, type InternalCaptureRegistry } from './types'

interface OverlayEntry {
  display: CaptureDisplay
  session: CaptureSession
  window: BrowserWindow
}

interface ActiveSelection {
  entries: Map<number, OverlayEntry>
  resolve(result: CapturedSource | null): void
  reject(error: unknown): void
  done: boolean
}

export interface RegionSelector {
  start(sourceId: string): Promise<CapturedSource | null>
  init(displayId: string): RegionOverlayInit | null
  select(captureId: string, rect: CaptureRect): Promise<void>
  cancel(): Promise<void>
}

function overlayWindow(display: CaptureDisplay): BrowserWindow {
  const window = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  return window
}

/** Places a frozen-source selection surface over the selected display or internal viewport. */
export function createRegionSelector(capture: ScreenCapture, internal?: InternalCaptureRegistry): RegionSelector {
  let active: ActiveSelection | null = null
  let generation = 0

  function finish(result: CapturedSource | null, error?: unknown): void {
    const state = active
    if (state === null || state.done) return
    state.done = true
    active = null
    for (const entry of state.entries.values()) {
      capture.releaseCapture(entry.session.captureId)
      if (!entry.window.isDestroyed()) entry.window.close()
    }
    if (error !== undefined) state.reject(error)
    else state.resolve(result)
  }

  async function start(sourceId: string): Promise<CapturedSource | null> {
    const request = ++generation
    if (active !== null) finish(null)

    const sources = await capture.listSources({ types: sourceId.startsWith('internal:') ? ['internal'] : ['window', 'screen'] })
    if (request !== generation) return null
    const source = sources.find((item) => item.id === sourceId)
    if (source === undefined) {
      throw new CaptureError('missing_source', '找不到要框选的屏幕来源')
    }
    if (source.unavailableReason) throw new CaptureError('empty_capture', source.unavailableReason)
    if (source.kind !== 'internal' && (source.kind !== 'screen' || source.displayId === null)) {
      throw new CaptureError('unsupported', 'v2 仅支持对显示器来源进行局部框选')
    }
    const session = await capture.beginRegionCapture(source.id)
    if (request !== generation) {
      capture.releaseCapture(session.captureId)
      return null
    }
    const panelBounds = source.kind === 'internal' ? internal?.get(source.id)?.getBounds?.() : null
    const display = source.kind === 'internal'
      ? panelBounds && {
          id: -1,
          size: { width: panelBounds.width, height: panelBounds.height },
          bounds: panelBounds,
          scaleFactor: 1
        }
      : screen.getAllDisplays().find((item) => String(item.id) === source.displayId)
    if (display == null) {
      capture.releaseCapture(session.captureId)
      throw new CaptureError('unsupported', '来源已关闭或不可见，无法继续框选')
    }

    const captureDisplay: CaptureDisplay = {
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

    return new Promise<CapturedSource | null>((resolve, reject) => {
      const state: ActiveSelection = { entries: new Map(), resolve, reject, done: false }
      active = state
      try {
        const window = overlayWindow(captureDisplay)
        state.entries.set(captureDisplay.id, {
          display: captureDisplay,
          session,
          window
        })
        window.on('closed', () => { if (active === state) finish(null) })
        const onLoadFailed = (error: unknown): void => { if (active === state) finish(null, error) }
        const rendererUrl = process.env['ELECTRON_RENDERER_URL']
        if (rendererUrl !== undefined && rendererUrl !== '') {
          void window.loadURL(
            `${rendererUrl}?mode=region&displayId=${encodeURIComponent(String(captureDisplay.id))}`
          ).catch(onLoadFailed)
        } else {
          void window.loadFile(join(__dirname, '../renderer/index.html'), {
            query: { mode: 'region', displayId: String(captureDisplay.id) }
          }).catch(onLoadFailed)
        }
        window.show()
        window.focus()
      } catch (error) {
        if (active === state) finish(null, error)
      }
    })
  }

  return {
    start,
    init(displayId) {
      const entry = active?.entries.get(Number(displayId))
      if (entry === undefined) return null
      return {
        captureId: entry.session.captureId,
        previewDataUrl: entry.session.previewDataUrl,
        imageWidth: entry.session.imageWidth,
        imageHeight: entry.session.imageHeight
      }
    },
    async select(captureId, rect) {
      const state = active
      if (state === null || state.done) throw new Error('区域选择会话已结束')
      const entry = [...state.entries.values()].find(
        (item) => item.session.captureId === captureId
      )
      if (entry === undefined) throw new Error('找不到区域选择会话')
      const result = await capture.cropCapture(captureId, rect, { keepOriginal: true })
      finish(result)
    },
    async cancel() {
      generation++
      finish(null)
    }
  }
}
