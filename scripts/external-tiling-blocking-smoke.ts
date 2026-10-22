import { app, BrowserWindow, screen } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createExternalTilingService } from '../src/main/tiling/service'

const isFixture = process.argv.includes('--fixture')
const title = 'Deriva stalled tiling fixture'
const root = resolve('node_modules/.cache/deriva-external-tiling-blocking')

function fixture(): void {
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      title,
      x: 150,
      y: 150,
      width: 820,
      height: 620,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await window.loadURL(
      'data:text/html,<body style="background:%23edf4ff;font:22px sans-serif;padding:32px">Stalled window fixture</body>'
    )
    process.send?.({ ready: true })
    process.on('message', (message) => {
      if (message === 'stall') {
        process.send?.({ stalling: true })
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1800)
        process.send?.({ resumed: true })
      }
      if (message === 'close') app.quit()
    })
  })
}

async function waitFor<T>(
  read: () => T | null | Promise<T | null>,
  label: string,
  timeout = 10000
): Promise<T> {
  const deadline = Date.now() + timeout
  do {
    const value = await read()
    if (value !== null) return value
    await new Promise((done) => setTimeout(done, 20))
  } while (Date.now() < deadline)
  throw new Error(label)
}

async function main(): Promise<void> {
  mkdirSync(root, { recursive: true })
  const profile = mkdtempSync(join(tmpdir(), 'deriva-tiling-blocking-'))
  app.setPath('userData', profile)
  let child: ChildProcess | null = null
  try {
    await app.whenReady()
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    child = spawn(process.execPath, [__filename, '--fixture'], {
      env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: false
    })
    let ready = false
    let stalling = false
    let resumed = false
    child.on('message', (message) => {
      if (typeof message !== 'object' || message === null) return
      if ('ready' in message) ready = true
      if ('stalling' in message) stalling = true
      if ('resumed' in message) resumed = true
    })
    await waitFor(() => (ready ? true : null), 'fixture-ready-timeout', 15000)
    const service = createExternalTilingService({
      workerPath: join(__dirname, 'tiling-worker.js'),
      stateFilePath: join(profile, 'external-tiling.json')
    })
    const target = await waitFor(
      async () => {
        const windows = await service.listWindows()
        return windows.find(
          (window) => window.identity.pid === child?.pid && window.title === title
        ) ?? null
      },
      'fixture-window-timeout'
    )
    const display = screen.getPrimaryDisplay()
    const workArea = screen.dipToScreenRect(null, display.workArea)
    const drawerWidth = Math.round(440 * display.scaleFactor)
    service.updateDrawer({
      displayId: display.id,
      edge: 'right',
      workArea: {
        left: workArea.x,
        top: workArea.y,
        right: workArea.x + workArea.width,
        bottom: workArea.y + workArea.height
      },
      bounds: {
        left: workArea.x + workArea.width - drawerWidth,
        top: workArea.y,
        right: workArea.x + workArea.width,
        bottom: workArea.y + workArea.height
      },
      scaleFactor: display.scaleFactor
    })

    child.send('stall')
    await waitFor(() => (stalling ? true : null), 'fixture-stall-timeout')
    await new Promise((done) => setTimeout(done, 100))

    const scheduledAt = performance.now()
    let timerFiredAt = 0
    const timer = new Promise<void>((done) => {
      setTimeout(() => {
        timerFiredAt = performance.now()
        done()
      }, 10)
    })
    const callStartedAt = performance.now()
    let error: string | null = null
    const pending = service.selectWindow(target.identity).catch((cause) => {
      error = cause instanceof Error ? cause.message : String(cause)
      return null
    })
    await timer
    const dispatchFinishedAt = performance.now()
    await pending
    const workerFinishedAt = performance.now()
    await waitFor(() => (resumed ? true : null), 'fixture-resume-timeout', 7000)

    const result = {
      dispatchMs: Math.round(dispatchFinishedAt - callStartedAt),
      workerCallMs: Math.round(workerFinishedAt - callStartedAt),
      eventLoopBlockMs: Math.round(timerFiredAt - scheduledAt - 10),
      thresholdMs: 100,
      exceeded: timerFiredAt - scheduledAt - 10 > 100,
      error
    }
    writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2))
    console.log(`RESULT ${JSON.stringify(result)}`)
    await service.dispose()
  } finally {
    if (child?.connected) child.send('close')
    if (child !== null && child.exitCode === null) child.kill()
    rmSync(profile, { recursive: true, force: true })
  }
}

if (isFixture) {
  fixture()
} else {
  main()
    .then(() => app.quit())
    .catch((cause) => {
      console.error('FAIL external tiling blocking measurement', cause)
      app.exit(1)
    })
}
