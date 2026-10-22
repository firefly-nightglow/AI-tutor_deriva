import { app, BrowserWindow, screen } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { createExternalTilingController } from '../src/main/tiling/controller'
import { createWin32ExternalTilingAdapter } from '../src/main/tiling/win32'
import { visibleBoundsMatch } from '../src/main/tiling/win32-geometry'

const isFixture = process.argv.includes('--fixture')
const fixtureTitle = 'Deriva tiling smoke fixture'

function fixture(): void {
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      title: fixtureTitle,
      x: 90,
      y: 90,
      width: 760,
      height: 560,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await window.loadURL(
      'data:text/html,<body style="background:%23eef6ff;font:22px sans-serif;padding:32px">Deriva window fixture</body>'
    )
    process.send?.({ ready: true })
    process.on('message', (message) => {
      if (message === 'close') app.quit()
    })
  })
}

async function waitFor<T>(read: () => T | null, label: string, timeout = 10000): Promise<T> {
  const deadline = Date.now() + timeout
  do {
    const value = read()
    if (value !== null) return value
    await new Promise((resolve) => setTimeout(resolve, 30))
  } while (Date.now() < deadline)
  throw new Error(label)
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'deriva-external-tiling-smoke-'))
  app.setPath('userData', join(directory, 'user-data'))
  let child: ChildProcess | null = null
  let controller: ReturnType<typeof createExternalTilingController> | null = null
  try {
    await app.whenReady()
    const adapter = createWin32ExternalTilingAdapter()
    controller = createExternalTilingController({
      adapter,
      stateFilePath: join(directory, 'external-tiling.json')
    })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    child = spawn(process.execPath, [__filename, '--fixture'], {
      env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: false
    })
    let ready = false
    child.on('message', (message) => {
      if (typeof message === 'object' && message !== null && 'ready' in message) ready = true
    })
    await waitFor(() => (ready ? true : null), 'fixture-ready-timeout', 15000)

    const target = await waitFor(
      () =>
        controller
          ?.listWindows()
          .find((window) => window.identity.pid === child?.pid && window.title === fixtureTitle) ??
        null,
      'fixture-window-not-found'
    )
    const original = adapter.read(target.identity)
    const display = screen.getPrimaryDisplay()
    const workArea = screen.dipToScreenRect(null, display.workArea)
    const physicalWorkArea = {
      left: workArea.x,
      top: workArea.y,
      right: workArea.x + workArea.width,
      bottom: workArea.y + workArea.height
    }
    const drawerWidth = Math.round(440 * display.scaleFactor)
    const drawerFrame = {
      displayId: display.id,
      edge: 'right' as const,
      workArea: physicalWorkArea,
      bounds: {
        left: physicalWorkArea.right - drawerWidth,
        top: physicalWorkArea.top,
        right: physicalWorkArea.right,
        bottom: physicalWorkArea.bottom
      },
      scaleFactor: display.scaleFactor
    }

    controller.updateDrawer(drawerFrame)
    const active = controller.selectWindow(target.identity)
    assert.equal(active.status, 'active')
    assert.ok(active.expectedBounds)
    assert.ok(visibleBoundsMatch(adapter.read(target.identity).visibleBounds, active.expectedBounds))

    const adjustedWidth = Math.round(560 * display.scaleFactor)
    controller.updateDrawer({
      ...drawerFrame,
      bounds: {
        ...drawerFrame.bounds,
        left: physicalWorkArea.right - adjustedWidth
      }
    })
    assert.ok(
      controller
        .getState()
        .expectedBounds &&
        visibleBoundsMatch(
          adapter.read(target.identity).visibleBounds,
          controller.getState().expectedBounds!
        )
    )

    controller.stop()
    await new Promise((resolve) => setTimeout(resolve, 180))
    assert.ok(visibleBoundsMatch(adapter.read(target.identity).visibleBounds, original.visibleBounds))
    assert.equal(controller.getState().status, 'idle')
    console.log('PASS external tiling production adapter')
  } finally {
    controller?.dispose()
    if (child?.connected) child.send('close')
    if (child !== null && child.exitCode === null) child.kill()
    rmSync(directory, { recursive: true, force: true })
  }
}

if (isFixture) {
  fixture()
} else {
  main()
    .then(() => app.quit())
    .catch((error) => {
      console.error('FAIL external tiling production adapter', error)
      app.exit(1)
    })
}
