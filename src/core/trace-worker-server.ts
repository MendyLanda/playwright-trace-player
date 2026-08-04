import { TracePlayerError } from './errors'
import { loadTraceOnCurrentThread } from './parser'
import type { ParsedTrace, TraceFrame } from './types'
import type {
  SerializedTraceError,
  TraceSnapshot,
  TraceWorkerRequest,
  TraceWorkerResponse,
} from './worker-protocol'

interface WorkerMessagePort {
  postMessage: (message: TraceWorkerResponse, transfer?: Transferable[]) => void
}

export function createTraceWorkerServer(port: WorkerMessagePort) {
  let trace: ParsedTrace | undefined
  let frameById = new Map<string, TraceFrame>()
  let loadController: AbortController | undefined

  const handleMessage = async (message: TraceWorkerRequest): Promise<void> => {
    if (message.type === 'dispose') {
      dispose()
      return
    }

    if (message.type === 'load') {
      dispose()
      loadController = new AbortController()
      try {
        trace = await loadTraceOnCurrentThread(message.source, {
          signal: loadController.signal,
          requestInit: message.requestInit,
          onProgress: (progress) => port.postMessage({ type: 'progress', progress }),
        })
        frameById = new Map(trace.frames.map((frame) => [frame.id, frame]))
        port.postMessage({ type: 'ready', trace: snapshotTrace(trace) })
      } catch (error) {
        port.postMessage({ type: 'error', error: serializeTraceError(error) })
      }
      return
    }

    try {
      if (!trace) {
        throw new TracePlayerError('TRACE_DISPOSED', 'The trace worker has no open trace.')
      }
      const frame = frameById.get(message.frameId)
      if (!frame) {
        throw new TracePlayerError(
          'INVALID_TRACE',
          `The trace frame ${message.frameId} does not exist.`,
        )
      }
      const data = await trace.readFrame(frame)
      const transferable = toTransferableBuffer(data)
      port.postMessage(
        { type: 'frame', requestId: message.requestId, data: transferable },
        [transferable],
      )
    } catch (error) {
      port.postMessage({
        type: 'error',
        requestId: message.requestId,
        error: serializeTraceError(error),
      })
    }
  }

  const dispose = () => {
    loadController?.abort()
    loadController = undefined
    trace?.dispose()
    trace = undefined
    frameById.clear()
  }

  return { handleMessage, dispose }
}

function toTransferableBuffer(data: Uint8Array): ArrayBuffer {
  if (
    data.buffer instanceof ArrayBuffer &&
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength
  ) {
    return data.buffer
  }
  return data.slice().buffer
}

function snapshotTrace(trace: ParsedTrace): TraceSnapshot {
  return {
    metadata: trace.metadata,
    frames: trace.frames,
    actions: trace.actions,
    pages: trace.pages,
    defaultPageId: trace.defaultPageId,
  }
}

export function serializeTraceError(error: unknown): SerializedTraceError {
  if (error instanceof TracePlayerError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    }
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { name: 'Error', message: String(error) }
}
