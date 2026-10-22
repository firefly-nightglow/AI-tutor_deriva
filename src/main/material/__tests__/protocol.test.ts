import { describe, expect, it } from 'vitest'
import { mimeForPath, parseByteRange } from '../protocol'

describe('material protocol helpers', () => {
  it('maps supported local files to explicit MIME types', () => {
    expect(mimeForPath('notes.pdf')).toBe('application/pdf')
    expect(mimeForPath('lecture.MP4')).toBe('video/mp4')
    expect(mimeForPath('diagram.png')).toBe('image/png')
    expect(mimeForPath('lesson.ts')).toBe('text/plain; charset=utf-8')
    expect(mimeForPath('page.html')).toBe('text/plain; charset=utf-8')
  })

  it('parses closed, open-ended and suffix byte ranges', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseByteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('ignores malformed or unsatisfiable ranges', () => {
    expect(parseByteRange(null, 1000)).toBeNull()
    expect(parseByteRange('bytes=abc', 1000)).toBeNull()
    expect(parseByteRange('bytes=1000-', 1000)).toBeNull()
    expect(parseByteRange('bytes=20-10', 1000)).toBeNull()
  })
})
