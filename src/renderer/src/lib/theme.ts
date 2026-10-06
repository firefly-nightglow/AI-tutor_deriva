export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'deriva.theme'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** Returns the stored preference, falling back to following the OS when nothing valid is stored. */
export function readThemePreference(storage: Pick<Storage, 'getItem'> | null): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY)
    return isThemePreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

/** Writes the resolved theme onto <html data-theme>, which is what the CSS token blocks key off. */
export function applyTheme(
  root: { dataset: DOMStringMap },
  preference: ThemePreference,
  prefersDark: boolean
): ResolvedTheme {
  const resolved = resolveTheme(preference, prefersDark)
  root.dataset.theme = resolved
  return resolved
}

export function saveThemePreference(
  storage: Pick<Storage, 'setItem'> | null,
  preference: ThemePreference
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Private mode or a full quota: the theme still applies for this session.
  }
}
