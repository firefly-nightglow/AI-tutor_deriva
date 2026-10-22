import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'

const state = vi.hoisted(() => ({
  handler: null as ((request: Request) => Promise<Response>) | null
}))

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn()
  }
}))

import { createMaterialFileAccess, MATERIAL_SCHEME } from '../protocol'

let directory = ''

function fakeSession(): Session {
  return {
    protocol: {
      handle: (_scheme: string, handler: (request: Request) => Promise<Response>) => {
        state.handler = handler
      },
      unhandle: vi.fn()
    }
  } as unknown as Session
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'deriva-material-'))
  state.handler = null
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('material file access', () => {
  it('serves Markdown as a safe, formatted Chinese document with math', async () => {
    const filePath = join(directory, 'notes.md')
    writeFileSync(filePath, '# 中文\n\n$x^2$\n\n<script>alert(1)</script>')
    const access = createMaterialFileAccess(join(directory, 'files.json'))
    access.handle(fakeSession())
    const response = await state.handler!(new Request(access.allow(filePath)))
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const html = await response.text()
    expect(html).toContain('<h1>中文</h1>')
    expect(html).toContain('<math')
    expect(html).not.toContain('<script>')
  })
  it('serves only an explicitly allowed local file', async () => {
    const filePath = join(directory, 'notes.txt')
    writeFileSync(filePath, 'hello material')
    const access = createMaterialFileAccess(join(directory, 'files.json'))
    access.handle(fakeSession())
    const url = access.allow(filePath)

    expect(url.startsWith(`${MATERIAL_SCHEME}://local/`)).toBe(true)
    const response = await state.handler!(new Request(url))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe('hello material')
  })

  it('rejects a path that was never selected', async () => {
    const filePath = join(directory, 'secret.txt')
    writeFileSync(filePath, 'not allowed')
    const access = createMaterialFileAccess(join(directory, 'files.json'))
    access.handle(fakeSession())
    const url = `${MATERIAL_SCHEME}://local/${encodeURIComponent(filePath)}`
    const response = await state.handler!(new Request(url))
    expect(response.status).toBe(403)
  })

  it('serves byte ranges for video and PDF seeking', async () => {
    const filePath = join(directory, 'clip.mp4')
    writeFileSync(filePath, '0123456789')
    const access = createMaterialFileAccess(join(directory, 'files.json'))
    access.handle(fakeSession())
    const url = access.allow(filePath)
    const response = await state.handler!(
      new Request(url, { headers: { range: 'bytes=2-4' } })
    )
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-4/10')
    expect(await response.text()).toBe('234')
  })

  it('persists the allowlist across controller instances', async () => {
    const filePath = join(directory, 'notes.txt')
    writeFileSync(filePath, 'persisted')
    const statePath = join(directory, 'files.json')
    const first = createMaterialFileAccess(statePath)
    first.handle(fakeSession())
    const url = first.allow(filePath)

    const second = createMaterialFileAccess(statePath)
    second.handle(fakeSession())
    const response = await state.handler!(new Request(url))
    expect(await response.text()).toBe('persisted')
  })
})
