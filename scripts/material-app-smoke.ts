import { app, BrowserWindow, WebContentsView } from 'electron'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve('node_modules/.cache/deriva-material-app-smoke')
mkdirSync(root, { recursive: true })
app.setPath('userData', join(root, 'profile'))
// Load the built application only after setting an isolated user-data path.
require(join(__dirname, 'index.js'))
if (!app.hasSingleInstanceLock()) {
  console.error('Isolated smoke profile is already in use')
  app.exit(1)
}
const watchdog = setTimeout(() => { console.error('Application smoke exceeded 45s'); app.exit(1) }, 45000)

async function until(check: () => Promise<boolean> | boolean): Promise<void> {
  for (let i = 0; i < 240; i++) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error('Application smoke condition timed out')
}

async function run(): Promise<void> {
  await app.whenReady()
  let imageRequests = 0
  const server = createServer(async (req, res) => {
    if (req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const payload = JSON.parse(body)
      if (payload.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part.image_url?.url.startsWith('data:image/jpeg;base64,')))) imageRequests++
      res.setHeader('content-type', 'text/event-stream')
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '这份资料中的公式表示测试关系。' }, finish_reason: null }] })}\n\ndata: [DONE]\n\n`)
    } else {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end('<title>线性代数测试资料</title><h1>线性代数</h1><p>A x = b</p><pre>const x = 1</pre>')
    }
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const isMain = (item: Electron.BrowserWindow): boolean => item.webContents.getURL().includes('/renderer/index.html')
  await until(() => BrowserWindow.getAllWindows().some(isMain))
  const window = BrowserWindow.getAllWindows().find(isMain)!
  const js = <T = any>(code: string): Promise<T> => window.webContents.executeJavaScript(code)
  await until(() => js('!!window.api && !!document.querySelector("h1")'))
  const title = `内部截图核验-${Date.now()}`
  const id = await js<string>(`(async () => {
    await window.api.windowControl.setMode('normal');
    localStorage.clear();
    await window.api.llm.saveConfig({baseUrl:'http://127.0.0.1:${port}',model:'deepseek-flash',contextStrategy:'excerpt',summarySource:'local'});
    await window.api.llm.saveKey('isolated-smoke-placeholder');
    return (await window.api.conversations.create({title:${JSON.stringify(title)}})).id;
  })()`)
  await window.webContents.reload()
  await until(() => js(`!![...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(title)})`))
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(title)}).click()`)
  await until(() => js('!!document.querySelector(".conversation__composer") || !![...document.querySelectorAll("button")].find(b=>b.textContent==="截图")'))
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='资料面板').click()`)
  await until(() => js('!!document.querySelector(".material-panel__viewport")'))
  await js(`window.api.materialPanel.navigate('http://127.0.0.1:${port}/')`)
  await until(async () => (await js<any[]>('window.api.capture.listSources({types:["internal"]})'))[0]?.unavailableReason === undefined)
  const view = window.contentView.children.find((child) => child instanceof WebContentsView) as Electron.WebContentsView
  for (const mode of ['normal', 'floating'] as const) {
    await js(`window.api.windowControl.setMode('${mode}')`)
    await new Promise((done) => setTimeout(done, 200))
    if (mode === 'floating') {
      // Floating starts without materials; open from its menu and reload the fixture explicitly.
      await js(`if(!document.querySelector('.material-panel')) { [...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='更多操作').click() }`)
      await js(`if(!document.querySelector('.material-panel')) [...document.querySelectorAll('[role="menuitem"]')].find(b=>b.textContent==='资料面板').click()`)
      await js(`window.api.materialPanel.navigate('http://127.0.0.1:${port}/')`)
      await until(async () => (await js<any[]>('window.api.capture.listSources({types:["internal"]})'))[0]?.unavailableReason === undefined)
    }
    assert.ok(await js(`Array.from(document.querySelectorAll('.material-panel button')).every(b=>{const r=b.getBoundingClientRect();return r.width>=44 && r.height>=44})`))
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='截图').click()`)
    await until(() => js(`!![...document.querySelectorAll('.screenshot-source')].find(n=>n.textContent.includes('Deriva 资料面板'))`))
    await until(() => !view.getVisible())
    await until(() => js(`![...document.querySelectorAll('.screenshot-source')].find(n=>n.textContent.includes('Deriva 资料面板')).querySelector('button').disabled`))
    await js(`[...document.querySelectorAll('.screenshot-source')].find(n=>n.textContent.includes('Deriva 资料面板')).querySelector('button').click()`)
    await until(() => js('!!document.querySelector(".screenshot-dialog__preview")?.complete'))
    const screenshot = await window.webContents.capturePage()
    writeFileSync(join(root, `${mode}-preview.png`), screenshot.toPNG())
    if (mode === 'normal') {
      await js(`(() => {const input=document.querySelector('[aria-label="截图提问"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(input,'解释资料中的公式');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
      await until(() => js(`!document.querySelector('.screenshot-dialog__actions button:last-child').disabled`))
      await js(`document.querySelector('.screenshot-dialog__actions button:last-child').click()`)
      await until(() => js(`(async()=> (await window.api.messages.listByConversation('${id}')).some(m=>m.role==='assistant' && m.status==='complete'))()`))
      assert.equal(imageRequests, 1)
      assert.ok(await js(`(async()=>{const messages=await window.api.messages.listByConversation('${id}');const a=JSON.parse(messages.find(m=>m.role==='user').attachments)[0];return (await window.api.attachments.read(a.id)).startsWith('data:image/jpeg;base64,')})()`))
      assert.ok(await js(`(async()=> (await window.api.bookmarks.listByConversation('${id}')).length > 0)()`))
    } else {
      await js(`document.querySelector('[aria-label="关闭截图提问"]').click()`)
    }
    await until(() => view.getVisible())
    console.log('APP-UI', mode, 'preview verified')
  }
  server.close()
  console.log('PASS: real app bridge, internal source, normal/floating previews, native modal occlusion, mocked image API send, stored attachment and bookmark')
}

run().then(() => { clearTimeout(watchdog); app.quit() }).catch((error) => { console.error(error); app.exit(1) })
