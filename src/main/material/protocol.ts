import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { protocol, type Session } from 'electron'
import { decodeMaterialText, renderMaterialMarkdown } from './document'

export const MATERIAL_SCHEME = 'deriva-material'

/** Must run before app ready so Chromium treats the scheme as a standard, secure origin. */
export function registerMaterialScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MATERIAL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: false
      }
    }
  ])
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export function mimeForPath(filePath: string): string {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'text/plain; charset=utf-8'
}

/** Parses a single HTTP byte range; malformed or unsatisfiable ranges are ignored. */
export function parseByteRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  if (header === null || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null

  let start: number
  let end: number
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Number(rawEnd)
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    return null
  }
  return { start, end: Math.min(end, size - 1) }
}

export interface MaterialFileAccess {
  allow(filePath: string): string
  handle(session: Session): void
  dispose(): void
}

/** Explicit allowlist for local materials: only files the user picked can be served. */
export function createMaterialFileAccess(stateFilePath: string): MaterialFileAccess {
  const allowed = new Set<string>()
  let handledSession: Session | null = null

  try {
    if (existsSync(stateFilePath)) {
      const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8')) as unknown
      if (Array.isArray(parsed)) {
        for (const item of parsed) if (typeof item === 'string') allowed.add(item)
      }
    }
  } catch {
    // A broken allowlist is safer than an unrestricted one.
  }

  function save(): void {
    try {
      mkdirSync(dirname(stateFilePath), { recursive: true })
      writeFileSync(stateFilePath, JSON.stringify([...allowed]), {
        encoding: 'utf8',
        mode: 0o600
      })
    } catch {
      // The current session can still use the file even if persistence fails.
    }
  }

  function allow(filePath: string): string {
    const absolute = resolve(filePath)
    const stat = statSync(absolute)
    if (!stat.isFile()) throw new Error('所选路径不是文件')
    allowed.add(absolute)
    save()
    return `${MATERIAL_SCHEME}://local/${encodeURIComponent(absolute)}`
  }

  function handle(session: Session): void {
    if (handledSession === session) return
    if (handledSession !== null) handledSession.protocol.unhandle(MATERIAL_SCHEME)
    handledSession = session
    session.protocol.handle(MATERIAL_SCHEME, async (request) => {
      try {
        const url = new URL(request.url)
        if (url.hostname !== 'local') {
          return new Response('Not found', { status: 404 })
        }
        const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
        if (!allowed.has(filePath)) {
          return new Response('Forbidden', { status: 403 })
        }
        const stat = statSync(filePath)
        if (!stat.isFile()) return new Response('Not found', { status: 404 })

        const size = stat.size
        const mime = mimeForPath(filePath)
        if (mime.startsWith('text/plain')) {
          if (size > 20 * 1024 * 1024) return new Response('Text file too large', { status: 413 })
          const text = decodeMaterialText(await readFile(filePath))
          const markdown = /\.(md|markdown)$/i.test(filePath)
          return new Response(request.method === 'HEAD' ? null : markdown ? renderMaterialMarkdown(text) : text, {
            headers: {
              'content-type': markdown ? 'text/html; charset=utf-8' : mime,
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff'
            }
          })
        }
        const headers: Record<string, string> = {
          'content-type': mimeForPath(filePath),
          'accept-ranges': 'bytes',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff'
        }
        if (request.method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { ...headers, 'content-length': String(size) }
          })
        }

        const range = parseByteRange(request.headers.get('range'), size)
        if (range !== null) {
          const stream = Readable.toWeb(
            createReadStream(filePath, { start: range.start, end: range.end })
          ) as unknown as ReadableStream
          return new Response(stream, {
            status: 206,
            headers: {
              ...headers,
              'content-range': `bytes ${range.start}-${range.end}/${size}`,
              'content-length': String(range.end - range.start + 1)
            }
          })
        }

        const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
        return new Response(stream, {
          status: 200,
          headers: { ...headers, 'content-length': String(size) }
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })
  }

  return {
    allow,
    handle,
    dispose() {
      handledSession?.protocol.unhandle(MATERIAL_SCHEME)
      handledSession = null
    }
  }
}
