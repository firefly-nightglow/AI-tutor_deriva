import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const display = { id: 1, workArea: { x: 0, y: 0, width: 1707, height: 1019 } }
  return {
    app: { quit: vi.fn() },
    BrowserWindow: class extends EventEmitter {
      isDestroyed = () => false
      isVisible = () => false
      loadURL = async () => {}
      setAlwaysOnTop() {}
      setBounds() {}
      destroy() {}
    },
    Menu: { buildFromTemplate: () => ({ popup() {} }) },
    Tray: class extends EventEmitter {
      setToolTip() {}
      setContextMenu() {}
      destroy() {}
    },
    nativeImage: { createFromDataURL: () => ({ resize: () => ({}) }) },
    globalShortcut: { register: () => true, unregisterAll() {} },
    screen: Object.assign(new EventEmitter(), {
      getPrimaryDisplay: () => display,
      getAllDisplays: () => [display],
      getDisplayMatching: () => display
    })
  }
})

import { createWindowModeManager } from '../window-mode'

afterEach(() => vi.useRealTimers())

describe('floating window width persistence', () => {
  it('keeps the requested DIP width when native move bounds contain rounding', () => {
    vi.useFakeTimers()
    const directory = mkdtempSync(join(tmpdir(), 'deriva-window-mode-'))
    let bounds = { x: 0, y: 0, width: 1100, height: 720 }
    const window = Object.assign(new EventEmitter(), {
      webContents: { send() {} },
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      isMaximized: () => false,
      isFullScreen: () => false,
      getNormalBounds: () => bounds,
      // Native rounding is observable at the framework boundary, not a user resize.
      getBounds: () => ({ ...bounds, width: bounds.width + 1 }),
      setBounds: (next: typeof bounds) => { bounds = next },
      setMinimumSize() {},
      setAlwaysOnTop() {},
      setSkipTaskbar() {},
      setResizable() {},
      setMaximizable() {},
      show() {}
    })
    const manager = createWindowModeManager(window as never, join(directory, 'state.json'))
    try {
      manager.setMode('floating')
      manager.setDrawerWidth(440, true)
      for (let move = 0; move < 3; move++) {
        vi.advanceTimersByTime(200)
        window.emit('moved')
        vi.advanceTimersByTime(121)
        expect(manager.getState().drawerWidth).toBe(440)
      }
    } finally {
      manager.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('notifies main-process subscribers for every drawer width update', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-window-mode-'))
    let bounds = { x: 0, y: 0, width: 1100, height: 720 }
    const window = Object.assign(new EventEmitter(), {
      webContents: { send() {} },
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      isMaximized: () => false,
      isFullScreen: () => false,
      getNormalBounds: () => bounds,
      getBounds: () => bounds,
      setBounds: (next: typeof bounds) => {
        bounds = next
      },
      setMinimumSize() {},
      setAlwaysOnTop() {},
      setSkipTaskbar() {},
      setResizable() {},
      setMaximizable() {},
      show() {}
    })
    const manager = createWindowModeManager(window as never, join(directory, 'state.json'))
    const widths: number[] = []
    const unsubscribe = manager.onGeometryChanged((next) => widths.push(next.width))
    try {
      manager.setMode('floating')
      manager.setDrawerWidth(500, false)
      manager.setDrawerWidth(560, true)
      expect(widths).toContain(500)
      expect(widths.at(-1)).toBe(560)
    } finally {
      unsubscribe()
      manager.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('clamps drawer dragging to the active external tiling limit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-window-mode-'))
    let bounds = { x: 0, y: 0, width: 1100, height: 720 }
    const window = Object.assign(new EventEmitter(), {
      webContents: { send() {} },
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      isMaximized: () => false,
      isFullScreen: () => false,
      getNormalBounds: () => bounds,
      getBounds: () => bounds,
      setBounds: (next: typeof bounds) => {
        bounds = next
      },
      setMinimumSize() {},
      setAlwaysOnTop() {},
      setSkipTaskbar() {},
      setResizable() {},
      setMaximizable() {},
      show() {}
    })
    const manager = createWindowModeManager(window as never, join(directory, 'state.json'))
    try {
      manager.setMode('floating')
      manager.setDrawerWidthLimit(500)
      manager.setDrawerWidth(720, true)
      expect(manager.getState().drawerWidth).toBe(500)
      expect(manager.getState().maxDrawerWidth).toBe(500)
      expect(bounds.width).toBe(500)
    } finally {
      manager.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not reapply geometry when the tiling width limit is unchanged', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-window-mode-'))
    const bounds = { x: 0, y: 0, width: 1100, height: 720 }
    const window = Object.assign(new EventEmitter(), {
      webContents: { send() {} },
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      isMaximized: () => false,
      isFullScreen: () => false,
      getNormalBounds: () => bounds,
      getBounds: () => bounds,
      setBounds() {},
      setMinimumSize() {},
      setAlwaysOnTop() {},
      setSkipTaskbar() {},
      setResizable() {},
      setMaximizable() {},
      show() {}
    })
    const manager = createWindowModeManager(window as never, join(directory, 'state.json'))
    const geometry = vi.fn()
    const unsubscribe = manager.onGeometryChanged(geometry)
    try {
      manager.setMode('floating')
      manager.setDrawerWidthLimit(500)
      geometry.mockClear()
      manager.setDrawerWidthLimit(500)
      expect(geometry).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
      manager.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
