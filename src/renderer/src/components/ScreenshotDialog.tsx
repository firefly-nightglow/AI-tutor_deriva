import { useEffect, useRef, useState } from 'react'
import type { OutgoingImage, ScreenCaptureResult, ScreenCaptureSource } from '../../../shared/types'
import { toUserMessage } from '../lib/errors'
import { readCaptureOriginalDefault } from '../lib/capturePrefs'
import { isSourceExcluded, readPrivacyPreferences } from '../lib/privacyPrefs'
import { supportsVisionModel } from '../lib/vision'

export interface ScreenshotDialogProps {
  question: string
  streaming: boolean
  onQuestionChange(value: string): void
  onClose(): void
  onSend(image: OutgoingImage): void
}

/** Source picker and confirmation preview for one screenshot question; nothing leaves memory before send. */
export function ScreenshotDialog(props: ScreenshotDialogProps): React.JSX.Element {
  const [sources, setSources] = useState<ScreenCaptureSource[]>([])
  const [selected, setSelected] = useState<ScreenCaptureResult | null>(null)
  const [keepOriginal, setKeepOriginal] = useState(() =>
    readCaptureOriginalDefault(window.localStorage)
  )
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [regionSelecting, setRegionSelecting] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [visionBlocked, setVisionBlocked] = useState<boolean | null>(null)
  const selectingRef = useRef(false)

  useEffect(() => () => {
    if (selectingRef.current) void window.api.capture.regionCancel()
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.api.llm
      .getConfig()
      .then((config) => {
        if (!cancelled) setVisionBlocked(!supportsVisionModel(config.model))
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(toUserMessage(cause))
          setVisionBlocked(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (visionBlocked !== false) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    const privacy = readPrivacyPreferences(window.localStorage)
    void window.api.capture
      .listSources({
        types: ['internal', 'screen', 'window'],
        excludedDisplayIds: privacy.excludedDisplayIds,
        excludedWindowTitles: privacy.excludedWindowTitles
      })
      .then((next) => {
        if (cancelled) return
        setSources(next)
      })
      .catch((cause) => {
        if (!cancelled) setError(toUserMessage(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey, visionBlocked])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || capturing) return
      if (zoomOpen) {
        setZoomOpen(false)
        return
      }
      props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [capturing, props, zoomOpen])

  useEffect(() => {
    const onFocus = (): void => setReloadKey((value) => value + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function capture(source: ScreenCaptureSource): Promise<void> {
    if (visionBlocked !== false) return
    if (isSourceExcluded(source, readPrivacyPreferences(window.localStorage))) {
      setError('该来源已在设置中被隐私排除，请选择其他来源。')
      return
    }
    setCapturing(true)
    setError('')
    try {
      const result = await window.api.capture.captureSource(source.id, { keepOriginal: true })
      setSelected(result)
      setKeepOriginal(readCaptureOriginalDefault(window.localStorage))
      setZoomOpen(false)
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setCapturing(false)
    }
  }

  async function selectSourceRegion(source: ScreenCaptureSource): Promise<void> {
    if (visionBlocked !== false) return
    if (isSourceExcluded(source, readPrivacyPreferences(window.localStorage))) {
      setError('该来源已在设置中被隐私排除，请选择其他来源。')
      return
    }
    setRegionSelecting(true)
    selectingRef.current = true
    setError('')
    try {
      const result = await window.api.capture.selectRegion(source.id)
      if (result === null) return
      setSelected(result)
      setKeepOriginal(readCaptureOriginalDefault(window.localStorage))
      setZoomOpen(false)
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      selectingRef.current = false
      setRegionSelecting(false)
    }
  }

  function reset(): void {
    setSelected(null)
    setKeepOriginal(readCaptureOriginalDefault(window.localStorage))
    setError('')
    setZoomOpen(false)
    setReloadKey((value) => value + 1)
  }

  function send(): void {
    const question = props.question.trim()
    if (selected === null || question === '' || props.streaming) return
    if (isSourceExcluded(selected.source, readPrivacyPreferences(window.localStorage))) {
      setError('该来源已在设置中被隐私排除，无法发送。')
      return
    }
    const image = keepOriginal && selected.original !== undefined ? selected.original : selected.thumbnail
    setZoomOpen(false)
    props.onSend({
      name: image.name,
      mime: image.mime,
      dataUrl: image.dataUrl,
      kind: 'capture',
      captureVariant: keepOriginal && selected.original !== undefined ? 'original' : 'thumbnail'
    })
  }

  const preview = selected === null
    ? null
    : keepOriginal && selected.original !== undefined
      ? selected.original
      : selected.thumbnail

  return (
    <div className="screenshot-overlay">
      <section
        className="screenshot-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-dialog-title"
      >
        <header className="screenshot-dialog__header">
          <h3 id="screenshot-dialog-title">{selected === null ? '选择屏幕内容' : '确认截图'}</h3>
          {selected === null && (
            <button
              type="button"
              className="secondary"
              disabled={regionSelecting || visionBlocked !== false}
              onClick={() => setReloadKey((value) => value + 1)}
            >
              刷新
            </button>
          )}
          <button type="button" className="pane-close" aria-label="关闭截图提问" onClick={() => props.onClose()}>
            ×
          </button>
        </header>

        {selected === null ? (
          <div className="screenshot-dialog__body">
            {visionBlocked === null ? (
              <p className="hint">正在读取窗口和显示器…</p>
            ) : visionBlocked ? (
              <p className="hint">
                当前模型不支持视觉输入。请在设置中改用 deepseek-flash 后再进行截图提问。
              </p>
            ) : loading ? (
              <p className="hint">正在读取窗口和显示器…</p>
            ) : sources.length === 0 ? (
              <p className="hint">没有可用的窗口或显示器。</p>
            ) : (
              <div className="screenshot-dialog__sources">
                {sources.map((source) => (
                  <div key={source.id} className="screenshot-source">
                    {source.previewDataUrl !== '' && <img src={source.previewDataUrl} alt="" />}
                    <span className="screenshot-source__name">{source.name}</span>
                    <span className="screenshot-source__kind">
                      {source.kind === 'screen'
                        ? '显示器'
                        : source.kind === 'internal'
                          ? '资料面板'
                          : '窗口'}
                    </span>
                    {source.unavailableReason && <p className="hint">{source.unavailableReason}</p>}
                    <div className="screenshot-source__actions">
                      <button
                        type="button"
                        disabled={capturing || regionSelecting || !!source.unavailableReason}
                        onClick={() => void capture(source)}
                      >
                        整幅截图
                      </button>
                      {(source.kind === 'screen' || source.kind === 'internal') && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={capturing || regionSelecting || !!source.unavailableReason}
                          onClick={() => void selectSourceRegion(source)}
                        >
                          框选局部
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(capturing || regionSelecting) && <p className="hint">正在截取屏幕…</p>}
          </div>
        ) : (
          <div className="screenshot-dialog__body">
            <div className="screenshot-dialog__preview-wrap">
              <img
                className="screenshot-dialog__preview"
                src={preview?.dataUrl}
                alt="屏幕截图预览"
                onClick={() => {
                  setZoom(1)
                  setZoomOpen(true)
                }}
              />
              <button
                type="button"
                className="secondary"
                aria-label="放大查看截图"
                onClick={() => {
                  setZoom(1)
                  setZoomOpen(true)
                }}
              >
                放大查看
              </button>
            </div>
            <label className="screenshot-dialog__option">
              <input
                type="checkbox"
                checked={keepOriginal}
                disabled={selected.original === undefined}
                onChange={(event) => setKeepOriginal(event.target.checked)}
              />
              <span>保留原图</span>
            </label>
            {selected.originalDowngraded && (
              <p className="hint">原图超过 8 MB，已降级为缩略图。</p>
            )}
            <textarea
              value={props.question}
              onChange={(event) => props.onQuestionChange(event.target.value)}
              placeholder="输入要问的问题，截图会随问题一起发送"
              aria-label="截图提问"
              rows={3}
            />
          </div>
        )}

        {error !== '' && <p className="error">{error}</p>}

        <footer className="screenshot-dialog__actions">
          {selected !== null && (
            <button type="button" className="secondary" onClick={reset}>
              重新截取
            </button>
          )}
          <button type="button" className="secondary" onClick={() => props.onClose()}>
            取消
          </button>
          {selected !== null && (
            <button
              type="button"
              disabled={props.question.trim() === '' || props.streaming}
              onClick={send}
            >
              发送
            </button>
          )}
        </footer>
      </section>

      {zoomOpen && preview !== null && (
        <section className="screenshot-zoom" role="dialog" aria-modal="true" aria-label="放大查看截图">
          <header className="screenshot-zoom__bar">
            <span>放大查看</span>
            <button
              type="button"
              aria-label="缩小截图"
              disabled={zoom <= 1}
              onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
            >
              −
            </button>
            <span className="screenshot-zoom__level">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="放大截图"
              disabled={zoom >= 4}
              onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
            >
              +
            </button>
            <button type="button" className="secondary" onClick={() => setZoom(1)}>
              重置
            </button>
            <button type="button" className="secondary" onClick={() => setZoomOpen(false)}>
              关闭
            </button>
          </header>
          <div className="screenshot-zoom__canvas">
            <img
              src={preview.dataUrl}
              alt="放大的屏幕截图"
              style={{ width: `${zoom * 100}%` }}
            />
          </div>
        </section>
      )}
    </div>
  )
}
