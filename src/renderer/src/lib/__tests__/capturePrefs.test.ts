import { describe, expect, it } from 'vitest'
import { readCaptureOriginalDefault, saveCaptureOriginalDefault } from '../capturePrefs'

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    }
  }
}

describe('capture preferences', () => {
  it('defaults to thumbnail and persists an explicit original preference', () => {
    const store = storage()
    expect(readCaptureOriginalDefault(store)).toBe(false)

    saveCaptureOriginalDefault(store, true)
    expect(readCaptureOriginalDefault(store)).toBe(true)

    saveCaptureOriginalDefault(store, false)
    expect(readCaptureOriginalDefault(store)).toBe(false)
  })
})
