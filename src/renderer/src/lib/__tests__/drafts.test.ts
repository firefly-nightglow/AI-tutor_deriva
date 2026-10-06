import { describe, expect, it } from 'vitest'
import { draftKey, readDraft, saveDraft } from '../drafts'

function storageOf(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    }
  }
}

describe('conversation drafts', () => {
  it('round-trips a draft per conversation', () => {
    const storage = storageOf()
    saveDraft(storage, 'c1', '还没问完的问题')
    saveDraft(storage, 'c2', '另一个草稿')

    expect(readDraft(storage, 'c1')).toBe('还没问完的问题')
    expect(readDraft(storage, 'c2')).toBe('另一个草稿')
    expect(readDraft(storage, 'c3')).toBe('')
  })

  it('clears the entry when the draft becomes empty', () => {
    const storage = storageOf()
    saveDraft(storage, 'c1', '内容')
    saveDraft(storage, 'c1', '')
    expect(storage.getItem(draftKey('c1'))).toBeNull()
  })

  it('degrades quietly when storage is unavailable', () => {
    expect(readDraft(null, 'c1')).toBe('')
    expect(() => saveDraft(null, 'c1', 'x')).not.toThrow()
  })
})
