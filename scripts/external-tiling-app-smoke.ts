import { app, BrowserWindow, screen } from 'electron'
import koffi from 'koffi'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { strict as assert } from 'node:assert'

const isFixture = process.argv.includes('--fixture')
const fixtureTitle = 'Deriva external tiling app fixture'
const root = resolve('node_modules/.cache/deriva-external-tiling-app-smoke')

function nativeHitTest(window: BrowserWindow, x: number, y: number): number {
  const user32 = koffi.load('user32.dll')
  const hitTest = user32.func(
    'intptr_t __stdcall SendMessageTimeoutW(void *hwnd, uint32 message, uintptr_t wparam, intptr_t lparam, uint32 flags, uint32 timeout, _Out_ uintptr_t *result)'
  )
  const content = window.getContentBounds()
  const point = screen.dipToScreenPoint({ x: content.x + x, y: content.y + y })
  const result = [0]
  const packedPoint = BigInt(((point.y & 0xffff) << 16) | (point.x & 0xffff))
  assert.ok(hitTest(window.getNativeWindowHandle().readBigUInt64LE(), 0x84, 0, packedPoint, 2, 1000, result))
  return Number(result[0])
}

function fixture(): void {
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      title: fixtureTitle,
      x: 100,
      y: 100,
      width: 780,
      height: 560,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await window.loadURL(
      'data:text/html,<body style="background:%23f4f7fb;font:22px sans-serif;padding:32px">External learning app fixture</body>'
    )
    process.send?.({ ready: true })
    process.on('message', (message) => {
      if (message === 'close') app.quit()
    })
  })
}

async function until(
  check: () => boolean | Promise<boolean>,
  label: string,
  timeout = 15000
): Promise<void> {
  const deadline = Date.now() + timeout
  do {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 40))
  } while (Date.now() < deadline)
  throw new Error(`timed out: ${label}`)
}

async function run(): Promise<void> {
  mkdirSync(root, { recursive: true })
  const profile = join(root, `profile-${process.pid}`)
  app.setPath('userData', profile)
  require(join(__dirname, 'index.js'))
  if (!app.hasSingleInstanceLock()) throw new Error('isolated profile already in use')
  const watchdog = setTimeout(() => {
    console.error('FAIL external tiling application flow watchdog')
    process.exit(1)
  }, 90000)
  let child: ChildProcess | null = null
  let server: Server | null = null
  try {
    await app.whenReady()
    const main = (): BrowserWindow | undefined =>
      BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('/renderer/index.html')
      )
    await until(() => main() !== undefined, 'main window')
    const window = main()!
    const js = <T = unknown>(code: string): Promise<T> =>
      window.webContents.executeJavaScript(code)
    await until(
      () => js('!!window.api && !!window.api.externalTiling && !!document.querySelector("h1")'),
      'renderer bridge'
    )
    console.log('stage renderer-ready')

    server = createServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 404
        response.end()
        return
      }
      for await (const _chunk of request) {
        // Consume the local fixture request before replying with a deterministic stream.
      }
      response.setHeader('content-type', 'text/event-stream')
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'external tiling stream ok' }, finish_reason: null }] })}\n\n`
      )
      response.end('data: [DONE]\n\n')
    })
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done))
    const port = (server.address() as { port: number }).port
    const conversationId = await js<string>(`(async()=>{
      await window.api.llm.saveKey('isolated-tiling-smoke');
      await window.api.llm.saveConfig({
        baseUrl:'http://127.0.0.1:${port}',
        model:'deepseek-flash',
        contextStrategy:'excerpt',
        summarySource:'local'
      });
      return (await window.api.conversations.create({title:'Tiling streaming fixture'})).id
    })()`)

    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    child = spawn(process.execPath, [__filename, '--fixture'], {
      env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      windowsHide: false
    })
    let fixtureReady = false
    child.on('message', (message) => {
      if (typeof message === 'object' && message !== null && 'ready' in message) {
        fixtureReady = true
      }
    })
    await until(() => fixtureReady, 'fixture ready')
    console.log('stage fixture-ready')
    const initialWindows = await js<
      Array<{
        identity: { hwnd: string; pid: number; started: string }
        bounds: { left: number; top: number; right: number; bottom: number }
      }>
    >('window.api.externalTiling.listWindows()')
    const initial = initialWindows.find((item) => item.identity.pid === child?.pid)
    assert.ok(initial)
    await js(`window.api.windowControl.setMode('floating')`)
    await until(
      () => js(`!![...document.querySelectorAll('button')].find(button=>button.textContent==='并排应用')`),
      'tiling entry'
    )
    console.log('stage floating-picker-entry')
    await js(
      `[...document.querySelectorAll('button')].find(button=>button.textContent==='并排应用').click()`
    )
    await until(
      () =>
        js(
          `!![...document.querySelectorAll('.external-tiling__window')].find(button=>button.textContent.includes(${JSON.stringify(fixtureTitle)}))`
        ),
      'fixture picker item'
    )
    console.log('stage picker-loaded')
    const pickerLayout = await js<{
      innerWidth: number
      panelLeft: number
      panelRight: number
    }>(`(() => {
      const panel = document.querySelector('.external-tiling__panel').getBoundingClientRect()
      return { innerWidth, panelLeft:panel.left, panelRight:panel.right }
    })()`)
    assert.ok(pickerLayout.panelLeft >= 8)
    assert.ok(pickerLayout.panelRight <= pickerLayout.innerWidth - 8)
    writeFileSync(
      join(root, 'external-tiling-picker.png'),
      (await window.webContents.capturePage()).toPNG()
    )
    await js(
      `[...document.querySelectorAll('.external-tiling__window')].find(button=>button.textContent.includes(${JSON.stringify(fixtureTitle)})).click()`
    )
    await until(
      () => js(`window.api.externalTiling.getState().then(state=>state.status==='active')`),
      'tiling activation'
    )
    const active = await js<{
      status: string
      selected: { identity: { hwnd: string; pid: number; started: string } } | null
      expectedBounds: { right: number } | null
    }>(`window.api.externalTiling.getState()`)
    assert.equal(active.status, 'active')
    assert.ok(active.selected)
    console.log('stage selected')
    const limitedWindowState = await js<{ maxDrawerWidth: number | null }>(
      `window.api.windowControl.getState()`
    )
    assert.ok(limitedWindowState.maxDrawerWidth !== null)

    async function verifyDrawerEdge(): Promise<void> {
      const probe = await js<{
        x: number; headerY: number; bodyY: number; hits: boolean[]; appRegion: string
      }>(`(() => {
        const handle = document.querySelector('.drawer-resize-handle')
        const rect = handle.getBoundingClientRect()
        const header = document.querySelector('.app__header').getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const headerY = header.height / 2
        const bodyY = header.bottom + 80
        return { x, headerY, bodyY,
          appRegion: getComputedStyle(handle).getPropertyValue('-webkit-app-region'),
          hits: [headerY, bodyY, innerHeight - 20].flatMap(y =>
            [rect.left + 1, x, rect.right - 1].map(px =>
              document.elementFromPoint(px, y) === handle))
        }
      })()`)
      assert.ok(probe.hits.every(Boolean), 'entire drawer edge must receive pointer events')
      assert.equal(probe.appRegion, 'no-drag')
      // Native hit testing catches title-bar drag regions that DOM hit testing cannot see.
      assert.equal(nativeHitTest(window, probe.x, probe.headerY), 1, 'grip must be HTCLIENT, not HTCAPTION')
      assert.equal(nativeHitTest(window, probe.x, probe.bodyY), 1)

      window.focus()
      await until(() => window.isFocused(), 'drawer focus for pointer input')
      for (let run = 0; run < 5; run++) {
        const state = await js<{ edge: string; drawerWidth: number }>('window.api.windowControl.getState()')
        const gripX = await js<number>(`(() => { const rect = document.querySelector('.drawer-resize-handle').getBoundingClientRect(); return rect.left + rect.width / 2 })()`)
        const content = window.getContentBounds()
        const screenX = content.x + gripX
        const y = run % 2 === 0 ? probe.headerY : probe.bodyY
        const direction = state.edge === 'right' ? -1 : 1
        const delta = run % 2 === 0 ? 40 : -40
        const globalY = content.y + y
        window.webContents.sendInputEvent({ type: 'mouseMove', x: gripX, y, globalX: screenX, globalY })
        window.webContents.sendInputEvent({ type: 'mouseDown', x: gripX, y, globalX: screenX, globalY, button: 'left', clickCount: 1 })
        for (let step = 1; step <= 20; step++) {
          const globalX = screenX + direction * delta * step / 20
          const x = Math.round(globalX - window.getContentBounds().x)
          window.webContents.sendInputEvent({ type: 'mouseMove', x, y, globalX, globalY, modifiers: ['leftButtonDown'] })
          await new Promise((done) => setTimeout(done, 40))
          assert.equal(await js(`window.api.externalTiling.getState().then(state=>state.status)`), 'active')
        }
        const endX = Math.round(screenX + direction * delta - window.getContentBounds().x)
        window.webContents.sendInputEvent({ type: 'mouseUp', x: endX, y, globalX: screenX + direction * delta, globalY, button: 'left', clickCount: 1 })
        await until(
          () => js<{ drawerWidth: number }>('window.api.windowControl.getState()')
            .then(next => Math.abs(next.drawerWidth - state.drawerWidth - delta) <= 2),
          'pointer-driven drawer resize'
        )
        assert.equal(await js(`window.api.externalTiling.getState().then(state=>state.status)`), 'active')
      }
      console.log('stage drawer-edge-drag', await js(`window.api.windowControl.getState().then(state=>state.edge)`))
    }

    await verifyDrawerEdge()

    await js(
      `window.api.llm.startChat({conversationId:${JSON.stringify(conversationId)},content:'Verify streaming while tiled'})`
    )
    await until(
      () =>
        js<Array<{ role: string; status: string; content: string }>>(
          `window.api.messages.listByConversation(${JSON.stringify(conversationId)})`
        ).then((messages) =>
          messages.some(
            (message) =>
              message.role === 'assistant' &&
              message.status === 'complete' &&
              message.content.includes('stream ok')
          )
        ),
      'streaming completion'
    )
    console.log('stage streaming-complete')

    console.log('stage initial-layout')

    await js(`window.api.windowControl.setDrawerWidth(520, false)`)
    await until(
      () =>
        js<{ expectedBounds: { right: number } | null }>(
          `window.api.externalTiling.getState()`
        ).then(
          (state) =>
            state.expectedBounds !== null &&
            active.expectedBounds !== null &&
            state.expectedBounds.right < active.expectedBounds.right
        ),
      'drawer-follow layout'
    )
    console.log('stage drawer-follow')

    await new Promise((done) => setTimeout(done, 200))
    const area = screen.getDisplayMatching(window.getBounds()).workArea
    window.setPosition(area.x, area.y)
    // setPosition does not emit the Windows user-move completion event.
    window.emit('moved')
    await until(() => js(`window.api.windowControl.getState().then(state=>state.edge==='left')`), 'left drawer docking')
    await verifyDrawerEdge()

    await js(`window.api.windowControl.collapse()`)
    await until(
      () => js(`window.api.externalTiling.getState().then(state=>state.status==='paused')`),
      'collapse pause'
    )
    console.log('stage paused')
    await new Promise((done) => setTimeout(done, 180))

    await js(`window.api.windowControl.expand()`)
    await until(
      () => js(`window.api.externalTiling.getState().then(state=>state.status==='active')`),
      'expand retile'
    )
    console.log('stage resumed')
    await js(`window.api.externalTiling.stop()`)
    await until(
      () => js(`window.api.externalTiling.getState().then(state=>state.status==='idle')`),
      'stop'
    )
    console.log('stage stopped')
    const releasedWindowState = await js<{ maxDrawerWidth: number | null }>(
      `window.api.windowControl.getState()`
    )
    assert.equal(releasedWindowState.maxDrawerWidth, null)
    const restored = (
      await js<
        Array<{
          identity: { hwnd: string }
          bounds: { left: number; top: number; right: number; bottom: number }
        }>
      >('window.api.externalTiling.listWindows()')
    ).find((item) => item.identity.hwnd === initial.identity.hwnd)
    assert.ok(restored)
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      assert.ok(Math.abs(restored.bounds[edge] - initial.bounds[edge]) <= 2)
    }
    const screenshot = await window.webContents.capturePage()
    writeFileSync(join(root, 'external-tiling.png'), screenshot.toPNG())
    console.log('PASS external tiling application flow')
  } finally {
    if (child?.connected) child.send('close')
    if (child !== null && child.exitCode === null) child.kill()
    if (server !== null) await new Promise<void>((done) => server!.close(() => done()))
    clearTimeout(watchdog)
  }
}

if (isFixture) {
  fixture()
} else {
  run()
    .then(() => app.quit())
    .catch((error) => {
      console.error('FAIL external tiling application flow', error)
      app.exit(1)
    })
}
