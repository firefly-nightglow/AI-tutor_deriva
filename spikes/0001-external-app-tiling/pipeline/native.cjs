const path = require('node:path')
const koffi = require('koffi')
const { outerRect, equalRect } = require('./geometry.cjs')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function createNative() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('unsupported-platform')
  const user = koffi.load('user32.dll')
  const kernel = koffi.load('kernel32.dll')
  const advapi = koffi.load('advapi32.dll')
  const dwm = koffi.load('dwmapi.dll')
  const rect = koffi.struct('SpikeRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' })
  const point = koffi.struct('SpikePoint', { x: 'int32', y: 'int32' })
  const placement = koffi.struct('SpikePlacement', {
    length: 'uint32', flags: 'uint32', showCmd: 'uint32',
    ptMinPosition: point, ptMaxPosition: point, rcNormalPosition: rect
  })
  koffi.struct('SpikeMonitor', { cbSize: 'uint32', rcMonitor: rect, rcWork: rect, flags: 'uint32' })
  koffi.struct('SpikeTime', { low: 'uint32', high: 'uint32' })
  const enumProc = koffi.proto('int __stdcall SpikeEnum(void *hwnd, intptr_t parameter)')
  const api = {
    enumerate: user.func('int __stdcall EnumWindows(SpikeEnum *callback, intptr_t parameter)'),
    isWindow: user.func('int __stdcall IsWindow(void *hwnd)'),
    visible: user.func('int __stdcall IsWindowVisible(void *hwnd)'),
    iconic: user.func('int __stdcall IsIconic(void *hwnd)'),
    zoomed: user.func('int __stdcall IsZoomed(void *hwnd)'),
    ancestor: user.func('void * __stdcall GetAncestor(void *hwnd, uint32 flags)'),
    owner: user.func('void * __stdcall GetWindow(void *hwnd, uint32 command)'),
    style: user.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)'),
    className: user.func('int __stdcall GetClassNameW(void *hwnd, void *buffer, int max)'),
    titleLength: user.func('int __stdcall GetWindowTextLengthW(void *hwnd)'),
    pid: user.func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)'),
    bounds: user.func('int __stdcall GetWindowRect(void *hwnd, _Out_ SpikeRect *rect)'),
    placement: user.func('int __stdcall GetWindowPlacement(void *hwnd, _Inout_ SpikePlacement *placement)'),
    setPlacement: user.func('int __stdcall SetWindowPlacement(void *hwnd, const SpikePlacement *placement)'),
    move: user.func('int __stdcall SetWindowPos(void *hwnd, void *after, int x, int y, int width, int height, uint32 flags)'),
    dpiContext: user.func('void * __stdcall SetThreadDpiAwarenessContext(void *context)'),
    dpi: user.func('uint32 __stdcall GetDpiForWindow(void *hwnd)'),
    monitor: user.func('void * __stdcall MonitorFromWindow(void *hwnd, uint32 flags)'),
    monitorInfo: user.func('int __stdcall GetMonitorInfoW(void *monitor, _Inout_ SpikeMonitor *info)'),
    dwmRect: dwm.func('int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attribute, _Out_ SpikeRect *rect, uint32 bytes)'),
    cloaked: dwm.func('int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attribute, _Out_ uint32 *value, uint32 bytes)'),
    open: kernel.func('void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'),
    close: kernel.func('int __stdcall CloseHandle(void *handle)'),
    times: kernel.func('int __stdcall GetProcessTimes(void *process, _Out_ SpikeTime *creation, _Out_ SpikeTime *exit, _Out_ SpikeTime *kernel, _Out_ SpikeTime *user)'),
    image: kernel.func('int __stdcall QueryFullProcessImageNameW(void *process, uint32 flags, void *buffer, _Inout_ uint32 *length)'),
    token: advapi.func('int __stdcall OpenProcessToken(void *process, uint32 access, _Out_ void **token)'),
    tokenInfo: advapi.func('int __stdcall GetTokenInformation(void *token, int type, void *value, uint32 bytes, _Out_ uint32 *length)'),
    error: kernel.func('uint32 __stdcall GetLastError()')
  }

  function check(ok, operation) {
    if (!ok) {
      const code = api.error()
      throw Object.assign(new Error(`${operation}:${code}`), { code: code === 5 ? 'access-denied' : 'native-failure', nativeCode: code })
    }
  }

  function physical(fn) {
    const previous = api.dpiContext(-4n)
    check(previous, 'dpi-context')
    try { return fn() } finally { api.dpiContext(previous) }
  }

  function processInfo(pid) {
    const handle = api.open(0x1000, 0, pid)
    check(handle, 'open-process')
    try {
      const created = {}
      check(api.times(handle, created, {}, {}, {}), 'process-times')
      const name = Buffer.alloc(4096)
      const length = [2048]
      check(api.image(handle, 0, name, length), 'process-image')
      const token = [null]
      check(api.token(handle, 8, token), 'open-token')
      try {
        const elevated = Buffer.alloc(4)
        check(api.tokenInfo(token[0], 20, elevated, 4, [0]), 'token-elevation')
        return {
          started: ((BigInt(created.high) << 32n) | BigInt(created.low)).toString(),
          app: path.win32.basename(name.toString('utf16le', 0, length[0] * 2)),
          elevated: elevated.readUInt32LE(0) !== 0
        }
      } finally { api.close(token[0]) }
    } finally { api.close(handle) }
  }

  function read(identityOrHwnd) {
    const hwnd = typeof identityOrHwnd === 'object' ? BigInt(identityOrHwnd.hwnd) : identityOrHwnd
    if (!api.isWindow(hwnd)) throw Object.assign(new Error('window-missing'), { code: 'window-missing' })
    const pid = [0]
    check(api.pid(hwnd, pid), 'window-pid')
    const info = processInfo(pid[0])
    if (typeof identityOrHwnd === 'object' && (identityOrHwnd.pid !== pid[0] || identityOrHwnd.started !== info.started)) {
      throw Object.assign(new Error('identity-mismatch'), { code: 'identity-mismatch' })
    }
    return physical(() => {
      const bounds = {}
      const visible = {}
      const saved = { length: koffi.sizeof(placement) }
      check(api.bounds(hwnd, bounds), 'get-rect')
      if (api.dwmRect(hwnd, 9, visible, koffi.sizeof(rect)) !== 0) Object.assign(visible, bounds)
      check(api.placement(hwnd, saved), 'get-placement')
      const monitor = api.monitor(hwnd, 2)
      const display = { cbSize: 40 }
      check(api.monitorInfo(monitor, display), 'get-monitor')
      return {
        identity: { hwnd: `0x${hwnd.toString(16)}`, pid: pid[0], started: info.started },
        app: info.app, elevated: info.elevated, bounds, visible, placement: saved,
        minimized: !!api.iconic(hwnd), maximized: !!api.zoomed(hwnd),
        monitor: `0x${monitor.toString(16)}`, area: display.rcWork, dpi: api.dpi(hwnd)
      }
    })
  }

  function list() {
    const items = []
    const errors = {}
    check(api.enumerate(hwnd => {
      try {
        if (!api.visible(hwnd) || api.ancestor(hwnd, 2) !== hwnd || api.owner(hwnd, 4) || !api.titleLength(hwnd)) return 1
        const cloaked = [0]
        if (api.cloaked(hwnd, 14, cloaked, 4) === 0 && cloaked[0]) return 1
        const buffer = Buffer.alloc(512)
        const chars = api.className(hwnd, buffer, 256)
        const name = buffer.toString('utf16le', 0, chars * 2)
        if (['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd'].includes(name)) return 1
        const item = read(hwnd)
        if (item.identity.pid === process.pid || item.bounds.right <= item.bounds.left) return 1
        items.push(item)
      } catch (error) { errors[error.code || 'unknown'] = (errors[error.code || 'unknown'] || 0) + 1 }
      return 1
    }, 0), 'enumerate')
    return { items, errors }
  }

  function assertControllable(identity) {
    const state = read(identity)
    if (state.elevated) throw Object.assign(new Error('elevated-window'), { code: 'elevated-window' })
    if (state.minimized) throw Object.assign(new Error('minimized-window'), { code: 'minimized-window' })
    const style = Number(api.style(BigInt(identity.hwnd), -16))
    if (!(style & 0x40000)) throw Object.assign(new Error('not-resizable'), { code: 'not-resizable' })
    return state
  }

  async function waitFor(identity, predicate, operation) {
    const until = Date.now() + 2200
    do {
      const current = read(identity)
      if (predicate(current)) return current
      await sleep(30)
    } while (Date.now() < until)
    throw Object.assign(new Error(operation), { code: operation })
  }

  async function move(identity, target) {
    let current = assertControllable(identity)
    if (current.maximized) {
      physical(() => check(api.setPlacement(BigInt(identity.hwnd), { ...current.placement, flags: 4, showCmd: 4 }), 'unmaximize'))
      current = await waitFor(identity, state => !state.maximized, 'unmaximize-timeout')
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const wanted = outerRect(target, current.bounds, current.visible)
      read(identity)
      physical(() => check(api.move(BigInt(identity.hwnd), null, wanted.left, wanted.top, wanted.right - wanted.left, wanted.bottom - wanted.top, 0x4014), 'set-position'))
      try { return await waitFor(identity, state => equalRect(state.visible, target), 'geometry-refused-or-timeout') }
      catch (error) {
        if (attempt || error.code !== 'geometry-refused-or-timeout') throw error
        current = read(identity)
      }
    }
  }

  async function restore(snapshot) {
    const state = read(snapshot.identity)
    if (state.elevated) throw Object.assign(new Error('elevated-window'), { code: 'elevated-window' })
    physical(() => check(api.setPlacement(BigInt(snapshot.identity.hwnd), { ...snapshot.placement, flags: snapshot.placement.flags | 4 }), 'restore'))
    // Async placement metadata can settle before the actual native rectangle.
    return waitFor(snapshot.identity, current => current.maximized === snapshot.maximized && current.minimized === snapshot.minimized && current.monitor === snapshot.monitor && equalRect(current.bounds, snapshot.bounds) && equalRect(current.placement.rcNormalPosition, snapshot.placement.rcNormalPosition), 'restore-timeout')
  }

  return { version: koffi.version, list, read, assertControllable, move, restore, physical }
}

module.exports = { createNative, sleep }
