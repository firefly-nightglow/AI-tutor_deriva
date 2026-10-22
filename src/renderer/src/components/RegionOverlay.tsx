import { useEffect, useState } from 'react'
import type { RegionOverlayInit, ScreenCaptureRect } from '../../../shared/types'
import { toUserMessage } from '../lib/errors'
import {
  isMeaningfulSelection,
  normalizeSelection,
  toPhysicalRect,
  type Point
} from '../lib/regionGeometry'

/** Frozen-source selector used for a display or a Deriva material viewport. */
export function RegionOverlay(): React.JSX.Element {
  const [init, setInit] = useState<RegionOverlayInit | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const [notice, setNotice] = useState('')

  const displayId = new URLSearchParams(window.location.search).get('displayId') ?? ''

  useEffect(() => {
    let cancelled = false
    void window.api.capture.regionInit(displayId).then((value) => {
      if (cancelled) return
      if (value === null) {
        void window.api.capture.regionCancel()
        return
      }
      setInit(value)
    })
    return () => {
      cancelled = true
    }
  }, [displayId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') void window.api.capture.regionCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function selection(point: Point | null = current): ScreenCaptureRect | null {
    return start === null || point === null ? null : normalizeSelection(start, point)
  }

  async function commit(end: Point): Promise<void> {
    const selected = selection(end)
    if (init === null || selected === null) return
    const physical = toPhysicalRect(
      selected,
      { width: window.innerWidth, height: window.innerHeight },
      { width: init.imageWidth, height: init.imageHeight }
    )
    if (!isMeaningfulSelection(physical)) {
      setNotice('选区太小，请重新框选')
      setStart(null)
      setCurrent(null)
      return
    }
    try {
      await window.api.capture.regionSelect(init.captureId, physical)
    } catch (cause) {
      setNotice(toUserMessage(cause))
      setStart(null)
      setCurrent(null)
    }
  }

  const selected = selection()

  return (
    <div
      className="region-overlay"
      onContextMenu={(event) => {
        event.preventDefault()
        void window.api.capture.regionCancel()
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const point = { x: event.clientX, y: event.clientY }
        setStart(point)
        setCurrent(point)
        setNotice('')
      }}
      onPointerMove={(event) => {
        if (start === null) return
        setCurrent({ x: event.clientX, y: event.clientY })
      }}
      onPointerUp={(event) => {
        if (start === null) return
        const end = { x: event.clientX, y: event.clientY }
        setCurrent(end)
        void commit(end)
      }}
    >
      {init !== null && (
        <img className="region-overlay__image" src={init.previewDataUrl} alt="屏幕框选背景" />
      )}
      {selected !== null && (
        <div
          className="region-overlay__selection"
          style={{
            left: `${selected.x}px`,
            top: `${selected.y}px`,
            width: `${selected.width}px`,
            height: `${selected.height}px`
          }}
        />
      )}
      <div className="region-overlay__hint">
        {notice === '' ? '拖拽框选，Esc 或右键取消' : notice}
      </div>
    </div>
  )
}
