import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Conversation,
  MaterialPanelState,
  Subject,
  WindowUiState
} from '../../shared/types'
import { summarizeTitle } from '../../shared/text'
import { ConversationPane } from './components/ConversationPane'
import { ConversationGraph } from './components/ConversationGraph'
import { ExternalTilingControl } from './components/ExternalTilingControl'
import { MaterialPanel } from './components/MaterialPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SubjectSidebar } from './components/SubjectSidebar'
import { ancestorIds, depthOf, descendantCounts, groupConversations } from './lib/grouping'
import { expandCollapsed, readCollapsed, saveCollapsed, toggleCollapsed } from './lib/collapse'
import { readCollapsedRails, saveCollapsedRails, toggleCollapsedRail } from './lib/collapse'
import {
  closePane,
  focusAfterClose,
  openPane,
  paneSizeFor,
  resizePanes,
  MIN_PANE_HEIGHT,
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
import { readCaptureOriginalDefault, saveCaptureOriginalDefault } from './lib/capturePrefs'
import { materialEntries, rememberMaterial, removeMaterial, readMaterialPrefs, saveMaterialPrefs, type MaterialPrefs } from './lib/materialPrefs'

const DEFAULT_WINDOW_STATE: WindowUiState = {
  mode: 'normal',
  collapsed: false,
  edge: null,
  drawerWidth: 440,
  maxDrawerWidth: null,
  shortcut: null,
  shortcutRegistered: false
}

const DEFAULT_MATERIAL_STATE: MaterialPanelState = {
  status: 'closed',
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  error: null
}

/**
 * App owns only what two places must agree on: the subject list, the conversation list and which
 * conversation is open. Messages and streaming state live in the conversation pane (see GROUND-0003).
 */
export default function App(): React.JSX.Element {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [openIds, setOpenIds] = useState<string[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [paneSizes, setPaneSizes] = useState<Record<string, number>>({})
  const [collapsedRails, setCollapsedRails] = useState<Set<string>>(() =>
    readCollapsedRails(browserStorage())
  )
  const [view, setView] = useState<'conversations' | 'graph'>('conversations')
  const paneRefs = useRef(new Map<string, HTMLDivElement>())
  const panesRef = useRef<HTMLDivElement | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [floatingSidebarOpen, setFloatingSidebarOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [drawerResizeLimited, setDrawerResizeLimited] = useState(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference(window.localStorage))
  const [captureDefaultOriginal, setCaptureDefaultOriginal] = useState(() =>
    readCaptureOriginalDefault(window.localStorage)
  )
  const [windowState, setWindowState] = useState<WindowUiState>(DEFAULT_WINDOW_STATE)
  const [materialPrefs, setMaterialPrefs] = useState<MaterialPrefs>(() =>
    readMaterialPrefs(window.localStorage)
  )
  const [materialState, setMaterialState] =
    useState<MaterialPanelState>(DEFAULT_MATERIAL_STATE)
  const materialViewportRef = useRef<HTMLDivElement | null>(null)
  const materialContainerRef = useRef<HTMLElement | null>(null)
  const materialInitializedRef = useRef(false)
  const [materialZoom, setMaterialZoom] = useState(1)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() =>
    readCollapsed(browserStorage())
  )
  const floating = windowState.mode === 'floating'
  const materialOpen = materialPrefs.open
  const materialRatio = floating ? materialPrefs.floatingRatio : materialPrefs.normalRatio

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

  useEffect(() => {
    void window.api.windowControl.getState().then((state) => {
      if (state) setWindowState(state)
    })
    const offState = window.api.windowControl.onStateChanged(setWindowState)
    const offSettings = window.api.windowControl.onOpenSettings(() => setShowSettings(true))
    return () => {
      offState()
      offSettings()
    }
  }, [])

  useEffect(() => {
    setFloatingSidebarOpen(false)
    setOverflowOpen(false)
  }, [windowState.mode])

  useEffect(() => {
    if (!windowState.collapsed) return
    setFloatingSidebarOpen(false)
    setOverflowOpen(false)
  }, [windowState.collapsed])

  useEffect(() => {
    if (!overflowOpen) return
    const close = (): void => setOverflowOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [overflowOpen])

  useEffect(() => {
    const off = window.api.materialPanel.onStateChanged(setMaterialState)
    if (!materialInitializedRef.current) {
      materialInitializedRef.current = true
      saveMaterialPrefs(window.localStorage, materialPrefs)
      if (materialPrefs.open) {
        void window.api.materialPanel.open(materialPrefs.url || null).then(setMaterialState)
      }
    }
    return off
  }, [])

  useEffect(() => {
    setMaterialZoom(materialState.zoom ?? 1)
  }, [materialState.zoom])

  useEffect(() => {
    if (!materialOpen) return
    const slot = materialViewportRef.current
    if (slot === null) return
    let frame = 0
    const send = (): void => {
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const rect = slot.getBoundingClientRect()
        window.api.materialPanel.setBounds({
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.max(0, Math.round(rect.width)),
          height: Math.max(0, Math.round(rect.height))
        })
      })
    }
    send()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => send())
    observer?.observe(slot)
    window.addEventListener('resize', send)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', send)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [materialOpen, floating])

  useEffect(() => {
    if (!materialOpen) return
    let previous: boolean | undefined
    const sync = (): void => {
      // A native child view is above the DOM regardless of the dialog's CSS z-index.
      const visible = !(floating && floatingSidebarOpen) && materialState.status !== 'error' &&
        document.querySelector('[aria-modal="true"]') === null
      if (visible === previous) return
      previous = visible
      window.api.materialPanel.setVisible(visible)
    }
    sync()
    const observer = new MutationObserver((records) => {
      const hasModal = (node: Node): boolean => node instanceof Element &&
        (node.matches('[aria-modal="true"]') || node.querySelector('[aria-modal="true"]') !== null)
      if (records.some((record) => record.type === 'attributes' ||
        [...record.addedNodes, ...record.removedNodes].some(hasModal))) sync()
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] })
    return () => observer.disconnect()
  }, [materialOpen, floating, floatingSidebarOpen, materialState.status])

  useEffect(() => {
    if (!materialOpen || materialState.status !== 'ready') return
    if (!materialState.url.startsWith('http')) return
    setMaterialPrefs((previous) => {
      if (previous.url === materialState.url && previous.label === materialState.url) {
        return previous
      }
      const next = { ...previous, ...rememberMaterial(previous, { url: materialState.url, label: materialState.url }) }
      saveMaterialPrefs(window.localStorage, next)
      return next
    })
  }, [materialOpen, materialState.status, materialState.url])

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
    setFloatingSidebarOpen(false)
  }

  function paneStyle(id: string): React.CSSProperties | undefined {
    const size = paneSizeFor(paneSizes, id, openPanes.length)
    return size === undefined ? undefined : { flex: `0 0 ${size}px` }
  }

  /**
   * The same divider gesture rebalances widths in normal mode and heights in the floating drawer.
   * Only the axis and readable floor change; the pair keeps its total size.
   */
  function startResize(event: React.PointerEvent, firstId: string, secondId: string): void {
    const first = paneRefs.current.get(firstId)
    const second = paneRefs.current.get(secondId)
    if (first === undefined || second === undefined) return
    event.preventDefault()

    const vertical = floating
    const start = vertical ? event.clientY : event.clientX
    const firstSize = vertical
      ? first.getBoundingClientRect().height
      : first.getBoundingClientRect().width
    const secondSize = vertical
      ? second.getBoundingClientRect().height
      : second.getBoundingClientRect().width
    // The floor is readability, not the three-column basis: with three panes the basis already equals
    // a third of the container, so using it as the floor would clamp every drag back to a no-op.
    const min = vertical ? MIN_PANE_HEIGHT : MIN_PANE_WIDTH
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
      pendingDelta = (vertical ? move.clientY : move.clientX) - start
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const next = resizePanes(firstSize, secondSize, pendingDelta, min)
        setPaneSizes((previous) => ({
          ...previous,
          [firstId]: next.left,
          [secondId]: next.right
        }))
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

  /**
   * The drawer's inner edge is resized in screen coordinates: the window itself moves while its
   * width changes, so clientX would feed the motion back into the next pointer event.
   */
  function startDrawerResize(event: React.PointerEvent): void {
    if (!floating) return
    event.preventDefault()
    const startX = event.screenX
    const startWidth = window.innerWidth
    const maxWidth = windowState.maxDrawerWidth ?? 720
    const direction = windowState.edge === 'left' ? 1 : -1
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture?.(event.pointerId)

    let frame = 0
    let pendingWidth = startWidth
    const onMove = (move: PointerEvent): void => {
      const rawWidth = startWidth + direction * (move.screenX - startX)
      pendingWidth = Math.min(Math.max(rawWidth, 360), maxWidth)
      setDrawerResizeLimited(rawWidth > maxWidth)
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        void window.api.windowControl.setDrawerWidth(pendingWidth, false)
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
      void window.api.windowControl.setDrawerWidth(pendingWidth, true).then(setWindowState)
      window.setTimeout(() => setDrawerResizeLimited(false), 350)
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
    setPaneSizes({})
    panesRef.current?.scrollTo({ left: 0, top: 0 })
  }, [paneSignature, floating])

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

  // Each pane owns its own rail preference; App only stores which conversation ids are collapsed.
  const handleToggleRail = useCallback((id: string) => {
    setCollapsedRails((previous) => {
      const next = toggleCollapsedRail(previous, id)
      saveCollapsedRails(browserStorage(), next)
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

  function toggleWindowMode(): void {
    void window.api.windowControl
      .setMode(windowState.mode === 'floating' ? 'normal' : 'floating')
      .then(setWindowState)
  }

  function collapseWindow(): void {
    setFloatingSidebarOpen(false)
    setOverflowOpen(false)
    void window.api.windowControl.collapse().then(setWindowState)
  }

  function updateMaterialPrefs(patch: Partial<MaterialPrefs>): void {
    setMaterialPrefs((previous) => {
      const next = { ...previous, ...patch }
      saveMaterialPrefs(window.localStorage, next)
      return next
    })
  }

  function toggleMaterialPanel(): void {
    if (materialPrefs.open) {
      updateMaterialPrefs({ open: false, url: '', label: '', items: [] })
      setMaterialState(DEFAULT_MATERIAL_STATE)
      void window.api.materialPanel.close()
      setMaterialZoom(1)
      return
    }
    updateMaterialPrefs({ open: true, url: '', label: '', items: [] })
    setMaterialState({ ...DEFAULT_MATERIAL_STATE, status: 'loading' })
    void window.api.materialPanel.open(null).then(setMaterialState)
  }

  function handleMaterialNavigate(event: React.FormEvent): void {
    event.preventDefault()
    const value = materialPrefs.label.trim()
    if (value === '') return
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).href
      updateMaterialPrefs(rememberMaterial(materialPrefs, { url, label: url }))
      void window.api.materialPanel.navigate(url).then(setMaterialState)
    } catch {
      setNotice('请输入有效的网址。')
    }
  }

  function handleMaterialPickFile(): void {
    void window.api.materialPanel.pickFile().then((file) => {
      if (file === null) return
      updateMaterialPrefs(rememberMaterial(materialPrefs, { url: file.url, label: file.name }))
      void window.api.materialPanel.navigate(file.url).then(setMaterialState)
    })
  }

  function handleMaterialRemove(): void {
    const next = removeMaterial(materialPrefs)
    updateMaterialPrefs(next)
    setMaterialState({ ...DEFAULT_MATERIAL_STATE, status: 'loading' })
    setMaterialZoom(1)
    // Recreate the native view so Back cannot resurrect a removed resource.
    void window.api.materialPanel.close().then(() =>
      window.api.materialPanel.open(next.url || null)
    ).then(setMaterialState).catch((error) => setNotice(toUserMessage(error)))
  }

  function handleMaterialSelect(url: string): void {
    const entry = materialEntries(materialPrefs).find((item) => item.url === url)
    if (!entry) return
    updateMaterialPrefs(entry)
    void window.api.materialPanel.navigate(url).then(setMaterialState)
  }

  function startMaterialResize(event: React.PointerEvent): void {
    if (!materialOpen) return
    const container = materialContainerRef.current
    if (container === null) return
    event.preventDefault()
    const rect = container.getBoundingClientRect()
    const vertical = floating
    const start = vertical ? event.clientY : event.clientX
    const startRatio = materialRatio
    const total = vertical ? rect.height : rect.width
    if (total <= 0) return
    const key = vertical ? 'floatingRatio' : 'normalRatio'
    let latest = startRatio
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture?.(event.pointerId)

    let frame = 0
    const onMove = (move: PointerEvent): void => {
      const delta = (vertical ? move.clientY : move.clientX) - start
      latest = Math.min(0.75, Math.max(0.25, startRatio + delta / total))
      if (frame !== 0) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setMaterialPrefs((previous) => ({ ...previous, [key]: latest }))
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
      setMaterialPrefs((previous) => {
        const next = { ...previous, [key]: latest }
        saveMaterialPrefs(window.localStorage, next)
        return next
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const sidebarNode = (
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
  )

  return (
    <div
      className={`app${
        floating ? ` app--floating app--floating--${windowState.edge ?? 'right'}` : ''
      }`}
    >
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden="true">
            D
          </span>
          <h1>Deriva</h1>
        </div>
        {floating ? (
          <div className="app__header-actions app__header-actions--floating">
            <button
              type="button"
              className="icon-button"
              aria-label="打开对话侧栏"
              aria-expanded={floatingSidebarOpen}
              onClick={() => setFloatingSidebarOpen((value) => !value)}
            >
              ☰
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="收起 Deriva"
              onClick={collapseWindow}
            >
              {windowState.edge === 'left' ? '‹' : '›'}
            </button>
            <ExternalTilingControl floating={floating} />
            <div
              className="app__overflow"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="icon-button"
                aria-label="更多操作"
                aria-expanded={overflowOpen}
                onClick={() => setOverflowOpen((value) => !value)}
              >
                ⋯
              </button>
              {overflowOpen && (
                <div className="app__overflow-menu" role="menu">
                  <button type="button" role="menuitem" onClick={toggleWindowMode}>
                    普通窗口
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={graphRootId === null}
                    onClick={() => {
                      setView(showingGraph ? 'conversations' : 'graph')
                      setOverflowOpen(false)
                    }}
                  >
                    {showingGraph ? '对话视图' : '链路图'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      toggleMaterialPanel()
                      setOverflowOpen(false)
                    }}
                  >
                    {materialOpen ? '关闭资料面板' : '资料面板'}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowSettings((value) => !value)
                      setOverflowOpen(false)
                    }}
                  >
                    {showSettings ? '收起设置' : '设置'}
                  </button>
                </div>
              )}
            </div>
            <div className="window-controls window-controls--floating">
              <button
                type="button"
                aria-label="最小化窗口"
                onClick={() => void window.api.windowControl.minimize()}
              >
                −
              </button>
              <button
                type="button"
                aria-label="关闭窗口"
                onClick={() => void window.api.windowControl.close()}
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <div className="app__header-actions">
            <button type="button" className="link" onClick={toggleWindowMode}>
              悬浮窗
            </button>
            <button type="button" className="link" onClick={toggleMaterialPanel}>
              {materialOpen ? '关闭资料' : '资料面板'}
            </button>
            <button
              type="button"
              className="link"
              disabled={graphRootId === null}
              onClick={() => setView(showingGraph ? 'conversations' : 'graph')}
            >
              {showingGraph ? '对话视图' : '链路图'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => setShowSettings((value) => !value)}
            >
              {showSettings ? '收起设置' : '设置'}
            </button>
            <ExternalTilingControl floating={false} />
            <div className="window-controls">
              <button
                type="button"
                aria-label="最小化窗口"
                onClick={() => void window.api.windowControl.minimize()}
              >
                −
              </button>
              <button
                type="button"
                aria-label="最大化或还原窗口"
                onClick={() => void window.api.windowControl.toggleMaximize()}
              >
                □
              </button>
              <button
                type="button"
                aria-label="关闭窗口"
                onClick={() => void window.api.windowControl.close()}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </header>

      {showSettings && (
        <SettingsPanel
          theme={theme}
          onThemeChange={(next) => {
            setTheme(next)
            saveThemePreference(window.localStorage, next)
          }}
          captureDefaultOriginal={captureDefaultOriginal}
          onCaptureDefaultOriginalChange={(next) => {
            setCaptureDefaultOriginal(next)
            saveCaptureOriginalDefault(window.localStorage, next)
          }}
        />
      )}
      {notice !== '' && <p className="error app__notice">{notice}</p>}

      <div className={`app__body${floating ? ' app__body--floating' : ''}`}>
        {floating ? (
          <>
            {floatingSidebarOpen && (
              <button
                type="button"
                className="drawer-backdrop"
                aria-label="关闭对话侧栏"
                onClick={() => setFloatingSidebarOpen(false)}
              />
            )}
            <div className={`drawer-sidebar${floatingSidebarOpen ? ' is-open' : ''}`}>
              {sidebarNode}
            </div>
          </>
        ) : (
          sidebarNode
        )}

        <main
          ref={materialContainerRef}
          className={`app__main${
            materialOpen
              ? ` app__main--split app__main--split-${floating ? 'vertical' : 'horizontal'}`
              : ''
          }`}
        >
          {materialOpen && (
            <>
              <MaterialPanel
                state={materialState}
                url={materialPrefs.label}
                onUrlChange={(label) => setMaterialPrefs((previous) => ({ ...previous, label }))}
                items={materialEntries(materialPrefs)}
                activeUrl={materialPrefs.url}
                onSelect={handleMaterialSelect}
                onRemove={handleMaterialRemove}
                zoom={materialZoom}
                onZoom={(factor) => {
                  void window.api.materialPanel.setZoom(factor).then(() => {
                    setMaterialZoom(factor)
                  }).catch((error) => setNotice(toUserMessage(error)))
                }}
                onNavigate={handleMaterialNavigate}
                onReload={() => void window.api.materialPanel.reload()}
                onBack={() => void window.api.materialPanel.goBack()}
                onForward={() => void window.api.materialPanel.goForward()}
                onStop={() => void window.api.materialPanel.stop()}
                onPickFile={handleMaterialPickFile}
                onClose={toggleMaterialPanel}
                onRetry={() => void window.api.materialPanel.reload()}
                viewportRef={materialViewportRef}
                style={{ flex: `0 0 ${(materialRatio * 100).toFixed(2)}%` }}
              />
              <div
                className="material-splitter"
                role="separator"
                aria-orientation={floating ? 'horizontal' : 'vertical'}
                aria-label={floating ? '调整资料面板高度' : '调整资料面板宽度'}
                onPointerDown={startMaterialResize}
              />
            </>
          )}
          <div className="app__chat">
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
            <div className={`panes${floating ? ' panes--vertical' : ''}`} ref={panesRef}>
              {openPanes.map((pane, index) => (
                <Fragment key={pane.id}>
                  {index > 0 && (
                    <div
                      className="pane-divider"
                      role="separator"
                      aria-orientation={floating ? 'horizontal' : 'vertical'}
                      aria-label={floating ? '调整面板高度' : '调整面板宽度'}
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
                    railCollapsed={collapsedRails.has(pane.id)}
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
          </div>
        </main>
      </div>
      {floating && (
        <div
          className={`drawer-resize-handle drawer-resize-handle--${windowState.edge ?? 'right'}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 Deriva 宽度"
          onPointerDown={startDrawerResize}
        />
      )}
      {floating && drawerResizeLimited && (
        <div className="drawer-resize-feedback" role="status">
          已达到最小外部应用宽度
        </div>
      )}
    </div>
  )
}
