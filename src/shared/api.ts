import type {
  ApiKeyStatus,
  Bookmark,
  ChatStreamEvent,
  Conversation,
  CreateConversationInput,
  LlmConfig,
  Message,
  StartChatInput,
  StartChatResult,
  Subject
} from './types'

/** The surface the preload bridge exposes to the renderer as window.api. */
export interface TutorApi {
  databasePath(): Promise<string>
  subjects: {
    list(): Promise<Subject[]>
    create(name: string): Promise<Subject>
    rename(id: string, name: string): Promise<Subject>
    remove(id: string): Promise<void>
  }
  conversations: {
    /** Every top-level conversation, newest first: what the sidebar groups by subject. */
    listRoots(): Promise<Conversation[]>
    /** Roots and branches together, oldest first: the sidebar renders the tree from this. */
    listAll(): Promise<Conversation[]>
    /** Top-level conversations of one subject; null means the 未分类 bucket. */
    listBySubject(subjectId: string | null): Promise<Conversation[]>
    create(input: CreateConversationInput): Promise<Conversation>
    rename(id: string, title: string): Promise<Conversation>
    moveToSubject(id: string, subjectId: string | null): Promise<Conversation>
    remove(id: string): Promise<void>
  }
  messages: {
    listByConversation(conversationId: string): Promise<Message[]>
  }
  attachments: {
    /** Data URL for rendering a stored image; null when it has gone missing. */
    read(id: string): Promise<string | null>
  }
  bookmarks: {
    listByConversation(conversationId: string): Promise<Bookmark[]>
  }
  llm: {
    keyStatus(): Promise<ApiKeyStatus>
    saveKey(apiKey: string): Promise<ApiKeyStatus>
    clearKey(): Promise<ApiKeyStatus>
    getConfig(): Promise<LlmConfig>
    saveConfig(config: LlmConfig): Promise<LlmConfig>
    startChat(input: StartChatInput): Promise<StartChatResult>
    retryChat(assistantMessageId: string): Promise<{ requestId: string }>
    cancelChat(requestId: string): Promise<void>
    /** Subscribes to stream events; the returned function unsubscribes. */
    onChatEvent(listener: (event: ChatStreamEvent) => void): () => void
  }
}
