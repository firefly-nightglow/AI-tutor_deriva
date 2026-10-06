import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from '..'
import { DuplicateNameError, NotFoundError, ValidationError } from '../errors'

let database: AppDatabase

beforeEach(() => {
  database = openDatabase(':memory:')
})

afterEach(() => {
  database.close()
})

describe('subjects', () => {
  it('creates, lists, renames and removes a subject', () => {
    const { subjects } = database.repositories
    const created = subjects.create({ name: '线性代数' })

    expect(subjects.list().map((subject) => subject.name)).toEqual(['线性代数'])
    expect(subjects.rename(created.id, '线性代数与数据学习').name).toBe('线性代数与数据学习')

    subjects.remove(created.id)
    expect(subjects.list()).toEqual([])
  })

  it('rejects a duplicate name regardless of case', () => {
    const { subjects } = database.repositories
    subjects.create({ name: 'Linear Algebra' })

    expect(() => subjects.create({ name: 'linear algebra' })).toThrow(DuplicateNameError)
    expect(() => subjects.create({ name: 'LINEAR ALGEBRA' })).toThrow(DuplicateNameError)
  })

  it('keeps conversations when their subject is removed', () => {
    const { subjects, conversations } = database.repositories
    const subject = subjects.create({ name: '数列极限' })
    const conversation = conversations.create({ subjectId: subject.id, title: '斯特林公式从哪里来' })

    subjects.remove(subject.id)

    expect(conversations.get(conversation.id)?.subjectId).toBeNull()
  })

  it('rejects blank names and trims valid ones', () => {
    const { subjects } = database.repositories

    expect(() => subjects.create({ name: '' })).toThrow(ValidationError)
    expect(() => subjects.create({ name: '   ' })).toThrow(ValidationError)

    const created = subjects.create({ name: '  线性代数  ' })
    expect(created.name).toBe('线性代数')
    expect(() => subjects.rename(created.id, '  ')).toThrow(ValidationError)
  })
})

describe('conversation tree', () => {
  it('validates titles, subjects and branch anchors on create', () => {
    const { subjects, conversations, messages } = database.repositories
    const subject = subjects.create({ name: '线代' })
    const parent = conversations.create({ subjectId: subject.id, title: '父' })
    const other = conversations.create({ title: '无关' })
    const foreignMessage = messages.append({
      conversationId: other.id,
      role: 'assistant',
      content: 'A'
    })

    expect(() => conversations.create({ title: '   ' })).toThrow(ValidationError)
    expect(() => conversations.create({ title: 'x', subjectId: 'missing' })).toThrow(NotFoundError)
    expect(() =>
      conversations.create({ title: 'x', parentConversationId: 'missing' })
    ).toThrow(NotFoundError)
    expect(() =>
      conversations.create({
        title: '错位分支',
        parentConversationId: parent.id,
        sourceMessageId: foreignMessage.id
      })
    ).toThrow(ValidationError)
  })

  it('nests branches at least five levels deep and returns them as a tree', () => {
    const { conversations } = database.repositories
    const root = conversations.create({ title: 'L0' })

    let parent = root
    for (let level = 1; level <= 5; level += 1) {
      parent = conversations.create({
        parentConversationId: parent.id,
        title: `L${level}`,
        sourceMessageId: null
      })
    }

    const tree = conversations.listTree(root.id)
    let depth = 0
    let node = tree
    while (node.children.length > 0) {
      depth += 1
      node = node.children[0]
    }

    expect(depth).toBe(5)
    expect(node.conversation.title).toBe('L5')
  })

  it('lists only top-level conversations as roots and groups them by subject', () => {
    const { subjects, conversations } = database.repositories
    const subject = subjects.create({ name: '高等数学' })
    const root = conversations.create({ subjectId: subject.id, title: '主对话' })
    conversations.create({ parentConversationId: root.id, title: '子对话' })
    conversations.create({ title: '未分类主对话' })

    expect(conversations.listRoots().map((item) => item.title).sort()).toEqual([
      '主对话',
      '未分类主对话'
    ])
    expect(conversations.listBySubject(subject.id).map((item) => item.title)).toEqual(['主对话'])
    expect(conversations.listBySubject(null).map((item) => item.title)).toEqual(['未分类主对话'])
  })

  it('orders sibling branches deterministically by insertion order', () => {
    const { conversations } = database.repositories
    const root = conversations.create({ title: '根' })
    const first = conversations.create({ parentConversationId: root.id, title: '第一支' })
    const second = conversations.create({ parentConversationId: root.id, title: '第二支' })
    const third = conversations.create({ parentConversationId: root.id, title: '第三支' })

    const tree = conversations.listTree(root.id)

    expect(tree.children.map((node) => node.conversation.id)).toEqual([
      first.id,
      second.id,
      third.id
    ])
    expect(tree.children.map((node) => node.conversation.title)).toEqual(['第一支', '第二支', '第三支'])
  })

  it('cascades deletion of a conversation to its whole subtree, messages and bookmarks', () => {
    const { conversations, messages, bookmarks } = database.repositories
    const root = conversations.create({ title: '根' })
    const child = conversations.create({ parentConversationId: root.id, title: '子' })
    const grandchild = conversations.create({ parentConversationId: child.id, title: '孙' })

    const childMessage = messages.append({
      conversationId: child.id,
      role: 'assistant',
      content: '这段推导用到了柯西收敛准则'
    })
    const grandchildMessage = messages.append({
      conversationId: grandchild.id,
      role: 'user',
      content: '柯西收敛准则是什么'
    })
    bookmarks.create({
      conversationId: child.id,
      messageId: childMessage.id,
      summary: '柯西收敛准则',
      position: 0
    })

    conversations.remove(root.id)

    expect(conversations.get(root.id)).toBeNull()
    expect(conversations.get(child.id)).toBeNull()
    expect(conversations.get(grandchild.id)).toBeNull()
    expect(messages.listByConversation(child.id)).toEqual([])
    expect(messages.get(grandchildMessage.id)).toBeNull()
    expect(bookmarks.listByConversation(child.id)).toEqual([])
  })
})

describe('messages', () => {
  it('keeps message lineage through parent_id', () => {
    const { conversations, messages } = database.repositories
    const root = conversations.create({ title: '主对话' })
    const question = messages.append({
      conversationId: root.id,
      role: 'user',
      content: '什么是数列极限'
    })
    const answer = messages.append({
      conversationId: root.id,
      parentId: question.id,
      role: 'assistant',
      content: '先看一个具体例子'
    })
    messages.append({
      conversationId: root.id,
      parentId: answer.id,
      role: 'user',
      content: '那这里的 ε 是什么意思'
    })

    expect(messages.listChildren(question.id).map((message) => message.id)).toEqual([answer.id])
    expect(messages.listByConversation(root.id)).toHaveLength(3)
    expect(messages.get(answer.id)?.contentType).toBe('text')
    expect(messages.get(answer.id)?.attachments).toBeNull()
  })

  it('records a selected source message as the anchor of a branch conversation', () => {
    const { conversations, messages } = database.repositories
    const root = conversations.create({ title: '主对话' })
    const answer = messages.append({
      conversationId: root.id,
      role: 'assistant',
      content: '由斯特林公式可得'
    })
    const branch = conversations.create({
      parentConversationId: root.id,
      sourceMessageId: answer.id,
      title: '斯特林公式是怎么来的'
    })

    expect(conversations.get(branch.id)?.sourceMessageId).toBe(answer.id)
  })

  it('persists the quoted excerpt and rejects a blank one', () => {
    const { conversations, messages } = database.repositories
    const root = conversations.create({ title: '根' })
    const answer = messages.append({
      conversationId: root.id,
      role: 'assistant',
      content: '由斯特林公式可得'
    })
    const branch = conversations.create({
      parentConversationId: root.id,
      sourceMessageId: answer.id,
      sourceQuote: '  由斯特林公式可得  ',
      title: '斯特林公式是怎么来的'
    })

    expect(conversations.get(branch.id)?.sourceQuote).toBe('由斯特林公式可得')
    expect(() => conversations.create({ title: 'x', sourceQuote: '   ' })).toThrow(ValidationError)
  })

  it('rejects a parent message that belongs to another conversation', () => {
    const { conversations, messages } = database.repositories
    const first = conversations.create({ title: '甲' })
    const second = conversations.create({ title: '乙' })
    const foreign = messages.append({ conversationId: first.id, role: 'assistant', content: 'A' })

    expect(() =>
      messages.append({
        conversationId: second.id,
        parentId: foreign.id,
        role: 'user',
        content: 'B'
      })
    ).toThrow(ValidationError)
  })

  it('writes a single message in well under 50ms (NFR-1)', () => {
    const { conversations, messages } = database.repositories
    const conversation = conversations.create({ title: '性能' })

    const started = performance.now()
    messages.append({ conversationId: conversation.id, role: 'user', content: '计时消息' })
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(50)
  })

  it('stores partial content when a streamed answer is aborted', () => {
    const { conversations, messages } = database.repositories
    const conversation = conversations.create({ title: '中断' })
    const partial = messages.append({
      conversationId: conversation.id,
      role: 'assistant',
      content: '已经收到的前半段',
      status: 'streaming'
    })
    const updated = messages.updateContent(partial.id, '已经收到的前半段', 'aborted')

    expect(updated.status).toBe('aborted')
    expect(updated.content).toBe('已经收到的前半段')
  })
})

describe('bookmarks', () => {
  it('rejects a message that belongs to another conversation', () => {
    const { conversations, messages, bookmarks } = database.repositories
    const first = conversations.create({ title: '甲' })
    const second = conversations.create({ title: '乙' })
    const message = messages.append({ conversationId: first.id, role: 'assistant', content: 'A' })

    expect(() =>
      bookmarks.create({
        conversationId: second.id,
        messageId: message.id,
        summary: '错位',
        position: 0
      })
    ).toThrow(ValidationError)
  })

  it('orders bookmarks by position inside a conversation', () => {
    const { conversations, messages, bookmarks } = database.repositories
    const conversation = conversations.create({ title: '书签' })
    const first = messages.append({ conversationId: conversation.id, role: 'assistant', content: 'A' })
    const second = messages.append({ conversationId: conversation.id, role: 'assistant', content: 'B' })

    bookmarks.create({ conversationId: conversation.id, messageId: second.id, summary: '第二段', position: 1 })
    bookmarks.create({ conversationId: conversation.id, messageId: first.id, summary: '第一段', position: 0 })

    expect(bookmarks.listByConversation(conversation.id).map((item) => item.summary)).toEqual([
      '第一段',
      '第二段'
    ])
    expect(bookmarks.getByMessage(conversation.id, first.id)?.position).toBe(0)
  })

  it('removes the bookmark when its message is deleted', () => {
    const { conversations, messages, bookmarks } = database.repositories
    const conversation = conversations.create({ title: '级联' })
    const message = messages.append({ conversationId: conversation.id, role: 'assistant', content: 'A' })
    const bookmark = bookmarks.create({
      conversationId: conversation.id,
      messageId: message.id,
      summary: 'A',
      position: 0
    })

    messages.remove(message.id)

    expect(bookmarks.get(bookmark.id)).toBeNull()
  })

  it('updates a bookmark summary in place', () => {
    const { conversations, messages, bookmarks } = database.repositories
    const conversation = conversations.create({ title: '摘要' })
    const message = messages.append({ conversationId: conversation.id, role: 'assistant', content: 'A' })
    const bookmark = bookmarks.create({
      conversationId: conversation.id,
      messageId: message.id,
      summary: '由斯特林公式可得',
      position: 0
    })

    const updated = bookmarks.updateSummary(bookmark.id, '模型生成的摘要', 'model')

    expect(updated.summary).toBe('模型生成的摘要')
    expect(updated.summarySource).toBe('model')
    expect(bookmarks.listByConversation(conversation.id)[0]?.summary).toBe('模型生成的摘要')
  })
})
