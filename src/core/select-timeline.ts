import type { ParsedTrace, TraceTimeline } from './types'

export function selectTraceTimeline(
  trace: ParsedTrace,
  pageId: string = trace.defaultPageId,
): TraceTimeline {
  const page = trace.pages.find((candidate) => candidate.id === pageId)

  if (!page) {
    throw new RangeError(`Page "${pageId}" was not found in this trace.`)
  }

  const frames = trace.frames
    .filter((frame) => frame.pageId === pageId)
    .map((frame) => ({ ...frame, time: frame.time - page.startTime }))

  const actions = trace.actions
    .filter(
      (action) =>
        (!action.pageId || action.pageId === pageId) &&
        action.endTime >= page.startTime &&
        action.startTime <= page.endTime,
    )
    .map((action) => ({
      ...action,
      startTime: Math.max(0, action.startTime - page.startTime),
      endTime: Math.min(page.endTime - page.startTime, action.endTime - page.startTime),
    }))

  return {
    page,
    frames,
    actions,
    startTime: page.startTime,
    endTime: page.endTime,
    duration: Math.max(0, page.endTime - page.startTime),
  }
}
