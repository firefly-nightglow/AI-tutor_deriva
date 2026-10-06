import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ApiKeyStatus } from '../../shared/types'
import { ValidationError } from '../db/errors'
import { LlmError } from './errors'

/** The subset of Electron safeStorage this module needs, so tests can substitute a fake. */
export interface EncryptionProvider {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface ApiKeyStore {
  status(): ApiKeyStatus
  save(apiKey: string): ApiKeyStatus
  read(): string | null
  clear(): ApiKeyStatus
}

interface KeyFile {
  version: 1
  /** base64 of the safeStorage-encrypted buffer; never the plaintext key. */
  encrypted: string
}

export function createApiKeyStore(filePath: string, encryption: EncryptionProvider): ApiKeyStore {
  function hasFile(): boolean {
    return existsSync(filePath)
  }

  function status(): ApiKeyStatus {
    const encryptionAvailable = encryption.isEncryptionAvailable()
    return { hasKey: encryptionAvailable && hasFile(), encryptionAvailable }
  }

  return {
    status,
    save(apiKey) {
      const trimmed = typeof apiKey === 'string' ? apiKey.trim() : ''
      if (trimmed === '') throw new ValidationError('API Key 不能为空')
      if (!encryption.isEncryptionAvailable()) {
        throw new LlmError('unknown', '当前系统不可用安全存储，拒绝以明文保存 API Key')
      }
      const payload: KeyFile = {
        version: 1,
        encrypted: encryption.encryptString(trimmed).toString('base64')
      }
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })
      return status()
    },
    read() {
      if (!hasFile() || !encryption.isEncryptionAvailable()) return null
      let payload: KeyFile
      try {
        payload = JSON.parse(readFileSync(filePath, 'utf8')) as KeyFile
      } catch {
        throw new LlmError('unknown', 'API Key 文件损坏，请重新填写')
      }
      if (typeof payload.encrypted !== 'string') {
        throw new LlmError('unknown', 'API Key 文件缺少加密内容，请重新填写')
      }
      try {
        return encryption.decryptString(Buffer.from(payload.encrypted, 'base64'))
      } catch {
        throw new LlmError('unknown', '无法解密已保存的 API Key，请重新填写')
      }
    },
    clear() {
      rmSync(filePath, { force: true })
      return status()
    }
  }
}
