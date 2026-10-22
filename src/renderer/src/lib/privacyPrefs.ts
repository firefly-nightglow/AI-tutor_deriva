import type { ScreenCaptureSource } from '../../../shared/types'

export const PRIVACY_PREFS_KEY = 'deriva.capture.privacyExclusions'

export interface PrivacyPreferences {
  excludedDisplayIds: string[]
  excludedWindowTitles: string[]
}

const EMPTY: PrivacyPreferences = { excludedDisplayIds: [], excludedWindowTitles: [] }

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter((value) => value !== ''))]
}

export function readPrivacyPreferences(storage: Pick<Storage, 'getItem'> | null): PrivacyPreferences {
  try {
    const raw = storage?.getItem(PRIVACY_PREFS_KEY)
    if (raw === null || raw === undefined) return EMPTY
    const parsed = JSON.parse(raw) as Partial<PrivacyPreferences>
    return {
      excludedDisplayIds: clean(parsed.excludedDisplayIds),
      excludedWindowTitles: clean(parsed.excludedWindowTitles)
    }
  } catch {
    return EMPTY
  }
}

export function savePrivacyPreferences(
  storage: Pick<Storage, 'setItem'> | null,
  preferences: PrivacyPreferences
): void {
  try {
    storage?.setItem(
      PRIVACY_PREFS_KEY,
      JSON.stringify({
        excludedDisplayIds: clean(preferences.excludedDisplayIds),
        excludedWindowTitles: clean(preferences.excludedWindowTitles)
      })
    )
  } catch {
    // Storage unavailable: exclusions still apply for this session through component state.
  }
}

export function isSourceExcluded(
  source: ScreenCaptureSource,
  preferences: PrivacyPreferences
): boolean {
  if (source.displayId !== null && preferences.excludedDisplayIds.includes(source.displayId)) {
    return true
  }
  if (source.kind === 'window') {
    const title = source.name.toLocaleLowerCase()
    return preferences.excludedWindowTitles.some((item) =>
      title.includes(item.toLocaleLowerCase())
    )
  }
  return false
}
