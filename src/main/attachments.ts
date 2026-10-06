import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MessageAttachment, OutgoingImage } from '../shared/types'
import { ValidationError } from './db/errors'

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}
const MIME_BY_EXTENSION = Object.fromEntries(Object.entries(ALLOWED).map(([mime, ext]) => [ext, mime]))
const MAX_BYTES = 4 * 1024 * 1024

export interface AttachmentStore {
  save(images: OutgoingImage[]): MessageAttachment[]
  read(id: string): string | null
  /** Removes stored files; used when the messages that referenced them are deleted. */
  removeAll(ids: string[]): void
}

/** Images live as files beside the database; the message row keeps only metadata. */
export function createAttachmentStore(directory: string): AttachmentStore {
  function find(id: string): string | null {
    if (!existsSync(directory)) return null
    const prefix = `${id}.`
    const match = readdirSync(directory).find((name) => name.startsWith(prefix))
    return match === undefined ? null : join(directory, match)
  }

  return {
    save(images) {
      if (images.length === 0) return []
      mkdirSync(directory, { recursive: true })
      return images.map((image) => {
        const extension = ALLOWED[image.mime]
        if (extension === undefined) throw new ValidationError(`不支持的图片格式：${image.mime}`)
        const base64 = image.dataUrl.replace(/^data:[^;]+;base64,/, '')
        const buffer = Buffer.from(base64, 'base64')
        if (buffer.byteLength === 0) throw new ValidationError('图片内容为空')
        if (buffer.byteLength > MAX_BYTES) throw new ValidationError('单张图片不能超过 4 MB')

        const id = randomUUID()
        writeFileSync(join(directory, `${id}.${extension}`), buffer)
        return { id, name: image.name, mime: image.mime, bytes: buffer.byteLength }
      })
    },
    read(id) {
      const path = find(id)
      if (path === null) return null
      const extension = path.slice(path.lastIndexOf('.') + 1)
      const mime = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
      return `data:${mime};base64,${readFileSync(path).toString('base64')}`
    },
    removeAll(ids) {
      for (const id of ids) {
        const path = find(id)
        if (path !== null) rmSync(path, { force: true })
      }
    }
  }
}
