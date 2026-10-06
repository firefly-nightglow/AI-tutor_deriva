import { describe, expect, it } from 'vitest'
import {
  expandCollapsed,
  readCollapsed,
  readRailCollapsed,
  saveCollapsed,
  saveRailCollapsed,
  toggleCollapsed
} from '../collapse'

function storageOf(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    }
  }
}

describe('collapsed nodes', () => {
  it('round-trips the collapsed set', () => {
    const storage = storageOf()
    saveCollapsed(storage, new Set(['a', 'b']))
    expect([...readCollapsed(storage)].sort()).toEqual(['a', 'b'])
  })

  it('ignores junk and degrades without storage', () => {
    expect([...readCollapsed(storageOf({ 'deriva.collapsed': 'not json' }))]).toEqual([])
    expect([...readCollapsed(storageOf({ 'deriva.collapsed': '{"a":1}' }))]).toEqual([])
    expect([...readCollapsed(null)]).toEqual([])
    expect(() => saveCollapsed(null, new Set(['a']))).not.toThrow()
  })

  it('toggles one id without touching the rest', () => {
    const first = toggleCollapsed(new Set(['a']), 'b')
    expect([...first].sort()).toEqual(['a', 'b'])
    expect([...toggleCollapsed(first, 'a')]).toEqual(['b'])
  })

  it('expands a chain and reports when nothing changed', () => {
    const current = new Set(['a', 'b', 'c'])
    expect([...expandCollapsed(current, ['a', 'b'])]).toEqual(['c'])
    expect(expandCollapsed(current, ['x'])).toBe(current)
  })

  it('round-trips the bookmark rail preference', () => {
    const storage = storageOf()
    expect(readRailCollapsed(storage)).toBe(false)
    saveRailCollapsed(storage, true)
    expect(readRailCollapsed(storage)).toBe(true)
    expect(() => saveRailCollapsed(null, true)).not.toThrow()
  })
})
