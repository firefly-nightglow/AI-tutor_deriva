import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createExternalTilingController,
  type ExternalTilingAdapter,
  type TilingDrawerFrame
} from '../controller'
import type {
  ExternalWindowIdentity,
  ExternalWindowSnapshot,
  ExternalWindowSummary,
  ExternalWindowRect
} from '../../../shared/types'

const identity: ExternalWindowIdentity = {
  hwnd: '0x1234',
  pid: 900,
  started: '123456'
}

const window: ExternalWindowSummary = {
  identity,
  appName: 'Code.exe',
  title: 'Linear algebra notes',
  bounds: { left: 100, top: 100, right: 900, bottom: 700 },
  minimized: false,
  maximized: false,
  eligible: true,
  unavailableReason: null
}

const secondWindow: ExternalWindowSummary = {
  ...window,
  identity: { hwnd: '0x5678', pid: 901, started: '654321' },
  appName: 'chrome.exe',
  title: 'Course reading'
}

const drawer: TilingDrawerFrame = {
  displayId: 1,
  edge: 'right',
  workArea: { left: 0, top: 0, right: 1600, bottom: 1000 },
  bounds: { left: 1160, top: 0, right: 1600, bottom: 1000 },
  scaleFactor: 1.5
}

function snapshot(bounds: ExternalWindowRect = window.bounds): ExternalWindowSnapshot {
  return {
    window,
    bounds,
    visibleBounds: bounds,
    placement: {
      length: 44,
      flags: 0,
      showCmd: 1,
      ptMinPosition: { x: -1, y: -1 },
      ptMaxPosition: { x: -1, y: -1 },
      rcNormalPosition: bounds
    }
  }
}

class FakeAdapter implements ExternalTilingAdapter {
  readonly tiles: ExternalWindowRect[] = []
  readonly restored: ExternalWindowSnapshot[] = []
  readonly events: string[] = []
  windows = [window, secondWindow]
  current = snapshot()
  readError: Error | null = null
  tileError: Error | null = null
  restoreError: Error | null = null

  listWindows(): ExternalWindowSummary[] {
    return this.windows
  }

  read(_identity: ExternalWindowIdentity): ExternalWindowSnapshot {
    if (this.readError !== null) throw this.readError
    return this.current
  }

  capture(_identity: ExternalWindowIdentity): ExternalWindowSnapshot {
    return snapshot()
  }

  tile(_identity: ExternalWindowIdentity, target: ExternalWindowRect): ExternalWindowSnapshot {
    this.events.push(`tile:${_identity.hwnd}`)
    this.tiles.push(target)
    if (this.tileError !== null) throw this.tileError
    const selected = this.windows.find((item) => item.identity.hwnd === _identity.hwnd) ?? window
    return { ...snapshot(target), window: selected }
  }

  restore(value: ExternalWindowSnapshot): ExternalWindowSnapshot {
    this.events.push(`restore:${value.window.identity.hwnd}`)
    this.restored.push(value)
    if (this.restoreError !== null) throw this.restoreError
    return value
  }
}

describe('external tiling controller', () => {
  it('selects a window and occupies the drawer-free side of the work area', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      const state = controller.selectWindow(identity)

      expect(state.status).toBe('active')
      expect(state.selected?.identity).toEqual(identity)
      expect(adapter.tiles).toEqual([
        { left: 0, top: 0, right: 1160, bottom: 1000 }
      ])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('restores the previous application before tiling a replacement', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      controller.selectWindow(secondWindow.identity)

      expect(adapter.events).toEqual([
        'tile:0x1234',
        'restore:0x1234',
        'tile:0x5678'
      ])
      expect(controller.getState().selected?.identity).toEqual(secondWindow.identity)
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('pauses when the drawer disappears and resumes when it returns', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      controller.updateDrawer(null)

      expect(controller.getState().status).toBe('paused')
      expect(controller.getState().canRetile).toBe(true)
      expect(adapter.events).toEqual(['tile:0x1234', 'restore:0x1234'])

      controller.updateDrawer(drawer)

      expect(controller.getState().status).toBe('active')
      expect(adapter.events).toEqual([
        'tile:0x1234',
        'restore:0x1234',
        'tile:0x1234'
      ])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns to a restore-pending state after an abnormal exit without moving the app', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const firstAdapter = new FakeAdapter()
    const first = createExternalTilingController({ adapter: firstAdapter, stateFilePath })
    first.updateDrawer(drawer)
    first.selectWindow(identity)

    const restartedAdapter = new FakeAdapter()
    const restarted = createExternalTilingController({
      adapter: restartedAdapter,
      stateFilePath
    })
    try {
      expect(restarted.getState().status).toBe('restore-pending')
      expect(restarted.getState().pendingRestore).toBe(true)
      expect(restarted.getState().selected?.identity).toEqual(identity)
      expect(restartedAdapter.events).toEqual([])
    } finally {
      restarted.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('restores the original placement only after the user confirms recovery', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const first = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath
    })
    first.updateDrawer(drawer)
    first.selectWindow(identity)

    const restartedAdapter = new FakeAdapter()
    const restarted = createExternalTilingController({
      adapter: restartedAdapter,
      stateFilePath
    })
    try {
      expect(restartedAdapter.events).toEqual([])
      const state = restarted.confirmPendingRestore()

      expect(state.status).toBe('idle')
      expect(state.pendingRestore).toBe(false)
      expect(restartedAdapter.events).toEqual(['restore:0x1234'])
    } finally {
      restarted.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('leaves a manually moved window alone and keeps the app as a retile choice', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({ adapter, stateFilePath })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      adapter.current = snapshot({
        left: 80,
        top: 120,
        right: 880,
        bottom: 720
      })

      const state = controller.poll()

      expect(state.status).toBe('paused')
      expect(state.canRetile).toBe(true)
      expect(state.selected?.identity).toEqual(identity)
      expect(adapter.events).toEqual(['tile:0x1234'])

      const restarted = createExternalTilingController({
        adapter: new FakeAdapter(),
        stateFilePath
      })
      expect(restarted.getState().status).toBe('paused')
      expect(restarted.getState().pendingRestore).toBe(false)
      restarted.dispose()
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('clears a closed target and explains that it must be selected again', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      adapter.readError = Object.assign(new Error('window-missing'), { code: 'window-missing' })

      const state = controller.poll()

      expect(state.status).toBe('error')
      expect(state.selected).toBeNull()
      expect(state.canRetile).toBe(false)
      expect(state.error).toContain('已关闭')
      expect(adapter.events).toEqual(['tile:0x1234'])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('restores the original placement when the app refuses the tile geometry', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    adapter.tileError = Object.assign(new Error('geometry-refused'), {
      code: 'geometry-refused'
    })
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      const state = controller.selectWindow(identity)

      expect(state.status).toBe('error')
      expect(state.selected).toBeNull()
      expect(state.error).toContain('无法并排')
      expect(adapter.events).toEqual(['tile:0x1234', 'restore:0x1234'])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('preserves the restore record when both tiling and rollback fail', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    adapter.tileError = Object.assign(new Error('geometry-refused'), {
      code: 'geometry-refused'
    })
    adapter.restoreError = Object.assign(new Error('restore-failed'), {
      code: 'restore-failed'
    })
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      const state = controller.selectWindow(identity)

      expect(state.status).toBe('restore-pending')
      expect(state.pendingRestore).toBe(true)
      expect(state.selected?.identity).toEqual(identity)
      expect(adapter.events).toEqual(['tile:0x1234', 'restore:0x1234'])

      const restarted = createExternalTilingController({
        adapter: new FakeAdapter(),
        stateFilePath: join(directory, 'external-tiling.json')
      })
      expect(restarted.getState().status).toBe('restore-pending')
      restarted.dispose()
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('stops tiling and clears the selection after restoring the original placement', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)

      const state = controller.stop()

      expect(state.status).toBe('idle')
      expect(state.selected).toBeNull()
      expect(adapter.events).toEqual(['tile:0x1234', 'restore:0x1234'])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('retiles a retained app from its current position after a manual layout change', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      adapter.current = snapshot({ left: 80, top: 120, right: 880, bottom: 720 })
      controller.poll()

      const state = controller.retile()

      expect(state.status).toBe('active')
      expect(state.expectedBounds).toEqual({ left: 0, top: 0, right: 1160, bottom: 1000 })
      expect(adapter.events).toEqual(['tile:0x1234', 'tile:0x1234'])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('refuses a layout that leaves less than the external app minimum width', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer({
        ...drawer,
        workArea: { left: 0, top: 0, right: 700, bottom: 1000 },
        bounds: { left: 440, top: 0, right: 700, bottom: 1000 }
      })
      const state = controller.selectWindow(identity)

      expect(state.status).toBe('error')
      expect(state.error).toContain('空间不足')
      expect(adapter.events).toEqual([])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('remembers the drawer ratio for the display where tiling was used', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const first = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath
    })
    const ratioDrawer = { ...drawer, scaleFactor: 1 }
    first.updateDrawer(ratioDrawer)
    first.selectWindow(identity)
    first.dispose()

    const restarted = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath
    })
    try {
      restarted.updateDrawer(ratioDrawer)
      expect(restarted.preferredDrawerWidth()).toBe(440)
    } finally {
      restarted.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns a remembered drawer width in DIP on a 150 percent display', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const highDpiDrawer = {
      ...drawer,
      bounds: { left: 940, top: 0, right: 1600, bottom: 1000 }
    }
    const first = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath
    })
    first.updateDrawer(highDpiDrawer)
    first.selectWindow(identity)
    first.dispose()

    const restarted = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath
    })
    try {
      restarted.updateDrawer(highDpiDrawer)
      expect(restarted.preferredDrawerWidth()).toBe(440)
    } finally {
      restarted.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('drops a restore record when the saved window no longer exists', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const first = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath
    })
    first.updateDrawer(drawer)
    first.selectWindow(identity)

    const restartedAdapter = new FakeAdapter()
    restartedAdapter.readError = Object.assign(new Error('window-missing'), {
      code: 'window-missing'
    })
    const restarted = createExternalTilingController({
      adapter: restartedAdapter,
      stateFilePath
    })
    try {
      expect(restarted.getState().status).toBe('idle')
      expect(restarted.getState().pendingRestore).toBe(false)
      expect(restarted.getState().selected).toBeNull()
    } finally {
      restarted.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('publishes main-process state changes so tray and renderer actions stay aligned', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const controller = createExternalTilingController({
      adapter: new FakeAdapter(),
      stateFilePath: join(directory, 'external-tiling.json')
    })
    const statuses: string[] = []
    const unsubscribe = controller.onStateChanged((state) => statuses.push(state.status))
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      controller.updateDrawer(null)
      expect(statuses).toEqual(['active', 'paused'])
    } finally {
      unsubscribe()
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('moves the external app with the drawer while preserving the original restore snapshot', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)

      controller.updateDrawer({
        ...drawer,
        bounds: { left: 1080, top: 0, right: 1600, bottom: 1000 }
      })

      expect(controller.getState().expectedBounds).toEqual({
        left: 0,
        top: 0,
        right: 1080,
        bottom: 1000
      })
      expect(adapter.tiles).toEqual([
        { left: 0, top: 0, right: 1160, bottom: 1000 },
        { left: 0, top: 0, right: 1080, bottom: 1000 }
      ])
      controller.stop()
      expect(adapter.restored[0]).toEqual(snapshot())
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('reports a retile failure after the drawer returns instead of throwing into the main process', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      controller.updateDrawer(null)
      adapter.tileError = Object.assign(new Error('geometry-refused'), {
        code: 'geometry-refused'
      })

      expect(() => controller.updateDrawer(drawer)).not.toThrow()
      expect(controller.getState().status).toBe('error')
      expect(controller.getState().canRetile).toBe(true)
      expect(controller.getState().error).toContain('无法并排')
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('turns a failed collapse restore into an explicit recovery state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      adapter.restoreError = Object.assign(new Error('restore-failed'), {
        code: 'restore-failed'
      })

      expect(() => controller.updateDrawer(null)).not.toThrow()
      expect(controller.getState().status).toBe('restore-pending')
      expect(controller.getState().pendingRestore).toBe(true)
      expect(controller.getState().selected?.identity).toEqual(identity)
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not replace an app when restoring the previous one fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      adapter.restoreError = Object.assign(new Error('restore-failed'), {
        code: 'restore-failed'
      })

      expect(() => controller.selectWindow(secondWindow.identity)).not.toThrow()
      expect(controller.getState().status).toBe('restore-pending')
      expect(controller.getState().selected?.identity).toEqual(identity)
      expect(adapter.events).toEqual(['tile:0x1234', 'restore:0x1234'])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('restores the app when drawer resizing would violate the external minimum width', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      controller.updateDrawer({
        ...drawer,
        workArea: { left: 0, top: 0, right: 1000, bottom: 1000 },
        bounds: { left: 650, top: 0, right: 1000, bottom: 1000 }
      })

      expect(controller.getState().status).toBe('error')
      expect(controller.getState().canRetile).toBe(true)
      expect(adapter.events).toEqual(['tile:0x1234', 'restore:0x1234'])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('clears a paused app when it closes before the drawer returns', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      controller.updateDrawer(null)
      adapter.tileError = Object.assign(new Error('window-missing'), {
        code: 'window-missing'
      })

      controller.updateDrawer(drawer)

      expect(controller.getState().status).toBe('error')
      expect(controller.getState().selected).toBeNull()
      expect(controller.getState().canRetile).toBe(false)
      expect(controller.getState().error).toContain('已关闭')
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('clears a closed app when the user asks to retile it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      adapter.current = snapshot({ left: 80, top: 120, right: 880, bottom: 720 })
      controller.poll()
      adapter.tileError = Object.assign(new Error('window-missing'), {
        code: 'window-missing'
      })

      const state = controller.retile()

      expect(state.status).toBe('error')
      expect(state.selected).toBeNull()
      expect(state.canRetile).toBe(false)
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('refuses to move a window when the initial restore record cannot be written', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    mkdirSync(stateFilePath)
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({ adapter, stateFilePath })
    try {
      controller.updateDrawer(drawer)
      const state = controller.selectWindow(identity)

      expect(state.status).toBe('error')
      expect(state.error).toContain('无法保存窗口恢复记录')
      expect(adapter.tiles).toEqual([])
      expect(adapter.events).toEqual([])
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps the app running when a later best-effort state write fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'deriva-tiling-controller-'))
    const stateFilePath = join(directory, 'external-tiling.json')
    const adapter = new FakeAdapter()
    const controller = createExternalTilingController({ adapter, stateFilePath })
    try {
      controller.updateDrawer(drawer)
      controller.selectWindow(identity)
      rmSync(stateFilePath)
      mkdirSync(stateFilePath)

      expect(() =>
        controller.updateDrawer({
          ...drawer,
          bounds: { left: 1080, top: 0, right: 1600, bottom: 1000 }
        })
      ).not.toThrow()
      expect(adapter.tiles).toHaveLength(2)
      expect(controller.getState().error).toContain('无法保存窗口恢复记录')
    } finally {
      controller.dispose()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
