import { describe, expect, it } from 'vitest'
import { summarizeBookmark, summarizeTitle } from '../text'

describe('summarizeTitle', () => {
  it('uses the trimmed question as the title', () => {
    expect(summarizeTitle('  什么是 ε-N 定义  ')).toBe('什么是 ε-N 定义')
  })

  it('collapses whitespace so a multi-line question stays one line', () => {
    expect(summarizeTitle('第一行\n\n第二行')).toBe('第一行 第二行')
  })

  it('strips leading markdown markers and emphasis', () => {
    expect(summarizeTitle('## 为什么 **极限** 存在')).toBe('为什么 极限 存在')
  })

  it('truncates with an ellipsis past the limit', () => {
    expect(summarizeTitle('一'.repeat(30))).toBe(`${'一'.repeat(24)}…`)
  })

  it('falls back to a placeholder for blank input', () => {
    expect(summarizeTitle('   ')).toBe('新对话')
  })

  it('strips LaTeX so a formula quote never becomes the title', () => {
    expect(summarizeTitle('$$\\sum_j M_{ij}x_j$$')).toBe('新对话')
    // Inline math is dropped wholesale in the fallback path; the primary path passes visible text.
    expect(summarizeTitle('由 $\\varepsilon$ 与 $N$ 共同决定')).toBe('由 与 共同决定')
  })

  it('prefers readable text when the caller supplies it', () => {
    expect(summarizeTitle('由 ε 与 N 共同决定')).toBe('由 ε 与 N 共同决定')
  })
})

describe('summarizeBookmark', () => {
  it('keeps the first sentence as the bookmark label', () => {
    expect(summarizeBookmark('张量的 CP 分解可以理解为把矩阵的秩推广到多维。后面还有别的说明。')).toBe(
      '张量的 CP 分解可以理解为把矩阵的秩推广到多维'
    )
  })

  it('strips markup so a formula-led answer still yields readable text', () => {
    expect(summarizeBookmark('$$\\sum_j M_{ij}x_j$$ 是外积展开')).toBe('是外积展开')
  })

  it('truncates long text and survives an empty answer', () => {
    expect(summarizeBookmark('一'.repeat(60))).toBe(`${'一'.repeat(40)}…`)
    expect(summarizeBookmark('   ')).toBe('未命名要点')
  })
})
