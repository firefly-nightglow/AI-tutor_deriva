import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownContent, normalizeDisplayMath } from '../MarkdownContent'
import { markdownSource } from '../../lib/markdownSource'

function render(content: string): string {
  return renderToStaticMarkup(<MarkdownContent content={content} />)
}

describe('MarkdownContent', () => {
  it('renders markdown instead of showing its punctuation', () => {
    const html = render('## 数列极限\n\n- 第一点\n- 第二点\n\n**重点**')

    expect(html).toMatch(/<h2[^>]*>数列极限<\/h2>/)
    expect(html).toContain('第一点')
    expect(html).toMatch(/<strong[^>]*>重点<\/strong>/)
    expect(html).not.toContain('##')
    expect(html).not.toContain('**')
  })

  it('typesets inline and display math with KaTeX', () => {
    const html = render('设 $\\varepsilon > 0$，则\n\n$$\\sum_{n=1}^{\\infty} a_n$$')

    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display')
    // The `$` delimiters are consumed; KaTeX's own source annotation keeps the TeX, which is expected.
    expect(html).not.toContain('$')
  })

  it('promotes a single-line $$...$$ line into display math', () => {
    expect(normalizeDisplayMath('行内 $a$ 不变\n$$b = c$$\n正文')).toBe(
      '行内 $a$ 不变\n$$\nb = c\n$$\n正文'
    )
  })

  it('rewrites LaTeX delimiters from models that emit backslash-paren/bracket', () => {
    expect(markdownSource('行内 \\(a+b\\) 结束')).toBe('行内 $a+b$ 结束')
    expect(markdownSource('\\[a = b\\]')).toBe('$$\na = b\n$$')
  })

  it('leaves delimiters inside fenced code blocks alone', () => {
    expect(markdownSource('```\n\\(literal\\)\n```')).toBe('```\n\\(literal\\)\n```')
  })

  it('leaves an unpaired delimiter alone instead of opening a runaway math span', () => {
    // Regression: a blanket replace turned this into "$", which made remark-math eat the rest.
    expect(markdownSource('说明 \\( 的用法')).toBe('说明 \\( 的用法')
    expect(markdownSource('单独一个 \\] 也不该被改写')).toBe('单独一个 \\] 也不该被改写')
  })

  it('handles display math that spans several lines', () => {
    expect(markdownSource('\\[a = b\nc = d\\]')).toBe('$$\na = b\nc = d\n$$')
  })

  it('typesets a whole answer written with backslash delimiters', () => {
    const html = render('取 \\(A = B\\)，则\n\n\\[x = y\\]')

    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-display')
    expect(html).not.toContain('\\(')
  })

  it('does not merge two separate display lines', () => {
    expect(normalizeDisplayMath('$$a$$\n$$b$$')).toBe('$$\na\n$$\n$$\nb\n$$')
  })

  it('keeps raw HTML disabled so model output cannot inject markup', () => {
    const html = render('<img src=x onerror=alert(1)>')

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('tags blocks with their offsets in the original markdown so quotes keep the source', () => {
    const source = '## 标题\n\n正文段落'
    const html = render(source)

    const headingTag = /<h2[^>]*>/.exec(html)?.[0] ?? ''
    const headingStart = Number(/data-source-start="(\d+)"/.exec(headingTag)?.[1])
    const headingEnd = Number(/data-source-end="(\d+)"/.exec(headingTag)?.[1])
    expect(source.slice(headingStart, headingEnd)).toBe('## 标题')

    const paragraphTag = /<p[^>]*>/.exec(html)?.[0] ?? ''
    const paragraphStart = Number(/data-source-start="(\d+)"/.exec(paragraphTag)?.[1])
    const paragraphEnd = Number(/data-source-end="(\d+)"/.exec(paragraphTag)?.[1])
    expect(source.slice(paragraphStart, paragraphEnd)).toBe('正文段落')
  })

  it('shows that offsets come from the normalised source, not the raw content', () => {
    const content = '前言\n\n$$a = b$$\n\n后续段落'
    const html = render(content)
    const tags = [...html.matchAll(/<p[^>]*data-source-start="(\d+)"[^>]*data-source-end="(\d+)"[^>]*>/g)]
    const last = tags.at(-1)
    expect(last).toBeDefined()
    const start = Number(last?.[1])
    const end = Number(last?.[2])

    console.log('raw slice      =', JSON.stringify(content.slice(start, end)))
    console.log('normalised     =', JSON.stringify(normalizeDisplayMath(content).slice(start, end)))
    expect(normalizeDisplayMath(content).slice(start, end)).toBe('后续段落')
  })
})
