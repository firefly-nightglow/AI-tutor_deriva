import type {
  ApiKeyStatus,
  Bookmark,
  ChatStreamEvent,
  Conversation,
  CreateConversationInput,
  ExternalTilingState,
  ExternalWindowIdentity,
  ExternalWindowSummary,
  LlmConfig,
  Message,
  MaterialLocalFile,
  MaterialPanelRect,
  MaterialPanelState,
  ScreenCaptureFilter,
  ScreenCaptureRect,
  ScreenCaptureResult,
  ScreenCaptureSource,
  RegionOverlayInit,
  StartChatInput,
  StartChatResult,
  Subject,
  WindowMode,
  WindowUiState
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
  capture: {
    listSources(filter?: ScreenCaptureFilter): Promise<ScreenCaptureSource[]>
    captureSource(id: string, options?: { keepOriginal?: boolean }): Promise<ScreenCaptureResult>
    selectRegion(sourceId: string): Promise<ScreenCaptureResult | null>
    regionInit(displayId: string): Promise<RegionOverlayInit | null>
    regionSelect(captureId: string, rect: ScreenCaptureRect): Promise<void>
    regionCancel(): Promise<void>
  }
  attachments: {
    /** Data URL for rendering a stored image; null when it has gone missing. */
    read(id: string): Promise<string | null>
  }
  bookmarks: {
    listByConversation(conversationId: string): Promise<Bookmark[]>
  }
  windowControl: {
    getState(): Promise<WindowUiState>
    setMode(mode: WindowMode): Promise<WindowUiState>
    collapse(): Promise<WindowUiState>
    expand(): Promise<WindowUiState>
    toggleCollapsed(): Promise<WindowUiState>
    setDrawerWidth(width: number, commit: boolean): Promise<WindowUiState>
    setShortcut(accelerator: string | null): Promise<WindowUiState>
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    bubbleDragStart(screenY: number): void
    bubbleDragMove(screenY: number): void
    bubbleDragEnd(): void
    bubbleContextMenu(): void
    onStateChanged(listener: (state: WindowUiState) => void): () => void
    onOpenSettings(listener: () => void): () => void
  }
  externalTiling: {
    getState(): Promise<ExternalTilingState>
    listWindows(): Promise<ExternalWindowSummary[]>
    selectWindow(identity: ExternalWindowIdentity): Promise<ExternalTilingState>
    retile(): Promise<ExternalTilingState>
    stop(): Promise<ExternalTilingState>
    confirmPendingRestore(): Promise<ExternalTilingState>
    discardPendingRestore(): Promise<ExternalTilingState>
    onStateChanged(listener: (state: ExternalTilingState) => void): () => void
  }
  materialPanel: {
    open(url: string | null): Promise<MaterialPanelState>
    close(): Promise<void>
    navigate(url: string): Promise<MaterialPanelState>
    reload(): Promise<void>
    goBack(): Promise<void>
    goForward(): Promise<void>
    stop(): Promise<void>
    setZoom(factor: number): Promise<void>
    pickFile(): Promise<MaterialLocalFile | null>
    setBounds(rect: MaterialPanelRect): void
    setVisible(visible: boolean): void
    onStateChanged(listener: (state: MaterialPanelState) => void): () => void
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
