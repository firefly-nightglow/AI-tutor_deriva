import { describe, expect, it } from 'vitest'
import { supportsVisionModel } from '../vision'

describe('vision model guard', () => {
  it('allows the verified DeepSeek vision models', () => {
    expect(supportsVisionModel('deepseek-flash')).toBe(true)
    expect(supportsVisionModel(' DeepSeek-Flash ')).toBe(true)
  })

  it('blocks models without a verified image input capability', () => {
    expect(supportsVisionModel('deepseek-v4-pro')).toBe(false)
    expect(supportsVisionModel('custom-text-model')).toBe(false)
  })
})
