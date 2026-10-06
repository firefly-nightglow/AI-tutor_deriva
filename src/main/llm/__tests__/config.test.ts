import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '../../db/errors'
import { DEFAULT_LLM_CONFIG, createLlmConfigStore } from '../config'

let directory: string
let filePath: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'deriva-config-'))
  filePath = join(directory, 'llm-config.json')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('llm config store', () => {
  it('falls back to the DeepSeek defaults when nothing is stored', () => {
    expect(createLlmConfigStore(filePath).read()).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('round-trips an alternative OpenAI-compatible provider', () => {
    const store = createLlmConfigStore(filePath)
    store.save({
      baseUrl: 'https://api.moonshot.cn/v1/',
      model: 'kimi-k2',
      contextStrategy: 'excerpt',
      summarySource: 'local'
    })
    expect(store.read()).toEqual({
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2',
      contextStrategy: 'excerpt',
      summarySource: 'local'
    })
  })

  it('rejects a non-http base url and a blank model', () => {
    const store = createLlmConfigStore(filePath)
    expect(() =>
      store.save({
        baseUrl: 'ftp://example.com',
        model: 'm',
        contextStrategy: 'excerpt',
        summarySource: 'local'
      })
    ).toThrow(ValidationError)
    expect(() =>
      store.save({
        baseUrl: 'https://example.com',
        model: '  ',
        contextStrategy: 'excerpt',
        summarySource: 'local'
      })
    ).toThrow(ValidationError)
    expect(existsSync(filePath)).toBe(false)
  })

  it('keeps the full-chain context strategy and falls back for an unknown one', () => {
    const store = createLlmConfigStore(filePath)
    store.save({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      contextStrategy: 'full-chain',
      summarySource: 'model'
    })
    expect(store.read().contextStrategy).toBe('full-chain')
    expect(store.read().summarySource).toBe('model')

    writeFileSync(
      filePath,
      JSON.stringify({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', contextStrategy: 'nonsense' }),
      'utf8'
    )
    expect(store.read().contextStrategy).toBe('excerpt')
  })

  it('falls back to defaults when the file is corrupt', () => {
    const store = createLlmConfigStore(filePath)
    require('node:fs').writeFileSync(filePath, 'not json', 'utf8')
    expect(store.read()).toEqual(DEFAULT_LLM_CONFIG)
  })
})
