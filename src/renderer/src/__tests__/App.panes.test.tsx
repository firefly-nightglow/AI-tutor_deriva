// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bookmark, Conversation } from '../../../shared/types'
import type { TutorApi } from '../../../shared/api'
import App from '../App'

function conversation(id: string, title: string): Conversation {
  return {
    id,
    subjectId: null,
    parentConversationId: null,
    sourceMessageId: null,
    sourceQuote: null,
    title,
    titleSource: 'manual',
    model: null,
    createdAt: 0,
    updatedAt: 0
  }
}

const PANES = [conversation('a', '甲对话'), conversation('b', '乙对话')]

function bookmark(conversationId: string): Bookmark {
  return {
    id: `bookmark-${conversationId}`,
    conversationId,
    messageId: `message-${conversationId}`,
    summary: `${conversationId} 的书签`,
    summarySource: 'local',
    position: 0,
    createdAt: 0,
    updatedAt: 0
  }
}

function installApi(
  mode: 'normal' | 'floating' = 'normal',
  maxDrawerWidth: number | null = null
): void {
  const windowState = {
    mode,
    collapsed: false,
    edge: 'right' as const,
    drawerWidth: 440,
    maxDrawerWidth,
    shortcut: null,
    shortcutRegistered: false
  }
  const materialState = {
    status: 'closed' as const,
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
    error: null
  }
  const api = {
    subjects: { list: async () => [], create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
    conversations: {
      listAll: async () => PANES,
      listRoots: async () => PANES,
      listBySubject: async () => PANES,
      create: vi.fn(),
      rename: vi.fn(),
      moveToSubject: vi.fn(),
      remove: vi.fn()
    },
    messages: { listByConversation: async () => [] },
    bookmarks: {
      listByConversation: async (conversationId: string) => [bookmark(conversationId)]
    },
    capture: {
      listSources: async () => [],
      captureSource: vi.fn()
    },
    windowControl: {
      getState: async () => windowState,
      setMode: vi.fn(async () => windowState),
      collapse: vi.fn(async () => windowState),
      expand: vi.fn(async () => windowState),
      toggleCollapsed: vi.fn(async () => windowState),
      setDrawerWidth: vi.fn(async () => windowState),
      setShortcut: vi.fn(),
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      bubbleDragStart: vi.fn(),
      bubbleDragMove: vi.fn(),
      bubbleDragEnd: vi.fn(),
      bubbleContextMenu: vi.fn(),
      onStateChanged: () => () => {},
      onOpenSettings: () => () => {}
    },
    externalTiling: {
      getState: async () => ({
        status: 'idle' as const,
        selected: null,
        expectedBounds: null,
        error: null,
        canRetile: false,
        pendingRestore: false
      }),
      listWindows: async () => [],
      selectWindow: vi.fn(),
      retile: vi.fn(),
      stop: vi.fn(),
      confirmPendingRestore: vi.fn(),
      discardPendingRestore: vi.fn(),
      onStateChanged: () => () => {}
    },
    materialPanel: {
      open: vi.fn(async () => materialState),
      close: vi.fn(async () => {}),
      navigate: vi.fn(async () => materialState),
      reload: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      stop: vi.fn(),
      setZoom: vi.fn(async () => {}),
      pickFile: vi.fn(async () => null),
      setBounds: vi.fn(),
      setVisible: vi.fn(),
      onStateChanged: () => () => {}
    },
    attachments: { read: async () => null },
    databasePath: async () => '/tmp/x.db',
    llm: {
      keyStatus: async () => ({ hasKey: false, encryptionAvailable: true }),
      saveKey: vi.fn(),
      clearKey: vi.fn(),
      getConfig: async () => ({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-flash',
        contextStrategy: 'excerpt',
        summarySource: 'local'
      }),
      saveConfig: vi.fn(),
      startChat: vi.fn(),
      retryChat: vi.fn(),
      cancelChat: vi.fn(),
      onChatEvent: () => () => {}
    }
  }
  ;(window as unknown as { api: TutorApi }).api = api as unknown as TutorApi
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  // jsdom has no matchMedia; the theme effect needs one.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  installApi()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

async function openBothPanes(): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: '甲对话' }))
  fireEvent.click(screen.getByRole('button', { name: '乙对话' }))
  await waitFor(() => expect(document.querySelectorAll('.pane')).toHaveLength(2))
}

describe('App pane resizing', () => {
  it('exposes the screenshot thumbnail/original default in settings', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    const setting = await screen.findByLabelText('默认保存方式')
    expect((setting as HTMLInputElement).checked).toBe(false)
  })

  it('exposes privacy exclusions for displays and windows in settings', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByLabelText('排除显示器 ID')).toBeTruthy()
    expect(screen.getByLabelText('排除窗口标题')).toBeTruthy()
  })

  it('collapses bookmark rails independently for each conversation', async () => {
    await openBothPanes()

    const collapseButtons = await screen.findAllByRole('button', { name: '收起书签栏' })
    expect(collapseButtons).toHaveLength(2)
    fireEvent.click(collapseButtons[0])

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '收起书签栏' })).toHaveLength(1)
    )
    expect(screen.getByRole('button', { name: '展开书签栏' })).toBeTruthy()
  })

  it('renders one divider between two panes', async () => {
    await openBothPanes()
    expect(document.querySelectorAll('.pane-divider')).toHaveLength(1)
  })

  it('applies explicit widths when the divider is dragged', async () => {
    await openBothPanes()
    const divider = document.querySelector('.pane-divider') as HTMLElement
    const panes = document.querySelectorAll('.pane')

    // jsdom has no layout, so give the panes and their container real sizes.
    panes.forEach((pane) => {
      ;(pane as HTMLElement).getBoundingClientRect = () =>
        ({ width: 700, height: 600, top: 0, left: 0, right: 700, bottom: 600, x: 0, y: 0 }) as DOMRect
    })
    Object.defineProperty(divider.parentElement as HTMLElement, 'getBoundingClientRect', {
      value: () => ({ width: 1500, height: 600, top: 0, left: 0, right: 1500, bottom: 600, x: 0, y: 0 })
    })

    fireEvent.pointerDown(divider, { clientX: 700 })
    fireEvent.pointerMove(window, { clientX: 760 })

    // The drag coalesces moves into an animation frame, so the style lands on the next frame.
    await waitFor(() => {
      const first = document.querySelectorAll('.pane')[0] as HTMLElement
      expect(first.style.flex).toMatch(/^0 0 \d+px$/)
    })
  })

  it('stacks floating panes vertically and exposes the drawer sidebar', async () => {
    installApi('floating')
    render(<App />)

    const openSidebar = await screen.findByRole('button', { name: '打开对话侧栏' })
    fireEvent.click(openSidebar)
    fireEvent.click(await screen.findByRole('button', { name: '甲对话' }))
    fireEvent.click(openSidebar)
    fireEvent.click(await screen.findByRole('button', { name: '乙对话' }))
    await waitFor(() => expect(document.querySelectorAll('.pane')).toHaveLength(2))

    expect(document.querySelector('.panes--vertical')).not.toBeNull()
    expect(document.querySelector('.pane-divider')?.getAttribute('aria-orientation')).toBe(
      'horizontal'
    )
    expect(document.querySelector('.drawer-sidebar')?.className).not.toContain('is-open')

    fireEvent.click(openSidebar)
    expect(document.querySelector('.drawer-sidebar')?.className).toContain('is-open')
  })

  it('stops the floating drawer at the external app minimum width with visible feedback', async () => {
    installApi('floating', 500)
    render(<App />)

    await waitFor(() =>
      expect(document.querySelector('.drawer-resize-handle')).not.toBeNull()
    )
    const handle = document.querySelector('.drawer-resize-handle') as HTMLElement
    fireEvent.pointerDown(handle, { screenX: 1000, pointerId: 1 })
    fireEvent.pointerMove(window, { screenX: 900, pointerId: 1 })

    expect(await screen.findByText('已达到最小外部应用宽度')).toBeTruthy()
    await waitFor(() =>
      expect(window.api.windowControl.setDrawerWidth).toHaveBeenLastCalledWith(500, false)
    )
    fireEvent.pointerUp(window, { pointerId: 1 })
  })

  it('opens the material panel as a horizontal split in normal mode', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '资料面板' }))

    await waitFor(() => expect(document.querySelector('.material-panel')).not.toBeNull())
    expect(document.querySelector('.app__main--split-horizontal')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '关闭资料' }))
    await waitFor(() => expect(document.querySelector('.material-panel')).toBeNull())
  })

  it('hides the native material view under modal dialogs and restores it afterwards', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '资料面板' }))
    await waitFor(() => expect(window.api.materialPanel.setVisible).toHaveBeenLastCalledWith(true))
    const dialog = document.createElement('section')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    await waitFor(() => expect(window.api.materialPanel.setVisible).toHaveBeenLastCalledWith(false))
    dialog.remove()
    await waitFor(() => expect(window.api.materialPanel.setVisible).toHaveBeenLastCalledWith(true))
  })

  it('removes a selected material without closing the panel or removing other open resources', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '资料面板' }))
    for (const url of ['https://a.test/', 'https://b.test/']) {
      fireEvent.change(screen.getByLabelText('资料网址'), { target: { value: url } })
      fireEvent.click(screen.getByRole('button', { name: '打开' }))
    }
    fireEvent.click(await screen.findByRole('button', { name: '移除当前资料' }))
    await waitFor(() => expect(window.api.materialPanel.open).toHaveBeenLastCalledWith('https://a.test/'))
    expect(document.querySelector('.material-panel')).not.toBeNull()
    expect(screen.queryByRole('option', { name: 'https://b.test/' })).toBeNull()
    expect(screen.getByRole('option', { name: 'https://a.test/' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '移除当前资料' }))
    await waitFor(() => expect(window.api.materialPanel.open).toHaveBeenLastCalledWith(null))
    expect((screen.getByLabelText('资料网址') as HTMLInputElement).value).toBe('')
  })

  it('starts blank after restart and clears the resource list when the panel is reopened', async () => {
    window.localStorage.setItem('deriva:material-panel', JSON.stringify({
      open: true, url: 'https://old.test/', label: 'Old',
      items: [{ url: 'https://old.test/', label: 'Old' }]
    }))
    render(<App />)
    await screen.findByLabelText('资料网址')
    expect(window.api.materialPanel.open).toHaveBeenCalledWith(null)
    expect((screen.getByLabelText('资料网址') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('option', { name: 'Old' })).toBeNull()
    fireEvent.change(screen.getByLabelText('资料网址'), { target: { value: 'https://new.test/' } })
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(screen.getByRole('option', { name: 'https://new.test/' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭资料面板' }))
    fireEvent.click(await screen.findByRole('button', { name: '资料面板' }))
    await waitFor(() => expect(window.api.materialPanel.open).toHaveBeenLastCalledWith(null))
    expect((screen.getByLabelText('资料网址') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('option', { name: 'https://new.test/' })).toBeNull()
  })

  it('permits shrinking a web page to 25 percent while retaining the file zoom floor', async () => {
    vi.mocked(window.api.materialPanel.navigate).mockResolvedValue({
      status: 'ready', url: 'https://wide.test/', title: 'Wide', error: null,
      canGoBack: false, canGoForward: false, minZoom: 0.25
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '资料面板' }))
    fireEvent.change(screen.getByLabelText('资料网址'), { target: { value: 'https://wide.test/' } })
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect((screen.getByRole('button', { name: '缩小资料' }) as HTMLButtonElement).disabled).toBe(false))
    for (const percent of [75, 50, 25]) {
      fireEvent.click(screen.getByRole('button', { name: '缩小资料' }))
      await screen.findByRole('button', { name: `${percent}%` })
    }
    expect((screen.getByRole('button', { name: '缩小资料' }) as HTMLButtonElement).disabled).toBe(true)
    expect(window.api.materialPanel.setZoom).toHaveBeenLastCalledWith(0.25)
  })

  it('bounds material magnification between initial size and 300 percent', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '资料面板' }))
    expect((screen.getByRole('button', { name: '缩小资料' }) as HTMLButtonElement).disabled).toBe(true)
    for (let index = 0; index < 8; index++) {
      fireEvent.click(screen.getByRole('button', { name: '放大资料' }))
      await screen.findByRole('button', { name: `${125 + index * 25}%` })
    }
    expect((screen.getByRole('button', { name: '放大资料' }) as HTMLButtonElement).disabled).toBe(true)
    expect(window.api.materialPanel.setZoom).toHaveBeenLastCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: '300%' }))
    await screen.findByRole('button', { name: '100%' })
    expect(window.api.materialPanel.setZoom).toHaveBeenLastCalledWith(1)
  })

  it('opens the material panel as a vertical split in floating mode', async () => {
    installApi('floating')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '资料面板' }))

    await waitFor(() => expect(document.querySelector('.material-panel')).not.toBeNull())
    expect(document.querySelector('.app__main--split-vertical')).not.toBeNull()
  })
})
