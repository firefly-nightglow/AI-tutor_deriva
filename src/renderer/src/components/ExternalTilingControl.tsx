import { useEffect, useState } from 'react'
import type {
  ExternalTilingState,
  ExternalWindowIdentity,
  ExternalWindowSummary
} from '../../../shared/types'
import { toUserMessage } from '../lib/errors'

interface ExternalTilingControlProps {
  floating: boolean
}

const EMPTY_STATE: ExternalTilingState = {
  status: 'idle',
  selected: null,
  expectedBounds: null,
  error: null,
  canRetile: false,
  pendingRestore: false
}

function statusLabel(state: ExternalTilingState): string {
  if (state.pendingRestore) return '需要恢复窗口'
  if (state.selected !== null) return state.selected.appName
  return '并排应用'
}

export function ExternalTilingControl({
  floating
}: ExternalTilingControlProps): React.JSX.Element | null {
  const [state, setState] = useState<ExternalTilingState>(EMPTY_STATE)
  const [open, setOpen] = useState(false)
  const [windows, setWindows] = useState<ExternalWindowSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void window.api.externalTiling.getState().then((next) => {
      if (active) setState(next)
    }).catch((cause) => {
      if (active) setError(toUserMessage(cause))
    })
    const unsubscribe = window.api.externalTiling.onStateChanged((next) => {
      setState(next)
      setError(next.error ?? '')
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!floating && !state.pendingRestore) return null

  async function loadWindows(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      setWindows(await window.api.externalTiling.listWindows())
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  function togglePanel(): void {
    const next = !open
    setOpen(next)
    if (next && !state.pendingRestore) void loadWindows()
  }

  async function select(identity: ExternalWindowIdentity): Promise<void> {
    setError('')
    try {
      const next = await window.api.externalTiling.selectWindow(identity)
      setState(next)
      setError(next.error ?? '')
      if (next.status === 'active') setOpen(false)
    } catch (cause) {
      setError(toUserMessage(cause))
    }
  }

  async function run(action: () => Promise<ExternalTilingState>): Promise<void> {
    setError('')
    try {
      const next = await action()
      setState(next)
      setError(next.error ?? '')
    } catch (cause) {
      setError(toUserMessage(cause))
    }
  }

  return (
    <div className="external-tiling">
      <button
        type="button"
        className={`external-tiling__trigger${state.pendingRestore ? ' has-alert' : ''}`}
        aria-expanded={open}
        onClick={togglePanel}
        title="选择要与 Deriva 并排的应用"
      >
        {statusLabel(state)}
      </button>
      {open && (
        <section className="external-tiling__panel" aria-label="外部应用并排">
          <div className="external-tiling__heading">
            <strong>
              {state.pendingRestore
                ? '恢复上次的窗口'
                : state.selected === null
                  ? '选择并排应用'
                  : '并排状态'}
            </strong>
            <button
              type="button"
              className="external-tiling__close"
              aria-label="关闭并排设置"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          {state.pendingRestore ? (
            <>
              <p>上次退出时，{state.selected?.appName ?? '外部应用'}尚未还原。Deriva 不会自动移动它。</p>
              <div className="external-tiling__actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void run(window.api.externalTiling.confirmPendingRestore)}
                >
                  恢复原窗口
                </button>
                <button
                  type="button"
                  onClick={() => void run(window.api.externalTiling.discardPendingRestore)}
                >
                  保留当前布局
                </button>
              </div>
            </>
          ) : (
            <>
              {state.selected !== null && (
                <div className="external-tiling__current">
                  <span>{state.status === 'active' ? '已并排' : '已暂停'}</span>
                  <strong>{state.selected.appName}</strong>
                  <span title={state.selected.title}>{state.selected.title}</span>
                </div>
              )}
              {(state.status === 'active' || state.status === 'paused') && (
                <div className="external-tiling__actions">
                  {state.canRetile && (
                    <button
                      type="button"
                      onClick={() => void run(window.api.externalTiling.retile)}
                    >
                      重新并排
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void run(window.api.externalTiling.stop)}
                  >
                    停止并排
                  </button>
                </div>
              )}
              <div className="external-tiling__list" role="list" aria-label="可并排窗口">
                {loading && <p>正在读取窗口…</p>}
                {!loading && windows.length === 0 && <p>没有找到可并排的窗口。</p>}
                {windows.map((item) => (
                  <div
                    key={`${item.identity.hwnd}:${item.identity.started}`}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="external-tiling__window"
                      disabled={!item.eligible}
                      onClick={() => void select(item.identity)}
                    >
                      <span>{item.appName}</span>
                      <span>{item.title}</span>
                      {!item.eligible && <small>{item.unavailableReason}</small>}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {error !== '' && <p className="external-tiling__error">{error}</p>}
        </section>
      )}
    </div>
  )
}
