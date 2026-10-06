import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Conversation, Subject } from '../../shared/types'
import { summarizeTitle } from '../../shared/text'
import { ConversationPane } from './components/ConversationPane'
import { ConversationGraph } from './components/ConversationGraph'
import { SettingsPanel } from './components/SettingsPanel'
import { SubjectSidebar } from './components/SubjectSidebar'
import { ancestorIds, depthOf, descendantCounts, groupConversations } from './lib/grouping'
import { expandCollapsed, readCollapsed, saveCollapsed, toggleCollapsed } from './lib/collapse'
import { readRailCollapsed, saveRailCollapsed } from './lib/collapse'
import {
  closePane,
  focusAfterClose,
  openPane,
  paneWidthFor,
  resizePanes,
  MIN_PANE_WIDTH
} from './lib/paneList'
import { branchSources } from './lib/branchMarks'
import { browserStorage } from './lib/drafts'
import { toUserMessage } from './lib/errors'
import {
  applyTheme,
  readThemePreference,
  saveThemePreference,
  type ThemePreference
} from './lib/theme'

/**
 * App owns only what two places must agree on: the subject list, the conversation list and which
 * conversation is open. Messages and streaming state live in the conversation pane (see GROUND-0003).
 */
export default function App(): React.JSX.Element {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [openIds, setOpenIds] = useState<string[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [paneWidths, setPaneWidths] = useState<Record<string, number>>({})
  const [railCollapsed, setRailCollapsed] = useState(() => readRailCollapsed(browserStorage()))
  const [view, setView] = useState<'conversations' | 'graph'>('conversations')
  const paneRefs = useRef(new Map<string, HTMLDivElement>())
  const panesRef = useRef<HTMLDivElement | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(window.localStorage))
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() =>
    readCollapsed(browserStorage())
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = (): void => {
      applyTheme(document.documentElement, theme, media.matches)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  const refresh = useCallback(async () => {
    try {
      const [subjectList, conversationList] = await Promise.all([
        window.api.subjects.list(),
        window.api.conversations.listAll()
      ])
      setSubjects(subjectList)
      setConversations(conversationList)
    } catch (cause) {
      setNotice(toUserMessage(cause))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Stable identity: ConversationPane depends on this for its stream subscription effect.
  const handleConversationChanged = useCallback(() => {
    void refresh()
  }, [refresh])

  const groups = useMemo(
    () => groupConversations(subjects, conversations, collapsedIds),
    [subjects, conversations, collapsedIds]
  )

  const openPanes = openIds
    .map((id) => conversations.find((item) => item.id === id))
    .filter((item): item is Conversation => item !== undefined)
  const branchMarks = useMemo(() => branchSources(conversations), [conversations])
  const deleteCounts = useMemo(() => descendantCounts(conversations), [conversations])

  // FR-7 draws the tree of the current 主对话; ancestorIds returns nearest-first, so the last id is
  // the root of whatever pane is focused.
  const graphRootId = useMemo(() => {
    if (focusedId === null) return null
    const chain = ancestorIds(conversations, focusedId)
    return chain.length === 0 ? focusedId : chain[chain.length - 1]
  }, [conversations, focusedId])

  // Single source of truth: deleting the focused conversation clears graphRootId while `view` stays
  // 'graph', which would otherwise leave the toggle labelled "对话视图" over the pane list.
  const showingGraph = view === 'graph' && graphRootId !== null

  function showConversation(id: string): void {
    setOpenIds((previous) => openPane(previous, id))
    setFocusedId(id)
  }

  function paneStyle(id: string): React.CSSProperties | undefined {
    const width = paneWidthFor(paneWidths, id, openPanes.length)
    return width === undefined ? undefined : { flex: `0 0 ${width}px` }
  }

  /** Dragging a divider rebalances the two panes it sits between; widths live for the session. */
  function startResize(event: React.PointerEvent, leftId: string, rightId: string): void {
    const left = paneRefs.current.get(leftId)
    const right = paneRefs.current.get(rightId)
    if (left === undefined || right === undefined) return
    event.preventDefault()

    const startX = event.clientX
    const leftWidth = left.getBoundingClientRect().width
    const rightWidth = right.getBoundingClientRect().width
    // The floor is readability, not the three-column basis: with three panes the basis already equals
    // a third of the container, so using it as the floor would clamp every drag back to a no-op.
    const min = MIN_PANE_WIDTH
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const divider = event.currentTarget as HTMLElement
    // Pointer capture keeps delivering moves even if the pointer leaves the 16px strip or the
    // container scrolls under it.
    divider.setPointerCapture?.(event.pointerId)

    // Coalesce moves to one update per frame: pointer events fire far more often than the display
    // refreshes, and each update re-renders the pane row.
    let frame = 0
    let pendingDelta = 0
    const onMove = (move: PointerEvent): void => {
      pendingDelta = move.clientX - startX
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const next = resizePanes(leftWidth, rightWidth, pendingDelta, min)
        setPaneWidths((previous) => ({ ...previous, [leftId]: next.left, [rightId]: next.right }))
      })
    }
    const onUp = (): void => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = previousUserSelect
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const paneSignature = openIds.join('|')

  /**
   * A drag records explicit pane widths. Those only make sense for the pane set they were chosen for:
   * once a pane opens or closes the survivors must reflow to fill the space, and a freshly opened pane
   * must start full width instead of inheriting a stale drag width (that stale value is what left a
   * lone pane at 1080px and pushed the leftmost pane out of view when three were open).
   */
  useEffect(() => {
    setPaneWidths({})
    panesRef.current?.scrollTo({ left: 0 })
  }, [paneSignature])

  // A collapsed ancestor would otherwise hide a node the app just selected (e.g. a fresh branch).
  useEffect(() => {
    if (focusedId === null) return
    setCollapsedIds((previous) => {
      const next = expandCollapsed(previous, ancestorIds(conversations, focusedId))
      if (next === previous) return previous
      saveCollapsed(browserStorage(), next)
      return new Set(next)
    })
  }, [focusedId, conversations])

  const guard = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
      setNotice('')
      await refresh()
    } catch (cause) {
      // Repository validation (duplicate subject name, unknown id) surfaces here as a readable message.
      setNotice(toUserMessage(cause))
    }
  }, [refresh])

  // Refs keep the id-addressed handlers stable, which is what lets memoized panes skip drag re-renders.
  const openIdsRef = useRef(openIds)
  openIdsRef.current = openIds

  const handlePaneClose = useCallback((id: string) => {
    setFocusedId((current) =>
      current === id ? focusAfterClose(openIdsRef.current, id) : current
    )
    setOpenIds((previous) => closePane(previous, id))
  }, [])

  // One preference for every pane: keeping it in App stops two open panes from disagreeing.
  const handleToggleRail = useCallback(() => {
    setRailCollapsed((previous) => {
      const next = !previous
      saveRailCollapsed(browserStorage(), next)
      return next
    })
  }, [])

  const handleOpenBranch = useCallback(
    (id: string, quote: string, sourceMessageId: string, visibleText: string) => {
      void guard(async () => {
        const branch = await window.api.conversations.create({
          parentConversationId: id,
          sourceMessageId,
          sourceQuote: quote,
          // Title from what the student saw; the quote itself keeps the LaTeX source.
          title: summarizeTitle(visibleText === '' ? quote : visibleText)
        })
        showConversation(branch.id)
      })
    },
    // showConversation only touches state setters, so depending on it would defeat stability.
    [guard]
  )

  return (
    <div className="app">
      <header className="app__header">
        <h1>Deriva</h1>
        <div className="app__header-actions">
          <button
            type="button"
            className="link"
            disabled={graphRootId === null}
            onClick={() => setView(showingGraph ? 'conversations' : 'graph')}
          >
            {showingGraph ? '对话视图' : '链路图'}
          </button>
          <button type="button" className="link" onClick={() => setShowSettings((value) => !value)}>
            {showSettings ? '收起设置' : '设置'}
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel
          theme={theme}
          onThemeChange={(next) => {
            setTheme(next)
            saveThemePreference(window.localStorage, next)
          }}
        />
      )}
      {notice !== '' && <p className="error app__notice">{notice}</p>}

      <div className="app__body">
        <SubjectSidebar
          groups={groups}
          selectedConversationId={focusedId}
          collapsedIds={collapsedIds}
          descendantCounts={deleteCounts}
          onToggleCollapsed={(id) =>
            setCollapsedIds((previous) => {
              const next = toggleCollapsed(previous, id)
              saveCollapsed(browserStorage(), next)
              return next
            })
          }
          onSelectConversation={showConversation}
          onCreateConversation={(subjectId) =>
            void guard(async () => {
              const created = await window.api.conversations.create({
                subjectId,
                title: '新对话'
              })
              showConversation(created.id)
            })
          }
          onRenameConversation={(id, title, subjectId) =>
            void guard(async () => {
              await window.api.conversations.rename(id, title)
              await window.api.conversations.moveToSubject(id, subjectId)
            })
          }
          onDeleteConversation={(id) =>
            void guard(async () => {
              const parentId = conversations.find((item) => item.id === id)?.parentConversationId ?? null
              await window.api.conversations.remove(id)
              // AC4: closing the pane of a deleted branch lands the student back on its parent.
              setOpenIds((previous) =>
                parentId === null ? closePane(previous, id) : openPane(closePane(previous, id), parentId)
              )
              setFocusedId((current) => (current === id ? parentId : current))
            })
          }
          onCreateSubject={(name) =>
            void guard(async () => {
              await window.api.subjects.create(name)
            })
          }
          onRenameSubject={(id, name) =>
            void guard(async () => {
              await window.api.subjects.rename(id, name)
            })
          }
          onDeleteSubject={(id) =>
            void guard(async () => {
              await window.api.subjects.remove(id)
            })
          }
        />

        <main className="app__main">
          {showingGraph ? (
            <ConversationGraph
              conversations={conversations}
              rootId={graphRootId}
              currentId={focusedId}
              onOpen={(id) => {
                showConversation(id)
                setView('conversations')
              }}
            />
          ) : openPanes.length === 0 ? (
            <section className="conversation conversation--empty">
              <h2>还没有打开任何对话</h2>
              <p>在左侧按科目新建或选择一个对话即可开始；可以同时打开多个对话对照查看。</p>
            </section>
          ) : (
            <div className="panes" ref={panesRef}>
              {openPanes.map((pane, index) => (
                <Fragment key={pane.id}>
                  {index > 0 && (
                    <div
                      className="pane-divider"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="调整面板宽度"
                      onPointerDown={(event) => startResize(event, openPanes[index - 1].id, pane.id)}
                    />
                  )}
                  <div
                    ref={(element) => {
                      if (element === null) paneRefs.current.delete(pane.id)
                      else paneRefs.current.set(pane.id, element)
                    }}
                    className={`pane${pane.id === focusedId ? ' is-focused' : ''}`}
                    style={paneStyle(pane.id)}
                    onMouseDown={() => setFocusedId(pane.id)}
                  >
                  <ConversationPane
                    conversation={pane}
                    levelLabel={depthOf(conversations, pane.id) === 0 ? '主对话' : `子对话 L${depthOf(conversations, pane.id)}`}
                    branchSources={branchMarks}
                    railCollapsed={railCollapsed}
                    onToggleRail={handleToggleRail}
                    onClose={handlePaneClose}
                    onConversationChanged={handleConversationChanged}
                    onOpenBranch={handleOpenBranch}
                  />
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
