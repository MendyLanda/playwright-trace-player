import type { ParsedTrace, TraceFrame } from '../core'

interface CachedUrl {
  url: string
  lastUsed: number
}

/** Keeps a small set of inflated screenshots ready for playback. */
export class FrameUrlCache {
  private readonly cached = new Map<string, CachedUrl>()
  private readonly pending = new Map<string, Promise<string>>()
  private clock = 0
  private disposed = false

  constructor(
    private readonly trace: Pick<ParsedTrace, 'readFrame'>,
    private readonly limit = 24,
  ) {}

  urlFor(frame: TraceFrame): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('The frame cache has been disposed.'))
    const key = frameKey(frame)
    const cached = this.cached.get(key)
    if (cached) {
      cached.lastUsed = ++this.clock
      return Promise.resolve(cached.url)
    }

    const pending = this.pending.get(key)
    if (pending) return pending

    const load = this.trace
      .readFrame(frame)
      .then((data) => {
        if (this.disposed) throw new Error('The frame cache has been disposed.')
        const url = URL.createObjectURL(
          new Blob([data as BlobPart], { type: frame.mimeType }),
        )
        this.cached.set(key, { url, lastUsed: ++this.clock })
        this.evictOldUrls()
        return url
      })
      .finally(() => this.pending.delete(key))

    this.pending.set(key, load)
    return load
  }

  prefetch(frames: TraceFrame[]): void {
    for (const frame of frames) void this.urlFor(frame).catch(() => undefined)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const { url } of this.cached.values()) URL.revokeObjectURL(url)
    this.cached.clear()
    this.pending.clear()
  }

  private evictOldUrls(): void {
    while (this.cached.size > Math.max(1, this.limit)) {
      let oldestKey: string | undefined
      let oldestUse = Number.POSITIVE_INFINITY
      for (const [key, value] of this.cached) {
        if (value.lastUsed < oldestUse) {
          oldestKey = key
          oldestUse = value.lastUsed
        }
      }
      if (!oldestKey) return
      URL.revokeObjectURL(this.cached.get(oldestKey)!.url)
      this.cached.delete(oldestKey)
    }
  }
}

function frameKey(frame: TraceFrame): string {
  return `${frame.sha1}:${frame.mimeType}`
}
