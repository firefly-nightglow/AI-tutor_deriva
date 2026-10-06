import { describe, expect, it } from 'vitest'
import { TUTOR_PROMPT_VERSION, TUTOR_SYSTEM_PROMPT_V0 } from '../system-prompt'

describe('tutor system prompt v0.1', () => {
  it('carries a version so v2 can iterate on it deliberately', () => {
    expect(TUTOR_PROMPT_VERSION).toBe('0.1.0')
  })

  it('states the four teaching constraints from the acceptance criteria', () => {
    // 1. anchor to the student's own level
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('先判断学生已经掌握什么')
    // 2. never assume an unlearned prerequisite
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('不得默认使用超出学生当前水平的前置知识')
    // 3. explain a prerequisite before using it
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('先用一两句话说明它是什么')
    // 4. cite the basis for key conclusions
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('关键结论要给出依据或出处')
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('不要编造定理名、公式或来源')
  })

  it('tells the model what to do when the student has not declared a level', () => {
    // v1 has no knowledge profile (that lands in v3), so the prompt needs an executable fallback.
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('如果学生没有说明自己的水平')
    expect(TUTOR_SYSTEM_PROMPT_V0).toContain('请其补充学过的内容')
  })
})
