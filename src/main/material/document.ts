import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { markdownSource } from '../../renderer/src/lib/markdownSource'

export function decodeMaterialText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('gb18030').decode(bytes)
  }
}

export function renderMaterialMarkdown(source: string): string {
  // Native MathML keeps this isolated, offline document independent of app assets and fonts.
  const body = renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [[rehypeKatex, { output: 'mathml', strict: false }]],
    children: markdownSource(source)
  }))
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<style>
:root { color-scheme: light dark; font-family: 'Segoe UI','Microsoft YaHei',sans-serif; }
body { margin: 0; padding: 24px; font-size: 16px; line-height: 1.8; overflow-wrap: anywhere; }
main { max-width: 960px; margin: auto; } h1,h2,h3 { line-height: 1.4; }
pre { overflow: auto; padding: 16px; background: light-dark(#f2f3f5,#25272b); border-radius: 4px; }
code { font-family: Consolas,monospace; } table { border-collapse: collapse; display: block; overflow: auto; }
td,th { padding: 6px 12px; border: 1px solid #888; } img { max-width: 100%; }
blockquote { margin-left: 0; padding-left: 16px; border-left: 3px solid #888; }
math[display="block"] { display: block; overflow-x: auto; padding: 12px 0; }
</style></head><body><main>${body}</main></body></html>`
}
