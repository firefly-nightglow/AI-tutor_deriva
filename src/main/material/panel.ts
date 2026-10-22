import { basename } from 'node:path'
import {
  BrowserWindow,
  dialog,
  session,
  shell,
  WebContentsView,
  type Rectangle
} from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type {
  MaterialLocalFile,
  MaterialPanelRect,
  MaterialPanelState
} from '../../shared/types'
import type { MaterialFileAccess } from './protocol'
import { minimumMaterialZoom, zoomMaterial } from './zoom'
import { createWebContentsCaptureTarget } from '../capture/internal-capture'
import { CaptureError, type InternalCaptureTarget } from '../capture/types'

const MATERIAL_PARTITION = 'persist:deriva-material'

const START_PAGE = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>资料面板</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
    <style>
      html, body { height: 100%; margin: 0; }
      body {
        display: grid; place-items: center; background: #f5f6f8; color: #5b6472;
        font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
      }
      main { max-width: 420px; padding: 32px; text-align: center; }
      h1 { margin: 0 0 10px; font-size: 18px; color: #39404b; }
      p { margin: 0; font-size: 13px; line-height: 1.7; }
    </style>
  </head>
  <body>
    <main>
      <h1>资料面板</h1>
      <p>在上方输入网址，或点击“文件”打开本地 PDF、代码、图片或视频。</p>
    </main>
  </body>
</html>`

const CLOSED_STATE: MaterialPanelState = {
  status: 'closed',
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  error: null
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isMaterialUrl(value: string): boolean {
  return value.startsWith('deriva-material://')
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (isHttpUrl(trimmed) || isMaterialUrl(trimmed)) return trimmed
  return `https://${trimmed}`
}

function startPageUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(START_PAGE)}`
}

export interface MaterialPanelController {
  open(url: string | null): MaterialPanelState
  close(): void
  navigate(url: string): MaterialPanelState
  reload(): void
  goBack(): void
  goForward(): void
  stop(): void
  setZoom(factor: number): Promise<void>
  pickFile(): Promise<MaterialLocalFile | null>
  setBounds(rect: MaterialPanelRect): void
  setVisible(visible: boolean): void
  getState(): MaterialPanelState
  getCaptureTarget(): InternalCaptureTarget
  dispose(): void
}

/** Owns the sandboxed WebContentsView and the explicit local-file allowlist. */
export function createMaterialPanelController(
  window: BrowserWindow,
  fileAccess: MaterialFileAccess
): MaterialPanelController {
  const materialSession = session.fromPartition(MATERIAL_PARTITION)
  fileAccess.handle(materialSession)
  materialSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  materialSession.setPermissionCheckHandler(() => false)
  materialSession.setSpellCheckerEnabled(false)

  let view: WebContentsView | null = null
  let bounds: Rectangle | null = null
  let userVisible = true
  let state: MaterialPanelState = { ...CLOSED_STATE }
  let zoom = 1
  let minZoom = 1
  let lastNotification = ''
  let visible: boolean | null = null
  let revision = 0
  let captureReady = false

  function captureUnavailable(): string | undefined {
    if (view === null || view.webContents.isDestroyed()) return '资料面板未打开，请先打开一份学习资料'
    if (state.status === 'error') return '资料加载失败，请重试或更换资料'
    if (state.status !== 'ready' || !captureReady) return '资料正在加载，请稍后重试'
    if (!isHttpUrl(state.url) && !isMaterialUrl(state.url)) return '请先在资料面板中打开网页或文件'
    if (window.isDestroyed() || !window.isVisible() || window.isMinimized() ||
      bounds === null || bounds.width <= 0 || bounds.height <= 0) return '资料面板当前不可见，请展开窗口后重试'
    return undefined
  }

  function notify(): void {
    state.zoom = zoom
    state.minZoom = minZoom
    const serialized = JSON.stringify(state)
    if (serialized === lastNotification) return
    lastNotification = serialized
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.materialPanelStateChanged, state)
    }
  }

  function applyVisibility(): void {
    const next = userVisible && state.status !== 'error'
    if (next === visible || view === null) return
    view.setVisible(next)
    visible = next
  }

  function openExternal(url: string): void {
    if (isHttpUrl(url)) {
      void shell.openExternal(url).catch((error) => {
        console.warn('[deriva] failed to open material link externally:', error)
      })
    }
  }

  function updateNavigationState(): void {
    if (view === null || view.webContents.isDestroyed()) return
    state.url = view.webContents.getURL()
    state.title = view.webContents.getTitle()
    state.canGoBack = view.webContents.navigationHistory.canGoBack()
    state.canGoForward = view.webContents.navigationHistory.canGoForward()
  }

  function ensureView(): WebContentsView {
    if (view !== null && !view.webContents.isDestroyed()) return view

    const created = new WebContentsView({
      webPreferences: {
        session: materialSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false
      }
    })
    created.setBackgroundColor('#ffffff')
    window.contentView.addChildView(created)
    if (bounds !== null) created.setBounds(bounds)
    view = created
    visible = null

    const contents = created.webContents
    contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (view !== created || !isMainFrame || isInPlace) return
      revision++
      captureReady = false
      zoom = 1
      minZoom = 1
      contents.setZoomFactor(1)
      notify()
    })
    contents.on('dom-ready', () => {
      if (view !== created) return
      captureReady = true
      const url = contents.getURL()
      void minimumMaterialZoom(contents).then((minimum) => {
        if (view !== created || contents.isDestroyed() || contents.getURL() !== url) return
        minZoom = minimum
        notify()
      }).catch(() => {})
      if (zoom !== 1) void zoomMaterial(contents, zoom).catch(() => {})
      if (isHttpUrl(contents.getURL())) {
        // Some desktop sites hide horizontal overflow even when their minimum width exceeds the slot.
        void contents.insertCSS('html { overflow-x: auto !important; } body { overflow-x: visible !important; }').catch(() => {})
      }
    })
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      // Explicit address-bar loads bypass this event; page links may only stay on their site.
      if (isHttpUrl(url) && isHttpUrl(contents.getURL()) &&
        new URL(url).origin === new URL(contents.getURL()).origin) return
      event.preventDefault()
      openExternal(url)
    })
    contents.on('will-redirect', (event, url) => {
      if (isHttpUrl(url) || isMaterialUrl(url)) return
      event.preventDefault()
      openExternal(url)
    })
    contents.on('did-start-loading', () => {
      if (view !== created) return
      state.status = 'loading'
      state.error = null
      applyVisibility()
      notify()
    })
    contents.on('did-finish-load', () => {
      if (view !== created) return
      state.status = 'ready'
      state.error = null
      updateNavigationState()
      applyVisibility()
      notify()
    })
    contents.on('did-stop-loading', () => {
      if (view !== created) return
      updateNavigationState()
      notify()
    })
    contents.on('did-navigate', () => {
      if (view !== created) return
      if (state.status !== 'error') {
        state.status = 'ready'
        updateNavigationState()
        notify()
      }
    })
    contents.on('did-navigate-in-page', () => {
      if (view !== created) return
      updateNavigationState()
      notify()
    })
    contents.on('page-title-updated', (_event, title) => {
      if (view !== created) return
      state.title = title
      notify()
    })
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (view !== created) return
      if (!isMainFrame || code === -3) return
      state.status = 'error'
      state.error = `${description} (${code})`
      applyVisibility()
      notify()
    })
    contents.on('render-process-gone', (_event, details) => {
      if (view !== created) return
      state.status = 'error'
      state.error = `资料面板进程退出：${details.reason}`
      applyVisibility()
      notify()
    })

    applyVisibility()
    return created
  }

  function load(url: string): void {
    const target = ensureView()
    revision++
    captureReady = false
    state.status = 'loading'
    state.error = null
    applyVisibility()
    notify()
    void target.webContents.loadURL(url).catch((error) => {
      if (view !== target || target.webContents.isDestroyed()) return
      if ((error as { code?: string }).code === 'ERR_ABORTED') return
      state.status = 'error'
      state.error = error instanceof Error ? error.message : String(error)
      applyVisibility()
      notify()
    })
  }

  function open(url: string | null): MaterialPanelState {
    ensureView()
    load(url === null || url.trim() === '' ? startPageUrl() : normalizeUrl(url) ?? startPageUrl())
    return state
  }

  function navigate(url: string): MaterialPanelState {
    const target = normalizeUrl(url)
    if (target !== null) load(target)
    return state
  }

  function close(): void {
    revision++
    if (view !== null) {
      if (!window.isDestroyed()) {
        try {
          window.contentView.removeChildView(view)
        } catch {
          // The window may already be tearing down.
        }
      }
      if (!view.webContents.isDestroyed()) view.webContents.close()
      view = null
    }
    state = { ...CLOSED_STATE }
    visible = null
    zoom = 1
    minZoom = 1
    notify()
  }

  return {
    open,
    close,
    navigate,
    reload() {
      if (view !== null && !view.webContents.isDestroyed()) view.webContents.reload()
    },
    goBack() {
      if (view === null || view.webContents.isDestroyed()) return
      if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
    },
    goForward() {
      if (view === null || view.webContents.isDestroyed()) return
      if (view.webContents.navigationHistory.canGoForward()) {
        view.webContents.navigationHistory.goForward()
      }
    },
    stop() {
      if (view !== null && !view.webContents.isDestroyed()) view.webContents.stop()
    },
    async setZoom(factor) {
      if (!Number.isFinite(factor)) return
      const target = view
      if (target === null || target.webContents.isDestroyed()) return
      const url = target.webContents.getURL()
      const minimum = await minimumMaterialZoom(target.webContents)
      if (view !== target || target.webContents.isDestroyed() || target.webContents.getURL() !== url) return
      const next = Math.min(3, Math.max(minimum, factor))
      revision++
      await zoomMaterial(target.webContents, next)
      if (view !== target || target.webContents.isDestroyed() || target.webContents.getURL() !== url) return
      zoom = next
      minZoom = minimum
      notify()
    },
    async pickFile() {
      const result = await dialog.showOpenDialog(window, {
        title: '打开学习资料',
        properties: ['openFile'],
        filters: [
          {
            name: '学习资料',
            extensions: [
              'pdf',
              'txt',
              'md',
              'js',
              'ts',
              'tsx',
              'json',
              'py',
              'c',
              'cpp',
              'h',
              'java',
              'go',
              'rs',
              'css',
              'png',
              'jpg',
              'jpeg',
              'gif',
              'webp',
              'mp4',
              'webm',
              'ogg',
              'mp3',
              'wav'
            ]
          },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const filePath = result.filePaths[0]
      return { url: fileAccess.allow(filePath), name: basename(filePath) }
    },
    setBounds(rect) {
      if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return
      const next = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height))
      }
      if (bounds !== null && next.x === bounds.x && next.y === bounds.y &&
        next.width === bounds.width && next.height === bounds.height) return
      bounds = next
      if (view !== null && !view.webContents.isDestroyed()) view.setBounds(bounds)
    },
    setVisible(visible) {
      userVisible = visible
      applyVisibility()
    },
    getState() {
      return state
    },
    getCaptureTarget() {
      return {
        id: 'internal:material',
        label: `Deriva 资料面板${state.title && !state.url.startsWith('data:') ? ` - ${state.title}` : ''}`,
        isDestroyed: () => window.isDestroyed(),
        unavailableReason: captureUnavailable,
        getBounds() {
          if (!bounds || window.isDestroyed()) return null
          const origin = window.getContentBounds()
          return { ...bounds, x: origin.x + bounds.x, y: origin.y + bounds.y }
        },
        async capturePage() {
          const reason = captureUnavailable()
          if (reason) throw new CaptureError('empty_capture', reason)
          const target = view!
          const version = revision
          const before = JSON.stringify(bounds)
          const image = await createWebContentsCaptureTarget('internal:material', '', target.webContents).capturePage()
          if (target !== view || version !== revision || before !== JSON.stringify(bounds) || captureUnavailable()) {
            throw new CaptureError('empty_capture', '资料已关闭、切换或尺寸改变，请重新截图')
          }
          return image
        }
      }
    },
    dispose() {
      close()
    }
  }
}
