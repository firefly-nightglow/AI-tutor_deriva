import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Conversation, Message } from '../../../../shared/types'
import { ConversationView } from '../ConversationView'

const conversation: Conversation = {
  id: 'c1',
  subjectId: null,
  parentConversationId: null,
  sourceMessageId: null,
  sourceQuote: null,
  title: '数列极限',
  titleSource: 'local',
  model: 'deepseek-flash',
  createdAt: 0,
  updatedAt: 0
}

function message(partial: Partial<Message>): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    parentId: null,
    role: 'assistant',
    content: '',
    contentType: 'text',
    attachments: null,
    model: 'deepseek-flash',
    status: 'complete',
    createdAt: 0,
    updatedAt: 0,
    ...partial
  }
}

function render(overrides: Partial<React.ComponentProps<typeof ConversationView>> = {}): string {
  return renderToStaticMarkup(
    <ConversationView
      conversation={conversation}
      levelLabel="主对话"
      onClose={() => {}}
      messages={[]}
      bookmarks={[]}
      branchSources={[]}
      railCollapsed={false}
      onToggleRail={() => {}}
      streamingText=""
      streaming={false}
      error=""
      onSend={() => {}}
      onCancel={() => {}}
      onRetry={() => {}}
      onAsk={() => {}}
      {...overrides}
    />
  )
}

describe('ConversationView', () => {
  it('renders assistant answers as markdown with math and shows the model badge', () => {
    const html = render({
      messages: [
        message({ id: 'q', role: 'user', content: '什么是 ε-N 定义', model: null }),
        message({
          id: 'a',
          content: '## 定义\n\n设 $\\varepsilon > 0$ 即可。',
          model: 'deepseek-flash'
        })
      ]
    })

    expect(html).toMatch(/<h2[^>]*>定义<\/h2>/)
    expect(html).toContain('class="katex"')
    expect(html).toContain('deepseek-flash')
    expect(html).not.toContain('##')
  })

  it('shows the local-live answer while streaming', () => {
    const html = render({ streaming: true, streamingText: '正在**生成**' })

    expect(html).toContain('生成中')
    expect(html).toContain('<strong>生成</strong>')
  })

  it('disables send for an empty draft and while an answer streams', () => {
    const empty = render()
    const busy = render({ streaming: true })

    expect(empty).toContain('disabled=""')
    expect(busy).toContain('disabled=""')
  })

  it('surfaces a failure with a retry action', () => {
    const html = render({ error: 'rate_limit: 请求过于频繁（触发限流），请稍后再试。' })

    expect(html).toContain('触发限流')
    expect(html).toContain('重试')
  })

  it('guides the user when the conversation has no messages yet', () => {
    expect(render()).toContain('在第一轮提问后，标题会自动取该问题的摘要')
  })

  it('puts the quoted excerpt above the transcript for a branch conversation', () => {
    const html = render({
      conversation: { ...conversation, sourceQuote: '由 $\\varepsilon$ 与 $N$ 共同决定' }
    })

    expect(html).toContain('引用的内容')
    expect(html).toContain('class="katex"')
    expect(html.indexOf('引用的内容')).toBeLessThan(html.indexOf('conversation__messages'))
  })
})
