// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation } from '../../../shared/types'
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

function installApi(): void {
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
    bookmarks: { listByConversation: async () => [] },
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
})
