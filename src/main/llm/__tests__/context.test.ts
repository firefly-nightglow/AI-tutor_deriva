import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from '../../db'
import {
  assembleContext,
  createBranchAnchorBlock,
  createConversationHistoryBlock,
  createConversationHistoryBlockWithParentChain,
  type ContextBlock
} from '../context'

let database: AppDatabase

beforeEach(() => {
  database = openDatabase(':memory:')
})

afterEach(() => {
  database.close()
})

describe('context assembly pipeline', () => {
  it('prepends the quoted excerpt when answering inside a branch', async () => {
    const answer = database.repositories.messages.append({
      conversationId: database.repositories.conversations.create({ title: '主对话' }).id,
      role: 'assistant',
      content: '由斯特林公式可得'
    })
    const root = database.repositories.conversations.get(answer.conversationId)
    const branch = database.repositories.conversations.create({
      parentConversationId: root?.id ?? null,
      sourceMessageId: answer.id,
      sourceQuote: '由斯特林公式可得',
      title: '斯特林公式'
    })

    const messages = await assembleContext('SYS', [createBranchAnchorBlock()], {
      repositories: database.repositories,
      conversationId: branch.id
    })

    expect(messages).toHaveLength(2)
    expect(messages[1]?.content).toContain('> 由斯特林公式可得')
  })

  it('adds the ancestor chain only under the full-chain strategy', async () => {
    const root = database.repositories.conversations.create({ title: '主对话' })
    database.repositories.messages.append({
      conversationId: root.id,
      role: 'user',
      content: '根问题'
    })
    const branch = database.repositories.conversations.create({
      parentConversationId: root.id,
      title: '子对话'
    })
    database.repositories.messages.append({
      conversationId: branch.id,
      role: 'user',
      content: '分支问题'
    })

    const excerptOnly = await assembleContext(
      'SYS',
      [createConversationHistoryBlockWithParentChain(() => false)],
      { repositories: database.repositories, conversationId: branch.id }
    )
    const fullChain = await assembleContext(
      'SYS',
      [createConversationHistoryBlockWithParentChain(() => true)],
      { repositories: database.repositories, conversationId: branch.id }
    )

    expect(excerptOnly.map((message) => message.content)).toEqual(['SYS', '分支问题'])
    expect(fullChain.map((message) => message.content)).toEqual(['SYS', '根问题', '分支问题'])
  })

  it('places the system prompt first and keeps block order', async () => {
    const first: ContextBlock = {
      id: 'first',
      build: () => [{ role: 'user', content: 'block-one' }]
    }
    const second: ContextBlock = {
      id: 'second',
      build: async () => [{ role: 'user', content: 'block-two' }]
    }

    const messages = await assembleContext('SYS', [first, second], {
      repositories: database.repositories,
      conversationId: 'unused'
    })

    expect(messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'block-one' },
      { role: 'user', content: 'block-two' }
    ])
  })

  it('lets a second block be appended without touching the assembly code (v2/v3 seam)', async () => {
    const conversation = database.repositories.conversations.create({ title: '线代' })
    database.repositories.messages.append({
      conversationId: conversation.id,
      role: 'user',
      content: '什么是向量空间'
    })
    const screenshotBlock: ContextBlock = {
      id: 'screenshot',
      build: () => [{ role: 'user', content: '[截图] 第 3 页定理 2.1' }]
    }

    const messages = await assembleContext(
      'SYS',
      [screenshotBlock, createConversationHistoryBlock()],
      { repositories: database.repositories, conversationId: conversation.id }
    )

    expect(messages.map((message) => message.content)).toEqual([
      'SYS',
      '[截图] 第 3 页定理 2.1',
      '什么是向量空间'
    ])
  })

  it('omits empty placeholders and failed answers from the conversation chain', () => {
    const conversation = database.repositories.conversations.create({ title: '极限' })
    const question = database.repositories.messages.append({
      conversationId: conversation.id,
      role: 'user',
      content: 'ε-N 定义'
    })
    const failed = database.repositories.messages.append({
      conversationId: conversation.id,
      parentId: question.id,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })
    database.repositories.messages.updateContent(failed.id, '', 'error')

    const messages = createConversationHistoryBlock().build({
      repositories: database.repositories,
      conversationId: conversation.id
    }) as Array<{ content: string }>

    expect(messages.map((message) => message.content)).toEqual(['ε-N 定义'])
  })
})
