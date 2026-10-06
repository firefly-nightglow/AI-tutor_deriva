import { useEffect, useRef, useState } from 'react'
import type { Bookmark, Conversation, Message, OutgoingImage } from '../../../shared/types'
import {
  selectionRect,
  selectionText,
  sliceSource,
  sourceRangeFromSelection
} from '../lib/selection'
import { browserStorage, readDraft, saveDraft } from '../lib/drafts'
import { branchRanges, overlaps, type BranchSource } from '../lib/branchMarks'
import { MarkdownContent, markdownSource } from './MarkdownContent'
import { MessageAttachments } from './MessageAttachments'

const MAX_IMAGES = 4

/** Reads a picked or pasted file into the data URL the main process stores. */
async function readImage(file: File): Promise<OutgoingImage | null> {
  if (!file.type.startsWith('image/')) return null
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
  return { name: file.name === '' ? '粘贴的图片' : file.name, mime: file.type, dataUrl }
}

export interface ConversationViewProps {
  conversation: Conversation
  /** 主对话 / 子对话 L2 — shown so a wall of panes stays readable. */
  levelLabel: string
  onClose(): void
  messages: Message[]
  bookmarks: Bookmark[]
  /** Passages that were selected to open a branch, so the transcript can outline them. */
  branchSources: BranchSource[]
  /** Shared by every pane so two open panes cannot disagree about the rail's state. */
  railCollapsed: boolean
  onToggleRail(): void
  /** Text accumulated for the answer currently streaming; empty when idle. */
  streamingText: string
  streaming: boolean
  error: string
  onSend(content: string, images: OutgoingImage[]): void
  onCancel(): void
  onRetry(): void
  /** quote = Markdown/LaTeX source for the prompt; visibleText = what the student saw, for the title. */
  onAsk(quote: string, sourceMessageId: string, visibleText: string): void
}

interface PendingAsk {
  quote: string
  visibleText: string
  messageId: string
  top: number
  left: number
}

export function ConversationView(props: ConversationViewProps): React.JSX.Element {
  // Keyed by conversation: switching away and back restores an unsent question.
  const [draft, setDraft] = useState(() => readDraft(browserStorage(), props.conversation.id))
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null)
  const [images, setImages] = useState<OutgoingImage[]>([])
  const [imageNotice, setImageNotice] = useState('')
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [props.messages.length, props.streamingText])

  /**
   * Outlines the passage each branch was opened from. The marks are derived from the branch list, so
   * deleting a branch removes its outline on the next render — nothing extra to keep in sync.
   */
  useEffect(() => {
    const container = messagesRef.current
    if (container === null) return
    for (const marked of container.querySelectorAll('[data-branch-mark]')) {
      marked.classList.remove('is-branch-source')
      marked.removeAttribute('data-branch-mark')
    }
    for (const message of props.messages) {
      const quotes = props.branchSources
        .filter((source) => source.messageId === message.id)
        .map((source) => source.quote)
      if (quotes.length === 0) continue
      const article = container.querySelector(`[data-message-id="${message.id}"]`)
      if (article === null) continue
      const ranges = branchRanges(message.content, quotes)
      if (ranges.length === 0) continue
      for (const element of article.querySelectorAll('[data-source-start]')) {
        const start = Number((element as HTMLElement).dataset.sourceStart)
        const end = Number((element as HTMLElement).dataset.sourceEnd)
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue
        if (ranges.some((range) => overlaps({ start, end }, range))) {
          element.classList.add('is-branch-source')
          element.setAttribute('data-branch-mark', '1')
        }
      }
    }
  }, [props.messages, props.branchSources])

  function submit(): void {
    const content = draft.trim()
    // FR-14: nothing to send is refused, and a second send is refused while an answer is streaming.
    // An image on its own counts as a question.
    if ((content === '' && images.length === 0) || props.streaming) return
    props.onSend(content, images)
    setDraft('')
    setImages([])
    saveDraft(browserStorage(), props.conversation.id, '')
  }

  /** FR-6: a bookmark jumps to its passage and flashes it so the eye can land. */
  function jumpTo(messageId: string): void {
    const target = messagesRef.current?.querySelector(`[data-message-id="${messageId}"]`)
    if (!(target instanceof HTMLElement)) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setHighlighted(messageId)
    window.setTimeout(() => {
      setHighlighted((current) => (current === messageId ? null : current))
    }, 1600)
  }

  async function addImages(files: File[]): Promise<void> {
    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      setImageNotice(`一条消息最多 ${MAX_IMAGES} 张图片`)
      return
    }
    setImageNotice(
      files.length > room ? `一条消息最多 ${MAX_IMAGES} 张图片，已忽略多余的 ${files.length - room} 张` : ''
    )
    try {
      const converted = await Promise.all(files.slice(0, room).map(readImage))
      setImages((previous) => [
        ...previous,
        ...converted.filter((image): image is OutgoingImage => image !== null)
      ])
    } catch (cause) {
      console.warn('[deriva] 读取图片失败', cause)
    }
  }

  /**
   * Turns the current selection into a quote. The offsets come from the rendered block, so the text
   * kept is the original Markdown (formulas stay as LaTeX) rather than KaTeX's glyphs.
   */
  function handleSelection(): void {
    const container = messagesRef.current
    const selection = window.getSelection()
    // A click leaves rangeCount > 0 with a collapsed range, so also require real selected text.
    if (
      container === null ||
      selection === null ||
      selection.isCollapsed ||
      selectionText(selection) === ''
    ) {
      setPendingAsk(null)
      return
    }
    const range = sourceRangeFromSelection(selection, container)
    const rect = selectionRect(selection)
    const anchor = selection.anchorNode
    const element = anchor instanceof Element ? anchor : (anchor?.parentElement ?? null)
    const article = element?.closest('[data-message-id]') as HTMLElement | null
    const messageId = article?.dataset.messageId
    const message = props.messages.find((item) => item.id === messageId)

    if (range === null || rect === null || messageId === undefined || message?.role !== 'assistant') {
      setPendingAsk(null)
      return
    }
    const quote = sliceSource(markdownSource(message.content), range)
    if (quote === '') {
      setPendingAsk(null)
      return
    }
    // Sit just past the right edge of the selection so the button never covers the quoted text.
    const BUTTON_WIDTH = 76
    setPendingAsk({
      quote,
      visibleText: selectionText(selection),
      messageId,
      top: Math.max(8, rect.top - 4),
      left: Math.min(rect.right + 12, window.innerWidth - BUTTON_WIDTH - 8)
    })
  }

  return (
    <section className="conversation">
      <header className="conversation__header">
        <div className="conversation__title">
          <span className="conversation__level">{props.levelLabel}</span>
          <h2>{props.conversation.title}</h2>
        </div>
        <div className="conversation__header-actions">
          <span className="conversation__hint">共 {props.messages.length} 条消息</span>
          <button
            type="button"
            className="pane-close"
            aria-label="关闭面板"
            onClick={() => props.onClose()}
          >
            ×
          </button>
        </div>
      </header>

      {props.conversation.sourceQuote !== null && (
        <blockquote className="conversation__quote">
          <span className="conversation__quote-label">引用的内容</span>
          <MarkdownContent content={props.conversation.sourceQuote} />
        </blockquote>
      )}

      <div className="conversation__body">
        <div
          className="conversation__messages"
          ref={messagesRef}
          onMouseUp={handleSelection}
          onKeyUp={handleSelection}
          onScroll={() => setPendingAsk(null)}
        >
        {props.messages.length === 0 && props.streamingText === '' ? (
          <p className="conversation__empty">在第一轮提问后，标题会自动取该问题的摘要。开始问点什么吧。</p>
        ) : (
          props.messages.map((message) => (
            <article
              key={message.id}
              className={`message message--${message.role}${highlighted === message.id ? ' is-highlighted' : ''}`}
              data-message-id={message.id}
            >
              <div className="message__meta">
                <span>{message.role === 'user' ? '我' : 'Deriva'}</span>
                {message.model !== null && <span className="message__model">{message.model}</span>}
                {message.status === 'error' && <span className="message__status">调用失败</span>}
                {message.status === 'aborted' && <span className="message__status">已取消</span>}
                {props.branchSources.some((source) => source.messageId === message.id) && (
                  <span className="message__branch-count">
                    {props.branchSources.filter((source) => source.messageId === message.id).length} 个子对话
                  </span>
                )}
              </div>
              <div className="message__body">
                <MessageAttachments raw={message.attachments} />
                {message.role === 'assistant' ? (
                  <MarkdownContent content={message.content} />
                ) : (
                  <p className="message__plain">{message.content}</p>
                )}
              </div>
            </article>
          ))
        )}

        {props.streamingText !== '' && (
          <article className="message message--assistant message--streaming">
            <div className="message__meta">
              <span>Deriva</span>
              <span className="message__model">生成中</span>
            </div>
            <div className="message__body">
              <MarkdownContent content={props.streamingText} />
            </div>
          </article>
        )}
          <div ref={endRef} />
        </div>

        {props.bookmarks.length > 0 && (
          <nav
            className={`bookmark-rail${props.railCollapsed ? ' is-collapsed' : ''}`}
            aria-label="对话书签"
          >
            <button
              type="button"
              className="bookmark-rail__toggle"
              aria-expanded={!props.railCollapsed}
              aria-label={props.railCollapsed ? '展开书签栏' : '收起书签栏'}
              onClick={() => props.onToggleRail()}
            >
              {props.railCollapsed ? '‹' : '›'}
            </button>
            {!props.railCollapsed &&
              props.bookmarks.map((bookmark, index) => (
              <button
                key={bookmark.id}
                type="button"
                className={`bookmark-rail__item${highlighted === bookmark.messageId ? ' is-active' : ''}`}
                title={bookmark.summary}
                onClick={() => jumpTo(bookmark.messageId)}
              >
                <span className="bookmark-rail__index">{index + 1}</span>
                <span className="bookmark-rail__label">{bookmark.summary}</span>
              </button>
              ))}
          </nav>
        )}
      </div>

      {pendingAsk !== null && (
        <button
          type="button"
          className="ask-button"
          style={{ top: `${pendingAsk.top}px`, left: `${pendingAsk.left}px` }}
          onClick={() => {
            props.onAsk(pendingAsk.quote, pendingAsk.messageId, pendingAsk.visibleText)
            setPendingAsk(null)
            window.getSelection()?.removeAllRanges()
          }}
        >
          追问
        </button>
      )}

      {props.error !== '' && (
        <div className="error conversation__error">
          <span>{props.error}</span>
          <button type="button" onClick={() => props.onRetry()}>
            重试
          </button>
        </div>
      )}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            saveDraft(browserStorage(), props.conversation.id, event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="问点什么，Enter 发送，Shift+Enter 换行"
          aria-label="提问"
          rows={3}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData?.items ?? [])
              .filter((item) => item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null)
            if (files.length === 0) return
            event.preventDefault()
            void addImages(files)
          }}
        />
        {images.length > 0 && (
          <div className="composer__attachments">
            {images.map((image, index) => (
              <div key={`${image.name}-${index}`} className="composer__attachment">
                <img src={image.dataUrl} alt={image.name} />
                <button
                  type="button"
                  className="link danger"
                  onClick={() => setImages((previous) => previous.filter((_, i) => i !== index))}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
        {imageNotice !== '' && <p className="hint">{imageNotice}</p>}
        <div className="composer__actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(event) => {
              void addImages(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
            图片
          </button>
          <button
            type="submit"
            disabled={props.streaming || (draft.trim() === '' && images.length === 0)}
          >
            发送
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!props.streaming}
            onClick={() => props.onCancel()}
          >
            取消
          </button>
        </div>
      </form>
    </section>
  )
}
