import { describe, expect, it } from 'vitest'
import { SseDecoder } from '../sse'

describe('SseDecoder', () => {
  it('decodes one event per blank line', () => {
    const decoder = new SseDecoder()
    expect(decoder.push('data: one\n\ndata: two\n\n')).toEqual([{ data: 'one' }, { data: 'two' }])
  })

  it('reassembles events split across chunk boundaries', () => {
    const decoder = new SseDecoder()
    expect(decoder.push('data: {"a"')).toEqual([])
    expect(decoder.push(':1}\n')).toEqual([])
    expect(decoder.push('\n')).toEqual([{ data: '{"a":1}' }])
  })

  it('handles CRLF endings and a final event without a trailing blank line', () => {
    const decoder = new SseDecoder()
    expect(decoder.push('data: first\r\n\r\n')).toEqual([{ data: 'first' }])
    decoder.push('data: second')
    expect(decoder.flush()).toEqual([{ data: 'second' }])
  })

  it('ignores comment lines used as keep-alives', () => {
    const decoder = new SseDecoder()
    expect(decoder.push(': keep-alive\n\n')).toEqual([])
    expect(decoder.push('data: real\n\n')).toEqual([{ data: 'real' }])
  })

  it('joins multiple data lines with a newline and keeps the event name', () => {
    const decoder = new SseDecoder()
    expect(decoder.push('event: message\ndata: line1\ndata: line2\n\n')).toEqual([
      { data: 'line1\nline2', event: 'message' }
    ])
  })

  it('tolerates a field with no value and no space after the colon', () => {
    const decoder = new SseDecoder()
    expect(decoder.push('data:tight\n\n')).toEqual([{ data: 'tight' }])
    expect(decoder.push('data\n\n')).toEqual([{ data: '' }])
  })
})
