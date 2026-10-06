import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '../db/errors'
import { createAttachmentStore } from '../attachments'

const PNG = 'data:image/png;base64,iVBORw0KGgo='
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'deriva-attachments-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('attachment store', () => {
  it('writes an image to disk and reads it back as a data URL', () => {
    const store = createAttachmentStore(directory)
    const [saved] = store.save([{ name: 'picked.png', mime: 'image/png', dataUrl: PNG }])

    expect(saved?.mime).toBe('image/png')
    expect(saved?.bytes).toBeGreaterThan(0)
    expect(store.read(saved?.id ?? '')).toBe(PNG)
  })

  it('returns nothing for an empty batch or an unknown id', () => {
    const store = createAttachmentStore(directory)
    expect(store.save([])).toEqual([])
    expect(store.read('missing')).toBeNull()
  })

  it('rejects unsupported formats and empty payloads instead of writing them', () => {
    const store = createAttachmentStore(directory)
    expect(() => store.save([{ name: 'x.tiff', mime: 'image/tiff', dataUrl: PNG }])).toThrow(
      ValidationError
    )
    expect(() =>
      store.save([{ name: 'x.png', mime: 'image/png', dataUrl: 'data:image/png;base64,' }])
    ).toThrow(ValidationError)
  })

  it('deletes stored files when the referencing messages are gone', () => {
    const store = createAttachmentStore(directory)
    const saved = store.save([
      { name: 'a.png', mime: 'image/png', dataUrl: PNG },
      { name: 'b.png', mime: 'image/png', dataUrl: PNG }
    ])

    store.removeAll([saved[0]?.id ?? ''])

    expect(store.read(saved[0]?.id ?? '')).toBeNull()
    expect(store.read(saved[1]?.id ?? '')).toBe( PNG)
  })
})
