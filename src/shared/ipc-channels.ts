/** Channel names shared by the main process handlers and the preload bridge. */
export const IPC_CHANNELS = {
  databasePath: 'app:databasePath',
  subjectsList: 'db:subjects:list',
  subjectsCreate: 'db:subjects:create',
  subjectsRename: 'db:subjects:rename',
  subjectsRemove: 'db:subjects:remove',
  conversationsListBySubject: 'db:conversations:listBySubject',
  conversationsListRoots: 'db:conversations:listRoots',
  conversationsListAll: 'db:conversations:listAll',
  conversationsCreate: 'db:conversations:create',
  conversationsRename: 'db:conversations:rename',
  conversationsMoveToSubject: 'db:conversations:moveToSubject',
  conversationsRemove: 'db:conversations:remove',
  messagesListByConversation: 'db:messages:listByConversation',
  llmKeyStatus: 'llm:key:status',
  llmKeySave: 'llm:key:save',
  llmKeyClear: 'llm:key:clear',
  llmConfigGet: 'llm:config:get',
  llmConfigSave: 'llm:config:save',
  llmChatStart: 'llm:chat:start',
  llmChatRetry: 'llm:chat:retry',
  llmChatCancel: 'llm:chat:cancel',
  /** Push channel: main process to renderer while an answer streams. */
  llmChatEvent: 'llm:chat:event',
  attachmentsRead: 'attachments:read',
  bookmarksListByConversation: 'db:bookmarks:listByConversation'
} as const
