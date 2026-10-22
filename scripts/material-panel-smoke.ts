import { app, BrowserWindow, webContents } from 'electron'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { createMaterialFileAccess, registerMaterialScheme } from '../src/main/material/protocol'
import { createMaterialPanelController } from '../src/main/material/panel'

const root = resolve('node_modules/.cache/deriva-material-smoke')
mkdirSync(root, { recursive: true })
app.setPath('userData', join(root, 'profile'))
registerMaterialScheme()

async function run(): Promise<void> {
  await app.whenReady()
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end('<!doctype html><style>body{margin:0;overflow-x:hidden}main{position:relative;left:50%;margin-left:-700px;width:1400px;height:1000px;background:#d6e6f8}</style><main>Wide learning page</main>')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address() as { port: number }
  const window = new BrowserWindow({ width: 1000, height: 850, show: true })
  await window.loadURL('data:text/html,<h1>Smoke test</h1>')
  const access = createMaterialFileAccess(join(root, 'files.json'))
  const panel = createMaterialPanelController(window, access)
  panel.setBounds({ x: 0, y: 0, width: 500, height: 750 })
  panel.open(`http://127.0.0.1:${address.port}`)
  const view = window.contentView.children.at(-1) as Electron.WebContentsView
  async function capture(name: string): Promise<void> {
    if (process.env.DERIVA_SMOKE_CAPTURE !== '1') return
    window.show()
    window.focus()
    await new Promise((done) => setTimeout(done, 200))
    writeFileSync(join(root, name), (await view.webContents.capturePage()).toPNG())
  }
  async function settled(): Promise<void> {
    for (let count = 0; count < 200; count++) {
      if (panel.getState().status === 'error') throw new Error(panel.getState().error!)
      if (!view.webContents.isLoading()) return
      await new Promise((done) => setTimeout(done, 50))
    }
    throw new Error('Material did not finish loading')
  }
  await settled()
  await new Promise((done) => setTimeout(done, 200))
  assert.ok(await view.webContents.executeJavaScript('document.querySelector("main").getBoundingClientRect().left < 0'))
  const scroll = await view.webContents.executeJavaScript(`({overflow: getComputedStyle(document.documentElement).overflowX, width:document.documentElement.scrollWidth, viewport:innerWidth, moved:(scrollTo(300,0),scrollX)})`)
  assert.equal(scroll.overflow, 'auto')
  assert.ok(scroll.width > scroll.viewport)
  assert.ok(scroll.moved > 0)
  let boundsCalls = 0
  const setBounds = view.setBounds.bind(view)
  view.setBounds = (bounds) => { boundsCalls++; setBounds(bounds) }
  for (let index = 0; index < 100; index++) panel.setBounds({ x: 0, y: 0, width: 500, height: 750 })
  assert.equal(boundsCalls, 0)
  console.log('WEB', JSON.stringify({ scroll, redundantBoundsCalls: boundsCalls }))
  await panel.setZoom(0.5)
  const reduced = await view.webContents.executeJavaScript('({width:innerWidth, factor:devicePixelRatio})')
  assert.equal(view.webContents.getZoomFactor(), 0.5)
  assert.ok(reduced.width >= 1000)
  await panel.setZoom(0.25)
  const fitted = await view.webContents.executeJavaScript('({width:innerWidth, content:document.documentElement.scrollWidth, left:document.querySelector("main").getBoundingClientRect().left, right:document.querySelector("main").getBoundingClientRect().right})')
  assert.equal(fitted.width, fitted.content)
  assert.ok(fitted.left >= 0 && fitted.right <= fitted.width)
  await panel.setZoom(1)
  console.log('WEB-SHRINK', JSON.stringify({ reduced, fitted }))
  const markdownPath = join(root, 'notes.md')
  writeFileSync(markdownPath, '# 中文公式\n\n**学习材料**\n\n$$\\frac{1}{n}$$\n\n<script>window.pwned=true</script>')
  panel.navigate(access.allow(markdownPath))
  await settled()
  const markdown = await view.webContents.executeJavaScript(`({heading:document.querySelector('h1')?.textContent,math:document.querySelectorAll('math').length,node:typeof require,bridge:typeof window.api,pwned:window.pwned===true})`)
  assert.equal(markdown.heading, '中文公式')
  assert.equal(markdown.math, 1)
  assert.equal(markdown.node, 'undefined')
  assert.equal(markdown.bridge, 'undefined')
  assert.equal(markdown.pwned, false)
  await capture('markdown.png')
  console.log('MARKDOWN', JSON.stringify(markdown))
  const pdf = ['%PDF-1.4\n']
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 48 >>\nstream\nBT /F1 24 Tf 40 740 Td (Deriva PDF zoom test) Tj ET\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'
  ]
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf.join('')))
    pdf.push(`${index + 1} 0 obj\n${object}\nendobj\n`)
  })
  const xref = Buffer.byteLength(pdf.join(''))
  pdf.push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  const pdfPath = join(root, 'sample.pdf')
  writeFileSync(pdfPath, pdf.join(''))
  panel.navigate(access.allow(pdfPath))
  await settled()
  await new Promise((done) => setTimeout(done, 1000))
  await capture('pdf-100.png')
  const pdfGuest = webContents.getAllWebContents().find((contents) => contents.getURL().startsWith('chrome-extension:'))!
  await pdfGuest.executeJavaScript(`(() => {const input=document.querySelector('pdf-viewer').shadowRoot.querySelector('viewer-toolbar').shadowRoot.querySelector('viewer-page-selector').shadowRoot.querySelector('input');input.value='2';input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await new Promise((done) => setTimeout(done, 200))
  const readPage = (): Promise<string> => pdfGuest.executeJavaScript(`document.querySelector('pdf-viewer').shadowRoot.querySelector('viewer-toolbar').shadowRoot.querySelector('viewer-page-selector').shadowRoot.querySelector('input').value`)
  assert.equal(await readPage(), '2')
  const readPdfZoom = (): Promise<number> => pdfGuest.executeJavaScript(`parseFloat(document.querySelector('pdf-viewer').shadowRoot.querySelector('viewer-toolbar').shadowRoot.querySelector('#zoom-controls input').value)`)
  const initialPdfZoom = await readPdfZoom()
  await panel.setZoom(1.5)
  await new Promise((done) => setTimeout(done, 500))
  await capture('pdf-150.png')
  const enlargedPdfZoom = await readPdfZoom()
  assert.equal(enlargedPdfZoom, Math.round(initialPdfZoom * 1.5))
  await panel.setZoom(1)
  assert.equal(await readPdfZoom(), initialPdfZoom)
  assert.equal(await readPage(), '2')
  console.log('PDF', JSON.stringify({ initialPdfZoom, enlargedPdfZoom, restored: await readPdfZoom(), retainedPage: await readPage() }))
  await panel.setZoom(0.5)
  assert.equal(panel.getState().zoom, 1)
  assert.equal(await readPdfZoom(), initialPdfZoom)
  if (process.env.DERIVA_SMOKE_WEB_URL) {
    panel.navigate(process.env.DERIVA_SMOKE_WEB_URL)
    for (let count = 0; count < 100; count++) {
      if (panel.getState().status === 'error') throw new Error(panel.getState().error!)
      if (view.webContents.getURL().startsWith('https://live.bilibili.com/') &&
        await view.webContents.executeJavaScript('document.body?.innerText.length > 100')) break
      await new Promise((done) => setTimeout(done, 100))
    }
    const measure = (): Promise<unknown> => view.webContents.executeJavaScript('({viewport:innerWidth, width:document.documentElement.scrollWidth, title:document.title, textLength:document.body?.innerText.length, video:!!document.querySelector("video")})')
    const before = await measure()
    await panel.setZoom(0.25)
    const after = await measure()
    console.log('EXTERNAL-WEB', JSON.stringify({ before, after }))
    await capture('external-web.png')
  }
  panel.close()
  assert.equal(panel.getState().status, 'closed')
  panel.dispose()
  access.dispose()
  window.destroy()
  server.close()
}

run().then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1) })
