import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { TutorApi } from '../shared/api'
import type { ChatStreamEvent } from '../shared/types'

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
  attachments: {
    read: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.attachmentsRead, id)
  },
  bookmarks: {
    listByConversation: (conversationId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.bookmarksListByConversation, conversationId)
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
