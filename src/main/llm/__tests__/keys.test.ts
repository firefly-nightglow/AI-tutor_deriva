import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ValidationError } from '../../db/errors'
import { LlmError } from '../errors'
import { createApiKeyStore, type EncryptionProvider } from '../keys'

const PLAINTEXT = 'sk-super-secret-value'
let directory: string
let filePath: string

function fakeEncryption(available = true): EncryptionProvider {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plainText) => Buffer.from(`enc:${plainText}`, 'utf8'),
    decryptString: (encrypted) => encrypted.toString('utf8').replace(/^enc:/, '')
  }
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'deriva-keys-'))
  filePath = join(directory, 'api-key.json')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('api key store', () => {
  it('round-trips a key and never writes the plaintext to disk', () => {
    const store = createApiKeyStore(filePath, fakeEncryption())

    expect(store.save(PLAINTEXT).hasKey).toBe(true)
    expect(store.read()).toBe(PLAINTEXT)
    expect(readFileSync(filePath, 'utf8')).not.toContain(PLAINTEXT)
    expect(readFileSync(filePath, 'utf8')).toContain('encrypted')
  })

  it('trims the key before saving', () => {
    const store = createApiKeyStore(filePath, fakeEncryption())
    store.save(`  ${PLAINTEXT}  `)
    expect(store.read()).toBe(PLAINTEXT)
  })

  it('rejects a blank key without touching the disk', () => {
    const store = createApiKeyStore(filePath, fakeEncryption())
    expect(() => store.save('   ')).toThrow(ValidationError)
    expect(existsSync(filePath)).toBe(false)
  })

  it('refuses to save when the OS key store is unavailable instead of falling back to plaintext', () => {
    const store = createApiKeyStore(filePath, fakeEncryption(false))
    expect(() => store.save(PLAINTEXT)).toThrow(LlmError)
    expect(existsSync(filePath)).toBe(false)
    expect(store.status()).toEqual({ hasKey: false, encryptionAvailable: false })
  })

  it('clears the stored key', () => {
    const store = createApiKeyStore(filePath, fakeEncryption())
    store.save(PLAINTEXT)
    expect(store.clear()).toEqual({ hasKey: false, encryptionAvailable: true })
    expect(existsSync(filePath)).toBe(false)
    expect(store.read()).toBeNull()
  })

  it('surfaces a corrupted key file instead of silently ignoring it', () => {
    writeFileSync(filePath, 'not json', 'utf8')
    const store = createApiKeyStore(filePath, fakeEncryption())
    expect(() => store.read()).toThrow(LlmError)
  })
})
