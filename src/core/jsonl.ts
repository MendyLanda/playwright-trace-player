export interface TraceRecord {
  type: string
  [field: string]: unknown
}

/** Calls `accept` once for each JSON object with a string `type` field. */
export function visitTraceRecords(
  source: string,
  accept: (record: TraceRecord) => void,
): void {
  const lines = source.matchAll(/[^\r\n]+/g)

  for (const match of lines) {
    const text = match[0].trim()
    if (text.length === 0) continue

    try {
      const value: unknown = JSON.parse(text)
      if (isTraceRecord(value)) accept(value)
    } catch {
      // One bad record should not make the rest of the trace unusable.
    }
  }
}

function isTraceRecord(value: unknown): value is TraceRecord {
  return isObject(value) && typeof value.type === 'string'
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
