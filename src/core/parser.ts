import { strFromU8 } from 'fflate'
import { TracePlayerError } from './errors'
import { isObject, type TraceRecord, visitTraceRecords } from './jsonl'
import type {
  LoadTraceOptions,
  ParsedTrace,
  TraceAction,
  TraceFrame,
  TracePage,
  TraceSource,
  TraceViewport,
} from './types'
import { ZipArchive } from './zip-archive'

export async function loadTraceOnCurrentThread(
  source: TraceSource,
  options: LoadTraceOptions = {},
): Promise<ParsedTrace> {
  try {
    const bytes = await readSource(source, options)
    assertNotAborted(options.signal)
    return await parseTraceArchive(bytes, options)
  } catch (error) {
    if (error instanceof TracePlayerError) throw error
    if (isAbortError(error) || options.signal?.aborted) {
      throw new TracePlayerError('ABORTED', 'Trace loading was cancelled.', error)
    }
    throw error
  }
}

export async function parseTraceArchive(
  archive: ArrayBuffer | Uint8Array,
  options: Pick<LoadTraceOptions, 'signal' | 'onProgress'> = {},
): Promise<ParsedTrace> {
  const bytes = archive instanceof Uint8Array ? archive : new Uint8Array(archive)
  options.onProgress?.({ phase: 'unzip' })
  assertNotAborted(options.signal)

  let zip: ZipArchive
  try {
    zip = new ZipArchive(bytes)
  } catch (error) {
    throw new TracePlayerError(
      'INVALID_ZIP',
      'The trace could not be opened as a ZIP archive.',
      error,
    )
  }

  try {
    assertNotAborted(options.signal)
    options.onProgress?.({ phase: 'parse' })
    const entryNames = zip.names()
    const traceEntryNames = entryNames.filter((name) => name.endsWith('.trace'))
    if (traceEntryNames.length === 0) {
      throw new TracePlayerError(
        'INVALID_TRACE',
        'This ZIP does not contain a Playwright .trace file.',
      )
    }

    const resources = mapResources(entryNames)
    const builder = new PlaybackDataBuilder(resources)
    for (const name of traceEntryNames) {
      try {
        visitTraceRecords(strFromU8(zip.read(name)), (record) => builder.add(record))
      } catch (error) {
        throw new TracePlayerError(
          'INVALID_ZIP',
          `The trace entry ${name} could not be read.`,
          error,
        )
      }
    }
    assertNotAborted(options.signal)
    const { actions, context, frames } = builder.finish()

    if (frames.length === 0) {
      throw new TracePlayerError(
        'NO_FRAMES',
        'This trace has no screencast frames. Record it with Playwright tracing screenshots enabled.',
      )
    }

    const pages = buildPages(frames)
    let startTime = frames[0]!.time
    let endTime = frames.at(-1)!.time
    for (const action of actions) {
      if (Number.isFinite(action.startTime)) startTime = Math.min(startTime, action.startTime)
      if (Number.isFinite(action.endTime)) endTime = Math.max(endTime, action.endTime)
    }
    let disposed = false

    return {
      metadata: {
        browserName: context?.browserName || 'unknown',
        platform: context?.platform || 'unknown',
        viewport: context?.viewport || inferViewport(frames),
        startTime,
        endTime,
        duration: Math.max(0, endTime - startTime),
        wallTime: context?.wallTime || 0,
        playwrightVersion: context?.playwrightVersion,
      },
      frames,
      actions,
      pages,
      defaultPageId: chooseDefaultPage(pages),
      readFrame: async (frame) => {
        if (disposed) {
          throw new TracePlayerError('TRACE_DISPOSED', 'This trace has been disposed.')
        }
        const resourceName = resources.get(frame.sha1)
        if (!resourceName) {
          throw new TracePlayerError(
            'INVALID_TRACE',
            `The screenshot resource ${frame.sha1} is missing.`,
          )
        }
        try {
          return zip.read(resourceName)
        } catch (error) {
          throw new TracePlayerError(
            'INVALID_ZIP',
            `The screenshot resource ${frame.sha1} could not be read.`,
            error,
          )
        }
      },
      dispose: () => {
        if (disposed) return
        disposed = true
        resources.clear()
        zip.dispose()
      },
    }
  } catch (error) {
    zip.dispose()
    throw error
  }
}

async function readSource(
  source: TraceSource,
  options: LoadTraceOptions,
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer())
  }

  const url = source instanceof URL ? source.toString() : (source as string)
  let response: Response
  try {
    response = await fetch(url, { ...options.requestInit, signal: options.signal })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new TracePlayerError(
      'FETCH_FAILED',
      `Could not fetch the trace from ${url}. Check the URL and its CORS headers.`,
      error,
    )
  }

  if (!response.ok) {
    throw new TracePlayerError(
      'FETCH_FAILED',
      `Could not fetch the trace: ${response.status} ${response.statusText}.`,
    )
  }

  return readResponse(response, options)
}

async function readResponse(
  response: Response,
  options: LoadTraceOptions,
): Promise<Uint8Array> {
  const totalHeader = response.headers.get('content-length')
  const declaredTotal = totalHeader ? Number(totalHeader) : undefined
  const totalBytes =
    declaredTotal !== undefined &&
    Number.isSafeInteger(declaredTotal) &&
    declaredTotal >= 0
      ? declaredTotal
      : undefined

  if (!response.body) {
    const result = new Uint8Array(await response.arrayBuffer())
    options.onProgress?.({
      phase: 'download',
      loadedBytes: result.byteLength,
      totalBytes,
    })
    return result
  }

  const reader = response.body.getReader()
  const knownSize = totalBytes !== undefined && totalBytes <= 1024 ** 3 ? totalBytes : 0
  let result = new Uint8Array(knownSize)
  let loadedBytes = 0

  while (true) {
    assertNotAborted(options.signal)
    const { done, value } = await reader.read()
    if (done) break
    const nextSize = loadedBytes + value.byteLength
    if (nextSize > result.byteLength) {
      const capacity = Math.max(nextSize, result.byteLength * 2, 64 * 1024)
      const grown = new Uint8Array(capacity)
      grown.set(result.subarray(0, loadedBytes))
      result = grown
    }
    result.set(value, loadedBytes)
    loadedBytes += value.byteLength
    options.onProgress?.({ phase: 'download', loadedBytes, totalBytes })
  }

  return loadedBytes === result.byteLength ? result : result.slice(0, loadedBytes)
}

interface TraceContext {
  browserName?: string
  platform?: string
  viewport?: TraceViewport
  wallTime?: number
  playwrightVersion?: string
}

interface ActionParts {
  callId: string
  stepId?: string
  title?: string
  className?: string
  method?: string
  params?: Record<string, unknown>
  startTime?: number
  endTime?: number
  parentId?: string
  pageId?: string
  point?: { x: number; y: number }
  error?: { message: string }
}

interface PlaybackData {
  context?: TraceContext
  frames: TraceFrame[]
  actions: TraceAction[]
}

/** Reduces raw trace records into the data needed for screenshot playback. */
class PlaybackDataBuilder {
  private readonly actionParts = new Map<string, ActionParts>()
  private readonly contexts: TraceContext[] = []
  private readonly frames: TraceFrame[] = []
  private frameIndex = 0

  constructor(private readonly resources: Map<string, string>) {}

  add(record: TraceRecord): void {
    switch (record.type) {
      case 'context-options':
        this.addContext(record)
        break
      case 'screencast-frame':
        this.addFrame(record)
        break
      case 'before':
        this.addActionStart(record)
        break
      case 'after':
        this.addActionResult(record)
        break
      case 'input':
        this.addActionPoint(record)
        break
    }
  }

  finish(): PlaybackData {
    const actions: TraceAction[] = []
    for (const parts of this.actionParts.values()) {
      if (parts.startTime === undefined) continue
      const className = parts.className || 'unknown'
      const method = parts.method || 'unknown'

      actions.push({
        callId: parts.callId,
        stepId: parts.stepId,
        title: parts.title || `${className}.${method}`,
        className,
        method,
        params: parts.params || {},
        startTime: parts.startTime,
        endTime: Math.max(parts.startTime, parts.endTime ?? parts.startTime),
        parentId: parts.parentId,
        pageId: parts.pageId,
        point: parts.point,
        error: parts.error,
      })
    }

    actions.sort((left, right) => left.startTime - right.startTime)
    this.frames.sort((left, right) => left.time - right.time)

    return {
      context: this.contexts.find((candidate) => Boolean(candidate.browserName)) ||
        this.contexts[0],
      frames: this.frames,
      actions,
    }
  }

  private addContext(record: TraceRecord): void {
    const options = objectField(record, 'options')
    const rawViewport = options ? objectField(options, 'viewport') : undefined
    const width = rawViewport ? numberField(rawViewport, 'width') : undefined
    const height = rawViewport ? numberField(rawViewport, 'height') : undefined

    this.contexts.push({
      browserName: stringField(record, 'browserName'),
      platform: stringField(record, 'platform'),
      viewport:
        width !== undefined && height !== undefined ? { width, height } : undefined,
      wallTime: numberField(record, 'wallTime'),
      playwrightVersion: stringField(record, 'playwrightVersion'),
    })
  }

  private addFrame(record: TraceRecord): void {
    const index = this.frameIndex
    this.frameIndex += 1

    const sha1 = stringField(record, 'sha1')
    const time = numberField(record, 'timestamp')
    const width = numberField(record, 'width')
    const height = numberField(record, 'height')
    if (!sha1 || time === undefined || width === undefined || height === undefined) return

    const resourceName = this.resources.get(sha1)
    if (!resourceName) return
    const pageId = stringField(record, 'pageId') || 'page'

    this.frames.push({
      id: `${pageId}:${time}:${index}`,
      sha1,
      pageId,
      time,
      width,
      height,
      mimeType: detectImageMimeType(resourceName),
    })
  }

  private addActionStart(record: TraceRecord): void {
    const callId = stringField(record, 'callId')
    if (!callId) return

    const parts = this.partsFor(callId)
    parts.stepId = stringField(record, 'stepId')
    parts.title = stringField(record, 'title')
    parts.className = stringField(record, 'class')
    parts.method = stringField(record, 'method')
    parts.params = objectField(record, 'params')
    parts.startTime = numberField(record, 'startTime')
    parts.parentId = stringField(record, 'parentId')
    parts.pageId = stringField(record, 'pageId')
  }

  private addActionResult(record: TraceRecord): void {
    const callId = stringField(record, 'callId')
    if (!callId) return

    const parts = this.partsFor(callId)
    parts.endTime = numberField(record, 'endTime')
    parts.error = errorField(record, 'error')
    parts.point = pointField(record, 'point') || parts.point
  }

  private addActionPoint(record: TraceRecord): void {
    const callId = stringField(record, 'callId')
    const point = pointField(record, 'point')
    if (callId && point) this.partsFor(callId).point = point
  }

  private partsFor(callId: string): ActionParts {
    let parts = this.actionParts.get(callId)
    if (!parts) {
      parts = { callId }
      this.actionParts.set(callId, parts)
    }
    return parts
  }
}

function mapResources(entryNames: string[]): Map<string, string> {
  const resources = new Map<string, string>()
  for (const name of entryNames) {
    const marker = '/resources/'
    const markerIndex = name.lastIndexOf(marker)
    const isRootResource = name.startsWith('resources/')
    if (markerIndex < 0 && !isRootResource) continue
    const sha1 = isRootResource
      ? name.slice('resources/'.length)
      : name.slice(markerIndex + marker.length)
    if (sha1 && !resources.has(sha1)) resources.set(sha1, name)
  }

  for (const name of entryNames) {
    if (!name.includes('/') && !resources.has(name)) resources.set(name, name)
  }
  return resources
}

function stringField(object: Record<string, unknown>, field: string): string | undefined {
  const value = object[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(object: Record<string, unknown>, field: string): number | undefined {
  const value = object[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function objectField(
  object: Record<string, unknown>,
  field: string,
): Record<string, unknown> | undefined {
  const value = object[field]
  return isObject(value) ? value : undefined
}

function pointField(
  object: Record<string, unknown>,
  field: string,
): { x: number; y: number } | undefined {
  const point = objectField(object, field)
  if (!point) return undefined
  const x = numberField(point, 'x')
  const y = numberField(point, 'y')
  return x !== undefined && y !== undefined ? { x, y } : undefined
}

function errorField(
  object: Record<string, unknown>,
  field: string,
): { message: string } | undefined {
  const error = objectField(object, field)
  const message = error ? stringField(error, 'message') : undefined
  return message === undefined ? undefined : { message }
}

function buildPages(frames: TraceFrame[]): TracePage[] {
  const byPage = new Map<string, TraceFrame[]>()
  for (const frame of frames) {
    const pageFrames = byPage.get(frame.pageId) || []
    pageFrames.push(frame)
    byPage.set(frame.pageId, pageFrames)
  }

  return [...byPage.entries()]
    .map(([id, pageFrames]) => ({
      id,
      frameCount: pageFrames.length,
      startTime: pageFrames[0]!.time,
      endTime: pageFrames.at(-1)!.time,
      width: pageFrames[0]!.width,
      height: pageFrames[0]!.height,
    }))
    .sort((left, right) => left.startTime - right.startTime)
}

function chooseDefaultPage(pages: TracePage[]): string {
  return [...pages].sort((left, right) => right.frameCount - left.frameCount)[0]!.id
}

function inferViewport(frames: TraceFrame[]): TraceViewport {
  const first = frames[0]
  return first ? { width: first.width, height: first.height } : { width: 1280, height: 720 }
}

function detectImageMimeType(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new TracePlayerError('ABORTED', 'Trace loading was cancelled.', signal.reason)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
