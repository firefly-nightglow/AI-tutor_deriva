import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ views: [] as any[], external: vi.fn() }))
vi.mock('electron', () => ({
  session: { fromPartition: () => ({
    setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setSpellCheckerEnabled() {}
  }) },
  shell: { openExternal: mocks.external },
  dialog: { showOpenDialog: vi.fn() },
  WebContentsView: class {
    webContents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      getURL: () => 'https://lesson.test/', getTitle: () => 'Lesson',
      loadURL: vi.fn(async () => {}), setWindowOpenHandler: vi.fn(),
      insertCSS: vi.fn(async () => ''), executeJavaScript: vi.fn(async () => false),
      setZoomFactor: vi.fn(), close: vi.fn(),
      navigationHistory: { canGoBack: () => false, canGoForward: () => false }
    })
    setBackgroundColor() {}
    setVisible = vi.fn()
    setBounds = vi.fn()
    constructor() { mocks.views.push(this) }
  }
}))
import { createMaterialPanelController } from '../panel'

beforeEach(() => { mocks.views.length = 0; mocks.external.mockReset().mockResolvedValue(undefined) })

describe('material panel navigation', () => {
  it('exposes a stable source with current screen bounds and understandable availability reasons', () => {
    let visible = true
    const window = { isDestroyed: () => false, isVisible: () => visible, isMinimized: () => false,
      getContentBounds: () => ({ x: -1200, y: 100 }), webContents: { send: vi.fn() },
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() } }
    const panel = createMaterialPanelController(window as never, { handle: vi.fn() } as never)
    expect(panel.getCaptureTarget().unavailableReason?.()).toContain('未打开')
    panel.open('https://lesson.test/')
    expect(panel.getCaptureTarget().unavailableReason?.()).toContain('加载')
    panel.setBounds({ x: 200, y: 100, width: 500, height: 400 })
    const contents = mocks.views[0].webContents
    contents.emit('dom-ready')
    contents.emit('did-finish-load')
    expect(panel.getCaptureTarget().unavailableReason?.()).toBeUndefined()
    expect(panel.getCaptureTarget().getBounds?.()).toEqual({ x: -1000, y: 200, width: 500, height: 400 })
    panel.setVisible(false) // Modal occlusion does not close the underlying material.
    expect(panel.getCaptureTarget().unavailableReason?.()).toBeUndefined()
    visible = false
    expect(panel.getCaptureTarget().unavailableReason?.()).toContain('不可见')
    visible = true
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '', true)
    expect(panel.getCaptureTarget().unavailableReason?.()).toContain('失败')
    panel.close()
    expect(panel.getCaptureTarget().unavailableReason?.()).toContain('未打开')
  })

  it('opens a cross-site page link externally without replacing the learning page', () => {
    const window = {
      isDestroyed: () => false, webContents: { send: vi.fn() },
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    }
    const panel = createMaterialPanelController(window as never, { handle: vi.fn() } as never)
    panel.open('https://lesson.test/')
    const event = { preventDefault: vi.fn() }
    mocks.views[0].webContents.emit('will-navigate', event, 'https://external.test/')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.external).toHaveBeenCalledWith('https://external.test/')
    panel.dispose()
  })
})
