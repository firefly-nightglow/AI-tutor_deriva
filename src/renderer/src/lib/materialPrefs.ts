export interface MaterialPrefs {
  open: boolean
  url: string
  label: string
  normalRatio: number
  floatingRatio: number
  items?: MaterialEntry[]
}

export interface MaterialEntry { url: string; label: string }

export function materialEntries(prefs: MaterialPrefs): MaterialEntry[] {
  return prefs.items ?? (prefs.url ? [{ url: prefs.url, label: prefs.label || prefs.url }] : [])
}

export function rememberMaterial(prefs: MaterialPrefs, entry: MaterialEntry): Partial<MaterialPrefs> {
  return {
    ...entry,
    items: [...materialEntries(prefs).filter((item) => item.url !== entry.url), entry]
  }
}

export function removeMaterial(prefs: MaterialPrefs): Partial<MaterialPrefs> {
  const items = materialEntries(prefs).filter((item) => item.url !== prefs.url)
  const next = items.at(-1)
  return { items, url: next?.url ?? '', label: next?.label ?? '' }
}

const STORAGE_KEY = 'deriva:material-panel'
const DEFAULT_PREFS: MaterialPrefs = {
  open: false,
  url: '',
  label: '',
  normalRatio: 0.55,
  floatingRatio: 0.5
}

function clampRatio(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(0.75, Math.max(0.25, value))
}

export function readMaterialPrefs(storage: Pick<Storage, 'getItem'>): MaterialPrefs {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<MaterialPrefs>
    return {
      open: parsed.open === true,
      url: '',
      label: '',
      normalRatio: clampRatio(parsed.normalRatio, DEFAULT_PREFS.normalRatio),
      floatingRatio: clampRatio(parsed.floatingRatio, DEFAULT_PREFS.floatingRatio)
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveMaterialPrefs(
  storage: Pick<Storage, 'setItem'>,
  prefs: MaterialPrefs
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      open: prefs.open,
      normalRatio: prefs.normalRatio,
      floatingRatio: prefs.floatingRatio
    }))
  } catch {
    // A failed preference write must not prevent the panel from working this session.
  }
}
