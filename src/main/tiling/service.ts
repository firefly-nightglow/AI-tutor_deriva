import type {
  ExternalTilingState,
  ExternalWindowIdentity,
  ExternalWindowSummary
} from '../../shared/types'
import type { TilingDrawerFrame } from './controller'

type WorkerMethod =
  | 'getState'
  | 'listWindows'
  | 'preferredDrawerWidth'
  | 'selectWindow'
  | 'retile'
  | 'stop'
  | 'poll'
  | 'confirmPendingRestore'
  | 'discardPendingRestore'
  | 'dispose'

export interface TilingWorkerRequest {
  id: number
  method: WorkerMethod
  args?: ExternalWindowIdentity
}

export type TilingWorkerMessage =
  | TilingWorkerRequest
  | { event: 'drawer'; frame: TilingDrawerFrame | null }

interface TilingWorkerResponse {
  id: number
  ok: boolean
  result?: unknown
  error?: { message: string; code?: string }
}

interface TilingWorkerStateEvent {
  event: 'state'
  state: ExternalTilingState
}

export interface TilingWorkerLike {
  postMessage(message: TilingWorkerMessage): void
  kill(): boolean
  on(event: string, listener: (...args: unknown[]) => void): this
}

export interface ExternalTilingService {
  getState(): Promise<ExternalTilingState>
  listWindows(): Promise<ExternalWindowSummary[]>
  preferredDrawerWidth(): Promise<number | null>
  selectWindow(identity: ExternalWindowIdentity): Promise<ExternalTilingState>
  retile(): Promise<ExternalTilingState>
  stop(): Promise<ExternalTilingState>
  poll(): Promise<ExternalTilingState>
  confirmPendingRestore(): Promise<ExternalTilingState>
  discardPendingRestore(): Promise<ExternalTilingState>
  updateDrawer(frame: TilingDrawerFrame | null): void
  onStateChanged(listener: (state: ExternalTilingState) => void): () => void
  dispose(): Promise<void>
  disposeNow(): void
}

interface ServiceOptions {
  workerPath: string
  stateFilePath: string
  forkWorker?: (workerPath: string, stateFilePath: string) => TilingWorkerLike
  requestTimeoutMs?: number
}

const EMPTY_STATE: ExternalTilingState = {
  status: 'idle',
  selected: null,
  expectedBounds: null,
  error: null,
  canRetile: false,
  pendingRestore: false
}

function forkUtilityProcess(workerPath: string, stateFilePath: string): TilingWorkerLike {
  const { utilityProcess } = require('electron') as typeof import('electron')
  return utilityProcess.fork(workerPath, [stateFilePath], {
    serviceName: 'Deriva external tiling'
  }) as unknown as TilingWorkerLike
}

export function createExternalTilingService({
  workerPath,
  stateFilePath,
  forkWorker = forkUtilityProcess,
  requestTimeoutMs = 5000
}: ServiceOptions): ExternalTilingService {
  const worker = forkWorker(workerPath, stateFilePath)
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const listeners = new Set<(state: ExternalTilingState) => void>()
  let nextId = 1
  let spawned = false
  let workerAlive = true
  let terminationError: Error | null = null
  let disposed = false
  let pollInFlight = false
  let latestDrawer: TilingDrawerFrame | null = null
  let state = EMPTY_STATE
  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  void ready.catch(() => {})

  function notify(): void {
    for (const listener of listeners) listener(state)
  }

  function failAll(error: Error): void {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function onMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return
    if ('event' in message && message.event === 'state' && 'state' in message) {
      state = (message as TilingWorkerStateEvent).state
      notify()
      return
    }
    if (!('id' in message) || typeof message.id !== 'number') return
    const response = message as TilingWorkerResponse
    const entry = pending.get(response.id)
    if (entry === undefined) return
    pending.delete(response.id)
    clearTimeout(entry.timer)
    if (response.ok) {
      entry.resolve(response.result)
      return
    }
    const error = new Error(response.error?.message ?? 'External tiling worker failed')
    if (response.error?.code !== undefined) {
      Object.assign(error, { code: response.error.code })
    }
    entry.reject(error)
  }

  function onExit(...args: unknown[]): void {
    if (terminationError !== null) return
    const code = typeof args[0] === 'number' ? args[0] : -1
    const error = new Error(`External tiling worker exited (${code})`)
    const wasSpawned = spawned
    terminationError = error
    workerAlive = false
    spawned = false
    if (!wasSpawned) rejectReady(error)
    failAll(error)
    if (!disposed) {
      state = {
        ...state,
        status: 'error',
        error: '外部窗口控制进程异常退出，请重启 Deriva 后重试。'
      }
      notify()
    }
  }

  worker.on('spawn', () => {
    spawned = true
    resolveReady()
    worker.postMessage({ event: 'drawer', frame: latestDrawer })
  })
  worker.on('message', onMessage)
  worker.on('error', onExit)
  worker.on('exit', onExit)

  function send(message: TilingWorkerRequest): void {
    worker.postMessage(message)
  }

  async function request<T>(method: WorkerMethod, args?: ExternalWindowIdentity): Promise<T> {
    try {
      await ready
    } catch (error) {
      throw terminationError ?? error
    }
    if (disposed) throw new Error('External tiling service is disposed')
    if (terminationError !== null || !workerAlive) {
      throw terminationError ?? new Error('External tiling worker is not running')
    }
    const id = nextId++
    const message: TilingWorkerRequest = { id, method }
    if (args !== undefined) message.args = args
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.delete(id)) return
        const error = new Error(`External tiling worker request timed out (${method})`)
        const shouldKill = workerAlive
        terminationError = error
        workerAlive = false
        spawned = false
        failAll(error)
        if (!disposed) {
          state = {
            ...state,
            status: 'error',
            error: '外部窗口控制进程无响应，已终止；请重启 Deriva 后重试。'
          }
          notify()
        }
        if (shouldKill) worker.kill()
        reject(error)
      }, requestTimeoutMs)
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      })
      send(message)
    })
  }

  return {
    getState: () => request<ExternalTilingState>('getState'),
    listWindows: () => request<ExternalWindowSummary[]>('listWindows'),
    preferredDrawerWidth: () => request<number | null>('preferredDrawerWidth'),
    selectWindow: (identity) =>
      request<ExternalTilingState>('selectWindow', identity),
    retile: () => request<ExternalTilingState>('retile'),
    stop: () => request<ExternalTilingState>('stop'),
    confirmPendingRestore: () =>
      request<ExternalTilingState>('confirmPendingRestore'),
    discardPendingRestore: () =>
      request<ExternalTilingState>('discardPendingRestore'),
    async poll() {
      if (pollInFlight || disposed) return state
      pollInFlight = true
      try {
        return await request<ExternalTilingState>('poll')
      } catch {
        return state
      } finally {
        pollInFlight = false
      }
    },
    updateDrawer(frame) {
      latestDrawer = frame
      if (spawned && !disposed) {
        worker.postMessage({ event: 'drawer', frame })
      }
    },
    onStateChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async dispose() {
      if (disposed) return
      try {
        await Promise.race([
          request<null>('dispose'),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('External tiling worker dispose timed out')),
              2500
            )
          })
        ])
      } catch {
        // The persisted restore record remains available if graceful shutdown fails.
      } finally {
        this.disposeNow()
      }
    },
    disposeNow() {
      if (disposed) return
      const shouldKill = workerAlive
      disposed = true
      workerAlive = false
      latestDrawer = null
      failAll(new Error('External tiling service disposed'))
      listeners.clear()
      if (shouldKill) worker.kill()
    }
  }
}
