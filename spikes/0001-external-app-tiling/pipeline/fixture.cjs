const { app, BrowserWindow, screen } = require('electron')
const path = require('node:path')

app.setPath('userData', path.resolve('node_modules/.cache/deriva-tiling-fixtures', String(process.pid)))
app.whenReady().then(async () => {
  // Native fixtures specify physical pixels; BrowserWindow minimums use DIP.
  const minimum = Math.ceil(Number(process.argv.find(arg => arg.startsWith('--minimum='))?.slice(10) || 200) / screen.getPrimaryDisplay().scaleFactor)
  const win = new BrowserWindow({
    title: 'Deriva geometry fixture', x: 80, y: 80, width: Math.max(800, minimum), height: 600,
    minWidth: minimum, minHeight: 200,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  await win.loadURL('data:text/html,<title>Deriva geometry fixture</title><body style="background:%23f0f6ff;color:%231b365d;font:24px sans-serif;padding:40px">Window geometry test fixture</body>')
  process.send?.({ ready: true, hwnd: `0x${win.getNativeWindowHandle().readBigUInt64LE().toString(16)}` })
  process.on('message', message => {
    if (message === 'maximize') win.maximize()
    if (message === 'minimize') win.minimize()
    if (message === 'close') app.quit()
  })
  process.on('disconnect', () => app.quit())
})
setTimeout(() => app.quit(), 60000).unref()
