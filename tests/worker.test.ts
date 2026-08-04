import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTrace } from '../src/core'
import { createTraceWorkerServer } from '../src/core/trace-worker-server'
import type {
  TraceWorkerRequest,
  TraceWorkerResponse,
} from '../src/core/worker-protocol'
import { makeTraceFixture } from './fixture'

class InProcessTraceWorker {
  static instances: InProcessTraceWorker[] = []

  onmessage: ((event: MessageEvent<TraceWorkerResponse>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readonly server = createTraceWorkerServer({
    postMessage: (message) => {
      queueMicrotask(() => {
        if (!this.terminated) this.onmessage?.({ data: message } as MessageEvent<TraceWorkerResponse>)
      })
    },
  })
  terminated = false

  constructor(
    readonly scriptUrl: URL,
    readonly options?: WorkerOptions,
  ) {
    InProcessTraceWorker.instances.push(this)
  }

  postMessage(message: TraceWorkerRequest): void {
    queueMicrotask(() => {
      if (!this.terminated) void this.server.handleMessage(message)
    })
  }

  terminate(): void {
    this.terminated = true
    this.server.dispose()
  }
}

class NeverReadyWorker {
  static instance: NeverReadyWorker | undefined
  onmessage: ((event: MessageEvent<TraceWorkerResponse>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  terminated = false

  constructor() {
    NeverReadyWorker.instance = this
  }

  postMessage(): void {}

  terminate(): void {
    this.terminated = true
  }
}

describe('worker trace loading', () => {
  beforeEach(() => {
    InProcessTraceWorker.instances = []
    NeverReadyWorker.instance = undefined
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads metadata and frames through an automatically managed module worker', async () => {
    vi.stubGlobal('Worker', InProcessTraceWorker)
    const source = makeTraceFixture()
    const sourceLength = source.byteLength
    const progress: string[] = []

    const trace = await loadTrace(source, {
      onProgress: (update) => progress.push(update.phase),
    })

    expect(InProcessTraceWorker.instances).toHaveLength(1)
    const worker = InProcessTraceWorker.instances[0]!
    expect(worker.scriptUrl.pathname).toMatch(/trace-worker\.js$/)
    expect(worker.options).toMatchObject({ type: 'module', name: 'playwright-trace-player' })
    expect(source.byteLength).toBe(sourceLength)
    expect(progress).toEqual(['unzip', 'parse'])
    expect(trace.frames).toHaveLength(3)
    await expect(trace.readFrame(trace.frames[0]!)).resolves.toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    )

    trace.dispose()

    expect(worker.terminated).toBe(true)
    await expect(trace.readFrame(trace.frames[0]!)).rejects.toMatchObject({
      code: 'TRACE_DISPOSED',
    })
  })

  it('returns parser errors from the worker', async () => {
    vi.stubGlobal('Worker', InProcessTraceWorker)

    await expect(loadTrace(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'INVALID_ZIP',
    })
    expect(InProcessTraceWorker.instances[0]!.terminated).toBe(true)
  })

  it('terminates a pending worker when loading is cancelled', async () => {
    vi.stubGlobal('Worker', NeverReadyWorker)
    const controller = new AbortController()
    const loading = loadTrace(makeTraceFixture(), { signal: controller.signal })

    controller.abort('test cancellation')

    await expect(loading).rejects.toMatchObject({ code: 'ABORTED' })
    expect(NeverReadyWorker.instance?.terminated).toBe(true)
  })
})
