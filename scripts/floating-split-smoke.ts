import { app, BrowserWindow, globalShortcut, screen, nativeImage } from 'electron'
import { createServer, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'

const root = resolve('node_modules/.cache/deriva-floating-split-smoke')
const phase = process.argv.find((arg) => arg.startsWith('--phase='))?.slice(8) ?? 'exercise'
const profile = join(root, 'profile')
const statePath = join(profile, 'deriva-data/window-state.json')
mkdirSync(join(profile, 'deriva-data'), { recursive: true })
app.setPath('userData', profile)
// Only this isolated profile is seeded; the actual application is loaded without test hooks.
if (phase === 'exercise') {
  writeFileSync(statePath, JSON.stringify({ mode: 'normal', normalBounds: { x: 80, y: 60, width: 1100, height: 720 } }))
} else if (phase === 'invalid') {
  writeFileSync(statePath, JSON.stringify({ mode: 'floating', displayId: -999999, normalBounds: { x: -90000, y: -90000, width: 1100, height: 720 } }))
}
if (phase === 'conflict') {
  app.setPath('userData', join(root, 'shortcut-profile'))
  app.whenReady().then(() => {
    process.send?.({ registered: globalShortcut.register('Control+Alt+Shift+F11', () => {}) })
  })
  process.on('disconnect', () => app.quit())
  app.on('will-quit', () => globalShortcut.unregisterAll())
} else require(join(__dirname, 'index.js'))
if (phase !== 'conflict' && phase !== 'second' && !app.hasSingleInstanceLock()) {
  console.error('Isolated smoke profile is already in use')
  app.exit(1)
}
const watchdog = setTimeout(() => { console.error('Smoke exceeded 60s'); app.exit(1) }, 60000)

const boot = performance.now()
const measures: Record<string, unknown> = { phase, electron: process.versions.electron }
// Windows can round fractional DIP work-area edges to the adjacent physical pixel.
const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) <= 1, `${actual} is not within 1 DIP of ${expected}`)
async function until(name: string, check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 15000
  while (performance.now() < deadline) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 40))
  }
  throw new Error(`Timed out: ${name}`)
}

async function run(): Promise<void> {
  await app.whenReady()
  if (!app.hasSingleInstanceLock()) {
    if (phase !== 'second') throw new Error('Another smoke run still owns the isolated profile')
    return
  }
  const main = (): BrowserWindow | undefined => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/renderer/index.html'))
  await until('main window', () => !!main())
  const window = main()!
  const js = <T = any>(code: string): Promise<T> => window.webContents.executeJavaScript(code)
  await until('React and bridge', () => js('!!window.api && !!document.querySelector("h1")'))
  await until('main window shown', () => window.isVisible() && !window.isMinimized())
  measures.readyMs = Math.round(performance.now() - boot)
  const display = screen.getDisplayMatching(window.getBounds())
  measures.display = { workArea: display.workArea, scaleFactor: display.scaleFactor }
  assert.ok((await js<string>('window.api.databasePath()')).startsWith(profile))

  if (phase === 'restore' || phase === 'invalid') {
    const fixture = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'))
    const state = await js('window.api.windowControl.getState()')
    assert.equal(state.mode, phase === 'restore' ? 'floating' : 'normal')
    assert.equal(state.collapsed, false)
    assert.ok(window.isVisible())
    const bounds = window.getBounds()
    assert.ok(screen.getAllDisplays().some(({ workArea: a }) => bounds.x >= a.x - 1 && bounds.y >= a.y - 1 && bounds.x + bounds.width <= a.x + a.width + 1 && bounds.y + bounds.height <= a.y + a.height + 1))
    if (phase === 'restore') {
      assert.equal(state.edge, 'left')
      near(state.drawerWidth, 440)
      near(bounds.height, display.workArea.height)
    }
    const messages = await js(`window.api.messages.listByConversation(${JSON.stringify(fixture.id)})`)
    assert.equal(messages.find((m: any) => m.role === 'assistant')?.content, fixture.answer)
    assert.ok(await js(`(async()=>{const m=(await window.api.messages.listByConversation(${JSON.stringify(fixture.id)})).find(m=>m.id===${JSON.stringify(fixture.imageMessageId)});return (await window.api.attachments.read(JSON.parse(m.attachments)[0].id)).startsWith('data:image/jpeg;base64,')})()`))
    assert.ok(await js(`(async()=> (await window.api.bookmarks.listByConversation(${JSON.stringify(fixture.id)})).length>0)()`))
    if (await js('!!document.querySelector(".material-panel")')) {
      assert.equal(await js('document.querySelector(".material-panel__address input").value'), '')
    }
    measures.restoredHistoryAndAttachment = true
    measures.state = state
    writeFileSync(join(root, `${phase}.json`), JSON.stringify(measures, null, 2))
    console.log('PASS', JSON.stringify(measures))
    return
  }

  assert.equal(phase, 'exercise')
  await js('localStorage.clear()')
  window.webContents.reload()
  await until('reloaded bridge', () => js('!!window.api && !!document.querySelector("h1")'))
  let response: ServerResponse | undefined
  let imageRequests = 0
  const first = '## Learning evidence\n\nThe relation is $Ax=b$.\n\n'
  const last = 'The answer survived layout changes.'
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end('<title>Study fixture</title><h1>Ax = b</h1><div style="height:2200px">Learning material</div>')
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body)
    if (payload.messages.some((m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.image_url))) imageRequests++
    res.setHeader('content-type', 'text/event-stream')
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: first }, finish_reason: null }] })}\n\n`)
    response = res
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  try {
    const port = (server.address() as { port: number }).port
    const title = `SPEC0003-${Date.now()}`
    const id = await js<string>(`(async()=>{
      await window.api.llm.saveKey('isolated-smoke-placeholder');
      await window.api.llm.saveConfig({baseUrl:'http://127.0.0.1:${port}',model:'deepseek-flash',contextStrategy:'excerpt',summarySource:'local'});
      return (await window.api.conversations.create({title:${JSON.stringify(title)}})).id;
    })()`)
    window.webContents.reload()
    await until('test conversation', () => js(`!![...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(title)})`))
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(title)}).click()`)
    await until('composer', () => js('!!document.querySelector("textarea[aria-label=提问]")'))
    const clickText = async (text: string): Promise<void> => {
      await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b)throw Error('Missing command');b.click()})()`)
    }
    const toggleMaterial = async (): Promise<void> => {
      if (await js('!!document.querySelector(".app--floating")')) {
        await js('document.querySelector("[aria-label=更多操作]").click()')
        await clickText(await js('document.querySelector(".material-panel") ? "关闭资料面板" : "资料面板"'))
      } else await clickText(await js('document.querySelector(".material-panel") ? "关闭资料" : "资料面板"'))
    }
    const setDraft = async (value: string): Promise<void> => {
      await js(`(()=>{const e=document.querySelector('textarea[aria-label=提问]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    }
    await toggleMaterial()
    await until('horizontal material layout', () => js('!!document.querySelector(".app__main--split-horizontal")'))
    await js(`window.api.materialPanel.navigate('http://127.0.0.1:${port}/')`)
    // Actual capture/preview/send is covered by material-app-smoke; here the image fixture
    // checks persistence across a separate application process without recapturing the desktop.
    const bitmap = Buffer.alloc(32 * 32 * 4, 255)
    const imageData = `data:image/jpeg;base64,${nativeImage.createFromBitmap(bitmap, { width: 32, height: 32 }).toJPEG(80).toString('base64')}`
    await setDraft('Explain this relation')
    // Send through the mounted composer so the stream subscription and layout state are exercised.
    await js(`(()=>{const form=document.querySelector('textarea[aria-label=提问]').closest('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})()`)
    await until('first stream chunk', () => js('document.body.textContent.includes("Learning evidence")'))
    await setDraft('Unsent draft survives mode switches')
    const timings: number[] = []
    let answer = first
    for (const mode of ['floating', 'normal', 'floating'] as const) {
      const start = performance.now()
      await js(`window.api.windowControl.setMode('${mode}')`)
      await until(`layout ${mode}`, () => js(`document.querySelector('.app').classList.contains('app--floating')===${mode === 'floating'}`))
      timings.push(Math.round(performance.now() - start))
      assert.ok(await js('document.body.textContent.includes("Learning evidence")'))
      assert.equal(await js('document.querySelector("textarea[aria-label=提问]").value'), 'Unsent draft survives mode switches')
      const chunk = `Stream step ${timings.length} (${mode}).\n\n`
      answer += chunk
      response!.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk }, finish_reason: null }] })}\n\n`)
      await until('next chunk displayed after mode switch', () => js(`document.body.textContent.includes(${JSON.stringify(chunk.trim())})`))
    }
    measures.modeSwitchMs = timings
    console.log('CHECK streaming mode switches')
    await js('window.api.windowControl.setDrawerWidth(440,true)')
    near(window.getBounds().height, display.workArea.height)
    near(window.getBounds().width, 440)
    assert.equal(await js('document.querySelector(".drawer-sidebar").classList.contains("is-open")'), false)
    if (!(await js('!!document.querySelector(".material-panel")'))) await toggleMaterial()
    await until('vertical split', () => js('!!document.querySelector(".app__main--split-vertical")'))
    await js(`window.api.materialPanel.navigate('http://127.0.0.1:${port}/')`)
    const targets = await js(`['打开对话侧栏','收起 Deriva','更多操作','最小化窗口','关闭窗口','调整 Deriva 宽度'].map(label=>{const r=document.querySelector('[aria-label="'+label+'"]').getBoundingClientRect();return {label,width:r.width,height:r.height}})`)
    assert.ok(targets.every((r: any) => r.width >= 44 && r.height >= 44))
    measures.hitTargets = targets
    console.log('CHECK hit targets')
    const oldHeight = await js('document.querySelector(".material-panel").getBoundingClientRect().height')
    await js(`(()=>{const e=document.querySelector('.material-splitter'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientY:r.y+r.height/2,pointerId:1}));window.dispatchEvent(new PointerEvent('pointermove',{clientY:r.y+r.height/2+50,pointerId:1}))})()`)
    await until('material ratio changed', () => js(`Math.abs(document.querySelector('.material-panel').getBoundingClientRect().height-${oldHeight})>20`))
    await js('window.dispatchEvent(new PointerEvent("pointerup",{pointerId:1}))')
    await toggleMaterial()
    await toggleMaterial()
    assert.equal(await js('document.querySelector(".material-panel__address input").value'), '')
    await js(`window.api.materialPanel.navigate('http://127.0.0.1:${port}/')`)
    await js('window.api.windowControl.collapse()')
    await until('bubble visible', () => BrowserWindow.getAllWindows().some((w) => w !== window && w.isVisible()))
    assert.equal(window.isVisible(), false)
    const bubble = BrowserWindow.getAllWindows().find((w) => w !== window && w.isVisible())!
    near(bubble.getBounds().width, 64)
    bubble.webContents.sendInputEvent({ type: 'mouseDown', x: 30, y: 30, button: 'left', clickCount: 1 })
    bubble.webContents.sendInputEvent({ type: 'mouseUp', x: 30, y: 30, button: 'left', clickCount: 1 })
    await until('bubble expands drawer', () => window.isVisible() && !bubble.isVisible())
    await until('expanded state acknowledged', () => js('(async()=>!(await window.api.windowControl.getState()).collapsed)()'))
    await new Promise((done) => setTimeout(done, 200))
    console.log('CHECK bubble recall')
    await js('window.api.windowControl.minimize()')
    await until('native minimized', () => window.isMinimized())
    const child = spawn(process.execPath, [__filename, '--phase=second'], { windowsHide: true, stdio: 'ignore' })
    await new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Second instance did not exit')) }, 15000)
      child.once('error', (error) => { clearTimeout(timeout); reject(error) })
      child.once('exit', (code) => { clearTimeout(timeout); code === 0 ? done() : reject(new Error(`Second instance exit ${code}`)) })
    })
    await until('second instance restores primary', () => window.isVisible() && !window.isMinimized())
    assert.equal(BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes('/renderer/index.html')).length, 1)
    measures.singleInstance = true
    console.log('CHECK single instance')
    assert.equal(await js('document.querySelector("textarea[aria-label=提问]").value'), 'Unsent draft survives mode switches')
    const accelerator = 'Control+Alt+Shift+F11'
    const shortcutOwner = spawn(process.execPath, [__filename, '--phase=conflict'], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    try {
      await new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => reject(new Error('Shortcut owner did not start')), 10000)
        shortcutOwner.once('error', (error) => { clearTimeout(timeout); reject(error) })
        shortcutOwner.once('message', (message: { registered: boolean }) => {
          clearTimeout(timeout)
          message.registered ? done() : reject(new Error('Test shortcut already occupied'))
        })
      })
      assert.equal((await js(`window.api.windowControl.setShortcut('${accelerator}')`)).shortcutRegistered, false)
    } finally {
      const exited = new Promise<void>((done) => shortcutOwner.once('exit', () => done()))
      if (shortcutOwner.connected) shortcutOwner.disconnect()
      else shortcutOwner.kill()
      await exited
    }
    await js('window.api.windowControl.setShortcut(null)')
    assert.ok(response)
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: last }, finish_reason: null }] })}\n\ndata: [DONE]\n\n`)
    await until('stream completed', () => js(`(async()=> (await window.api.messages.listByConversation('${id}')).some(m=>m.role==='assistant'&&m.status==='complete'))()`))
    assert.equal((await js(`window.api.messages.listByConversation('${id}')`)).find((m: any) => m.role === 'assistant').content, answer + last)
    // A second, image-bearing request verifies stored internal capture readback on the next boot.
    await js(`window.api.llm.startChat({conversationId:'${id}',content:'Image persistence',images:[{name:'fixture.jpg',mime:'image/jpeg',dataUrl:${JSON.stringify(imageData)},kind:'capture',captureVariant:'thumbnail'}]})`)
    await until('image request started', () => imageRequests === 1)
    response!.end('data: [DONE]\n\n')
    await until('image message terminal', () => js(`(async()=> (await window.api.messages.listByConversation('${id}')).filter(m=>m.role==='assistant'&&m.status==='complete').length===2)()`))
    const firstUser = await js(`(async()=> (await window.api.messages.listByConversation('${id}')).find(m=>m.attachments))()`)
    assert.ok(firstUser)
    writeFileSync(join(root, 'fixture.json'), JSON.stringify({ id, answer: answer + last, imageMessageId: firstUser.id }))
    await js('window.api.windowControl.setDrawerWidth(440,true)')
    // Programmatic setPosition does not produce Windows' interactive move-end notification.
    // Simulate that notification; real title-bar dragging remains a hardware walkthrough item.
    await new Promise((done) => setTimeout(done, 200))
    window.setPosition(display.workArea.x, display.workArea.y)
    window.emit('moved')
    await until('left edge docked', () => js('(async()=> (await window.api.windowControl.getState()).edge==="left")()'))
    await js('window.api.windowControl.collapse()')
    measures.streamingSurvived = true
    writeFileSync(join(root, 'exercise.json'), JSON.stringify(measures, null, 2))
    console.log('PASS', JSON.stringify(measures))
  } finally {
    response?.end()
    server.closeAllConnections()
    server.close()
  }
}

if (phase !== 'conflict') {
  run().then(() => { clearTimeout(watchdog); app.quit() }).catch((error) => { console.error(error); app.exit(1) })
}
