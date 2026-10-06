import { describe, expect, it } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  saveThemePreference
} from '../theme'

function storageOf(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    }
  }
}

describe('theme', () => {
  it('follows the OS by default and ignores junk in storage', () => {
    expect(readThemePreference(storageOf())).toBe('system')
    expect(readThemePreference(storageOf({ [THEME_STORAGE_KEY]: 'sepia' }))).toBe('system')
  })

  it('reads a stored override', () => {
    expect(readThemePreference(storageOf({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark')
  })

  it('resolves system against the OS signal and passes overrides through', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('applies the resolved value on the root element', () => {
    const dataset: Record<string, string> = {}
    applyTheme({ dataset }, 'system', true)
    expect(dataset.theme).toBe('dark')
  })

  it('persists the preference and survives storage being unavailable', () => {
    const storage = storageOf()
    saveThemePreference(storage, 'dark')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(() => saveThemePreference(null, 'dark')).not.toThrow()
  })
})
