import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Bookmark, Conversation, Message, OutgoingImage } from '../../../shared/types'
import { summarizeTitle } from '../../../shared/text'
import { ConversationView } from './ConversationView'
import type { BranchSource } from '../lib/branchMarks'
import { toUserMessage } from '../lib/errors'

/**
 * Owns everything about one open conversation: its messages, the streaming answer and the terminal
 * error. State stays here rather than in App so that a later multi-pane view can render several panes
 * without reshaping shared state (see GROUND-0003).
 */
export const ConversationPane = memo(function ConversationPane({
  conversation,
  levelLabel,
  branchSources,
  railCollapsed,
  onToggleRail,
  onConversationChanged,
  onOpenBranch,
  onClose
}: {
  conversation: Conversation
  levelLabel: string
  branchSources: BranchSource[]
  railCollapsed: boolean
  onToggleRail(): void
  onConversationChanged(): void
  /** Id-addressed so App can hand over stable callbacks and memo keeps drags from re-rendering panes. */
  onOpenBranch(id: string, quote: string, sourceMessageId: string, visibleText: string): void
  onClose(id: string): void
}): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const activeRequest = useRef<string | null>(null)
  const retryMessageId = useRef<string | null>(null)

  const reload = useCallback(async () => {
    const [nextMessages, nextBookmarks] = await Promise.all([
      window.api.messages.listByConversation(conversation.id),
      window.api.bookmarks.listByConversation(conversation.id)
    ])
    setMessages(nextMessages)
    setBookmarks(nextBookmarks)
  }, [conversation.id])

  useEffect(() => {
    setStreamingText('')
    setError('')
    setStreaming(false)
    activeRequest.current = null
    void reload()
  }, [reload])

  useEffect(() => {
    return window.api.llm.onChatEvent((event) => {
      if (event.requestId !== activeRequest.current) return
      if (event.messageId !== undefined) retryMessageId.current = event.messageId
      if (event.type === 'delta') {
        setStreamingText((previous) => previous + (event.text ?? ''))
        return
      }
      activeRequest.current = null
      setStreaming(false)
      if (event.type === 'error') setError(event.errorMessage ?? '调用失败')
      // The finished answer is now persisted, so the live buffer must be dropped or the same text
      // renders twice: once as the stored message and once as the streaming block.
      void reload().then(() => {
        setStreamingText('')
        onConversationChanged()
      })
    })
  }, [reload, onConversationChanged])

  async function send(content: string, images: OutgoingImage[]): Promise<void> {
    if (activeRequest.current !== null) return
    setError('')
    setStreamingText('')
    try {
      if (messages.length === 0) {
        // FR-10: the title defaults to a local summary of the first question, never a model call.
        await window.api.conversations.rename(conversation.id, summarizeTitle(content))
        onConversationChanged()
      }
      const started = await window.api.llm.startChat({
        conversationId: conversation.id,
        content,
        images
      })
      activeRequest.current = started.requestId
      retryMessageId.current = started.assistantMessageId
      setStreaming(true)
      await reload()
    } catch (cause) {
      setError(toUserMessage(cause))
    }
  }

  async function cancel(): Promise<void> {
    if (activeRequest.current === null) return
    try {
      await window.api.llm.cancelChat(activeRequest.current)
    } catch (cause) {
      setError(toUserMessage(cause))
    }
  }

  async function retry(): Promise<void> {
    if (retryMessageId.current === null || activeRequest.current !== null) return
    setError('')
    setStreamingText('')
    try {
      const started = await window.api.llm.retryChat(retryMessageId.current)
      activeRequest.current = started.requestId
      setStreaming(true)
    } catch (cause) {
      setError(toUserMessage(cause))
    }
  }

  return (
    <ConversationView
      conversation={conversation}
      levelLabel={levelLabel}
      branchSources={branchSources}
      railCollapsed={railCollapsed}
      onToggleRail={onToggleRail}
      onClose={() => onClose(conversation.id)}
      messages={messages}
      bookmarks={bookmarks}
      streamingText={streamingText}
      streaming={streaming}
      error={error}
      onSend={(content, images) => void send(content, images)}
      onCancel={() => void cancel()}
      onRetry={() => void retry()}
      onAsk={(quote, sourceMessageId, visibleText) =>
        onOpenBranch(conversation.id, quote, sourceMessageId, visibleText)
      }
    />
  )
})
