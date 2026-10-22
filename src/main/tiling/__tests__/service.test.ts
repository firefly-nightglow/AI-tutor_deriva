import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type {
  ExternalTilingState,
  ExternalWindowIdentity,
  ExternalWindowSummary
} from '../../../shared/types'
import {
  createExternalTilingService,
  type TilingWorkerLike,
  type TilingWorkerRequest
} from '../service'

class FakeWorker extends EventEmitter implements TilingWorkerLike {
  readonly sent: TilingWorkerRequest[] = []
  kill = vi.fn(() => true)

  postMessage(message: TilingWorkerRequest): void {
    this.sent.push(message)
  }
}

const idle: ExternalTilingState = {
  status: 'idle',
  selected: null,
  expectedBounds: null,
  error: null,
  canRetile: false,
  pendingRestore: false
}

const identity: ExternalWindowIdentity = {
  hwnd: '0x1234',
  pid: 900,
  started: '123456'
}

const window: ExternalWindowSummary = {
  identity,
  appName: 'Code.exe',
  title: 'Deriva',
  bounds: { left: 10, top: 10, right: 900, bottom: 700 },
  minimized: false,
  maximized: false,
  eligible: true,
  unavailableReason: null
}

function service(requestTimeoutMs?: number) {
  const worker = new FakeWorker()
  const controller = createExternalTilingService({
    workerPath: 'worker.js',
    stateFilePath: 'state.json',
    forkWorker: () => worker,
    requestTimeoutMs
  })
  worker.emit('spawn')
  return { worker, controller }
}

async function respond<T>(
  worker: FakeWorker,
  result: T
): Promise<TilingWorkerRequest> {
  await Promise.resolve()
  const request = worker.sent.at(-1)
  if (request === undefined || request.id === undefined) throw new Error('missing request')
  worker.emit('message', { id: request.id, ok: true, result })
  return request
}

describe('external tiling utility service', () => {
  it('returns state through the worker request protocol', async () => {
    const { worker, controller } = service()
    const pending = controller.getState()
    await respond(worker, idle)
    expect(await pending).toEqual(idle)
    controller.disposeNow()
  })

  it('forwards select, list and preferred width arguments', async () => {
    const { worker, controller } = service()

    const list = controller.listWindows()
    await respond(worker, [window])
    expect(await list).toEqual([window])

    const preferred = controller.preferredDrawerWidth()
    await respond(worker, 440)
    expect(await preferred).toBe(440)

    const selected = controller.selectWindow(identity)
    await respond(worker, { ...idle, status: 'active', selected: window })
    expect(await selected).toMatchObject({ status: 'active' })
    expect(worker.sent.at(-1)).toMatchObject({ method: 'selectWindow', args: identity })
    controller.disposeNow()
  })

  it('publishes worker state events to main-process subscribers', () => {
    const { worker, controller } = service()
    const states: ExternalTilingState[] = []
    const off = controller.onStateChanged((state) => states.push(state))
    const active = { ...idle, status: 'active' as const, selected: window }

    worker.emit('message', { event: 'state', state: active })

    expect(states).toEqual([active])
    off()
    controller.disposeNow()
  })

  it('requests worker disposal and kills it after acknowledgement', async () => {
    const { worker, controller } = service()
    const pending = controller.dispose()
    await Promise.resolve()
    const request = worker.sent.at(-1)
    if (request === undefined || request.id === undefined) throw new Error('missing dispose')
    worker.emit('message', { id: request.id, ok: true, result: null })
    await pending
    expect(worker.kill).toHaveBeenCalled()
  })

  it('rejects in-flight and future requests after the worker exits', async () => {
    const { worker, controller } = service()
    const pending = controller.getState()
    worker.emit('exit', 1)

    await expect(pending).rejects.toThrow('worker exited')
    await expect(controller.getState()).rejects.toThrow('worker exited')
    await expect(controller.poll()).resolves.toMatchObject({ status: 'error' })
    controller.disposeNow()
  })

  it('kills an unresponsive worker and rejects the pending request after a timeout', async () => {
    vi.useFakeTimers()
    const { worker, controller } = service(100)
    const pending = controller.getState()
    await Promise.resolve()

    vi.advanceTimersByTime(101)

    await expect(pending).rejects.toThrow('timed out')
    expect(worker.kill).toHaveBeenCalled()
    await expect(controller.getState()).rejects.toThrow('timed out')
    controller.disposeNow()
    vi.useRealTimers()
  })
})
