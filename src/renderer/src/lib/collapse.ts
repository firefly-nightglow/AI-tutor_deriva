const COLLAPSE_KEY = 'deriva.collapsed'
const RAIL_KEY = 'deriva.bookmarkRailCollapsed'

export function readCollapsed(storage: Pick<Storage, 'getItem'> | null): Set<string> {
  try {
    const raw = storage?.getItem(COLLAPSE_KEY)
    if (raw === null || raw === undefined) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function saveCollapsed(
  storage: Pick<Storage, 'setItem'> | null,
  collapsed: ReadonlySet<string>
): void {
  try {
    storage?.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]))
  } catch {
    // Storage unavailable: the state still applies for this session.
  }
}

export function toggleCollapsed(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Expands the given ids; returns the original set when nothing needed to change. */
export function expandCollapsed(
  current: ReadonlySet<string>,
  ids: readonly string[]
): ReadonlySet<string> {
  if (!ids.some((id) => current.has(id))) return current
  const next = new Set(current)
  for (const id of ids) next.delete(id)
  return next
}

/** The bookmark rail's collapsed preference is a global UI choice, shared by every pane. */
export function readRailCollapsed(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(RAIL_KEY) === '1'
  } catch {
    return false
  }
}

export function saveRailCollapsed(
  storage: Pick<Storage, 'setItem'> | null,
  collapsed: boolean
): void {
  try {
    storage?.setItem(RAIL_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage unavailable: the state still applies for this session.
  }
}
