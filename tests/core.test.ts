import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseTraceArchive, selectTraceTimeline, TracePlayerError } from '../src/core'
import { makeTraceFixture } from './fixture'

describe('parseTraceArchive', () => {
  it('rejects invalid ZIP data', async () => {
    await expect(parseTraceArchive(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'INVALID_ZIP',
    } satisfies Partial<TracePlayerError>)
  })

  it('parses frames, actions, metadata, and pages', async () => {
    const trace = await parseTraceArchive(makeTraceFixture())

    expect(trace.metadata).toMatchObject({
      browserName: 'chromium',
      platform: 'linux',
      viewport: { width: 800, height: 600 },
      playwrightVersion: '1.50.0',
    })
    expect(trace.frames).toHaveLength(3)
    expect(trace.actions.find((action) => action.method === 'click')).toMatchObject({
      method: 'click',
      point: { x: 100, y: 200 },
    })
    expect(trace.pages).toHaveLength(2)
    expect(trace.defaultPageId).toBe('page@1')
    expect(trace.frames[0]).not.toHaveProperty('data')
    await expect(trace.readFrame(trace.frames[0]!)).resolves.toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    )
  })

  it('selects and normalizes one page timeline', async () => {
    const trace = await parseTraceArchive(makeTraceFixture())
    const timeline = selectTraceTimeline(trace)

    expect(timeline.duration).toBe(1_000)
    expect(timeline.frames.map((frame) => frame.time)).toEqual([0, 1_000])
    expect(timeline.actions.find((action) => action.method === 'click')?.startTime).toBe(100)
  })

  it('rejects a ZIP without a Playwright trace', async () => {
    const archive = zipSync({ 'readme.txt': strToU8('hello') })

    await expect(parseTraceArchive(archive)).rejects.toMatchObject({
      code: 'INVALID_TRACE',
    } satisfies Partial<TracePlayerError>)
  })

  it('rejects a trace without screencast frames', async () => {
    const archive = zipSync({
      'trace.trace': strToU8('{"type":"context-options"}\n'),
    })

    await expect(parseTraceArchive(archive)).rejects.toMatchObject({
      code: 'NO_FRAMES',
    } satisfies Partial<TracePlayerError>)
  })

  it('loads a large frame only when requested', async () => {
    const events = [
      {
        type: 'screencast-frame',
        pageId: 'page@large',
        sha1: 'large.jpeg',
        width: 800,
        height: 600,
        timestamp: 1_000,
      },
    ]
    const archive = zipSync({
      'trace.trace': strToU8(events.map((event) => JSON.stringify(event)).join('\n')),
      'resources/large.jpeg': new Uint8Array(600_000),
    })

    const trace = await parseTraceArchive(archive)

    expect(trace.frames).toHaveLength(1)
    await expect(trace.readFrame(trace.frames[0]!)).resolves.toHaveLength(600_000)
    trace.dispose()
    await expect(trace.readFrame(trace.frames[0]!)).rejects.toMatchObject({
      code: 'TRACE_DISPOSED',
    } satisfies Partial<TracePlayerError>)
  })

  it('keeps valid records around damaged lines and joins actions in any order', async () => {
    const records = [
      JSON.stringify({ type: 'context-options', platform: 'linux' }),
      '{not valid json',
      JSON.stringify({
        type: 'after',
        callId: 'call@late-start',
        endTime: 1_400,
        error: { message: 'click failed' },
        point: { x: 25, y: 30 },
      }),
      JSON.stringify({
        type: 'before',
        callId: 'call@late-start',
        pageId: 'page@1',
        class: 'Locator',
        method: 'click',
        startTime: 1_100,
      }),
      JSON.stringify({ type: 'context-options', browserName: 'webkit' }),
      JSON.stringify({
        type: 'screencast-frame',
        pageId: 'page@1',
        sha1: 'frame.jpeg',
        width: 640,
        height: 480,
        timestamp: 1_000,
      }),
    ]
    const archive = zipSync({
      'trace.trace': strToU8(records.join('\n')),
      'resources/frame.jpeg': new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    })

    const trace = await parseTraceArchive(archive)

    expect(trace.metadata.browserName).toBe('webkit')
    expect(trace.actions).toEqual([
      expect.objectContaining({
        callId: 'call@late-start',
        title: 'Locator.click',
        startTime: 1_100,
        endTime: 1_400,
        point: { x: 25, y: 30 },
        error: { message: 'click failed' },
      }),
    ])
  })
})
