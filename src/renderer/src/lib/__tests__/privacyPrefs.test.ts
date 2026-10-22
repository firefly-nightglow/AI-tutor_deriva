import { describe, expect, it } from 'vitest'
import type { ScreenCaptureSource } from '../../../../shared/types'
import {
  isSourceExcluded,
  readPrivacyPreferences,
  savePrivacyPreferences
} from '../privacyPrefs'

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    }
  }
}

describe('privacy preferences', () => {
  it('round-trips and deduplicates exclusions', () => {
    const store = storage()
    savePrivacyPreferences(store, {
      excludedDisplayIds: ['1', ' 1 ', '2'],
      excludedWindowTitles: ['私人', '私人', '  ']
    })
    expect(readPrivacyPreferences(store)).toEqual({
      excludedDisplayIds: ['1', '2'],
      excludedWindowTitles: ['私人']
    })
  })

  it('matches display ids and window-title substrings', () => {
    const display: ScreenCaptureSource = {
      id: 'screen:1',
      name: '主显示器',
      kind: 'screen',
      displayId: '1',
      previewDataUrl: ''
    }
    const window: ScreenCaptureSource = {
      id: 'window:2',
      name: '私人笔记',
      kind: 'window',
      displayId: null,
      previewDataUrl: ''
    }
    const preferences = { excludedDisplayIds: ['1'], excludedWindowTitles: ['私人'] }

    expect(isSourceExcluded(display, preferences)).toBe(true)
    expect(isSourceExcluded(window, preferences)).toBe(true)
    expect(isSourceExcluded({ ...window, name: '线性代数' }, preferences)).toBe(false)
  })
})
