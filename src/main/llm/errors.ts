import type { ChatErrorKind } from '../../shared/types'

const USER_MESSAGES: Record<ChatErrorKind, string> = {
  auth: 'API Key 无效或已失效，请在设置中检查后重试。',
  insufficient_balance: 'DeepSeek 账户余额不足，请充值后重试。',
  rate_limit: '请求过于频繁（触发限流），请稍后再试。',
  bad_request: '请求被拒绝：模型或参数不合法，请检查模型设置。',
  server: '模型服务暂时不可用，请稍后重试。',
  network: '网络连接失败，请检查网络后重试。',
  timeout: '等待模型响应超过 30 秒，已中断本次回答，可重试。',
  aborted: '已取消本次回答。',
  missing_key: '尚未配置 API Key，请先在设置中填写。',
  unknown: '调用模型时发生未知错误。'
}

export class LlmError extends Error {
  readonly kind: ChatErrorKind

  constructor(kind: ChatErrorKind, detail?: string) {
    super(detail ? `${USER_MESSAGES[kind]}（${detail}）` : USER_MESSAGES[kind])
    this.name = 'LlmError'
    this.kind = kind
  }
}

/** Maps HTTP status to a user-actionable failure class. Codes per DeepSeek's error reference. */
export function classifyHttpStatus(status: number): ChatErrorKind {
  if (status === 401) return 'auth'
  if (status === 402) return 'insufficient_balance'
  if (status === 429) return 'rate_limit'
  if (status === 400 || status === 422) return 'bad_request'
  if (status >= 500) return 'server'
  return 'unknown'
}

export function userMessageFor(kind: ChatErrorKind): string {
  return USER_MESSAGES[kind]
}
