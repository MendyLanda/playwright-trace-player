export type TraceSource = string | URL | Blob | ArrayBuffer | Uint8Array

export interface LoadTraceOptions {
  /** A signal used to cancel downloading or parsing the trace. */
  signal?: AbortSignal
  /** Options passed to fetch when the source is a URL. */
  requestInit?: Omit<RequestInit, 'signal'>
  /** Reports download progress when the server sends Content-Length. */
  onProgress?: (progress: TraceLoadProgress) => void
}

export interface TraceLoadProgress {
  phase: 'download' | 'unzip' | 'parse'
  loadedBytes?: number
  totalBytes?: number
}

export interface TraceViewport {
  width: number
  height: number
}

export interface TraceMetadata {
  browserName: string
  platform: string
  viewport: TraceViewport
  startTime: number
  endTime: number
  duration: number
  wallTime: number
  playwrightVersion?: string
}

export interface TraceFrame {
  id: string
  sha1: string
  pageId: string
  time: number
  width: number
  height: number
  mimeType: string
}

export interface TracePoint {
  x: number
  y: number
}

export interface TraceAction {
  callId: string
  title: string
  className: string
  method: string
  params: Record<string, unknown>
  startTime: number
  endTime: number
  pageId?: string
  parentId?: string
  stepId?: string
  point?: TracePoint
  error?: { message: string }
}

export interface TracePage {
  id: string
  frameCount: number
  startTime: number
  endTime: number
  width: number
  height: number
}

export interface ParsedTrace {
  metadata: TraceMetadata
  frames: TraceFrame[]
  actions: TraceAction[]
  pages: TracePage[]
  defaultPageId: string
  /** Inflates one screenshot when it is needed. */
  readFrame: (frame: TraceFrame) => Promise<Uint8Array>
  /** Frees the source ZIP held by this trace. */
  dispose: () => void
}

export interface TraceTimeline {
  page: TracePage
  frames: TraceFrame[]
  actions: TraceAction[]
  duration: number
  startTime: number
  endTime: number
}
