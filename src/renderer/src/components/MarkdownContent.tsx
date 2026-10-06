import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { markdownSource } from '../lib/markdownSource'

export { markdownSource, normalizeDisplayMath } from '../lib/markdownSource'

/**
 * Renders an assistant answer as formatted text instead of raw markup: Markdown via react-markdown,
 * math via KaTeX ($...$ inline, $$...$$ display).
 *
 * Raw HTML stays disabled, so model output cannot inject markup. While an answer is still streaming,
 * an unclosed math span is typeset as a KaTeX error until its closing delimiter arrives; that is
 * inherent to live typesetting and is revisited by the conversation UI task.
 */
export function MarkdownContent({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkSourceOffsets]}
        rehypePlugins={[rehypeWrapMathBlocks, rehypeKatex]}
      >
        {markdownSource(content)}
      </ReactMarkdown>
    </div>
  )
}

interface PositionedNode {
  type: string
  position?: { start?: { offset?: number }; end?: { offset?: number } }
  data?: { hProperties?: Record<string, unknown> }
  children?: PositionedNode[]
}

/** Block-level mdast nodes whose source range is worth attaching to the rendered element. */
const SOURCE_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'tableCell',
  'code',
  'math'
])

/**
 * Marks each block with its offsets in the original Markdown. A selection is later mapped back to
 * those offsets (see lib/selection.ts) so a quote carries the real LaTeX source instead of KaTeX's
 * rendered glyphs; the granularity is deliberately the block, which keeps every quote complete.
 */
export function remarkSourceOffsets(): (tree: PositionedNode) => void {
  return (tree) => {
    const walk = (node: PositionedNode): void => {
      const start = node.position?.start?.offset
      const end = node.position?.end?.offset
      if (SOURCE_BLOCK_TYPES.has(node.type) && typeof start === 'number' && typeof end === 'number') {
        node.data = node.data ?? {}
        node.data.hProperties = {
          ...(node.data.hProperties ?? {}),
          'data-source-start': start,
          'data-source-end': end
        }
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  }
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  position?: { start?: { offset?: number }; end?: { offset?: number } }
}

function classNames(node: HastNode): string[] {
  const value = node.properties?.className
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value.split(/\s+/) : []
}

function containsDisplayMath(node: HastNode, depth = 0): boolean {
  if (depth > 4) return false
  if (classNames(node).includes('math-display')) return true
  return (node.children ?? []).some((child) => containsDisplayMath(child, depth + 1))
}

/**
 * KaTeX replaces the whole math element with its own markup, which would drop the source offsets and
 * leave selections inside a formula unmappable. This runs before rehype-katex and wraps each math
 * element in a container that keeps the offsets, so a quoted formula stays real LaTeX.
 */
export function rehypeWrapMathBlocks(): (tree: HastNode) => void {
  return (tree) => {
    const wrap = (node: HastNode): HastNode => {
      // mdast-util-math turns display math into `pre > code.math-display`, and rehype-katex replaces
      // that subtree wholesale — dropping the offsets with it. Only the `pre` carries the offsets, so
      // it is the one that needs a surviving wrapper.
      if (node.tagName !== 'pre' || !containsDisplayMath(node)) return node

      const start = node.properties?.['data-source-start'] ?? node.position?.start?.offset
      const end = node.properties?.['data-source-end'] ?? node.position?.end?.offset
      if (typeof start !== 'number' || typeof end !== 'number') return node

      return {
        type: 'element',
        tagName: 'div',
        properties: { 'data-source-start': start, 'data-source-end': end },
        children: [node]
      }
    }

    const walk = (node: HastNode): void => {
      if (node.children === undefined) return
      node.children = node.children.map((child) => {
        walk(child)
        return wrap(child)
      })
    }
    walk(tree)
  }
}
