// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TutorApi } from '../../../../shared/api'
import { MessageAttachments } from '../MessageAttachments'

const RAW = JSON.stringify([
  {
    id: 'thumb',
    name: 'capture-thumbnail.jpg',
    mime: 'image/jpeg',
    bytes: 3,
    captureVariant: 'thumbnail'
  },
  {
    id: 'original',
    name: 'capture-original.jpg',
    mime: 'image/jpeg',
    bytes: 6,
    captureVariant: 'original'
  }
])

beforeEach(() => {
  ;(window as unknown as { api: Partial<TutorApi> }).api = {
    attachments: {
      read: async (id) => `data:image/jpeg;base64,${id}`
    }
  }
})

afterEach(cleanup)

describe('MessageAttachments', () => {
  it('marks thumbnail-only captures and lets an original be opened full size', async () => {
    render(<MessageAttachments raw={RAW} />)

    expect(await screen.findByText('仅保留缩略图')).toBeTruthy()
    expect(screen.getByText('原图')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '查看 capture-original.jpg' }))
    expect(screen.getByAltText('查看附件原图')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByAltText('查看附件原图')).toBeNull()
  })
})
