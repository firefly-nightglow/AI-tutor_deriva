// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TutorApi } from '../../../../shared/api'
import { RegionOverlay } from '../RegionOverlay'

const select = vi.fn(async () => undefined)
const cancel = vi.fn(async () => undefined)

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn()
  })
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn()
  })
})

beforeEach(() => {
  window.history.replaceState({}, '', '/?mode=region&displayId=1')
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })
  select.mockClear()
  cancel.mockClear()
  ;(window as unknown as { api: Partial<TutorApi> }).api = {
    capture: {
      listSources: vi.fn(),
      captureSource: vi.fn(),
      selectRegion: vi.fn(),
      regionInit: vi.fn(async () => ({
        captureId: 'capture-1',
        previewDataUrl: 'data:image/jpeg;base64,preview',
        imageWidth: 3840,
        imageHeight: 2160
      })),
      regionSelect: select,
      regionCancel: cancel
    }
  }
})

afterEach(cleanup)

describe('RegionOverlay', () => {
  it('maps a pointer drag to physical pixels and commits it', async () => {
    render(<RegionOverlay />)
    const overlay = await screen.findByAltText('屏幕框选背景')
    const root = overlay.parentElement as HTMLElement

    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 300, clientY: 250 })
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 300, clientY: 250 })

    await waitFor(() => expect(select).toHaveBeenCalledTimes(1))
    expect(select).toHaveBeenCalledWith('capture-1', {
      x: 300,
      y: 300,
      width: 600,
      height: 450
    })
  })

  it('cancels on Escape without committing a selection', async () => {
    render(<RegionOverlay />)
    await screen.findByAltText('屏幕框选背景')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
    expect(select).not.toHaveBeenCalled()
  })

  it('reports a closed material panel instead of incorrectly labelling the region too small', async () => {
    select.mockRejectedValueOnce(new Error('资料面板已关闭，请重新截图'))
    render(<RegionOverlay />)
    const root = (await screen.findByAltText('屏幕框选背景')).parentElement as HTMLElement
    fireEvent.pointerDown(root, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 300, clientY: 250 })
    expect(await screen.findByText(/资料面板已关闭/)).toBeTruthy()
  })
})
