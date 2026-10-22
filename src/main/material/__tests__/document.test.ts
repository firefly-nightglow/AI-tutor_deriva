import { describe, expect, it } from 'vitest'
import { decodeMaterialText, renderMaterialMarkdown } from '../document'

describe('local learning documents', () => {
  it('renders Chinese headings and formulas without enabling raw HTML', () => {
    const html = renderMaterialMarkdown('# 学习笔记\n\n**导数**\n\n$$x^2$$\n\n<script>alert(1)</script>')
    expect(html).toContain('<h1>学习笔记</h1>')
    expect(html).toContain('<strong>导数</strong>')
    expect(html).toContain('<math')
    expect(html).not.toContain('<script>')
  })

  it('decodes UTF-8, UTF-16 and legacy Chinese text', () => {
    expect(decodeMaterialText(Buffer.from('中文'))).toBe('中文')
    expect(decodeMaterialText(Buffer.concat([Buffer.from([255, 254]), Buffer.from('中文', 'utf16le')]))).toBe('中文')
    expect(decodeMaterialText(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]))).toBe('中文')
  })
})
