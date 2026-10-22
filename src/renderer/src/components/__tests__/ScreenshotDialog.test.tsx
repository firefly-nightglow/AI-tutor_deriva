// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TutorApi } from '../../../../shared/api'
import type { ScreenCaptureResult, ScreenCaptureSource } from '../../../../shared/types'
import { ScreenshotDialog } from '../ScreenshotDialog'

const SOURCE: ScreenCaptureSource = {
  id: 'screen:1',
  name: '主显示器',
  kind: 'screen',
  displayId: '1',
  previewDataUrl: 'data:image/png;base64,preview'
}

const THUMBNAIL: ScreenCaptureResult['thumbnail'] = {
  kind: 'thumbnail',
  name: 'capture-thumbnail.jpg',
  mime: 'image/jpeg',
  dataUrl: 'data:image/jpeg;base64,thumb',
  width: 1280,
  height: 720,
  bytes: 3
}

const ORIGINAL: NonNullable<ScreenCaptureResult['original']> = {
  kind: 'original',
  name: 'capture-original.jpg',
  mime: 'image/jpeg',
  dataUrl: 'data:image/jpeg;base64,original',
  width: 3840,
  height: 2160,
  bytes: 6
}

const RESULT: ScreenCaptureResult = {
  source: SOURCE,
  thumbnail: THUMBNAIL,
  original: ORIGINAL,
  originalDowngraded: false
}

const captureApi = {
  listSources: vi.fn(async () => [SOURCE]),
  captureSource: vi.fn(async () => RESULT),
  selectRegion: vi.fn(async () => RESULT),
  regionInit: vi.fn(async () => null),
  regionSelect: vi.fn(async () => undefined),
  regionCancel: vi.fn(async () => undefined)
}

let configuredModel = 'deepseek-flash'

beforeEach(() => {
  captureApi.listSources.mockReset().mockResolvedValue([SOURCE])
  captureApi.captureSource.mockClear()
  captureApi.selectRegion.mockClear()
  captureApi.regionCancel.mockClear()
  window.localStorage.clear()
  configuredModel = 'deepseek-flash'
  ;(window as unknown as { api: Partial<TutorApi> }).api = {
    capture: captureApi,
    llm: {
      getConfig: async () => ({
        baseUrl: 'https://api.deepseek.com',
        model: configuredModel,
        contextStrategy: 'excerpt',
        summarySource: 'local'
      })
    } as TutorApi['llm']
  }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function renderDialog(question = '这个公式是什么意思') {
  const onClose = vi.fn()
  const onSend = vi.fn()
  const onQuestionChange = vi.fn()
  const { unmount } = render(
    <ScreenshotDialog
      question={question}
      streaming={false}
      onQuestionChange={onQuestionChange}
      onClose={onClose}
      onSend={onSend}
    />
  )
  return { onClose, onSend, onQuestionChange, unmount }
}

describe('ScreenshotDialog', () => {
  it('cancels a pending selection when the screenshot dialog is closed', async () => {
    let finish!: (result: ScreenCaptureResult | null) => void
    captureApi.selectRegion.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve as typeof finish }))
    const { unmount } = renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: '框选局部' }))
    await waitFor(() => expect(captureApi.selectRegion).toHaveBeenCalled())
    unmount()
    expect(captureApi.regionCancel).toHaveBeenCalledOnce()
    finish(null)
  })

  it('offers whole and region capture for the internal panel through the shared preview and send flow', async () => {
    const panel = { ...SOURCE, id: 'internal:material', kind: 'internal' as const,
      name: 'Deriva 资料面板 — 线性代数', displayId: null, previewDataUrl: '' }
    captureApi.listSources.mockResolvedValue([panel])
    const { onSend } = renderDialog()
    expect(await screen.findByText(panel.name)).toBeTruthy()
    expect(captureApi.listSources).toHaveBeenCalledWith(expect.objectContaining({ types: ['internal', 'screen', 'window'] }))
    fireEvent.click(screen.getByRole('button', { name: '框选局部' }))
    await screen.findByAltText('屏幕截图预览')
    expect(captureApi.selectRegion).toHaveBeenCalledWith('internal:material')
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ kind: 'capture', captureVariant: 'thumbnail' }))
  })

  it('shows why an internal panel is unavailable and disables both capture operations', async () => {
    captureApi.listSources.mockResolvedValue([{ ...SOURCE, id: 'internal:material', kind: 'internal',
      unavailableReason: '资料正在加载，请稍后重试' }])
    renderDialog()
    await screen.findByText('资料正在加载，请稍后重试')
    expect((screen.getByRole('button', { name: '整幅截图' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '框选局部' }) as HTMLButtonElement).disabled).toBe(true)
    expect(captureApi.captureSource).not.toHaveBeenCalled()
  })

  it('blocks screenshot questions when the configured model has no vision capability', async () => {
    configuredModel = 'deepseek-v4-pro'
    renderDialog()

    expect(await screen.findByText(/当前模型不支持视觉输入/)).toBeTruthy()
    expect(captureApi.listSources).not.toHaveBeenCalled()
  })

  it('passes privacy exclusions to source enumeration and blocks excluded targets before capture', async () => {
    window.localStorage.setItem(
      'deriva.capture.privacyExclusions',
      JSON.stringify({ excludedDisplayIds: ['1'], excludedWindowTitles: [] })
    )
    const { onSend } = renderDialog()

    await waitFor(() =>
      expect(captureApi.listSources).toHaveBeenCalledWith(
        expect.objectContaining({ excludedDisplayIds: ['1'] })
      )
    )
    fireEvent.click(await screen.findByRole('button', { name: '整幅截图' }))

    expect(await screen.findByText(/隐私排除/)).toBeTruthy()
    expect(captureApi.captureSource).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('opens the confirmation preview from a source region selection', async () => {
    renderDialog('框选这段推导')

    fireEvent.click(await screen.findByRole('button', { name: '框选局部' }))

    await waitFor(() => expect(captureApi.selectRegion).toHaveBeenCalledWith('screen:1'))
    expect(await screen.findByAltText('屏幕截图预览')).toBeTruthy()
  })

  it('lists sources, captures a selected source and sends the thumbnail by default', async () => {
    const { onSend } = renderDialog()

    const sourceButton = await screen.findByRole('button', { name: '整幅截图' })
    fireEvent.click(sourceButton)

    await waitFor(() => expect(captureApi.captureSource).toHaveBeenCalledWith('screen:1', {
      keepOriginal: true
    }))
    expect((await screen.findByAltText('屏幕截图预览')).getAttribute('src')).toBe(
      THUMBNAIL.dataUrl
    )

    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(onSend).toHaveBeenCalledWith({
      name: THUMBNAIL.name,
      mime: THUMBNAIL.mime,
      dataUrl: THUMBNAIL.dataUrl,
      kind: 'capture',
      captureVariant: 'thumbnail'
    })
  })

  it('sends the original only after the preview option is selected', async () => {
    const { onSend } = renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: '整幅截图' }))

    const original = await screen.findByRole('checkbox', { name: '保留原图' })
    fireEvent.click(original)
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ dataUrl: ORIGINAL.dataUrl, captureVariant: 'original' })
    )
  })

  it('cancels from the preview without sending or persisting a capture', async () => {
    const { onClose, onSend } = renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: '整幅截图' }))
    await screen.findByAltText('屏幕截图预览')

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('blocks sending while the question is blank', async () => {
    const { onSend } = renderDialog('   ')
    fireEvent.click(await screen.findByRole('button', { name: '整幅截图' }))
    await screen.findByAltText('屏幕截图预览')

    const send = screen.getByRole('button', { name: '发送' })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(send)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('opens a zoom view to inspect the selected screenshot before sending', async () => {
    renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: '整幅截图' }))
    await screen.findByAltText('屏幕截图预览')

    fireEvent.click(screen.getByRole('button', { name: '放大查看截图' }))
    expect(screen.getByAltText('放大的屏幕截图')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '放大截图' }))
    expect(screen.getByText('125%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByText('100%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByAltText('放大的屏幕截图')).toBeNull()
  })
})
