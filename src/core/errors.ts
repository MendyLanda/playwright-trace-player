export class TracePlayerError extends Error {
  readonly code: TracePlayerErrorCode
  readonly cause?: unknown

  constructor(code: TracePlayerErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'TracePlayerError'
    this.code = code
    this.cause = cause
  }
}

export type TracePlayerErrorCode =
  | 'FETCH_FAILED'
  | 'INVALID_ZIP'
  | 'INVALID_TRACE'
  | 'NO_FRAMES'
  | 'ABORTED'
  | 'TRACE_DISPOSED'
  | 'WORKER_FAILED'
