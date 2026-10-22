import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { TutorApi } from '../shared/api'
import type {
  ChatStreamEvent,
  ExternalTilingState,
  MaterialPanelState,
  WindowUiState
} from '../shared/types'

const api: TutorApi = {
  databasePath: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.databasePath),
  subjects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.subjectsList),
    create: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.subjectsCreate, name),
    rename: (id: string, name: string) => ipcRenderer.invoke(IPC_CHANNELS.subjectsRename, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.subjectsRemove, id)
  },
  conversations: {
    listRoots: () => ipcRenderer.invoke(IPC_CHANNELS.conversationsListRoots),
    listAll: () => ipcRenderer.invoke(IPC_CHANNELS.conversationsListAll),
    listBySubject: (subjectId: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.conversationsListBySubject, subjectId),
    create: (input: { subjectId?: string | null; title: string; model?: string | null }) =>
      ipcRenderer.invoke(IPC_CHANNELS.conversationsCreate, input),
    rename: (id: string, title: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.conversationsRename, id, title),
    moveToSubject: (id: string, subjectId: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.conversationsMoveToSubject, id, subjectId),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.conversationsRemove, id)
  },
  messages: {
    listByConversation: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.messagesListByConversation, conversationId)
  },
  capture: {
    listSources: (filter) => ipcRenderer.invoke(IPC_CHANNELS.captureListSources, filter),
    captureSource: (id, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.captureSource, id, options),
    selectRegion: (sourceId) => ipcRenderer.invoke(IPC_CHANNELS.captureRegionSelect, sourceId),
    regionInit: (displayId) => ipcRenderer.invoke(IPC_CHANNELS.captureRegionInit, displayId),
    regionSelect: (captureId, rect) =>
      ipcRenderer.invoke(IPC_CHANNELS.captureRegionCommit, captureId, rect),
    regionCancel: () => ipcRenderer.invoke(IPC_CHANNELS.captureRegionCancel)
  },
  attachments: {
    read: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsRead, id)
  },
  bookmarks: {
    listByConversation: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.bookmarksListByConversation, conversationId)
  },
  windowControl: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.windowStateGet),
    setMode: (mode) => ipcRenderer.invoke(IPC_CHANNELS.windowModeSet, mode),
    collapse: () => ipcRenderer.invoke(IPC_CHANNELS.windowCollapse),
    expand: () => ipcRenderer.invoke(IPC_CHANNELS.windowExpand),
    toggleCollapsed: () => ipcRenderer.invoke(IPC_CHANNELS.windowCollapseToggle),
    setDrawerWidth: (width, commit) =>
      ipcRenderer.invoke(IPC_CHANNELS.windowDrawerWidth, width, commit),
    setShortcut: (accelerator) =>
      ipcRenderer.invoke(IPC_CHANNELS.windowShortcutSet, accelerator),
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMaximizeToggle),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
    bubbleDragStart: (screenY) => ipcRenderer.send(IPC_CHANNELS.windowBubbleDragStart, screenY),
    bubbleDragMove: (screenY) => ipcRenderer.send(IPC_CHANNELS.windowBubbleDragMove, screenY),
    bubbleDragEnd: () => ipcRenderer.send(IPC_CHANNELS.windowBubbleDragEnd),
    bubbleContextMenu: () => ipcRenderer.send(IPC_CHANNELS.windowBubbleContextMenu),
    onStateChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: WindowUiState): void => listener(payload)
      ipcRenderer.on(IPC_CHANNELS.windowStateChanged, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, handler)
    },
    onOpenSettings: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC_CHANNELS.windowOpenSettings, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.windowOpenSettings, handler)
    }
  },
  externalTiling: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.externalTilingGetState),
    listWindows: () => ipcRenderer.invoke(IPC_CHANNELS.externalTilingListWindows),
    selectWindow: (identity) =>
      ipcRenderer.invoke(IPC_CHANNELS.externalTilingSelect, identity),
    retile: () => ipcRenderer.invoke(IPC_CHANNELS.externalTilingRetile),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.externalTilingStop),
    confirmPendingRestore: () =>
      ipcRenderer.invoke(IPC_CHANNELS.externalTilingConfirmRestore),
    discardPendingRestore: () =>
      ipcRenderer.invoke(IPC_CHANNELS.externalTilingDiscardRestore),
    onStateChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, state: ExternalTilingState): void =>
        listener(state)
      ipcRenderer.on(IPC_CHANNELS.externalTilingStateChanged, handler)
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.externalTilingStateChanged, handler)
    }
  },
  materialPanel: {
    open: (url) => ipcRenderer.invoke(IPC_CHANNELS.materialPanelOpen, url),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.materialPanelClose),
    navigate: (url) => ipcRenderer.invoke(IPC_CHANNELS.materialPanelNavigate, url),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.materialPanelReload),
    goBack: () => ipcRenderer.invoke(IPC_CHANNELS.materialPanelGoBack),
    goForward: () => ipcRenderer.invoke(IPC_CHANNELS.materialPanelGoForward),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.materialPanelStop),
    setZoom: (factor) => ipcRenderer.invoke(IPC_CHANNELS.materialPanelZoom, factor),
    pickFile: () => ipcRenderer.invoke(IPC_CHANNELS.materialPanelPickFile),
    setBounds: (rect) => ipcRenderer.send(IPC_CHANNELS.materialPanelSetBounds, rect),
    setVisible: (visible) => ipcRenderer.send(IPC_CHANNELS.materialPanelSetVisible, visible),
    onStateChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: MaterialPanelState): void =>
        listener(payload)
      ipcRenderer.on(IPC_CHANNELS.materialPanelStateChanged, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.materialPanelStateChanged, handler)
    }
  },
  llm: {
    keyStatus: () => ipcRenderer.invoke(IPC_CHANNELS.llmKeyStatus),
    saveKey: (apiKey: string) => ipcRenderer.invoke(IPC_CHANNELS.llmKeySave, apiKey),
    clearKey: () => ipcRenderer.invoke(IPC_CHANNELS.llmKeyClear),
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.llmConfigGet),
    saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.llmConfigSave, config),
    startChat: (input) => ipcRenderer.invoke(IPC_CHANNELS.llmChatStart, input),
    retryChat: (assistantMessageId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.llmChatRetry, assistantMessageId),
    cancelChat: (requestId: string) => ipcRenderer.invoke(IPC_CHANNELS.llmChatCancel, requestId),
    onChatEvent: (listener: (event: ChatStreamEvent) => void) => {
      const handler = (_event: IpcRendererEvent, payload: ChatStreamEvent): void => listener(payload)
      ipcRenderer.on(IPC_CHANNELS.llmChatEvent, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.llmChatEvent, handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
