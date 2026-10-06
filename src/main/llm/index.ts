/**
 * Model access module boundary reserved by ADR-0004.
 *
 * v1 ships the OpenAI-compatible streaming client, the safeStorage-backed key store, the provider
 * config store and the context assembly pipeline with a single conversation-history block.
 * Screenshots (v2) and the knowledge profile (v3) plug in as additional ContextBlocks.
 */
export { createOpenAiCompatibleClient } from './client'
export { createApiKeyStore, type ApiKeyStore, type EncryptionProvider } from './keys'
export { createLlmConfigStore, DEFAULT_LLM_CONFIG, type LlmConfigStore } from './config'
export {
  assembleContext,
  createBranchAnchorBlock,
  createConversationHistoryBlock,
  createConversationHistoryBlockWithParentChain,
  type ContextBlock,
  type ContextBlockInput
} from './context'
export { createChatService, type ChatService, type ChatServiceDeps } from './chat-service'
export { TUTOR_SYSTEM_PROMPT_V0 } from './system-prompt'
export { LlmError, classifyHttpStatus, userMessageFor } from './errors'
export { SseDecoder, type SseEvent } from './sse'
export type { ChatClient, ChatMessage, ChatStreamChunk } from './types'
