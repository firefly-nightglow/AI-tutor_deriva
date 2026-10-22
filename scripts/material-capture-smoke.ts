import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { createMaterialFileAccess, registerMaterialScheme } from '../src/main/material/protocol'
import { createMaterialPanelController } from '../src/main/material/panel'
import { createCaptureRouter } from '../src/main/capture/router'
import { createScreenCapture } from '../src/main/capture/screen-capture'
import { createRegionSelector } from '../src/main/capture/region-selector'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'
import type { InternalCaptureRegistry } from '../src/main/capture/types'

const root = resolve('node_modules/.cache/deriva-material-capture-smoke')
mkdirSync(root, { recursive: true })
app.setPath('userData', join(root, 'profile'))
if (process.env.DERIVA_SMOKE_SCALE) app.commandLine.appendSwitch('force-device-scale-factor', process.env.DERIVA_SMOKE_SCALE)
registerMaterialScheme()

async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error('Smoke condition timed out')
}

async function run(): Promise<void> {
  await app.whenReady()
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end('<title>Capture fixture</title><style>body{margin:0;background:#fff}#marker{position:absolute;left:80px;top:70px;width:100px;height:80px;background:rgb(220,20,40)}</style><div id="marker"></div>')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const window = new BrowserWindow({ width: 1000, height: 800, show: true })
  await window.loadURL('data:text/html,<h1>Conversation remains available</h1>')
  let hidden = 0
  const hide = window.hide.bind(window)
  window.hide = () => { hidden++; hide() }
  const access = createMaterialFileAccess(join(root, 'files.json'))
  const panel = createMaterialPanelController(window, access)
  const registry: InternalCaptureRegistry = {
    list: () => [panel.getCaptureTarget()],
    get: (id) => id === 'internal:material' ? panel.getCaptureTarget() : undefined
  }
  let desktopCalls = 0
  const desktop = createScreenCapture({
    getSources: async () => { desktopCalls++; throw new Error('Desktop capture must not be used') },
    getOwnWindows: () => [], getOwnSourceIds: () => [], getAllDisplays: () => [],
    getPrimaryDisplay: () => { throw new Error('No desktop display required') }
  })
  const capture = createCaptureRouter(desktop, registry)
  const selector = createRegionSelector(capture, registry)
  ipcMain.handle(IPC_CHANNELS.captureRegionInit, (_event, id) => selector.init(id))
  ipcMain.handle(IPC_CHANNELS.captureRegionCommit, (_event, id, rect) => selector.select(id, rect))
  ipcMain.handle(IPC_CHANNELS.captureRegionCancel, () => selector.cancel())
  panel.setBounds({ x: 20, y: 80, width: 500, height: 500 })
  panel.open(`http://127.0.0.1:${port}/`)
  const view = window.contentView.children.at(-1) as Electron.WebContentsView
  await until(() => !panel.getCaptureTarget().unavailableReason?.())
  for (const [factor, bounds] of [
    [1, { x: 20, y: 80, width: 500, height: 500 }],
    [0.5, { x: 20, y: 80, width: 350, height: 480 }],
    [1.5, { x: 10, y: 300, width: 650, height: 300 }]
  ] as const) {
    panel.setBounds(bounds)
    await panel.setZoom(factor)
    await new Promise((done) => setTimeout(done, 150))
    panel.setVisible(false) // The actual screenshot modal hides the native view in exactly this way.
    const full = await capture.captureSource('internal:material', { keepOriginal: true })
    assert.ok(full.original && full.original.width >= bounds.width)
    const marker = await view.webContents.executeJavaScript(`(() => {const r=document.querySelector('#marker').getBoundingClientRect();return {x:r.x+10,y:r.y+10,width:r.width-20,height:r.height-20,vw:innerWidth,vh:innerHeight}})()`)
    const selection = selector.start('internal:material')
    await until(() => BrowserWindow.getAllWindows().some((item) => item !== window && !item.isDestroyed()))
    const overlay = BrowserWindow.getAllWindows().find((item) => item !== window)!
    await until(async () => !overlay.webContents.isLoading() &&
      !!await overlay.webContents.executeJavaScript('document.querySelector(".region-overlay__image")?.complete'))
    const actualBounds = overlay.getBounds()
    const intendedBounds = panel.getCaptureTarget().getBounds!()
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      assert.ok(Math.abs(actualBounds[key] - intendedBounds[key]) <= 3, 'Windows DIP bounds rounding exceeded tolerance')
    }
    // The same CSS-to-image ratio used by the real Pointer Events UI, including page zoom and DPI.
    const rect = { x: Math.round(marker.x * full.original.width / marker.vw),
      y: Math.round(marker.y * full.original.height / marker.vh),
      width: Math.round(marker.width * full.original.width / marker.vw),
      height: Math.round(marker.height * full.original.height / marker.vh) }
    const init = selector.init('-1')!
    assert.equal(init.imageWidth, full.original.width)
    const overlayImage = await overlay.webContents.capturePage()
    if (process.env.DERIVA_SMOKE_CAPTURE === '1') writeFileSync(join(root, `overlay-${factor}.png`), overlayImage.toPNG())
    const viewport = await overlay.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})')
    const x = Math.round(marker.x * viewport.width / marker.vw)
    const y = Math.round(marker.y * viewport.height / marker.vh)
    const right = Math.round((marker.x + marker.width) * viewport.width / marker.vw)
    const bottom = Math.round((marker.y + marker.height) * viewport.height / marker.vh)
    overlay.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    await new Promise((done) => setTimeout(done, 50))
    overlay.webContents.sendInputEvent({ type: 'mouseMove', x: right, y: bottom, button: 'left' })
    overlay.webContents.sendInputEvent({ type: 'mouseUp', x: right, y: bottom, button: 'left', clickCount: 1 })
    const result = await selection
    assert.ok(result?.original)
    assert.ok(Math.abs(result.original.width - rect.width) <= 3)
    assert.ok(Math.abs(result.original.height - rect.height) <= 3)
    const decoded = nativeImage.createFromDataURL(result.original.dataUrl)
    const pixel = decoded.toBitmap()
    assert.ok(pixel[2] > 180 && pixel[0] < 80 && pixel[1] < 70, `Crop missed the red marker: ${pixel.subarray(0, 4).toString('hex')}`)
    assert.equal(window.isVisible(), true)
    panel.setVisible(true)
    console.log('INTERNAL-CAPTURE', JSON.stringify({ factor, bounds, physical: full.original.width, rect }))
  }
  assert.equal(hidden, 0)
  assert.equal(desktopCalls, 0)
  panel.close()
  const unavailable = await capture.listSources({ types: ['internal'] })
  assert.ok(unavailable[0].unavailableReason?.includes('未打开'))
  await assert.rejects(capture.captureSource('internal:material'), /未打开/)
  panel.dispose()
  access.dispose()
  window.destroy()
  server.close()
  console.log('PASS: native pixels, zoom, resizing, hidden-view modal, region overlay, no desktop capture or main-window hide')
}

run().then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1) })
