/**
 * Models mix two LaTeX delimiters: `$...$` / `$$...$$` (the convention remark-math understands) and
 * `\(...\)` / `\[...\]` (plain LaTeX). The second pair reaches us as literal text, so formulas look
 * like garbage in the transcript; rewrite them into the first pair.
 *
 * Fenced code blocks are left alone, because there a backslash-paren is content rather than math.
 */
export function normalizeMathDelimiters(content: string): string {
  // Process everything outside fenced code blocks; the capture keeps the fences themselves untouched.
  const parts = content.split(/(^[ \t]*```[\s\S]*?^[ \t]*```[ \t]*$)/m)
  return parts.map((part, index) => (index % 2 === 1 ? part : convertPairedDelimiters(part))).join('')
}

/**
 * Rewrites only *paired* delimiters. A lone `\(` in prose (someone explaining LaTeX, say) must stay as
 * it is: turning it into `$` would open a math span that swallows the rest of the message.
 */
function convertPairedDelimiters(segment: string): string {
  // Replacement strings: `$$` is one literal `$`, so `$$$$` emits two dollars around the group.
  return segment
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
}

/**
 * `$$...$$` written on a single line is parsed as inline math, which models do constantly when they
 * emit a display formula. The same is true when a formula spans several lines. Promote a standalone
 * `$$...$$` line or block into the fenced block form so it is typeset as display math.
 */
export function normalizeDisplayMath(content: string): string {
  // In a replacement string `$$` means a literal `$`, so the fenced output needs four dollars.
  return content.replace(
    /^[ \t]*\$\$[ \t]*((?:(?!\$\$)[\s\S])*?\S(?:(?!\$\$)[\s\S])*?)[ \t]*\$\$[ \t]*$/gm,
    '$$$$\n$1\n$$$$'
  )
}

/**
 * The exact string that gets parsed, and therefore the one the `data-source-*` offsets index into.
 * Anything that slices or matches a quote out of a message must run the same transform, or offsets
 * drift by however many characters `normalizeDisplayMath` inserted.
 */
export function markdownSource(content: string): string {
  return normalizeDisplayMath(normalizeMathDelimiters(content))
}
