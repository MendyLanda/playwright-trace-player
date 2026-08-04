// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { TraceFrame } from '../src/core'
import { FrameUrlCache } from '../src/react/frame-url-cache'

describe('FrameUrlCache', () => {
  it('keeps only its most recent object URLs', async () => {
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((() => `blob:frame-${createUrl.mock.calls.length}`) as typeof URL.createObjectURL)
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL')
    const readFrame = vi.fn(async () => new Uint8Array([0xff, 0xd8]))
    const cache = new FrameUrlCache({ readFrame }, 4)
    const frames = Array.from({ length: 30 }, (_, index): TraceFrame => ({
      id: `frame-${index}`,
      sha1: `frame-${index}.jpeg`,
      pageId: 'page',
      time: index,
      width: 100,
      height: 100,
      mimeType: 'image/jpeg',
    }))

    for (const frame of frames) await cache.urlFor(frame)

    expect(readFrame).toHaveBeenCalledTimes(30)
    expect(createUrl).toHaveBeenCalledTimes(30)
    expect(revokeUrl).toHaveBeenCalledTimes(26)

    cache.dispose()
    expect(revokeUrl).toHaveBeenCalledTimes(30)
    createUrl.mockRestore()
    revokeUrl.mockRestore()
  })
})
