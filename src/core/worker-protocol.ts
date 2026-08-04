import type {
  TraceAction,
  TraceFrame,
  TraceLoadProgress,
  TraceMetadata,
  TracePage,
} from './types'
import type { TracePlayerErrorCode } from './errors'

export type WorkerTraceSource = string | Blob | ArrayBuffer

export type SerializedRequestInit = Omit<
  RequestInit,
  'body' | 'headers' | 'signal'
> & {
  headers?: [string, string][]
}

export interface TraceSnapshot {
  metadata: TraceMetadata
  frames: TraceFrame[]
  actions: TraceAction[]
  pages: TracePage[]
  defaultPageId: string
}

export interface SerializedTraceError {
  name: string
  message: string
  code?: TracePlayerErrorCode
  stack?: string
}

export type TraceWorkerRequest =
  | {
      type: 'load'
      source: WorkerTraceSource
      requestInit?: SerializedRequestInit
    }
  | { type: 'frame'; requestId: number; frameId: string }
  | { type: 'dispose' }

export type TraceWorkerResponse =
  | { type: 'progress'; progress: TraceLoadProgress }
  | { type: 'ready'; trace: TraceSnapshot }
  | { type: 'frame'; requestId: number; data: ArrayBuffer }
  | { type: 'error'; requestId?: number; error: SerializedTraceError }
