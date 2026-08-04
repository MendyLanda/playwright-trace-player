import { TracePlayerError } from './errors'
import { loadTraceOnCurrentThread } from './parser'
import type {
  LoadTraceOptions,
  ParsedTrace,
  TraceFrame,
  TraceSource,
} from './types'
import type {
  SerializedRequestInit,
  SerializedTraceError,
  TraceWorkerRequest,
  TraceWorkerResponse,
  WorkerTraceSource,
} from './worker-protocol'

interface PendingFrame {
  resolve: (data: Uint8Array) => void
  reject: (error: Error) => void
}

/** Loads a trace off the main thread in browsers and directly in non-browser runtimes. */
export async function loadTrace(
  source: TraceSource,
  options: LoadTraceOptions = {},
): Promise<ParsedTrace> {
  if (typeof Worker === 'undefined') {
    return loadTraceOnCurrentThread(source, options)
  }
  return loadTraceInWorker(source, options)
}

async function loadTraceInWorker(
  source: TraceSource,
  options: LoadTraceOptions,
): Promise<ParsedTrace> {
  if (options.signal?.aborted) {
    throw new TracePlayerError('ABORTED', 'Trace loading was cancelled.', options.signal.reason)
  }

  let worker: Worker
  try {
    worker = new Worker(new URL('./trace-worker.js', import.meta.url), {
      type: 'module',
      name: 'playwright-trace-player',
    })
  } catch (error) {
    throw new TracePlayerError(
      'WORKER_FAILED',
      'The trace worker could not be started. Check the worker-src CSP and bundler output.',
      error,
    )
  }

  const pendingFrames = new Map<number, PendingFrame>()
  let nextRequestId = 1
  let disposed = false
  let ready = false
  let workerFailure: Error | undefined

  return new Promise<ParsedTrace>((resolve, reject) => {
    const abortLoad = () => {
      const error = new TracePlayerError(
        'ABORTED',
        'Trace loading was cancelled.',
        options.signal?.reason,
      )
      disposeWorker(error)
      reject(error)
    }

    const removeAbortListener = () => {
      options.signal?.removeEventListener('abort', abortLoad)
    }

    const disposeWorker = (reason: Error) => {
      if (disposed) return
      disposed = true
      removeAbortListener()
      for (const pending of pendingFrames.values()) pending.reject(reason)
      pendingFrames.clear()
      worker.terminate()
    }

    worker.onmessage = (event: MessageEvent<TraceWorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        options.onProgress?.(message.progress)
        return
      }
      if (message.type === 'frame') {
        const pending = pendingFrames.get(message.requestId)
        if (!pending) return
        pendingFrames.delete(message.requestId)
        pending.resolve(new Uint8Array(message.data))
        return
      }
      if (message.type === 'error') {
        const error = deserializeTraceError(message.error)
        if (message.requestId !== undefined) {
          const pending = pendingFrames.get(message.requestId)
          pendingFrames.delete(message.requestId)
          pending?.reject(error)
          return
        }
        disposeWorker(error)
        reject(error)
        return
      }

      ready = true
      removeAbortListener()
      const readFrame = (frame: TraceFrame): Promise<Uint8Array> => {
        if (workerFailure) return Promise.reject(workerFailure)
        if (disposed) {
          return Promise.reject(
            new TracePlayerError('TRACE_DISPOSED', 'This trace has been disposed.'),
          )
        }
        const requestId = nextRequestId++
        return new Promise((resolveFrame, rejectFrame) => {
          pendingFrames.set(requestId, { resolve: resolveFrame, reject: rejectFrame })
          worker.postMessage({ type: 'frame', requestId, frameId: frame.id } satisfies TraceWorkerRequest)
        })
      }
      resolve({
        ...message.trace,
        readFrame,
        dispose: () => {
          const error = new TracePlayerError('TRACE_DISPOSED', 'This trace has been disposed.')
          try {
            worker.postMessage({ type: 'dispose' } satisfies TraceWorkerRequest)
          } finally {
            disposeWorker(error)
          }
        },
      })
    }

    worker.onerror = () => {
      workerFailure = new TracePlayerError(
        'WORKER_FAILED',
        'The trace worker stopped unexpectedly.',
      )
      disposeWorker(workerFailure)
      if (!ready) reject(workerFailure)
    }

    options.signal?.addEventListener('abort', abortLoad, { once: true })

    try {
      const serializedSource = serializeWorkerSource(source)
      const message: TraceWorkerRequest = {
        type: 'load',
        source: serializedSource.source,
        requestInit: serializeRequestInit(options.requestInit),
      }
      worker.postMessage(message, serializedSource.transfer)
    } catch (error) {
      const resolvedError = error instanceof TracePlayerError
        ? error
        : new TracePlayerError('WORKER_FAILED', 'The trace could not be sent to its worker.', error)
      disposeWorker(resolvedError)
      reject(resolvedError)
    }
  })
}

function serializeWorkerSource(source: TraceSource): {
  source: WorkerTraceSource
  transfer: Transferable[]
} {
  if (source instanceof URL) return { source: source.toString(), transfer: [] }
  if (typeof source === 'string' || source instanceof Blob) {
    return { source, transfer: [] }
  }
  const sourceBytes = source instanceof Uint8Array ? source : new Uint8Array(source)
  const copiedBytes = new Uint8Array(sourceBytes.byteLength)
  copiedBytes.set(sourceBytes)
  return { source: copiedBytes.buffer, transfer: [copiedBytes.buffer] }
}

function serializeRequestInit(
  requestInit?: LoadTraceOptions['requestInit'],
): SerializedRequestInit | undefined {
  if (!requestInit) return undefined
  const { body, headers, signal: _signal, ...serializable } = requestInit as RequestInit
  if (body !== undefined && body !== null) {
    throw new TracePlayerError(
      'WORKER_FAILED',
      'Trace requests with a body cannot be sent to the trace worker.',
    )
  }
  return {
    ...serializable,
    headers: headers ? [...new Headers(headers).entries()] : undefined,
  }
}

function deserializeTraceError(error: SerializedTraceError): Error {
  const resolved = error.code
    ? new TracePlayerError(error.code, error.message)
    : new Error(error.message)
  resolved.name = error.name
  if (error.stack) resolved.stack = error.stack
  return resolved
}
