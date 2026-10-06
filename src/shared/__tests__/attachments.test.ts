import { describe, expect, it } from 'vitest'
import { parseMessageAttachments } from '../attachments'

describe('parseMessageAttachments', () => {
  it('reads stored metadata and ignores malformed entries', () => {
    const raw = JSON.stringify([
      { id: 'a', name: 'x.png', mime: 'image/png', bytes: 12 },
      { id: 'b', mime: 'image/png' },
      { name: 'no id', mime: 'image/png' }
    ])

    expect(parseMessageAttachments(raw).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('degrades to none for null, junk and non-arrays', () => {
    expect(parseMessageAttachments(null)).toEqual([])
    expect(parseMessageAttachments('not json')).toEqual([])
    expect(parseMessageAttachments('{"id":"a"}')).toEqual([])
  })
})
