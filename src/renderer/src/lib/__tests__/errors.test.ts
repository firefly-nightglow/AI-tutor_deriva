import { describe, expect, it } from 'vitest'
import { toUserMessage } from '../errors'

describe('toUserMessage', () => {
  it('strips the Electron IPC wrapper so the domain message reaches the user', () => {
    const wrapped = new Error(
      "Error invoking remote method 'db:subjects:create': Error: 「线性代数」已存在，请换一个名字。"
    )

    expect(toUserMessage(wrapped)).toBe('「线性代数」已存在，请换一个名字。')
  })

  it('leaves a plain message untouched and stringifies non-errors', () => {
    expect(toUserMessage(new Error('科目名称不能为空'))).toBe('科目名称不能为空')
    expect(toUserMessage('boom')).toBe('boom')
  })
})
