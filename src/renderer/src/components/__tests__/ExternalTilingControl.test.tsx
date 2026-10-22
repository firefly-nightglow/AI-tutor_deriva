// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TutorApi } from '../../../../shared/api'
import type {
  ExternalTilingState,
  ExternalWindowSummary
} from '../../../../shared/types'
import { ExternalTilingControl } from '../ExternalTilingControl'

const codeWindow: ExternalWindowSummary = {
  identity: { hwnd: '0x1234', pid: 900, started: '123456' },
  appName: 'Code.exe',
  title: 'Linear algebra notes',
  bounds: { left: 10, top: 10, right: 900, bottom: 700 },
  minimized: false,
  maximized: false,
  eligible: true,
  unavailableReason: null
}

const activeState: ExternalTilingState = {
  status: 'active',
  selected: codeWindow,
  expectedBounds: { left: 0, top: 0, right: 1160, bottom: 1000 },
  error: null,
  canRetile: false,
  pendingRestore: false
}

function pendingState(): ExternalTilingState {
  return {
    ...activeState,
    status: 'restore-pending',
    expectedBounds: null,
    canRetile: false,
    pendingRestore: true
  }
}

function installApi(state: ExternalTilingState): void {
  const api = {
    externalTiling: {
      getState: vi.fn(async () => state),
      listWindows: vi.fn(async () => [codeWindow]),
      selectWindow: vi.fn(async () => activeState),
      retile: vi.fn(async () => activeState),
      stop: vi.fn(async () => ({ ...state, status: 'idle', selected: null })),
      confirmPendingRestore: vi.fn(async () => ({ ...state, status: 'idle', selected: null })),
      discardPendingRestore: vi.fn(async () => ({ ...state, status: 'idle', selected: null })),
      onStateChanged: vi.fn(() => () => {})
    }
  }
  ;(window as unknown as { api: TutorApi }).api = api as unknown as TutorApi
}

describe('ExternalTilingControl', () => {
  beforeEach(() => installApi(activeState))
  afterEach(cleanup)

  it('lists eligible applications and starts tiling the selected one', async () => {
    const idle = {
      ...activeState,
      status: 'idle' as const,
      selected: null,
      expectedBounds: null
    }
    installApi(idle)
    render(<ExternalTilingControl floating />)

    fireEvent.click(screen.getByRole('button', { name: '并排应用' }))
    const target = await screen.findByRole('button', {
      name: /Code\.exe.*Linear algebra notes/
    })
    fireEvent.click(target)

    await waitFor(() =>
      expect(window.api.externalTiling.selectWindow).toHaveBeenCalledWith(codeWindow.identity)
    )
    expect(await screen.findByRole('button', { name: 'Code.exe' })).toBeTruthy()
  })

  it('asks before restoring a window left by an abnormal exit', async () => {
    installApi(pendingState())
    render(<ExternalTilingControl floating />)

    fireEvent.click(await screen.findByRole('button', { name: '需要恢复窗口' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复原窗口' }))

    await waitFor(() =>
      expect(window.api.externalTiling.confirmPendingRestore).toHaveBeenCalledOnce()
    )
  })

  it('surfaces an abnormal restore record even while Deriva is in normal mode', async () => {
    installApi(pendingState())
    render(<ExternalTilingControl floating={false} />)

    expect(await screen.findByRole('button', { name: '需要恢复窗口' })).toBeTruthy()
  })

  it('offers retry when the app was manually moved out of the tiled layout', async () => {
    const paused = {
      ...activeState,
      status: 'paused' as const,
      expectedBounds: null,
      canRetile: true
    }
    installApi(paused)
    render(<ExternalTilingControl floating />)

    fireEvent.click(await screen.findByRole('button', { name: /Code\.exe/ }))
    fireEvent.click(screen.getByRole('button', { name: '重新并排' }))

    await waitFor(() => expect(window.api.externalTiling.retile).toHaveBeenCalledOnce())
  })
})
