import { describe, expect, it } from 'vitest'
import { materialEntries, rememberMaterial, removeMaterial, readMaterialPrefs, saveMaterialPrefs } from '../materialPrefs'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    }
  }
}

describe('material panel preferences', () => {
  it('starts without resources even when older storage contains an open page', () => {
    const storage = memoryStorage()
    storage.setItem('deriva:material-panel', JSON.stringify({
      open: true, url: 'https://old.test/', label: 'Old',
      items: [{ url: 'https://old.test/', label: 'Old' }], normalRatio: 0.6
    }))
    const prefs = readMaterialPrefs(storage)
    expect(prefs.open).toBe(true)
    expect(prefs.url).toBe('')
    expect(prefs.label).toBe('')
    expect(materialEntries(prefs)).toEqual([])
    expect(prefs.normalRatio).toBe(0.6)
  })

  it('removes only the selected resource during the open panel session', () => {
    const storage = memoryStorage()
    let prefs = readMaterialPrefs(storage)
    prefs = { ...prefs, ...rememberMaterial(prefs, { url: 'https://a.test', label: 'A' }) }
    prefs = { ...prefs, ...rememberMaterial(prefs, { url: 'https://b.test', label: 'B' }) }
    prefs = { ...prefs, ...removeMaterial(prefs) }
    expect(prefs.url).toBe('https://a.test')
    expect(materialEntries(prefs)).toEqual([{ url: 'https://a.test', label: 'A' }])
    prefs = { ...prefs, ...removeMaterial(prefs) }
    saveMaterialPrefs(storage, prefs)
    expect(readMaterialPrefs(storage).url).toBe('')
    expect(materialEntries(readMaterialPrefs(storage))).toEqual([])
  })

  it('migrates the old single-resource preference into a removable entry', () => {
    const prefs = { ...readMaterialPrefs(memoryStorage()), url: 'https://old.test', label: 'Old' }
    expect(materialEntries(prefs)).toHaveLength(1)
    expect(removeMaterial(prefs)).toEqual({ items: [], url: '', label: '' })
  })
  it('returns closed defaults for empty storage', () => {
    expect(readMaterialPrefs(memoryStorage())).toEqual({
      open: false,
      url: '',
      label: '',
      normalRatio: 0.55,
      floatingRatio: 0.5
    })
  })

  it('persists layout but never persists resources or the address draft', () => {
    const storage = memoryStorage()
    saveMaterialPrefs(storage, {
      open: true,
      url: 'https://example.com/notes',
      label: '笔记',
      items: [{ url: 'https://example.com/notes', label: '笔记' }],
      normalRatio: 0.62,
      floatingRatio: 0.41
    })
    expect(readMaterialPrefs(storage)).toEqual({
      open: true,
      url: '',
      label: '',
      normalRatio: 0.62,
      floatingRatio: 0.41
    })
    expect(storage.getItem('deriva:material-panel')).not.toContain('example.com')
  })

  it('clamps ratios and ignores malformed storage', () => {
    const storage = memoryStorage()
    storage.setItem(
      'deriva:material-panel',
      JSON.stringify({ open: true, normalRatio: 0.9, floatingRatio: 0.1 })
    )
    const prefs = readMaterialPrefs(storage)
    expect(prefs.normalRatio).toBe(0.75)
    expect(prefs.floatingRatio).toBe(0.25)

    storage.setItem('deriva:material-panel', '{not json')
    expect(readMaterialPrefs(storage).open).toBe(false)
  })
})
