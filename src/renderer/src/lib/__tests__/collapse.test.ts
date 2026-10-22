import { describe, expect, it } from 'vitest'
import {
  expandCollapsed,
  readCollapsed,
  readCollapsedRails,
  saveCollapsed,
  saveCollapsedRails,
  toggleCollapsedRail,
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

  it('round-trips bookmark rail collapse per conversation', () => {
    const storage = storageOf()
    expect([...readCollapsedRails(storage)]).toEqual([])
    saveCollapsedRails(storage, new Set(['a']))
    expect([...readCollapsedRails(storage)]).toEqual(['a'])
    expect([...toggleCollapsedRail(new Set(['a']), 'b')].sort()).toEqual(['a', 'b'])
    expect(() => saveCollapsedRails(null, new Set(['a']))).not.toThrow()
  })
})
