import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, nativeTheme, safeStorage, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ChatStreamEvent } from '../shared/types'
import { openDatabase, type AppDatabase } from './db'
import { attachContextMenu } from './context-menu'
import { createAttachmentStore } from './attachments'
import { registerIpcHandlers } from './ipc'
import {
  createApiKeyStore,
  createBranchAnchorBlock,
  createChatService,
  createConversationHistoryBlockWithParentChain,
  createLlmConfigStore,
  createOpenAiCompatibleClient
} from './llm'

let database: AppDatabase | null = null

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

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    // Matches the renderer's token background so launching in dark mode does not flash white.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15181d' : '#f5f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  attachContextMenu(mainWindow)

  if (is.dev) {
    // Dev-only smoke check: proves the renderer actually mounted React and that the preload
    // bridge reached the page, instead of silently showing a blank window.
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const report = await mainWindow.webContents.executeJavaScript(
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
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
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.deriva.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const filePath = databaseFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  database = openDatabase(filePath)

  const keyStore = createApiKeyStore(join(dataDirectory(), 'api-key.json'), safeStorage)
  const configStore = createLlmConfigStore(join(dataDirectory(), 'llm-config.json'))
  const attachmentStore = createAttachmentStore(join(dataDirectory(), 'attachments'))
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

  registerIpcHandlers(database.repositories, database.filePath, {
    keyStore,
    configStore,
    chatService,
    attachmentStore
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  database?.close()
  database = null
})
