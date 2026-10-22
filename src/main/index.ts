import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, nativeTheme, safeStorage, screen, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ChatStreamEvent, ExternalTilingState } from '../shared/types'
import { openDatabase, type AppDatabase } from './db'
import { attachContextMenu } from './context-menu'
import { createAttachmentStore } from './attachments'
import { createScreenCapture } from './capture'
import { createElectronCapturePlatform } from './capture/electron'
import { createRegionSelector } from './capture/region-selector'
import { createCaptureRouter } from './capture/router'
import type { InternalCaptureRegistry } from './capture'
import { registerIpcHandlers } from './ipc'
import { createWindowModeManager, type WindowModeManager } from './window-mode'
import type { TilingDrawerFrame } from './tiling/controller'
import {
  createExternalTilingService,
  type ExternalTilingService
} from './tiling/service'
import { createMaterialPanelController, type MaterialPanelController } from './material/panel'
import { createMaterialFileAccess, registerMaterialScheme } from './material/protocol'
import {
  createApiKeyStore,
  createBranchAnchorBlock,
  createChatService,
  createConversationHistoryBlockWithParentChain,
  createLlmConfigStore,
  createOpenAiCompatibleClient
} from './llm'

let database: AppDatabase | null = null
let windowManager: WindowModeManager | null = null
let mainWindow: BrowserWindow | null = null
let materialFileAccess: ReturnType<typeof createMaterialFileAccess> | null = null
let materialPanel: MaterialPanelController | null = null
let externalTiling: ExternalTilingService | null = null
let externalTilingPoll: ReturnType<typeof setInterval> | null = null
let tilingDisposeStarted = false

registerMaterialScheme()

function broadcast(event: ChatStreamEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.llmChatEvent, event)
  }
}

function dataDirectory(): string {
  return join(app.getPath('userData'), 'deriva-data')
}

function databaseFilePath(): string {
  // Electron docs: user data belongs under app.getPath('userData'), in an app-owned subdirectory
  // so it cannot collide with Chromium's own Cache/GPUCache/Local Storage folders.
  return join(dataDirectory(), 'deriva.db')
}

function windowStateFilePath(): string {
  return join(dataDirectory(), 'window-state.json')
}

function externalTilingStateFilePath(): string {
  return join(dataDirectory(), 'external-tiling.json')
}

function createWindow(): BrowserWindow {
  const createdWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 320,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    // Matches the renderer's token background so launching in dark mode does not flash white.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15181d' : '#f5f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  createdWindow.on('ready-to-show', () => {
    createdWindow.show()
  })

  // Closing the learning window is a real quit. The tray and the edge bubble are recovery
  // affordances, not an excuse to keep an invisible process alive.
  createdWindow.on('closed', () => {
    if (mainWindow === createdWindow) mainWindow = null
    if (process.platform !== 'darwin') app.quit()
  })

  attachContextMenu(createdWindow)

  if (is.dev) {
    // Dev-only smoke check: proves the renderer actually mounted React and that the preload
    // bridge reached the page, instead of silently showing a blank window.
    createdWindow.webContents.once('did-finish-load', async () => {
      try {
        const report = await createdWindow.webContents.executeJavaScript(
          `(async () => JSON.stringify({
             heading: document.querySelector('h1')?.textContent ?? null,
             hasBridge: typeof window.api !== 'undefined',
             hasLlmBridge: typeof window.api?.llm?.keyStatus === 'function',
             sidebarMounted: document.querySelector('.sidebar') !== null,
             groupsRendered: document.querySelectorAll('.sidebar__group').length,
             conversationCount: (await window.api.conversations.listRoots()).length,
             keyStatus: typeof window.api?.llm?.keyStatus === 'function'
               ? await window.api.llm.keyStatus()
               : null,
             databasePath: typeof window.api?.databasePath === 'function'
               ? await window.api.databasePath()
               : null
           }))()`
        )
        console.log(`[deriva] renderer smoke check: ${report}`)
      } catch (error) {
        console.warn('[deriva] renderer smoke check failed:', error)
      }
    })
  }

  createdWindow.webContents.setWindowOpenHandler((details) => {
    // Only http(s) may leave the app, and a failure to hand off must not surface as an unhandled rejection.
    try {
      const { protocol } = new URL(details.url)
      if (protocol === 'https:' || protocol === 'http:') {
        void shell.openExternal(details.url).catch((error) => {
          console.warn('[deriva] failed to open external url:', error)
        })
      }
    } catch {
      console.warn('[deriva] ignored malformed external url')
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    createdWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    createdWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return createdWindow
}

function currentTilingDrawer(): TilingDrawerFrame | null {
  if (
    mainWindow === null ||
    mainWindow.isDestroyed() ||
    mainWindow.isMinimized() ||
    windowManager === null
  ) {
    return null
  }
  const state = windowManager.getState()
  if (state.mode !== 'floating' || state.collapsed) return null
  const bounds = mainWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const physicalBounds = screen.dipToScreenRect(mainWindow, bounds)
  const physicalWorkArea = screen.dipToScreenRect(mainWindow, display.workArea)
  return {
    displayId: display.id,
    edge: state.edge === 'left' ? 'left' : 'right',
    bounds: {
      left: physicalBounds.x,
      top: physicalBounds.y,
      right: physicalBounds.x + physicalBounds.width,
      bottom: physicalBounds.y + physicalBounds.height
    },
    workArea: {
      left: physicalWorkArea.x,
      top: physicalWorkArea.y,
      right: physicalWorkArea.x + physicalWorkArea.width,
      bottom: physicalWorkArea.y + physicalWorkArea.height
    },
    scaleFactor: display.scaleFactor
  }
}

function initializeExternalTiling(): void {
  if (mainWindow === null || windowManager === null) return
  externalTiling?.disposeNow()
  externalTiling = null
  if (externalTilingPoll !== null) clearInterval(externalTilingPoll)
  externalTilingPoll = null
  try {
    externalTiling = createExternalTilingService({
      workerPath: join(__dirname, 'tiling-worker.js'),
      stateFilePath: externalTilingStateFilePath()
    })
  } catch (error) {
    console.warn(
      '[deriva] external app tiling unavailable:',
      error instanceof Error ? error.message : 'native adapter failed'
    )
    return
  }
  const controller = externalTiling
  if (controller === null) return
  let drawerUpdateTimer: ReturnType<typeof setTimeout> | null = null
  const updateDrawer = (): void => controller.updateDrawer(currentTilingDrawer())
  const scheduleDrawerUpdate = (): void => {
    if (drawerUpdateTimer !== null) return
    drawerUpdateTimer = setTimeout(() => {
      drawerUpdateTimer = null
      updateDrawer()
    }, 16)
  }
  const unsubscribe = windowManager.onGeometryChanged(scheduleDrawerUpdate)
  const sendState = (state: ExternalTilingState): void => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      const display = screen.getDisplayMatching(mainWindow.getBounds())
      const constrained =
        windowManager !== null &&
        windowManager.getState().mode === 'floating' &&
        (state.status === 'active' || state.status === 'paused')
          ? Math.max(360, Math.floor(display.workArea.width - 480))
          : null
      windowManager?.setDrawerWidthLimit(constrained)
    }
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        IPC_CHANNELS.externalTilingStateChanged,
        state
      )
    }
  }
  const unsubscribeState = controller.onStateChanged(sendState)
  mainWindow.on('minimize', updateDrawer)
  mainWindow.on('restore', updateDrawer)
  mainWindow.on('closed', () => {
    if (drawerUpdateTimer !== null) clearTimeout(drawerUpdateTimer)
    drawerUpdateTimer = null
    unsubscribe()
    unsubscribeState()
  })
  updateDrawer()
  void controller.getState().then(sendState).catch(() => {})
  externalTilingPoll = setInterval(() => void controller.poll(), 750)
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!app.isReady() || windowManager === null) return
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      windowManager.showAndFocus()
      return
    }
    materialPanel?.dispose()
    materialPanel = null
    externalTiling?.disposeNow()
    externalTiling = null
    windowManager?.dispose()
    windowManager = null
    mainWindow = createWindow()
    windowManager = createWindowModeManager(mainWindow, windowStateFilePath())
    if (materialFileAccess !== null) {
      materialPanel = createMaterialPanelController(mainWindow, materialFileAccess)
    }
    initializeExternalTiling()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.deriva.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const filePath = databaseFilePath()
    mkdirSync(dirname(filePath), { recursive: true })
    database = openDatabase(filePath)
    const fileAccess = createMaterialFileAccess(join(dataDirectory(), 'material-files.json'))
    materialFileAccess = fileAccess

    const keyStore = createApiKeyStore(join(dataDirectory(), 'api-key.json'), safeStorage)
    const configStore = createLlmConfigStore(join(dataDirectory(), 'llm-config.json'))
    const attachmentStore = createAttachmentStore(join(dataDirectory(), 'attachments'))
    const internalRegistry: InternalCaptureRegistry = {
      list: () => materialPanel ? [materialPanel.getCaptureTarget()] : [],
      get: (id) => id === 'internal:material' ? materialPanel?.getCaptureTarget() : undefined
    }
    const capture = createCaptureRouter(createScreenCapture(createElectronCapturePlatform()), internalRegistry)
    const regionSelector = createRegionSelector(capture, internalRegistry)
    const chatService = createChatService({
      repositories: database.repositories,
      createClient: (config) => createOpenAiCompatibleClient(config),
      readApiKey: () => keyStore.read(),
      readConfig: () => configStore.read(),
      emit: broadcast,
      attachmentStore,
      blocks: [
        createBranchAnchorBlock(),
        createConversationHistoryBlockWithParentChain(
          () => configStore.read().contextStrategy === 'full-chain',
          (id) => attachmentStore.read(id)
        )
      ]
    })

    registerIpcHandlers(
      database.repositories,
      database.filePath,
      {
        keyStore,
        configStore,
        chatService,
        attachmentStore
      },
      capture,
      regionSelector,
      () => windowManager,
      () => materialPanel,
      () => externalTiling
    )

    mainWindow = createWindow()
    windowManager = createWindowModeManager(mainWindow, windowStateFilePath())
    materialPanel = createMaterialPanelController(mainWindow, fileAccess)
    initializeExternalTiling()

    app.on('activate', () => {
      if (mainWindow === null || mainWindow.isDestroyed()) {
        materialPanel?.dispose()
        materialPanel = null
        externalTiling?.disposeNow()
        externalTiling = null
        windowManager?.dispose()
        mainWindow = createWindow()
        windowManager = createWindowModeManager(mainWindow, windowStateFilePath())
        if (materialFileAccess !== null) {
          materialPanel = createMaterialPanelController(mainWindow, materialFileAccess)
        }
        initializeExternalTiling()
      } else {
        windowManager?.showAndFocus()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (tilingDisposeStarted || externalTiling === null) return
  event.preventDefault()
  tilingDisposeStarted = true
  const service = externalTiling
  externalTiling = null
  void service.dispose().finally(() => app.quit())
})

app.on('will-quit', () => {
  if (externalTilingPoll !== null) clearInterval(externalTilingPoll)
  externalTilingPoll = null
  externalTiling = null
  windowManager?.dispose()
  materialPanel?.dispose()
  materialPanel = null
  materialFileAccess?.dispose()
  materialFileAccess = null
  database?.close()
  database = null
})
