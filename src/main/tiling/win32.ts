import { basename } from 'node:path'
import type {
  ExternalWindowIdentity,
  ExternalWindowPlacement,
  ExternalWindowRect,
  ExternalWindowSnapshot,
  ExternalWindowSummary
} from '../../shared/types'
import type { ExternalTilingAdapter } from './controller'
import { outerRectForVisibleTarget, visibleBoundsMatch } from './win32-geometry'

type Koffi = typeof import('koffi')

interface NativeRect extends ExternalWindowRect {}

interface NativePlacement extends ExternalWindowPlacement {}

interface ProcessDetails {
  started: string
  appName: string
  elevated: boolean
}

interface MonitorInfo {
  cbSize: number
  rcMonitor: NativeRect
  rcWork: NativeRect
  flags: number
}

export type ExternalTilingErrorCode =
  | 'unsupported-platform'
  | 'native-unavailable'
  | 'window-missing'
  | 'identity-mismatch'
  | 'access-denied'
  | 'elevated-window'
  | 'minimized-window'
  | 'not-resizable'
  | 'geometry-refused'
  | 'restore-failed'

export class ExternalTilingAdapterError extends Error {
  constructor(
    readonly code: ExternalTilingErrorCode,
    message: string,
    readonly nativeCode = 0
  ) {
    super(message)
    this.name = 'ExternalTilingAdapterError'
  }
}

const SYSTEM_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'Windows.UI.Core.CoreWindow',
  'ApplicationManager_ImmersiveShellWindow',
  'MultitaskingViewFrame',
  'ForegroundStaging',
  'MSCTFIME UI',
  'IME',
  'tooltips_class32',
  'NotifyIconOverflowWindow',
  'DummyDWMListenerWindow'
])

const GW_OWNER = 4
const GA_ROOT = 2
const GWL_STYLE = -16
const WS_SIZEBOX = 0x00040000
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const DWMWA_CLOAKED = 14
const MONITOR_DEFAULTTONEAREST = 2
const SW_RESTORE = 9
const SWP_NOZORDER = 0x0004
const SWP_NOACTIVATE = 0x0010
const WPF_ASYNCWINDOWPLACEMENT = 0x0004
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const TOKEN_QUERY = 0x0008
const TOKEN_ELEVATION = 20
let bindingSequence = 0

function nativeError(code: number, operation: string): ExternalTilingAdapterError {
  if (code === 5) {
    return new ExternalTilingAdapterError(
      'access-denied',
      `${operation} was denied by Windows`,
      code
    )
  }
  return new ExternalTilingAdapterError(
    'native-unavailable',
    `${operation} failed with Windows error ${code}`,
    code
  )
}

function createBindings() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new ExternalTilingAdapterError(
      'unsupported-platform',
      'External app tiling is currently available on Windows x64 only'
    )
  }

  let koffi: Koffi
  try {
    koffi = require('koffi') as Koffi
  } catch {
    throw new ExternalTilingAdapterError(
      'native-unavailable',
      'The Windows window adapter could not load its native dependency'
    )
  }

  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const advapi32 = koffi.load('advapi32.dll')
  const dwmapi = koffi.load('dwmapi.dll')
  const suffix = ++bindingSequence
  const rectName = `DerivaExternalRect${suffix}`
  const pointName = `DerivaExternalPoint${suffix}`
  const placementName = `DerivaExternalPlacement${suffix}`
  const monitorName = `DerivaExternalMonitor${suffix}`
  const fileTimeName = `DerivaExternalFileTime${suffix}`
  const callbackName = `DerivaEnumWindows${suffix}`
  const rect = koffi.struct(rectName, {
    left: 'int32',
    top: 'int32',
    right: 'int32',
    bottom: 'int32'
  })
  const point = koffi.struct(pointName, {
    x: 'int32',
    y: 'int32'
  })
  const placement = koffi.struct(placementName, {
    length: 'uint32',
    flags: 'uint32',
    showCmd: 'uint32',
    ptMinPosition: point,
    ptMaxPosition: point,
    rcNormalPosition: rect
  })
  const monitorInfo = koffi.struct(monitorName, {
    cbSize: 'uint32',
    rcMonitor: rect,
    rcWork: rect,
    flags: 'uint32'
  })
  koffi.struct(fileTimeName, {
    low: 'uint32',
    high: 'uint32'
  })
  koffi.proto(`int __stdcall ${callbackName}(void *hwnd, intptr_t parameter)`)

  const api = {
    enumerate: user32.func(
      `int __stdcall EnumWindows(${callbackName} *callback, intptr_t parameter)`
    ),
    isWindow: user32.func('int __stdcall IsWindow(void *hwnd)'),
    isVisible: user32.func('int __stdcall IsWindowVisible(void *hwnd)'),
    isMinimized: user32.func('int __stdcall IsIconic(void *hwnd)'),
    isMaximized: user32.func('int __stdcall IsZoomed(void *hwnd)'),
    root: user32.func('void * __stdcall GetAncestor(void *hwnd, uint32 flags)'),
    owner: user32.func('void * __stdcall GetWindow(void *hwnd, uint32 command)'),
    style: user32.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)'),
    className: user32.func('int __stdcall GetClassNameW(void *hwnd, void *buffer, int cap)'),
    title: user32.func('int __stdcall GetWindowTextW(void *hwnd, void *buffer, int cap)'),
    pid: user32.func(
      'uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)'
    ),
    bounds: user32.func(
      `int __stdcall GetWindowRect(void *hwnd, _Out_ ${rectName} *rect)`
    ),
    placement: user32.func(
      `int __stdcall GetWindowPlacement(void *hwnd, _Inout_ ${placementName} *placement)`
    ),
    setPlacement: user32.func(
      `int __stdcall SetWindowPlacement(void *hwnd, const ${placementName} *placement)`
    ),
    move: user32.func(
      'int __stdcall SetWindowPos(void *hwnd, void *after, int x, int y, int width, int height, uint32 flags)'
    ),
    monitorFromWindow: user32.func(
      'void * __stdcall MonitorFromWindow(void *hwnd, uint32 flags)'
    ),
    monitorInfo: user32.func(
      `int __stdcall GetMonitorInfoW(void *monitor, _Inout_ ${monitorName} *info)`
    ),
    setDpiContext: user32.func(
      'void * __stdcall SetThreadDpiAwarenessContext(void *context)'
    ),
    windowDpi: user32.func('uint32 __stdcall GetDpiForWindow(void *hwnd)'),
    dwmRect: dwmapi.func(
      `int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attribute, _Out_ ${rectName} *rect, uint32 bytes)`
    ),
    dwmUint: dwmapi.func(
      'int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attribute, _Out_ uint32 *value, uint32 bytes)'
    ),
    openProcess: kernel32.func(
      'void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'
    ),
    closeHandle: kernel32.func('int __stdcall CloseHandle(void *handle)'),
    processTimes: kernel32.func(
      `int __stdcall GetProcessTimes(void *process, _Out_ ${fileTimeName} *creation, _Out_ ${fileTimeName} *exit, _Out_ ${fileTimeName} *kernel, _Out_ ${fileTimeName} *user)`
    ),
    processImage: kernel32.func(
      'int __stdcall QueryFullProcessImageNameW(void *process, uint32 flags, void *buffer, _Inout_ uint32 *length)'
    ),
    lastError: kernel32.func('uint32 __stdcall GetLastError()'),
    openToken: advapi32.func(
      'int __stdcall OpenProcessToken(void *process, uint32 access, _Out_ void **token)'
    ),
    tokenInfo: advapi32.func(
      'int __stdcall GetTokenInformation(void *token, int type, void *value, uint32 bytes, _Out_ uint32 *length)'
    )
  }

  function check(ok: unknown, operation: string): void {
    if (!ok) throw nativeError(Number(api.lastError()), operation)
  }

  function physical<T>(action: () => T): T {
    const previous = api.setDpiContext(-4n)
    if (!previous) throw nativeError(Number(api.lastError()), 'SetThreadDpiAwarenessContext')
    try {
      return action()
    } finally {
      api.setDpiContext(previous)
    }
  }

  function readProcess(pid: number): ProcessDetails {
    const handle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
    if (!handle) throw nativeError(Number(api.lastError()), 'OpenProcess')
    try {
      const created = {}
      check(api.processTimes(handle, created, {}, {}, {}), 'GetProcessTimes')
      const image = Buffer.alloc(4096)
      const imageLength = [2048]
      check(api.processImage(handle, 0, image, imageLength), 'QueryFullProcessImageNameW')

      const token = [null]
      check(api.openToken(handle, TOKEN_QUERY, token), 'OpenProcessToken')
      try {
        const elevated = Buffer.alloc(4)
        check(
          api.tokenInfo(token[0], TOKEN_ELEVATION, elevated, 4, [0]),
          'GetTokenInformation'
        )
        const creation = created as { high?: number; low?: number }
        return {
          started: (
            (BigInt(creation.high ?? 0) << 32n) | BigInt(creation.low ?? 0)
          ).toString(),
          appName: basename(image.toString('utf16le', 0, imageLength[0] * 2)),
          elevated: elevated.readUInt32LE(0) !== 0
        }
      } finally {
        api.closeHandle(token[0])
      }
    } finally {
      api.closeHandle(handle)
    }
  }

  function readVisible(hwnd: bigint): {
    windowRect: NativeRect
    visibleRect: NativeRect
    placement: NativePlacement
    minimized: boolean
    maximized: boolean
    dpi: number
    workArea: NativeRect
  } {
    return physical(() => {
      const windowRect: NativeRect = { left: 0, top: 0, right: 0, bottom: 0 }
      const visibleRect: NativeRect = { left: 0, top: 0, right: 0, bottom: 0 }
      check(api.bounds(hwnd, windowRect), 'GetWindowRect')
      if (api.dwmRect(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, visibleRect, koffi.sizeof(rect)) !== 0) {
        Object.assign(visibleRect, windowRect)
      }
      const saved = { length: koffi.sizeof(placement) } as NativePlacement
      check(api.placement(hwnd, saved), 'GetWindowPlacement')
      const monitor = api.monitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)
      if (!monitor) throw nativeError(Number(api.lastError()), 'MonitorFromWindow')
      const info: MonitorInfo = {
        cbSize: koffi.sizeof(monitorInfo),
        rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
        rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
        flags: 0
      }
      check(api.monitorInfo(monitor, info), 'GetMonitorInfoW')
      return {
        windowRect,
        visibleRect,
        placement: saved,
        minimized: !!api.isMinimized(hwnd),
        maximized: !!api.isMaximized(hwnd),
        dpi: api.windowDpi(hwnd),
        workArea: info.rcWork
      }
    })
  }

  function titleOf(hwnd: bigint): string {
    const buffer = Buffer.alloc(1024)
    const length = api.title(hwnd, buffer, 512)
    return length > 0 ? buffer.toString('utf16le', 0, length * 2) : ''
  }

  function classOf(hwnd: bigint): string {
    const buffer = Buffer.alloc(512)
    const length = api.className(hwnd, buffer, 256)
    return length > 0 ? buffer.toString('utf16le', 0, length * 2) : ''
  }

  function read(identity: ExternalWindowIdentity): ExternalWindowSnapshot {
    const hwnd = BigInt(identity.hwnd)
    if (!api.isWindow(hwnd)) {
      throw new ExternalTilingAdapterError('window-missing', 'Window no longer exists')
    }
    const pid = [0]
    api.pid(hwnd, pid)
    if (pid[0] !== identity.pid) {
      throw new ExternalTilingAdapterError('identity-mismatch', 'Window process changed')
    }
    const process = readProcess(pid[0])
    if (process.started !== identity.started) {
      throw new ExternalTilingAdapterError('identity-mismatch', 'Window identity changed')
    }
    const current = readVisible(hwnd)
    const title = titleOf(hwnd)
    const style = Number(api.style(hwnd, GWL_STYLE))
    const unavailableReason = process.elevated
      ? '该应用以管理员权限运行，Deriva 无法控制其窗口。'
      : current.minimized
        ? '请先还原并排应用的最小化窗口。'
        : !(style & WS_SIZEBOX)
          ? '该窗口不允许调整大小。'
          : null
    const window: ExternalWindowSummary = {
      identity,
      appName: process.appName,
      title,
      bounds: current.windowRect,
      minimized: current.minimized,
      maximized: current.maximized,
      eligible: unavailableReason === null,
      unavailableReason
    }
    return {
      window,
      bounds: current.windowRect,
      visibleBounds: current.visibleRect,
      placement: current.placement
    }
  }

  function list(): ExternalWindowSummary[] {
    const windows: ExternalWindowSummary[] = []
    check(
      api.enumerate((hwnd: bigint) => {
        try {
          if (
            !api.isVisible(hwnd) ||
            api.root(hwnd, GA_ROOT) !== hwnd ||
            api.owner(hwnd, GW_OWNER) !== null ||
            titleOf(hwnd).length === 0 ||
            SYSTEM_CLASSES.has(classOf(hwnd))
          ) {
            return 1
          }
          const cloaked = [0]
          if (
            api.dwmUint(hwnd, DWMWA_CLOAKED, cloaked, 4) === 0 &&
            cloaked[0] !== 0
          ) {
            return 1
          }
          const pid = [0]
          api.pid(hwnd, pid)
          if (pid[0] === process.pid) return 1
          try {
            const process = readProcess(pid[0])
            const identity = {
              hwnd: `0x${hwnd.toString(16)}`,
              pid: pid[0],
              started: process.started
            }
            windows.push(read(identity).window)
          } catch (error) {
            const code =
              error instanceof ExternalTilingAdapterError ? error.code : 'access-denied'
            windows.push({
              identity: {
                hwnd: `0x${hwnd.toString(16)}`,
                pid: pid[0],
                started: ''
              },
              appName: '受保护的应用',
              title: titleOf(hwnd),
              bounds: { left: 0, top: 0, right: 0, bottom: 0 },
              minimized: !!api.isMinimized(hwnd),
              maximized: !!api.isMaximized(hwnd),
              eligible: false,
              unavailableReason:
                code === 'access-denied'
                  ? '该窗口需要更高权限，无法从 Deriva 控制。'
                  : '无法读取该窗口的状态。'
            })
          }
        } catch {
          // One disappearing or protected window must not fail the whole picker.
        }
        return 1
      }, 0),
      'EnumWindows'
    )
    return windows.sort((first, second) =>
      first.appName.localeCompare(second.appName) || first.title.localeCompare(second.title)
    )
  }

  function capture(identity: ExternalWindowIdentity): ExternalWindowSnapshot {
    const current = read(identity)
    if (current.window.minimized) {
      throw new ExternalTilingAdapterError('minimized-window', 'Window is minimized')
    }
    if (!current.window.eligible) {
      throw new ExternalTilingAdapterError(
        current.window.unavailableReason?.includes('管理员')
          ? 'elevated-window'
          : 'not-resizable',
        current.window.unavailableReason ?? 'Window cannot be tiled'
      )
    }
    return current
  }

  function tile(
    identity: ExternalWindowIdentity,
    target: ExternalWindowRect
  ): ExternalWindowSnapshot {
    let current = capture(identity)
    const hwnd = BigInt(identity.hwnd)
    if (current.window.maximized) {
      physical(() =>
        check(
          api.setPlacement(hwnd, {
            ...current.placement,
            flags: current.placement.flags | WPF_ASYNCWINDOWPLACEMENT,
            showCmd: SW_RESTORE
          }),
          'SetWindowPlacement'
        )
      )
      current = read(identity)
    }
    if (target.right <= target.left || target.bottom <= target.top) {
      throw new ExternalTilingAdapterError('geometry-refused', 'Target rectangle is invalid')
    }
    const outer = outerRectForVisibleTarget(
      current.bounds,
      current.visibleBounds,
      target
    )
    physical(() =>
      check(
        api.move(
          hwnd,
          null,
          outer.left,
          outer.top,
          outer.right - outer.left,
          outer.bottom - outer.top,
          SWP_NOZORDER | SWP_NOACTIVATE
        ),
        'SetWindowPos'
      )
    )
    const updated = read(identity)
    if (!visibleBoundsMatch(updated.visibleBounds, target)) {
      throw new ExternalTilingAdapterError(
        'geometry-refused',
        'The application refused the requested window geometry'
      )
    }
    return updated
  }

  function restore(snapshot: ExternalWindowSnapshot): ExternalWindowSnapshot {
    const hwnd = BigInt(snapshot.window.identity.hwnd)
    read(snapshot.window.identity)
    physical(() =>
      check(
        api.setPlacement(hwnd, {
          ...snapshot.placement,
          flags: snapshot.placement.flags | WPF_ASYNCWINDOWPLACEMENT
        }),
        'SetWindowPlacement'
      )
    )
    return read(snapshot.window.identity)
  }

  return {
    listWindows: list,
    read,
    capture,
    tile,
    restore
  } satisfies ExternalTilingAdapter
}

export function createWin32ExternalTilingAdapter(): ExternalTilingAdapter {
  return createBindings()
}
