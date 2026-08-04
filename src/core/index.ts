export { TracePlayerError, type TracePlayerErrorCode } from './errors'
export { loadTrace } from './load-trace'
export { parseTraceArchive } from './parser'
export { selectTraceTimeline } from './select-timeline'
export type {
  LoadTraceOptions,
  ParsedTrace,
  TraceAction,
  TraceFrame,
  TraceLoadProgress,
  TraceMetadata,
  TracePage,
  TracePoint,
  TraceSource,
  TraceTimeline,
  TraceViewport,
} from './types'
