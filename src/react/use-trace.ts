import { useEffect, useRef, useState } from 'react'
import {
  loadTrace,
  TracePlayerError,
  type LoadTraceOptions,
  type ParsedTrace,
  type TraceLoadProgress,
  type TraceSource,
} from '../core'

interface TraceState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  trace?: ParsedTrace
  error?: Error
  progress?: TraceLoadProgress
}

export function useTrace(
  source: TraceSource | undefined,
  requestInit: LoadTraceOptions['requestInit'],
  reloadKey: number,
  onLoad?: (trace: ParsedTrace) => void,
  onError?: (error: Error) => void,
): TraceState {
  const [state, setState] = useState<TraceState>({ status: 'idle' })
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  onLoadRef.current = onLoad
  onErrorRef.current = onError

  useEffect(() => {
    if (!source) {
      setState({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    let active = true
    let loadedTrace: ParsedTrace | undefined
    setState({ status: 'loading' })

    loadTrace(source, {
      signal: controller.signal,
      requestInit,
      onProgress: (progress) => {
        if (active) setState((current) => ({ ...current, progress }))
      },
    }).then(
      (trace) => {
        loadedTrace = trace
        if (!active) {
          trace.dispose()
          return
        }
        setState({ status: 'ready', trace })
        onLoadRef.current?.(trace)
      },
      (error: unknown) => {
        if (!active || (error instanceof TracePlayerError && error.code === 'ABORTED')) return
        const resolvedError = error instanceof Error ? error : new Error(String(error))
        setState({ status: 'error', error: resolvedError })
        onErrorRef.current?.(resolvedError)
      },
    )

    return () => {
      active = false
      controller.abort()
      loadedTrace?.dispose()
    }
  }, [source, requestInit, reloadKey])

  return state
}
