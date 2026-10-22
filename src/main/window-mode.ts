import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  nativeImage,
  screen,
  Tray,
  type Display,
  type Rectangle
} from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { WindowMode, WindowUiState } from '../shared/types'
import {
  BUBBLE_SIZE,
  DEFAULT_DRAWER_WIDTH,
  MIN_DRAWER_WIDTH,
  bubbleBounds,
  clampDrawerWidth,
  clampToWorkArea,
  drawerBounds,
  nearestDrawerEdge,
  type DrawerEdge
} from './window-geometry'

interface PersistedWindowState {
  mode: WindowMode
  edge: DrawerEdge
  width: number
  displayId: number | null
  bubbleY: number | null
  normalBounds: Rectangle | null
  normalMaximized: boolean
  shortcut: string | null
}

const DEFAULT_STATE: PersistedWindowState = {
  mode: 'normal',
  edge: 'right',
  width: DEFAULT_DRAWER_WIDTH,
  displayId: null,
  bubbleY: null,
  normalBounds: null,
  normalMaximized: false,
  shortcut: null
}

const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAH9SURBVFhH1ZevTwMxFMeRSCQONAlXJHJ/wiRqTBISrkjkxBwCuX+ADImcWlDLJGYJcgKxu+tlywS5kImS13WX6+vr/dhuS/gmH0Nf+759176yo6P/qsuH4Jpx0ciCY2rVxX146vnBHeNiwLiQOYw9P3xifHaO19hKjC9OGBcdxkVCJCsg7oFxvGZpQVk9P1rYC1ci8fzoBq9dKMbD9na7dtLBOZzSyfECO+P54gXnsqRPdJ07N4CDjHOmWp/0nb95EQnj4RXOrQQlIibUjufH7zi32n1R6bsT6dTo1Y7PB1Vh3TxwkEmegbV+ZZeYRxP3DAPQwewgk9RA9CNb6d/nsh9lPEyW1jwHs0xy1e1wgAVtAMiaqFIF/Rn0w0IEmLgNCNkarvTgSvaf7bkUaYdkPGjiQYq6DTAePSoD+pUjAkzqN6DbM5SCGLRwG1jKkR6yx9zAzdvcAGi/VgCGNpBJLqX8Hs6teW7CtjKgmxARYFLYB8pfQQUcfn0RVRue4gCM20CVq5eSnN1Oj7MGDvIObLDeA2gKOGi/BE3DAAhc2YH14/niE+dWOlwViN1vVOZV3A30ClJiXLzZE2thbJx8lyBoDybG8OriXLnSP0jwQlsQ90rtnJL+cfJhL1qG6Cv3wFWRfrLhs+T+36gZpH1+H1pXRd0W+ERZGlVL/QeKj6QgRZqR1wAAAABJRU5ErkJggg=='

function readState(filePath: string): PersistedWindowState {
  try {
    if (!existsSync(filePath)) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    return {
      mode: parsed.mode === 'floating' ? 'floating' : 'normal',
      edge: parsed.edge === 'left' ? 'left' : 'right',
      width:
        typeof parsed.width === 'number' && Number.isFinite(parsed.width)
          ? parsed.width
          : DEFAULT_DRAWER_WIDTH,
      displayId:
        typeof parsed.displayId === 'number' && Number.isFinite(parsed.displayId)
          ? parsed.displayId
          : null,
      bubbleY:
        typeof parsed.bubbleY === 'number' && Number.isFinite(parsed.bubbleY)
          ? parsed.bubbleY
          : null,
      normalBounds: isRectangle(parsed.normalBounds) ? parsed.normalBounds : null,
      normalMaximized: parsed.normalMaximized === true,
      shortcut: typeof parsed.shortcut === 'string' ? parsed.shortcut : null
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(candidate[key])) &&
    Number(candidate.width) > 0 &&
    Number(candidate.height) > 0
  )
}

function intersects(bounds: Rectangle, area: Rectangle): boolean {
  return (
    bounds.x < area.x + area.width &&
    bounds.x + bounds.width > area.x &&
    bounds.y < area.y + area.height &&
    bounds.y + bounds.height > area.y
  )
}

function bubbleHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      #bubble {
        width: 100%; height: 100%; padding: 0; border: 2px solid rgba(255,255,255,.9);
        border-radius: 50%; background: #2f6feb; color: #fff; display: flex;
        align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 5px 16px rgba(0,0,0,.3); transition: transform 120ms ease, background-color 120ms ease;
        touch-action: none; -webkit-user-select: none; user-select: none;
      }
      #bubble:hover { background: #245fd0; transform: translateY(-2px); }
      #bubble:active { background: #1f55bd; transform: translateY(0); }
      svg { width: 58%; height: 58%; pointer-events: none; }
    </style>
  </head>
  <body>
    <button id="bubble" type="button" aria-label="展开 Deriva">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M8 6h8a10 10 0 0 1 0 20H8V6Z" stroke="white" stroke-width="3.2" stroke-linejoin="round" />
      </svg>
    </button>
    <script>
      const button = document.getElementById('bubble')
      let dragging = false
      let moved = false
      let startY = 0
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return
        dragging = true
        moved = false
        startY = event.screenY
        button.setPointerCapture(event.pointerId)
        window.api.windowControl.bubbleDragStart(event.screenY)
      })
      button.addEventListener('pointermove', (event) => {
        if (!dragging) return
        if (Math.abs(event.screenY - startY) > 3) moved = true
        window.api.windowControl.bubbleDragMove(event.screenY)
      })
      button.addEventListener('pointerup', () => {
        if (!dragging) return
        dragging = false
        window.api.windowControl.bubbleDragEnd()
        if (!moved) window.api.windowControl.expand()
      })
      button.addEventListener('pointercancel', () => {
        if (!dragging) return
        dragging = false
        window.api.windowControl.bubbleDragEnd()
      })
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        window.api.windowControl.bubbleContextMenu()
      })
    </script>
  </body>
</html>`
}

export interface WindowModeManager {
  getState(): WindowUiState
  setMode(mode: WindowMode): WindowUiState
  collapse(): WindowUiState
  expand(): WindowUiState
  toggleCollapsed(): WindowUiState
  setDrawerWidth(width: number, commit: boolean): WindowUiState
  setDrawerWidthLimit(width: number | null): WindowUiState
  setShortcut(accelerator: string | null): WindowUiState
  minimize(): void
  toggleMaximize(): void
  close(): void
  showAndFocus(): void
  openSettings(): void
  bubbleDragStart(screenY: number): void
  bubbleDragMove(screenY: number): void
  bubbleDragEnd(): void
  bubbleContextMenu(): void
  onGeometryChanged(listener: (bounds: Rectangle) => void): () => void
  dispose(): void
}

/** Owns the normal/floating window state machine, the edge bubble, the tray and its persistence. */
export function createWindowModeManager(
  window: BrowserWindow,
  stateFilePath: string
): WindowModeManager {
  const state = readState(stateFilePath)
  let collapsed = false
  let suppressMovedUntil = 0
  let shortcutRegistered = false
  let tray: Tray | null = null
  let bubble: BrowserWindow | null = null
  let bubbleDragStartY = 0
  let bubbleDragCursorY = 0
  let moveTimer: ReturnType<typeof setTimeout> | null = null
  let normalSaveTimer: ReturnType<typeof setTimeout> | null = null
  let drawerWidthLimit: number | null = null
  const geometryListeners = new Set<(bounds: Rectangle) => void>()

  function notifyGeometry(): void {
    if (window.isDestroyed()) return
    const bounds = window.getBounds()
    for (const listener of geometryListeners) listener(bounds)
  }

  function save(): void {
    try {
      mkdirSync(dirname(stateFilePath), { recursive: true })
      writeFileSync(stateFilePath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    } catch {
      // A failed preference write must not prevent the window from working this session.
    }
  }

  function visibleState(): WindowUiState {
    return {
      mode: state.mode,
      collapsed,
      edge: state.edge,
      drawerWidth: state.width,
      maxDrawerWidth: drawerWidthLimit,
      shortcut: state.shortcut,
      shortcutRegistered
    }
  }

  function notify(): void {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.windowStateChanged, visibleState())
    }
    tray?.setContextMenu(buildTrayMenu())
  }

  function onAnyDisplay(bounds: Rectangle): boolean {
    return screen.getAllDisplays().some((display) => intersects(bounds, display.workArea))
  }

  function currentDisplay(): Display {
    if (state.displayId !== null) {
      const found = screen.getAllDisplays().find((display) => display.id === state.displayId)
      if (found) return found
    }
    return screen.getPrimaryDisplay()
  }

  function normalDisplay(bounds: Rectangle): Display {
    return onAnyDisplay(bounds) ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay()
  }

  function applyMode(): void {
    if (state.mode === 'floating') {
      if (window.isMaximized()) window.unmaximize()
      if (window.isFullScreen()) window.setFullScreen(false)
      window.setAlwaysOnTop(true, 'floating')
      window.setSkipTaskbar(false)
      window.setResizable(false)
      window.setMaximizable(false)
      window.setMinimumSize(Math.min(MIN_DRAWER_WIDTH, currentDisplay().workArea.width), 200)
    } else {
      window.setAlwaysOnTop(false)
      window.setSkipTaskbar(false)
      window.setResizable(true)
      window.setMaximizable(true)
      window.setMinimumSize(360, 320)
    }
  }

  function applyDrawerBounds(): void {
    const display = currentDisplay()
    const bounds = drawerBounds(
      display.workArea,
      state.edge,
      state.width,
      drawerWidthLimit
    )
    state.width = bounds.width
    state.displayId = display.id
    window.setMinimumSize(
      Math.min(MIN_DRAWER_WIDTH, display.workArea.width),
      Math.min(200, display.workArea.height)
    )
    suppressMovedUntil = Date.now() + 150
    window.setBounds(bounds)
    notifyGeometry()
  }

  function restoreNormalBounds(): void {
    const target = state.normalBounds ?? window.getBounds()
    const display = normalDisplay(target)
    const bounds = clampToWorkArea(target, display.workArea)
    state.normalBounds = bounds
    suppressMovedUntil = Date.now() + 150
    window.setBounds(bounds)
    notifyGeometry()
    if (state.normalMaximized) window.maximize()
  }

  function scheduleNormalSave(): void {
    if (normalSaveTimer !== null) clearTimeout(normalSaveTimer)
    normalSaveTimer = setTimeout(() => {
      normalSaveTimer = null
      if (state.mode !== 'normal' || window.isDestroyed()) return
      state.normalBounds = window.getNormalBounds()
      state.normalMaximized = window.isMaximized()
      save()
    }, 200)
  }

  function dockAfterMove(): void {
    if (state.mode !== 'floating' || collapsed || window.isDestroyed()) return
    const bounds = window.getBounds()
    const display = screen.getDisplayMatching(bounds)
    state.edge = nearestDrawerEdge(bounds, display.workArea)
    state.displayId = display.id
    // Native bounds may round fractional DIP edges; only explicit resizing changes user width.
    state.width = clampDrawerWidth(state.width, display.workArea, drawerWidthLimit)
    applyDrawerBounds()
    save()
    notify()
  }

  function onMoved(): void {
    if (window.isDestroyed() || Date.now() < suppressMovedUntil || window.isMinimized()) return
    if (state.mode === 'normal') {
      scheduleNormalSave()
      return
    }
    if (collapsed) return
    if (moveTimer !== null) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      moveTimer = null
      dockAfterMove()
    }, 120)
  }

  function onResize(): void {
    if (window.isDestroyed() || state.mode !== 'normal') return
    scheduleNormalSave()
  }

  function createTrayIcon() {
    return nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 16, height: 16 })
  }

  function bubbleMenu(): void {
    Menu.buildFromTemplate([
      { label: '打开 Deriva', click: () => expand() },
      { label: '设置', click: () => openSettings() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]).popup({ window: bubble ?? undefined })
  }

  function buildTrayMenu(): Menu {
    return Menu.buildFromTemplate([
      { label: '打开 Deriva', click: () => showAndFocus() },
      {
        label: '收起',
        enabled: state.mode === 'floating' && !collapsed,
        click: () => collapse()
      },
      { label: '设置', click: () => openSettings() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  }

  function ensureTray(): void {
    if (tray !== null) return
    tray = new Tray(createTrayIcon())
    tray.setToolTip('Deriva')
    tray.setContextMenu(buildTrayMenu())
    tray.on('click', () => showAndFocus())
  }

  function ensureBubble(): BrowserWindow {
    if (bubble !== null && !bubble.isDestroyed()) return bubble
    bubble = new BrowserWindow({
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    bubble.setAlwaysOnTop(true, 'floating')
    bubble.on('ready-to-show', () => {
      if (collapsed) showBubble()
    })
    bubble.on('closed', () => {
      bubble = null
    })
    void bubble
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(bubbleHtml())}`)
      .catch((error) => console.warn('[deriva] failed to load the quick bubble:', error))
    return bubble
  }

  function showBubble(): void {
    if (window.isDestroyed()) return
    const display = currentDisplay()
    const area = display.workArea
    const fallbackY = area.y + Math.round((area.height - BUBBLE_SIZE) / 2)
    const bounds = bubbleBounds(area, state.edge, state.bubbleY ?? fallbackY)
    const target = ensureBubble()
    target.setBounds(bounds)
    target.showInactive()
  }

  function hideBubble(): void {
    if (bubble !== null && !bubble.isDestroyed() && bubble.isVisible()) bubble.hide()
  }

  function registerShortcut(accelerator: string | null): void {
    globalShortcut.unregisterAll()
    shortcutRegistered = false
    state.shortcut = accelerator?.trim() || null
    if (state.shortcut !== null) {
      try {
        shortcutRegistered = globalShortcut.register(state.shortcut, showAndFocus)
      } catch {
        shortcutRegistered = false
      }
    }
  }

  function showAndFocus(): void {
    if (window.isDestroyed()) return
    if (collapsed) {
      expand()
      return
    }
    if (window.isMinimized()) window.restore()
    hideBubble()
    window.show()
    window.focus()
    if (state.mode === 'floating') window.setAlwaysOnTop(true, 'floating')
  }

  function openSettings(): void {
    showAndFocus()
    if (window.isDestroyed()) return
    const send = (): void => {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.windowOpenSettings)
    }
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
    else send()
  }

  function expand(): WindowUiState {
    if (state.mode !== 'floating') setMode('floating')
    collapsed = false
    hideBubble()
    applyMode()
    applyDrawerBounds()
    save()
    if (!window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    notify()
    return visibleState()
  }

  function collapse(): WindowUiState {
    if (state.mode !== 'floating') setMode('floating')
    if (window.isDestroyed()) return visibleState()
    const display = currentDisplay()
    state.width = clampDrawerWidth(state.width, display.workArea, drawerWidthLimit)
    state.displayId = display.id
    collapsed = true
    applyDrawerBounds()
    save()
    window.hide()
    showBubble()
    notify()
    return visibleState()
  }

  function setMode(mode: WindowMode): WindowUiState {
    if (mode === state.mode) {
      if (mode === 'floating' && collapsed) return expand()
      return visibleState()
    }
    if (mode === 'floating') {
      state.normalBounds = window.getNormalBounds()
      state.normalMaximized = window.isMaximized()
      state.mode = 'floating'
      collapsed = false
      hideBubble()
      const display = normalDisplay(state.normalBounds)
      state.displayId = display.id
      applyMode()
      applyDrawerBounds()
      if (!window.isVisible()) window.show()
    } else {
      state.mode = 'normal'
      collapsed = false
      hideBubble()
      applyMode()
      restoreNormalBounds()
      if (window.isMinimized()) window.restore()
      if (!window.isVisible()) window.show()
    }
    save()
    notify()
    return visibleState()
  }

  function setDrawerWidth(width: number, commit: boolean): WindowUiState {
    if (state.mode !== 'floating' || collapsed || window.isDestroyed()) return visibleState()
    const display = currentDisplay()
    state.width = clampDrawerWidth(width, display.workArea, drawerWidthLimit)
    state.displayId = display.id
    applyDrawerBounds()
    if (commit) {
      save()
      notify()
    }
    return visibleState()
  }

  function ensureVisible(): void {
    if (window.isDestroyed()) return
    if (state.mode === 'floating') {
      const found =
        state.displayId === null
          ? null
          : screen.getAllDisplays().find((display) => display.id === state.displayId)
      if (found === null || found === undefined) {
        state.mode = 'normal'
        collapsed = false
        hideBubble()
        applyMode()
        restoreNormalBounds()
        if (window.isMinimized()) window.restore()
        window.show()
        save()
        notify()
        return
      }
      applyDrawerBounds()
      if (collapsed) showBubble()
      return
    }
    const target = state.normalBounds ?? window.getBounds()
    const display = normalDisplay(target)
    state.normalBounds = clampToWorkArea(target, display.workArea)
    suppressMovedUntil = Date.now() + 150
    window.setBounds(state.normalBounds)
    save()
  }

  window.on('moved', onMoved)
  window.on('resize', onResize)
  screen.on('display-added', ensureVisible)
  screen.on('display-removed', ensureVisible)
  screen.on('display-metrics-changed', ensureVisible)

  applyMode()
  if (state.mode === 'floating') {
    const savedDisplay =
      state.displayId === null
        ? null
        : screen.getAllDisplays().find((display) => display.id === state.displayId)
    if (savedDisplay === null || savedDisplay === undefined) {
      state.mode = 'normal'
      applyMode()
      restoreNormalBounds()
    } else {
      applyDrawerBounds()
    }
  } else {
    restoreNormalBounds()
  }
  collapsed = false
  ensureBubble()
  ensureTray()
  registerShortcut(state.shortcut)
  save()

  return {
    getState: visibleState,
    setMode,
    collapse,
    expand,
    toggleCollapsed: () => (collapsed ? expand() : collapse()),
    setDrawerWidth,
    setDrawerWidthLimit(width) {
      if (drawerWidthLimit === width) return visibleState()
      drawerWidthLimit = width
      if (state.mode === 'floating' && !collapsed && !window.isDestroyed()) {
        applyDrawerBounds()
      }
      notify()
      return visibleState()
    },
    setShortcut(accelerator) {
      registerShortcut(accelerator)
      save()
      notify()
      return visibleState()
    },
    minimize: () => {
      if (!collapsed && !window.isDestroyed()) window.minimize()
    },
    toggleMaximize: () => {
      if (state.mode === 'floating' || window.isDestroyed()) return
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    },
    close: () => app.quit(),
    showAndFocus,
    openSettings,
    bubbleDragStart(screenY: number) {
      if (bubble === null || bubble.isDestroyed()) return
      bubbleDragStartY = bubble.getBounds().y
      bubbleDragCursorY = screenY
    },
    bubbleDragMove(screenY: number) {
      if (bubble === null || bubble.isDestroyed()) return
      const display = screen.getDisplayMatching(bubble.getBounds())
      const y = bubbleDragStartY + (screenY - bubbleDragCursorY)
      bubble.setBounds(bubbleBounds(display.workArea, state.edge, y))
    },
    bubbleDragEnd() {
      if (bubble === null || bubble.isDestroyed()) return
      state.bubbleY = bubble.getBounds().y
      save()
    },
    bubbleContextMenu: bubbleMenu,
    onGeometryChanged(listener) {
      geometryListeners.add(listener)
      return () => geometryListeners.delete(listener)
    },
    dispose() {
      globalShortcut.unregisterAll()
      screen.removeListener('display-added', ensureVisible)
      screen.removeListener('display-removed', ensureVisible)
      screen.removeListener('display-metrics-changed', ensureVisible)
      window.removeListener('moved', onMoved)
      window.removeListener('resize', onResize)
      if (moveTimer !== null) clearTimeout(moveTimer)
      if (normalSaveTimer !== null) clearTimeout(normalSaveTimer)
      moveTimer = null
      normalSaveTimer = null
      geometryListeners.clear()
      tray?.destroy()
      tray = null
      if (bubble !== null && !bubble.isDestroyed()) bubble.destroy()
      bubble = null
    }
  }
}
