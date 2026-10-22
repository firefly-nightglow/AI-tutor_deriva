import type { MaterialPanelState } from '../../../shared/types'
import type { MaterialEntry } from '../lib/materialPrefs'

interface MaterialPanelProps {
  state: MaterialPanelState
  url: string
  items: MaterialEntry[]
  activeUrl: string
  onSelect(url: string): void
  onRemove(): void
  zoom: number
  onZoom(factor: number): void
  onUrlChange(value: string): void
  onNavigate(event: React.FormEvent): void
  onReload(): void
  onBack(): void
  onForward(): void
  onStop(): void
  onPickFile(): void
  onClose(): void
  onRetry(): void
  viewportRef: React.RefObject<HTMLDivElement | null>
  style?: React.CSSProperties
}

/** Header and error surface for the native WebContentsView. The view covers the viewport slot. */
export function MaterialPanel({
  state,
  url,
  items,
  activeUrl,
  onSelect,
  onRemove,
  zoom,
  onZoom,
  onUrlChange,
  onNavigate,
  onReload,
  onBack,
  onForward,
  onStop,
  onPickFile,
  onClose,
  onRetry,
  viewportRef,
  style
}: MaterialPanelProps): React.JSX.Element {
  const loading = state.status === 'loading'
  const minZoom = state.minZoom ?? 1

  return (
    <section className="material-panel" style={style} title={state.title || undefined}>
      <header className="material-panel__bar">
        <button
          type="button"
          className="material-panel__nav"
          aria-label="资料后退"
          disabled={!state.canGoBack}
          onClick={onBack}
        >
          ‹
        </button>
        <button
          type="button"
          className="material-panel__nav"
          aria-label="资料前进"
          disabled={!state.canGoForward}
          onClick={onForward}
        >
          ›
        </button>
        <button
          type="button"
          className="material-panel__nav"
          aria-label={loading ? '停止加载' : '刷新资料'}
          onClick={loading ? onStop : onReload}
        >
          {loading ? '×' : '⟳'}
        </button>
        <form className="material-panel__address" onSubmit={onNavigate}>
          <input
            type="text"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="输入网址，例如 https://…"
            aria-label="资料网址"
          />
          <button type="submit" className="material-panel__go">
            打开
          </button>
        </form>
        <button type="button" className="material-panel__file" onClick={onPickFile}>
          文件
        </button>
        <button
          type="button"
          className="material-panel__close"
          aria-label="关闭资料面板"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="material-panel__tools">
        <select aria-label="已打开的资料" value={activeUrl} onChange={(event) => onSelect(event.target.value)}>
          {!items.some((item) => item.url === activeUrl) && <option value={activeUrl}>未打开资料</option>}
          {items.map((item) => <option key={item.url} value={item.url}>{item.label}</option>)}
        </select>
        <button type="button" className="material-panel__close" disabled={!activeUrl}
          title="移除当前资料（保留磁盘原文件）" aria-label="移除当前资料" onClick={onRemove}>×</button>
        <button type="button" className="material-panel__nav" disabled={zoom <= minZoom}
          title="缩小资料" aria-label="缩小资料" onClick={() => onZoom(Math.max(minZoom, zoom - 0.25))}>−</button>
        <button type="button" className="material-panel__go" title="相对初始大小；点击恢复" onClick={() => onZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="material-panel__nav" disabled={zoom >= 3}
          title="放大资料" aria-label="放大资料" onClick={() => onZoom(Math.min(3, zoom + 0.25))}>+</button>
      </div>
      <div className="material-panel__viewport" ref={viewportRef}>
        {state.status === 'error' && (
          <div className="material-panel__error" role="alert">
            <strong>资料加载失败</strong>
            <p>{state.error ?? '无法加载该资料，请检查网址或文件。'}</p>
            <div className="material-panel__error-actions">
              <button type="button" className="material-panel__go" onClick={onRetry}>
                重试
              </button>
              <button type="button" className="material-panel__file" onClick={onClose}>
                关闭面板
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
