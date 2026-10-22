if (process.argv.includes('--fixture')) {
  require('./fixture.cjs')
} else {
  const { app, BrowserWindow, screen } = require('electron')
  const { spawn } = require('node:child_process')
  const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
  const path = require('node:path')
  const assert = require('node:assert/strict')
  const { createNative, sleep } = require('./native.cjs')
  const { tileRect, equalRect } = require('./geometry.cjs')
  const root = path.resolve(__dirname, '..')
  const output = process.env.DERIVA_SPIKE_OUTPUT || path.resolve('spikes/0001-external-app-tiling')
  app.setPath('userData', path.resolve('node_modules/.cache/deriva-tiling-controller', String(process.pid)))
  let cleanup = () => {}
  let failed = false
  const watchdog = setTimeout(() => {
    cleanup()
    console.error('FAIL watchdog')
    app.exit(1)
  }, 90000)

  function save(folder, name, value) {
    const dir = path.join(output, folder)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2))
  }

  async function until(fn, label, timeout = 5000) {
    const deadline = Date.now() + timeout
    do {
      const value = fn()
      if (value) return value
      await sleep(30)
    } while (Date.now() < deadline)
    throw new Error(label)
  }

  async function fixture(minimum) {
    const args = [...(app.isPackaged ? [] : [root]), '--fixture', `--minimum=${minimum || 200}`]
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env, windowsHide: false })
    let reply
    let spawnError
    child.on('message', message => { if (message.ready) reply = message })
    child.on('error', error => { spawnError = error })
    async function close() {
      if (child.connected) child.send('close')
      await until(() => child.exitCode !== null, 'fixture-exit-timeout', 4000).catch(() => child.kill())
    }
    try {
      await until(() => { if (spawnError) throw spawnError; return reply }, 'fixture-start-timeout', 15000)
      return { child, hwnd: BigInt(reply.hwnd), close }
    } catch (error) { await close(); throw error }
  }

  app.whenReady().then(async () => {
    const native = createNative()
    const golden = JSON.parse(readFileSync(path.join(root, 'fixtures/golden.json'), 'utf8'))
    const listed = native.list()
    const inventory = listed.items.map(({ app, identity, bounds, monitor, dpi, minimized, maximized, elevated }) => ({ app, identity, bounds, monitor, dpi, minimized, maximized, elevated }))
    save('debug/01-load-enumerate', 'inventory', {
      electron: process.versions.electron, node: process.versions.node, koffi: native.version, packaged: app.isPackaged,
      displays: screen.getAllDisplays().map(({ id, bounds, workArea, scaleFactor }) => ({ id, bounds, workArea, scaleFactor })),
      windows: inventory, errors: listed.errors
    })
    if (process.argv.includes('--list')) {
      console.log(JSON.stringify(inventory, null, 2))
      clearTimeout(watchdog)
      app.quit()
      return
    }
    const results = {
      fixture: 'fixtures/golden.json', packaged: app.isPackaged,
      end_to_end: { total: Object.keys(golden.cases).length, passed: 0, failed: 0 },
      per_stage: {}, failures: [], cases: [],
      manual_gates: Object.fromEntries(Object.keys(golden.manual_gates).map(key => [key, 'unverified']))
    }
    function stage(name, pass) {
      const counts = results.per_stage[name] ||= { passed: 0, failed: 0 }
      counts[pass ? 'passed' : 'failed']++
    }
    const display = screen.getPrimaryDisplay()
    const drawer = new BrowserWindow({
      frame: false, x: display.workArea.x + display.workArea.width - 440, y: display.workArea.y,
      width: 440, height: display.workArea.height,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await drawer.loadURL('data:text/html,<body style="background:%23dff3ec;font:22px sans-serif;padding:20px">Drawer test fixture</body>')
    const own = native.read(drawer.getNativeWindowHandle().readBigUInt64LE())
    function setDrawer(edge, width) {
      const area = display.workArea
      drawer.setBounds({ x: edge === 'left' ? area.x : area.x + area.width - width, y: area.y, width, height: area.height })
    }
    function assertPartition(external, edge) {
      const current = native.read(own.identity).visible
      assert.ok(equalRect(current, {
        left: edge === 'left' ? own.area.left : external.right,
        top: own.area.top,
        right: edge === 'left' ? external.left : own.area.right,
        bottom: own.area.bottom
      }))
    }
    if (process.argv.includes('--manual')) {
      const hwnd = process.argv.find(arg => arg.startsWith('--target='))?.slice(9)
      const confirmed = process.argv.find(arg => arg.startsWith('--confirm='))?.slice(10)
      assert.ok(hwnd && confirmed === hwnd, 'manual control requires matching --target and --confirm identities')
      const snapshot = listed.items.find(item => item.identity.hwnd === hwnd)
      assert.ok(snapshot, 'selected identity not in current enumeration; list again')
      native.assertControllable(snapshot.identity)
      save('debug/manual', 'pending-restore', snapshot)
      const targetName = snapshot.app.replace(/[^a-z0-9.-]/gi, '_')
      const run = { app: snapshot.app, identity: snapshot.identity, before: snapshot, states: [], restored: null, passed: false }
      try {
        for (const edge of ['right', 'left']) {
          for (const width of [440, 560]) {
            setDrawer(edge, width)
            const state = await native.move(snapshot.identity, tileRect(own.area, width, own.dpi / 96, edge))
            assertPartition(state.visible, edge)
            run.states.push({ edge, width, visible: state.visible })
            await sleep(1500)
          }
        }
      } finally {
        run.restored = await native.restore(snapshot)
        assert.ok(equalRect(run.restored.bounds, snapshot.bounds))
        assert.equal(run.restored.monitor, snapshot.monitor)
        run.passed = run.states.length === 4
        save('debug/manual', targetName, run)
        save('debug/manual', 'pending-restore', { restored: true })
      }
      drawer.destroy()
      clearTimeout(watchdog)
      console.log(`PASS manual ${targetName}`)
      app.quit()
      return
    }
    for (const [id, input] of Object.entries(golden.cases)) {
      let host
      let snapshot
      let changed = false
      let activeStage = '02-identify'
      const started = performance.now()
      try {
        host = await fixture(input.minimumWidthPx)
        cleanup = () => { if (host?.child.connected) host.child.send('close') }
        if (input.initial === 'maximized') {
          host.child.send('maximize')
          await until(() => native.read(host.hwnd).maximized, 'fixture-maximize')
        }
        if (input.initial === 'minimized') {
          host.child.send('minimize')
          await until(() => native.read(host.hwnd).minimized, 'fixture-minimize')
        }
        snapshot = native.read(host.hwnd)
        assert.equal(snapshot.identity.pid, host.child.pid)
        assert.ok(native.list().items.some(item => item.identity.hwnd === snapshot.identity.hwnd))
        save('debug/02-identify', id, snapshot)
        stage(activeStage, true)
        activeStage = '03-layout'
        if (id === 'stale-identity') {
          assert.throws(() => native.assertControllable({ ...snapshot.identity, started: '0' }), { code: 'identity-mismatch' })
          assert.ok(equalRect(native.read(snapshot.identity).bounds, snapshot.bounds))
        } else if (id === 'closed-window') {
          await host.close()
          assert.throws(() => native.assertControllable(snapshot.identity), { code: 'window-missing' })
        } else if (input.initial === 'minimized') {
          assert.throws(() => native.assertControllable(snapshot.identity), { code: 'minimized-window' })
          assert.equal(native.read(snapshot.identity).minimized, true)
        } else {
          const target = tileRect(own.area, input.widthDip || 440, own.dpi / 96, input.edge || 'right')
          setDrawer(input.edge || 'right', input.widthDip || 440)
          changed = true
          save('debug/03-layout', `${id}-restore-record`, { identity: snapshot.identity, placement: snapshot.placement })
          if (id === 'owned-minimum-size') {
            await assert.rejects(() => native.move(snapshot.identity, target), { code: 'geometry-refused-or-timeout' })
          } else {
            const first = await native.move(snapshot.identity, target)
            assertPartition(first.visible, input.edge)
            const adjusted = tileRect(own.area, input.adjustDip, own.dpi / 96, input.edge)
            setDrawer(input.edge, input.adjustDip)
            const second = await native.move(snapshot.identity, adjusted)
            assertPartition(second.visible, input.edge)
            save('debug/03-layout', id, { first, second, target, adjusted })
          }
        }
        stage(activeStage, true)
        activeStage = '04-restore'
        if (changed) {
          const restored = await native.restore(snapshot)
          assert.equal(restored.monitor, snapshot.monitor)
          assert.ok(equalRect(restored.bounds, snapshot.bounds))
          save('debug/04-restore', id, restored)
          changed = false
        }
        stage(activeStage, true)
        results.end_to_end.passed++
        results.cases.push({ id, passed: true, elapsedMs: Math.round(performance.now() - started) })
      } catch (error) {
        stage(activeStage, false)
        failed = true
        results.end_to_end.failed++
        const debug = { id, stage: activeStage, code: error.code || 'assertion-failed', message: error.message }
        save(`debug/${activeStage}`, `${id}-failure`, debug)
        results.failures.push({ input: id, diverged_at: activeStage, debug_artifact: `debug/${activeStage}/${id}-failure.json` })
        results.cases.push({ ...debug, passed: false })
      } finally {
        if (changed && snapshot) {
          try { await native.restore(snapshot) }
          catch (error) {
            save('debug/04-restore', `${id}-cleanup-failure`, { code: error.code, message: error.message })
            results.failures.push({ input: id, diverged_at: '04-restore-cleanup', debug_artifact: `debug/04-restore/${id}-cleanup-failure.json` })
            failed = true
          }
        }
        if (host) await host.close()
        cleanup = () => {}
      }
      if (failed) break
    }
    results.end_to_end.not_run = results.end_to_end.total - results.end_to_end.passed - results.end_to_end.failed
    results.versions = { electron: process.versions.electron, koffi: native.version }
    save('eval', 'results', results)
    drawer.destroy()
    clearTimeout(watchdog)
    console.log(`${failed ? 'FAIL' : 'PASS'} ${JSON.stringify({ ...results.end_to_end, packaged: app.isPackaged })}`)
    app.exit(failed ? 1 : 0)
  }).catch(error => {
    cleanup()
    save('debug/01-load-enumerate', 'failure', { message: error.message, code: error.code })
    console.error(`FAIL ${error.message}`)
    clearTimeout(watchdog)
    app.exit(1)
  })
}
