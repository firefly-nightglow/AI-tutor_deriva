import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  ExternalTilingState,
  ExternalWindowIdentity,
  ExternalWindowRect,
  ExternalWindowSnapshot,
  ExternalWindowSummary
} from '../../shared/types'

export interface TilingDrawerFrame {
  displayId: number
  edge: 'left' | 'right'
  workArea: ExternalWindowRect
  bounds: ExternalWindowRect
  scaleFactor: number
}

export interface ExternalTilingAdapter {
  listWindows(): ExternalWindowSummary[]
  read(identity: ExternalWindowIdentity): ExternalWindowSnapshot
  capture(identity: ExternalWindowIdentity): ExternalWindowSnapshot
  tile(identity: ExternalWindowIdentity, target: ExternalWindowRect): ExternalWindowSnapshot
  restore(snapshot: ExternalWindowSnapshot): ExternalWindowSnapshot
}

export interface ExternalTilingController {
  getState(): ExternalTilingState
  listWindows(): ExternalWindowSummary[]
  updateDrawer(frame: TilingDrawerFrame | null): void
  selectWindow(identity: ExternalWindowIdentity): ExternalTilingState
  stop(): ExternalTilingState
  retile(): ExternalTilingState
  poll(): ExternalTilingState
  confirmPendingRestore(): ExternalTilingState
  discardPendingRestore(): ExternalTilingState
  preferredDrawerWidth(): number | null
  onStateChanged(listener: (state: ExternalTilingState) => void): () => void
  dispose(): void
}

interface ControllerOptions {
  adapter: ExternalTilingAdapter
  stateFilePath: string
}

interface PersistedTilingState {
  version: 1
  selected: ExternalWindowSummary | null
  restore: ExternalWindowSnapshot | null
  ratios: Record<string, number>
}

function readPersisted(filePath: string): PersistedTilingState {
  try {
    if (!existsSync(filePath)) {
      return { version: 1, selected: null, restore: null, ratios: {} }
    }
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<PersistedTilingState>
    return {
      version: 1,
      selected: parsed.selected ?? null,
      restore: parsed.restore ?? null,
      ratios: parsed.ratios ?? {}
    }
  } catch {
    return { version: 1, selected: null, restore: null, ratios: {} }
  }
}

export function createExternalTilingController({
  adapter,
  stateFilePath
}: ControllerOptions): ExternalTilingController {
  const restored = readPersisted(stateFilePath)
  let drawer: TilingDrawerFrame | null = null
  let snapshot: ExternalWindowSnapshot | null = null
  let recoverySnapshot: ExternalWindowSnapshot | null = restored.restore
  let pausedForDrawer = false
  const ratios = new Map(
    Object.entries(restored.ratios).filter(
      (entry): entry is [string, number] =>
        Number.isFinite(entry[1]) && entry[1] > 0 && entry[1] < 1
    )
  )
  const listeners = new Set<(value: ExternalTilingState) => void>()
  let state: ExternalTilingState = {
    status: restored.restore !== null
      ? 'restore-pending'
      : restored.selected !== null
        ? 'paused'
        : 'idle',
    selected: restored.selected ?? restored.restore?.window ?? null,
    expectedBounds: null,
    error: null,
    canRetile: restored.restore === null && restored.selected !== null,
    pendingRestore: restored.restore !== null
  }

  function save(
    selected: ExternalWindowSummary | null,
    restore: ExternalWindowSnapshot | null,
    critical = false
  ): boolean {
    try {
      mkdirSync(dirname(stateFilePath), { recursive: true })
      writeFileSync(
        stateFilePath,
        JSON.stringify({
          version: 1,
          selected,
          restore,
          ratios: Object.fromEntries(ratios)
        } satisfies PersistedTilingState),
        { encoding: 'utf8', mode: 0o600 }
      )
      return true
    } catch {
      const error = Object.assign(new Error('无法保存窗口恢复记录。'), {
        code: 'storage-failed'
      })
      if (critical) throw error
      state = {
        ...state,
        error: '无法保存窗口恢复记录，当前会话仍可继续，但重启后可能无法恢复。'
      }
      return false
    }
  }

  function notify(): void {
    for (const listener of listeners) listener(state)
  }

  if (recoverySnapshot !== null) {
    try {
      adapter.read(recoverySnapshot.window.identity)
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : ''
      if (code === 'window-missing' || code === 'identity-mismatch') {
        recoverySnapshot = null
        state = {
          status: 'idle',
          selected: null,
          expectedBounds: null,
          error: null,
          canRetile: false,
          pendingRestore: false
        }
        save(null, null)
      }
    }
  }

  function rememberDrawerRatio(): void {
    if (drawer === null) return
    const width = drawer.bounds.right - drawer.bounds.left
    const workWidth = drawer.workArea.right - drawer.workArea.left
    if (width > 0 && workWidth > 0) {
      ratios.set(String(drawer.displayId), width / workWidth)
    }
  }

  function tileTarget(): ExternalWindowRect | null {
    if (drawer === null) return null
    return drawer.edge === 'right'
      ? {
          left: drawer.workArea.left,
          top: drawer.workArea.top,
          right: drawer.bounds.left,
          bottom: drawer.workArea.bottom
        }
      : {
          left: drawer.bounds.right,
          top: drawer.workArea.top,
          right: drawer.workArea.right,
          bottom: drawer.workArea.bottom
        }
  }

  function targetTooNarrow(target: ExternalWindowRect): boolean {
    return (
      drawer !== null &&
      target.right - target.left < Math.round(480 * drawer.scaleFactor)
    )
  }

  function errorCode(error: unknown): string {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  }

  function targetMissing(error: unknown): boolean {
    const code = errorCode(error)
    return code === 'window-missing' || code === 'identity-mismatch'
  }

  function selectionError(error: unknown): string {
    const code = errorCode(error)
    if (code === 'access-denied' || code === 'elevated-window') {
      return '无法控制该窗口。若应用以管理员权限运行，请使用 Windows 手动贴靠。'
    }
    if (code === 'window-missing' || code === 'identity-mismatch') {
      return '该窗口已关闭或发生变化，请刷新后重新选择。'
    }
    if (code === 'minimized-window') {
      return '请先还原并排应用的最小化窗口。'
    }
    if (code === 'storage-failed') {
      return '无法保存窗口恢复记录，已停止并排以避免丢失原始布局。'
    }
    return '无法并排该应用，请尝试还原窗口或使用 Windows 手动贴靠。'
  }

  function preserveFailedRollback(
    candidate: ExternalWindowSnapshot | null,
    error: unknown
  ): boolean {
    if (candidate === null || targetMissing(error)) return true
    try {
      adapter.restore(candidate)
      return true
    } catch {
      recoverySnapshot = candidate
      snapshot = null
      pausedForDrawer = false
      state = {
        status: 'restore-pending',
        selected: candidate.window,
        expectedBounds: null,
        error: '无法还原外部应用窗口，请手动确认后重试。',
        canRetile: false,
        pendingRestore: true
      }
      save(candidate.window, candidate)
      notify()
      return false
    }
  }

  function selectWindow(identity: ExternalWindowIdentity): ExternalTilingState {
    const selected = adapter.listWindows().find(
      (window) => window.identity.hwnd === identity.hwnd
    )
    const target = tileTarget()
    const tooNarrow = target !== null && targetTooNarrow(target)
    if (selected === undefined || !selected.eligible || target === null || tooNarrow) {
      state = {
        ...state,
        status: 'error',
        error: tooNarrow
          ? '屏幕空间不足：外部应用至少需要 480px 宽，请先缩窄 Deriva。'
          : selected?.unavailableReason ?? '当前没有可并排的悬浮抽屉。',
        canRetile: false
      }
      notify()
      return state
    }

    if (snapshot !== null) {
      try {
        adapter.restore(snapshot)
        snapshot = null
      } catch {
        recoverySnapshot = snapshot
        snapshot = null
        state = {
          ...state,
          status: 'restore-pending',
          expectedBounds: null,
          error: '无法还原当前并排应用，请先恢复它再更换。',
          canRetile: false,
          pendingRestore: true
        }
        save(state.selected, recoverySnapshot)
        notify()
        return state
      }
    }
    let tileAttempted = false
    try {
      rememberDrawerRatio()
      snapshot = adapter.capture(identity)
      save(selected, snapshot, true)
      tileAttempted = true
      const tiled = adapter.tile(identity, target)
      pausedForDrawer = false
      state = {
        status: 'active',
        selected: tiled.window,
        expectedBounds: target,
        error: null,
        canRetile: false,
        pendingRestore: false
      }
      save(tiled.window, snapshot)
    } catch (error) {
      if (tileAttempted && !preserveFailedRollback(snapshot, error)) return state
      snapshot = null
      save(null, null)
      state = {
        status: 'error',
        selected: null,
        expectedBounds: null,
        error: selectionError(error),
        canRetile: false,
        pendingRestore: false
      }
    }
    notify()
    return state
  }

  function resume(): void {
    if (drawer === null || state.selected === null) return
    const target = tileTarget()
    if (target === null) return
    let tileAttempted = false
    try {
      snapshot = adapter.capture(state.selected.identity)
      save(state.selected, snapshot, true)
      tileAttempted = true
      const tiled = adapter.tile(state.selected.identity, target)
      pausedForDrawer = false
      state = {
        ...state,
        status: 'active',
        selected: tiled.window,
        expectedBounds: target,
        error: null,
        canRetile: false
      }
      save(tiled.window, snapshot)
    } catch (error) {
      if (tileAttempted && !preserveFailedRollback(snapshot, error)) return
      snapshot = null
      pausedForDrawer = false
      const missing = targetMissing(error)
      state = {
        ...state,
        status: 'error',
        selected: missing ? null : state.selected,
        expectedBounds: null,
        error: missing ? '并排应用已关闭，请重新选择。' : selectionError(error),
        canRetile: !missing,
        pendingRestore: false
      }
      save(missing ? null : state.selected, null)
    }
    notify()
  }

  function confirmPendingRestore(): ExternalTilingState {
    if (recoverySnapshot === null) return state
    try {
      adapter.restore(recoverySnapshot)
      recoverySnapshot = null
      state = {
        status: 'idle',
        selected: null,
        expectedBounds: null,
        error: null,
        canRetile: false,
        pendingRestore: false
      }
      save(null, null)
    } catch {
      state = {
        ...state,
        status: 'error',
        error: '无法恢复上次的窗口位置，请手动调整。',
        pendingRestore: true
      }
    }
    notify()
    return state
  }

  function discardPendingRestore(): ExternalTilingState {
    recoverySnapshot = null
    state = {
      status: 'idle',
      selected: null,
      expectedBounds: null,
      error: null,
      canRetile: false,
      pendingRestore: false
    }
    save(null, null)
    notify()
    return state
  }

  function stop(): ExternalTilingState {
    if (snapshot !== null) {
      try {
        adapter.restore(snapshot)
        snapshot = null
      } catch {
        state = {
          ...state,
          status: 'error',
          error: '无法恢复外部应用的原窗口位置，请使用 Windows 手动调整。'
        }
        save(state.selected, snapshot)
        notify()
        return state
      }
    }
    recoverySnapshot = null
    pausedForDrawer = false
    state = {
      status: 'idle',
      selected: null,
      expectedBounds: null,
      error: null,
      canRetile: false,
      pendingRestore: false
    }
    save(null, null)
    notify()
    return state
  }

  function retile(): ExternalTilingState {
    if (
      state.selected === null ||
      drawer === null ||
      state.pendingRestore ||
      state.status === 'active'
    ) {
      return state
    }
    const target = tileTarget()
    if (target === null) return state
    let tileAttempted = false
    try {
      snapshot = adapter.capture(state.selected.identity)
      save(state.selected, snapshot, true)
      tileAttempted = true
      const tiled = adapter.tile(state.selected.identity, target)
      pausedForDrawer = false
      state = {
        status: 'active',
        selected: tiled.window,
        expectedBounds: target,
        error: null,
        canRetile: false,
        pendingRestore: false
      }
      save(tiled.window, snapshot)
    } catch (error) {
      if (tileAttempted && !preserveFailedRollback(snapshot, error)) return state
      snapshot = null
      const missing = targetMissing(error)
      state = {
        ...state,
        status: 'error',
        selected: missing ? null : state.selected,
        expectedBounds: null,
        error: missing ? '并排应用已关闭，请重新选择。' : selectionError(error),
        canRetile: !missing,
        pendingRestore: false
      }
      save(missing ? null : state.selected, null)
    }
    notify()
    return state
  }

  function rectDifference(first: ExternalWindowRect, second: ExternalWindowRect): number {
    return Math.max(
      Math.abs(first.left - second.left),
      Math.abs(first.top - second.top),
      Math.abs(first.right - second.right),
      Math.abs(first.bottom - second.bottom)
    )
  }

  function poll(): ExternalTilingState {
    if (
      state.status !== 'active' ||
      state.selected === null ||
      state.expectedBounds === null
    ) {
      return state
    }
    try {
      const current = adapter.read(state.selected.identity)
      if (rectDifference(current.visibleBounds, state.expectedBounds) <= 2) return state
      snapshot = null
      pausedForDrawer = false
      state = {
        ...state,
        status: 'paused',
        expectedBounds: null,
        error: null,
        canRetile: true,
        pendingRestore: false
      }
      save(state.selected, null)
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : ''
      if (code === 'window-missing' || code === 'identity-mismatch') {
        snapshot = null
        pausedForDrawer = false
        state = {
          status: 'error',
          selected: null,
          expectedBounds: null,
          error: '并排应用已关闭，请重新选择。',
          canRetile: false,
          pendingRestore: false
        }
        save(null, null)
      }
    }
    notify()
    return state
  }

  return {
    getState: () => state,
    listWindows: () => adapter.listWindows(),
    updateDrawer(frame) {
      drawer = frame
      if (frame === null) {
        if (state.status === 'active' && snapshot !== null) {
          try {
            adapter.restore(snapshot)
            snapshot = null
            save(state.selected, null)
            pausedForDrawer = true
            state = {
              ...state,
              status: 'paused',
              expectedBounds: null,
              canRetile: true
            }
          } catch {
            recoverySnapshot = snapshot
            snapshot = null
            pausedForDrawer = false
            state = {
              ...state,
              status: 'restore-pending',
              expectedBounds: null,
              error: '无法还原外部应用窗口，请手动确认后重试。',
              canRetile: false,
              pendingRestore: true
            }
            save(state.selected, recoverySnapshot)
          }
          notify()
        }
        return
      }
      if (state.status === 'active' && state.selected !== null && snapshot !== null) {
        const target = tileTarget()
        if (target === null) return
        try {
          if (targetTooNarrow(target)) {
            throw Object.assign(new Error('insufficient-space'), {
              code: 'geometry-refused'
            })
          }
          const tiled = adapter.tile(state.selected.identity, target)
          rememberDrawerRatio()
          state = {
            ...state,
            selected: tiled.window,
            expectedBounds: target,
            error: null
          }
          save(tiled.window, snapshot)
          notify()
        } catch (error) {
          if (!preserveFailedRollback(snapshot, error)) return
          snapshot = null
          pausedForDrawer = false
          const missing = targetMissing(error)
          state = {
            ...state,
            status: 'error',
            selected: missing ? null : state.selected,
            expectedBounds: null,
            error: missing ? '并排应用已关闭，请重新选择。' : selectionError(error),
            canRetile: !missing,
            pendingRestore: false
          }
          save(missing ? null : state.selected, null)
          notify()
        }
        return
      }
      if (pausedForDrawer) resume()
    },
    selectWindow,
    stop,
    retile,
    poll,
    confirmPendingRestore,
    discardPendingRestore,
    preferredDrawerWidth() {
      if (drawer === null) return null
      const ratio = ratios.get(String(drawer.displayId))
      if (ratio === undefined) return null
      const physicalWidth = (drawer.workArea.right - drawer.workArea.left) * ratio
      return Math.round(physicalWidth / drawer.scaleFactor)
    },
    onStateChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (snapshot !== null) {
        try {
          adapter.restore(snapshot)
          snapshot = null
          save(state.selected, null)
        } catch {
          save(state.selected, snapshot)
        }
      }
      if (recoverySnapshot !== null) {
        save(state.selected, recoverySnapshot)
      }
      recoverySnapshot = null
      listeners.clear()
    }
  }
}
