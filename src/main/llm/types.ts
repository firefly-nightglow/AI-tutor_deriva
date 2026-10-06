export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** Data URLs for attached images; the client turns these into OpenAI-style content parts. */
  images?: string[]
}

export type ChatStreamChunk = { type: 'delta'; text: string } | { type: 'done' }

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ChatClient {
  readonly model: string
  streamChat(messages: ChatMessage[], options?: { signal?: AbortSignal }): AsyncGenerator<ChatStreamChunk>
}
