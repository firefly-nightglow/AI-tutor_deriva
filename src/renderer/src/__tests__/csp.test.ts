import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('allows data URLs for captured images and message attachments', () => {
    const html = readFileSync(resolve('src/renderer/index.html'), 'utf8')
    const viteConfig = readFileSync(resolve('electron.vite.config.ts'), 'utf8')

    expect(html).toContain("img-src 'self' data: blob:")
    expect(viteConfig).toContain("img-src 'self' data: blob:")
  })
})
