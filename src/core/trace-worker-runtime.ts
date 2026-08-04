import { createTraceWorkerServer } from './trace-worker-server'
import type { TraceWorkerRequest, TraceWorkerResponse } from './worker-protocol'

interface TraceWorkerScope {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<TraceWorkerRequest>) => void,
  ) => void
  postMessage: (message: TraceWorkerResponse, transfer?: Transferable[]) => void
}

export function startTraceWorker(): void {
  const workerScope = globalThis as unknown as TraceWorkerScope
  const server = createTraceWorkerServer({
    postMessage: (message, transfer) => workerScope.postMessage(message, transfer),
  })

  workerScope.addEventListener('message', (event) => {
    void server.handleMessage(event.data)
  })
}
