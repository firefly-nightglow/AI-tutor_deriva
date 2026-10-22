import { createExternalTilingController } from './controller'
import { createWin32ExternalTilingAdapter } from './win32'
import type {
  TilingWorkerMessage,
  TilingWorkerRequest
} from './service'

interface ParentPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

const parentPort = (process as NodeJS.Process & { parentPort: ParentPort }).parentPort
const stateFilePath = process.argv.at(-1)
if (stateFilePath === undefined) throw new Error('Missing external tiling state path')

const controller = createExternalTilingController({
  adapter: createWin32ExternalTilingAdapter(),
  stateFilePath
})

controller.onStateChanged((state) => {
  parentPort.postMessage({ event: 'state', state })
})

function respond(id: number, result: unknown): void {
  parentPort.postMessage({ id, ok: true, result })
}

function fail(id: number, error: unknown): void {
  parentPort.postMessage({
    id,
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : undefined
    }
  })
}

parentPort.on('message', (event) => {
  const message = event.data as TilingWorkerMessage
  if ('event' in message && message.event === 'drawer') {
    controller.updateDrawer(message.frame)
    return
  }
  if (!('id' in message)) return
  const request = message as TilingWorkerRequest
  try {
    switch (request.method) {
      case 'getState':
        respond(request.id, controller.getState())
        break
      case 'listWindows':
        respond(request.id, controller.listWindows())
        break
      case 'preferredDrawerWidth':
        respond(request.id, controller.preferredDrawerWidth())
        break
      case 'selectWindow':
        if (request.args === undefined) throw new Error('Missing window identity')
        respond(request.id, controller.selectWindow(request.args))
        break
      case 'retile':
        respond(request.id, controller.retile())
        break
      case 'stop':
        respond(request.id, controller.stop())
        break
      case 'poll':
        respond(request.id, controller.poll())
        break
      case 'confirmPendingRestore':
        respond(request.id, controller.confirmPendingRestore())
        break
      case 'discardPendingRestore':
        respond(request.id, controller.discardPendingRestore())
        break
      case 'dispose':
        controller.dispose()
        respond(request.id, null)
        break
    }
  } catch (error) {
    fail(request.id, error)
  }
})
