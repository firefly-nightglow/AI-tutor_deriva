import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { CreateConversationInput, LlmConfig, StartChatInput } from '../shared/types'
import type { Repositories } from './db/repositories'
import type { ApiKeyStore, ChatService, LlmConfigStore } from './llm'
import type { AttachmentStore } from './attachments'
import { parseMessageAttachments } from '../shared/attachments'
import type { ConversationNode } from '../shared/types'

export interface LlmIpcDependencies {
  keyStore: ApiKeyStore
  configStore: LlmConfigStore
  chatService: ChatService
  attachmentStore: AttachmentStore
}

function conversationIds(node: ConversationNode): string[] {
  return [node.conversation.id, ...node.children.flatMap(conversationIds)]
}

function attachmentIdsInTree(
  repositories: Repositories,
  rootId: string
): string[] {
  return conversationIds(repositories.conversations.listTree(rootId))
    .flatMap((conversationId) => repositories.messages.listByConversation(conversationId))
    .flatMap((message) => parseMessageAttachments(message.attachments))
    .map((attachment) => attachment.id)
}

export function registerIpcHandlers(
  repositories: Repositories,
  databasePath: string,
  llm: LlmIpcDependencies
): void {
  ipcMain.handle(IPC_CHANNELS.databasePath, () => databasePath)
  ipcMain.handle(IPC_CHANNELS.subjectsList, () => repositories.subjects.list())
  ipcMain.handle(IPC_CHANNELS.subjectsCreate, (_event, name: string) =>
    repositories.subjects.create({ name })
  )
  ipcMain.handle(IPC_CHANNELS.subjectsRename, (_event, id: string, name: string) =>
    repositories.subjects.rename(id, name)
  )
  ipcMain.handle(IPC_CHANNELS.subjectsRemove, (_event, id: string) => {
    repositories.subjects.remove(id)
  })
  ipcMain.handle(IPC_CHANNELS.conversationsListRoots, () => repositories.conversations.listRoots())
  ipcMain.handle(IPC_CHANNELS.conversationsListAll, () => repositories.conversations.listAll())
  ipcMain.handle(IPC_CHANNELS.conversationsListBySubject, (_event, subjectId: string | null) =>
    repositories.conversations.listBySubject(subjectId)
  )
  ipcMain.handle(IPC_CHANNELS.conversationsCreate, (_event, input: CreateConversationInput) =>
    repositories.conversations.create(input)
  )
  ipcMain.handle(IPC_CHANNELS.conversationsRename, (_event, id: string, title: string) =>
    repositories.conversations.rename(id, title)
  )
  ipcMain.handle(
    IPC_CHANNELS.conversationsMoveToSubject,
    (_event, id: string, subjectId: string | null) =>
      repositories.conversations.moveToSubject(id, subjectId)
  )
  ipcMain.handle(IPC_CHANNELS.conversationsRemove, (_event, id: string) => {
    // Rows cascade in SQLite but files do not, so collect the referenced ids first.
    const attachmentIds = attachmentIdsInTree(repositories, id)
    repositories.conversations.remove(id)
    llm.attachmentStore.removeAll(attachmentIds)
  })
  ipcMain.handle(IPC_CHANNELS.messagesListByConversation, (_event, conversationId: string) =>
    repositories.messages.listByConversation(conversationId)
  )
  ipcMain.handle(IPC_CHANNELS.attachmentsRead, (_event, id: string) => llm.attachmentStore.read(id))
  ipcMain.handle(IPC_CHANNELS.bookmarksListByConversation, (_event, conversationId: string) =>
    repositories.bookmarks.listByConversation(conversationId)
  )

  ipcMain.handle(IPC_CHANNELS.llmKeyStatus, () => llm.keyStore.status())
  ipcMain.handle(IPC_CHANNELS.llmKeySave, (_event, apiKey: string) => llm.keyStore.save(apiKey))
  ipcMain.handle(IPC_CHANNELS.llmKeyClear, () => llm.keyStore.clear())
  ipcMain.handle(IPC_CHANNELS.llmConfigGet, () => llm.configStore.read())
  ipcMain.handle(IPC_CHANNELS.llmConfigSave, (_event, config: LlmConfig) =>
    llm.configStore.save(config)
  )
  ipcMain.handle(IPC_CHANNELS.llmChatStart, (_event, input: StartChatInput) =>
    llm.chatService.start(input)
  )
  ipcMain.handle(IPC_CHANNELS.llmChatRetry, (_event, assistantMessageId: string) =>
    llm.chatService.retry(assistantMessageId)
  )
  ipcMain.handle(IPC_CHANNELS.llmChatCancel, (_event, requestId: string) => {
    llm.chatService.cancel(requestId)
  })
}
