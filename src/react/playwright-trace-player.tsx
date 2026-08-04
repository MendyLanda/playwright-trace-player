'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import {
  selectTraceTimeline,
  type LoadTraceOptions,
  type ParsedTrace,
  type TraceAction,
  type TraceFrame,
  type TraceSource,
} from '../core'
import { CursorIcon, ExpandIcon, InfoIcon, PauseIcon, PlayIcon, RetryIcon, TraceIcon } from './icons'
import { FrameUrlCache } from './frame-url-cache'
import {
  createPlayerSettings,
  type PlaywrightTracePlayerSettings,
  type TracePlayerActivityMode,
} from './player-settings'
import {
  buildTraceActivityTimeline,
  findClickActivity,
  findKeyboardActivity,
  findPointerActivity,
  isKeyboardInputAction,
  type KeyboardActivity,
} from './trace-activity'
import { useTrace } from './use-trace'

export interface PlaywrightTracePlayerHandle {
  play: () => void
  pause: () => void
  seek: (timeInSeconds: number) => void
}

export interface PlaywrightTracePlayerStyle extends CSSProperties {
  '--ptp-background'?: string
  '--ptp-accent'?: string
  '--ptp-radius'?: string
  '--ptp-font-family'?: string
  '--ptp-foreground'?: string
  '--ptp-accent-foreground'?: string
  '--ptp-muted'?: string
  '--ptp-danger'?: string
  '--ptp-border-color'?: string
  '--ptp-viewport-background'?: string
  '--ptp-max-viewport-height'?: string
}

export interface PlaywrightTracePlayerProps {
  /** Public or signed URL for a Playwright trace ZIP. */
  traceUrl?: string
  /** A URL, File, Blob, ArrayBuffer, or Uint8Array. Takes priority over traceUrl. */
  trace?: TraceSource
  className?: string
  /** CSS properties and the player's public theme tokens. */
  style?: PlaywrightTracePlayerStyle
  /** Selects one page from a trace with popups or more than one browser page. */
  pageId?: string
  autoPlay?: boolean
  loop?: boolean
  playbackRate?: number
  showControls?: boolean
  /** Sets the initial display choices available from the settings popover. */
  defaultSettings?: Partial<PlaywrightTracePlayerSettings>
  requestInit?: LoadTraceOptions['requestInit']
  ariaLabel?: string
  /** The player owns this trace and disposes it when the source changes or it unmounts. */
  onLoad?: (trace: ParsedTrace) => void
  onError?: (error: Error) => void
  onTimeUpdate?: (timeInSeconds: number) => void
}

const PLAYBACK_RATES = [0.25, 0.5, 1, 1.5, 2, 4]

const KEY_DISPLAY: Record<string, { value: string; label: string }> = {
  Alt: { value: 'Alt', label: 'Alt' },
  ArrowDown: { value: '↓', label: 'Arrow Down' },
  ArrowLeft: { value: '←', label: 'Arrow Left' },
  ArrowRight: { value: '→', label: 'Arrow Right' },
  ArrowUp: { value: '↑', label: 'Arrow Up' },
  Backspace: { value: '⌫', label: 'Backspace' },
  Control: { value: 'Ctrl', label: 'Control' },
  ControlOrMeta: { value: 'Ctrl/⌘', label: 'Control or Command' },
  Delete: { value: 'Del', label: 'Delete' },
  End: { value: 'End', label: 'End' },
  Enter: { value: '↵', label: 'Enter' },
  Escape: { value: 'Esc', label: 'Escape' },
  Home: { value: 'Home', label: 'Home' },
  Meta: { value: '⌘', label: 'Command' },
  PageDown: { value: 'PgDn', label: 'Page Down' },
  PageUp: { value: 'PgUp', label: 'Page Up' },
  Shift: { value: 'Shift', label: 'Shift' },
  Space: { value: 'Space', label: 'Space' },
  Tab: { value: '⇥', label: 'Tab' },
}

type BooleanSetting = 'showTraceResult' | 'showBrowserName' | 'showPlaywrightCommands'

const DISPLAY_SETTING_OPTIONS: Array<{
  key: BooleanSetting
  label: string
}> = [
  { key: 'showTraceResult', label: 'Trace result' },
  { key: 'showBrowserName', label: 'Browser name' },
  { key: 'showPlaywrightCommands', label: 'Playwright commands' },
]

export const PlaywrightTracePlayer = forwardRef<
  PlaywrightTracePlayerHandle,
  PlaywrightTracePlayerProps
>(function PlaywrightTracePlayer(
  {
    traceUrl,
    trace: traceSource,
    className,
    style,
    pageId,
    autoPlay = false,
    loop = false,
    playbackRate = 1,
    showControls = true,
    defaultSettings,
    requestInit,
    ariaLabel = 'Playwright trace replay',
    onLoad,
    onError,
    onTimeUpdate,
  },
  forwardedRef,
) {
  const source = traceSource || traceUrl
  const rootRef = useRef<HTMLDivElement>(null)
  const initialSettingsRef = useRef<PlaywrightTracePlayerSettings | undefined>(undefined)
  if (!initialSettingsRef.current) {
    initialSettingsRef.current = createPlayerSettings(defaultSettings)
  }
  const [reloadKey, setReloadKey] = useState(0)
  const loadState = useTrace(source, requestInit, reloadKey, onLoad, onError)
  const selection = useMemo(() => {
    if (!loadState.trace) return {}
    try {
      return {
        timeline: selectTraceTimeline(
          loadState.trace,
          pageId || loadState.trace.defaultPageId,
        ),
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }, [loadState.trace, pageId])
  const timeline = selection.timeline

  useEffect(() => {
    if (selection.error) onError?.(selection.error)
  }, [selection.error, onError])
  const [currentTime, setCurrentTime] = useState(0)
  const currentTimeRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(normalizeRate(playbackRate))
  const [rateMenuOpen, setRateMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<PlaywrightTracePlayerSettings>(
    () => initialSettingsRef.current!,
  )
  const rateMenuRef = useRef<HTMLDivElement>(null)
  const rateButtonRef = useRef<HTMLButtonElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const previousTickRef = useRef<number | undefined>(undefined)

  const duration = timeline?.duration || 0
  const frameIndex = timeline ? findFrameIndex(timeline.frames, currentTime) : -1
  const frame = frameIndex >= 0 ? timeline?.frames[frameIndex] : undefined
  const frameLoad = useFrameUrl(
    loadState.trace,
    timeline?.frames,
    frameIndex,
    onError,
  )
  const frameUrl = frameLoad.url
  const activeAction = timeline ? findActiveAction(timeline.actions, currentTime) : undefined
  const activityTimeline = useMemo(
    () => buildTraceActivityTimeline(timeline?.actions || []),
    [timeline?.actions],
  )
  const pointerActivity = settings.pointer === 'full'
    ? findPointerActivity(activityTimeline.pointer, currentTime)
    : undefined
  const clickActivity = settings.pointer !== 'hidden'
    ? findClickActivity(activityTimeline.clicks, currentTime)
    : undefined
  const keyboardActivity = settings.keyboardInput !== 'hidden'
    ? findKeyboardActivity(activityTimeline.keyboard, currentTime)
    : undefined
  const failed = Boolean(timeline?.actions.some((action) => action.error))

  const updateTime = useCallback(
    (nextTime: number) => {
      currentTimeRef.current = nextTime
      setCurrentTime(nextTime)
      onTimeUpdate?.(nextTime / 1000)
    },
    [onTimeUpdate],
  )

  const seek = useCallback(
    (timeInSeconds: number) => {
      const nextTime = clamp(timeInSeconds * 1000, 0, duration)
      updateTime(nextTime)
    },
    [duration, updateTime],
  )

  const play = useCallback(() => {
    if (!timeline) return
    if (currentTimeRef.current >= duration) updateTime(0)
    setPlaying(true)
  }, [duration, timeline, updateTime])

  const pause = useCallback(() => setPlaying(false), [])

  useImperativeHandle(forwardedRef, () => ({ play, pause, seek }), [pause, play, seek])

  useEffect(() => {
    currentTimeRef.current = 0
    setCurrentTime(0)
    setRateMenuOpen(false)
    setSettingsOpen(false)
    setPlaying(Boolean(timeline && autoPlay))
  }, [timeline, autoPlay])

  useEffect(() => setRate(normalizeRate(playbackRate)), [playbackRate])

  useEffect(() => {
    if (!rateMenuOpen) return

    const focusFrame = requestAnimationFrame(() => {
      rateMenuRef.current
        ?.querySelector<HTMLButtonElement>(`[data-rate="${rate}"]`)
        ?.focus()
    })
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rateMenuRef.current?.contains(event.target as Node)) setRateMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)

    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [rate, rateMenuOpen])

  useEffect(() => {
    if (!playing || !timeline) return

    const tick = (timestamp: number) => {
      const previous = previousTickRef.current ?? timestamp
      previousTickRef.current = timestamp
      const delta = (timestamp - previous) * rate

      const next = currentTimeRef.current + delta
      if (next < duration) {
        updateTime(next)
        animationRef.current = requestAnimationFrame(tick)
      } else if (loop && duration > 0) {
        updateTime(next % duration)
        animationRef.current = requestAnimationFrame(tick)
      } else {
        updateTime(duration)
        setPlaying(false)
      }
    }

    animationRef.current = requestAnimationFrame(tick)
    return () => {
      if (animationRef.current !== undefined) cancelAnimationFrame(animationRef.current)
      previousTickRef.current = undefined
    }
  }, [duration, loop, playing, rate, timeline, updateTime])

  const togglePlayback = useCallback(() => {
    if (playing) pause()
    else play()
  }, [pause, play, playing])

  const toggleFullscreen = async () => {
    if (!rootRef.current) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await rootRef.current.requestFullscreen()
  }

  const selectRate = (nextRate: number) => {
    setRate(nextRate)
    setRateMenuOpen(false)
    rateButtonRef.current?.focus()
  }

  const updateSetting = useCallback((setting: BooleanSetting, visible: boolean) => {
    setSettings((current) => ({ ...current, [setting]: visible }))
  }, [])

  const updateActivityMode = useCallback((
    setting: 'keyboardInput' | 'pointer',
    value: TracePlayerActivityMode,
  ) => {
    setSettings((current) => ({ ...current, [setting]: value }))
  }, [])

  const changeSettingsOpen = useCallback((open: boolean) => {
    if (open) setRateMenuOpen(false)
    setSettingsOpen(open)
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(initialSettingsRef.current!)
  }, [])

  const handleRateMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setRateMenuOpen(false)
      rateButtonRef.current?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    )
    if (!options.length) return
    event.preventDefault()
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowUp'
          ? (currentIndex - 1 + options.length) % options.length
          : (currentIndex + 1) % options.length
    options[nextIndex]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    ) return
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault()
      togglePlayback()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      seek(currentTime / 1000 - 5)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      seek(currentTime / 1000 + 5)
    } else if (event.key === '0') {
      event.preventDefault()
      seek(0)
    }
  }

  const progress = duration ? (currentTime / duration) * 100 : 0
  const aspectRatio = frame ? `${frame.width} / ${frame.height}` : '16 / 9'
  const rootClassName = ['ptp', className].filter(Boolean).join(' ')

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      data-playwright-trace-player=""
      style={{ ...style, '--ptp-progress': `${progress}%` } as CSSProperties}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="ptp__viewport" style={{ aspectRatio }}>
        {loadState.status === 'loading' && <LoadingState progress={loadState.progress} />}
        {loadState.status === 'error' && (
          <ErrorState error={loadState.error} onRetry={() => setReloadKey((key) => key + 1)} />
        )}
        {selection.error && <ErrorState error={selection.error} />}
        {frameLoad.error && <ErrorState error={frameLoad.error} />}
        {loadState.status === 'idle' && <EmptyState />}

        {frameUrl && (
          <button
            className="ptp__screen"
            type="button"
            onClick={togglePlayback}
            aria-label={playing ? 'Pause trace' : 'Play trace'}
          >
            <img className="ptp__frame" src={frameUrl} alt="" draggable={false} />
          </button>
        )}

        {timeline && settings.showTraceResult && (
          <div className={`ptp__trace-result ${failed ? 'ptp__trace-result--failed' : ''}`}>
            <span className="ptp__state-dot" />
            {failed ? 'Contains errors' : 'No recorded errors'}
          </div>
        )}

        {timeline && settings.showBrowserName && (
          <div className="ptp__browser-label">
            {formatBrowser(loadState.trace?.metadata.browserName)}
          </div>
        )}

        {pointerActivity && frame && (
          <CursorIcon
            className="ptp__pointer"
            style={{
              left: `${clamp((pointerActivity.point.x / frame.width) * 100, 0, 100)}%`,
              top: `${clamp((pointerActivity.point.y / frame.height) * 100, 0, 100)}%`,
            }}
          />
        )}

        {clickActivity && frame && (
          <span
            key={clickActivity.id}
            className="ptp__click"
            style={{
              left: `${clamp((clickActivity.point.x / frame.width) * 100, 0, 100)}%`,
              top: `${clamp((clickActivity.point.y / frame.height) * 100, 0, 100)}%`,
            }}
            aria-hidden="true"
          />
        )}

        {(keyboardActivity || (settings.showPlaywrightCommands && activeAction)) && (
          <div className="ptp__activity-stack">
            {keyboardActivity && (
              <KeyboardOverlay
                key={keyboardActivity.id}
                activity={keyboardActivity}
                mode={settings.keyboardInput}
              />
            )}
            {settings.showPlaywrightCommands && activeAction && (
              <div className={`ptp__action ${activeAction.error ? 'ptp__action--error' : ''}`}>
                <span>{formatMethod(activeAction.method)}</span>
                <strong>
                  {cleanActionTitle(
                    activeAction,
                    settings.keyboardInput !== 'full' && isKeyboardInputAction(activeAction),
                  )}
                </strong>
              </div>
            )}
          </div>
        )}

        {timeline && !playing && currentTime < duration && (
          <button className="ptp__big-play" type="button" onClick={play} aria-label="Play trace">
            <PlayIcon />
          </button>
        )}
      </div>

      {timeline && showControls && (
        <div className="ptp__controls">
          <button className="ptp__control ptp__play" type="button" onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <span className="ptp__time ptp__time--current">{formatTime(currentTime)}</span>
          <input
            className="ptp__scrubber"
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="1"
            value={currentTime}
            onChange={(event) => seek(Number(event.currentTarget.value) / 1000)}
            aria-label="Trace position"
          />
          <span className="ptp__time">{formatTime(duration)}</span>
          <div
            className="ptp__rate-menu"
            ref={rateMenuRef}
            onKeyDown={handleRateMenuKeyDown}
          >
            <button
              ref={rateButtonRef}
              className="ptp__rate-trigger"
              type="button"
              onClick={() => {
                setSettingsOpen(false)
                setRateMenuOpen((open) => !open)
              }}
              aria-label={`Playback speed ${rate} times`}
              aria-haspopup="menu"
              aria-expanded={rateMenuOpen}
            >
              {rate}×
            </button>
            {rateMenuOpen && (
              <div className="ptp__rate-options" role="menu" aria-label="Playback speed options">
                {PLAYBACK_RATES.map((playbackRateOption) => (
                  <button
                    key={playbackRateOption}
                    type="button"
                    role="menuitemradio"
                    aria-checked={rate === playbackRateOption}
                    data-rate={playbackRateOption}
                    onClick={() => selectRate(playbackRateOption)}
                  >
                    {playbackRateOption}×
                  </button>
                ))}
              </div>
            )}
          </div>
          <PlayerSettingsMenu
            open={settingsOpen}
            settings={settings}
            onOpenChange={changeSettingsOpen}
            onSettingChange={updateSetting}
            onModeChange={updateActivityMode}
            onReset={resetSettings}
          />
          <button className="ptp__control" type="button" onClick={toggleFullscreen} aria-label="Toggle full screen">
            <ExpandIcon />
          </button>
        </div>
      )}
    </div>
  )
})

interface PlayerSettingsMenuProps {
  open: boolean
  settings: PlaywrightTracePlayerSettings
  onOpenChange: (open: boolean) => void
  onSettingChange: (setting: BooleanSetting, visible: boolean) => void
  onModeChange: (
    setting: 'keyboardInput' | 'pointer',
    value: TracePlayerActivityMode,
  ) => void
  onReset: () => void
}

function PlayerSettingsMenu({
  open,
  settings,
  onOpenChange,
  onSettingChange,
  onModeChange,
  onReset,
}: PlayerSettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const headingId = `${panelId}-heading`

  useEffect(() => {
    if (!open) return

    const focusFrame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="radio"], [role="switch"]')?.focus()
    })
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)

    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [onOpenChange, open])

  const closeMenu = () => {
    onOpenChange(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="ptp__settings-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        className="ptp__control ptp__settings-trigger"
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Display settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <InfoIcon />
      </button>
      {open && (
        <div
          id={panelId}
          className="ptp__settings-panel"
          role="dialog"
          aria-labelledby={headingId}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            closeMenu()
          }}
        >
          <div className="ptp__settings-header">
            <strong id={headingId}>Display settings</strong>
            <button type="button" onClick={onReset}>Reset</button>
          </div>

          <ActivityModeSetting
            label="Keyboard input"
            note="Full shows values"
            value={settings.keyboardInput}
            markerLabel="Markers"
            onChange={(value) => onModeChange('keyboardInput', value)}
          />
          <ActivityModeSetting
            label="Pointer"
            note="Full shows movement"
            value={settings.pointer}
            markerLabel="Clicks"
            onChange={(value) => onModeChange('pointer', value)}
          />

          <div className="ptp__settings-switches">
            {DISPLAY_SETTING_OPTIONS.map((option) => (
              <button
                key={option.key}
                className="ptp__settings-switch"
                type="button"
                role="switch"
                aria-checked={settings[option.key]}
                onClick={() => onSettingChange(option.key, !settings[option.key])}
              >
                <span>{option.label}</span>
                <i aria-hidden="true"><i /></i>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface ActivityModeSettingProps {
  label: string
  note: string
  value: TracePlayerActivityMode
  markerLabel: string
  onChange: (value: TracePlayerActivityMode) => void
}

function ActivityModeSetting({
  label,
  note,
  value,
  markerLabel,
  onChange,
}: ActivityModeSettingProps) {
  const options: Array<{ label: string; value: TracePlayerActivityMode }> = [
    { label: 'Full', value: 'full' },
    { label: markerLabel, value: 'markers-only' },
    { label: 'Hidden', value: 'hidden' },
  ]

  return (
    <fieldset className="ptp__mode-setting">
      <legend>
        <strong>{label}</strong>
        <small>{note}</small>
      </legend>
      <div
        role="radiogroup"
        aria-label={`${label} display`}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          const currentIndex = options.findIndex((option) => option.value === value)
          const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
          const next = options[(currentIndex + direction + options.length) % options.length]!
          onChange(next.value)
          event.currentTarget
            .querySelector<HTMLButtonElement>(`[data-mode="${next.value}"]`)
            ?.focus()
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            data-mode={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function KeyboardOverlay({
  activity,
  mode,
}: {
  activity: KeyboardActivity
  mode: TracePlayerActivityMode
}) {
  if (mode === 'markers-only') {
    const label = activity.kind === 'text' ? activity.label : 'Key press'
    return (
      <div
        className="ptp__keyboard ptp__keyboard--marker"
        aria-label={`${label}; value hidden`}
      >
        <span>{label}</span>
        <kbd aria-hidden="true">•••</kbd>
      </div>
    )
  }

  if (activity.kind === 'text') {
    return (
      <div
        className="ptp__keyboard ptp__keyboard--text"
        aria-label={`${activity.label}: ${activity.text}`}
      >
        <span>{activity.label}</span>
        <kbd aria-hidden="true">“{activity.text}”</kbd>
      </div>
    )
  }

  return (
    <div className="ptp__keyboard" aria-label={`Keys: ${activity.keys.join(' plus ')}`}>
      {activity.keys.map((key, index) => {
        const formatted = formatKey(key)
        return (
          <span className="ptp__key-part" key={`${key}-${index}`}>
            {index > 0 && <b aria-hidden="true">+</b>}
            <kbd aria-label={formatted.label}>{formatted.value}</kbd>
          </span>
        )
      })}
    </div>
  )
}

function LoadingState({ progress }: { progress?: { loadedBytes?: number; totalBytes?: number; phase: string } }) {
  const percent = progress?.totalBytes
    ? Math.round(((progress.loadedBytes || 0) / progress.totalBytes) * 100)
    : undefined
  const label = progress?.phase === 'download' ? 'Fetching trace' : progress?.phase === 'parse' ? 'Reading events' : 'Opening archive'

  return (
    <div className="ptp__placeholder" role="status">
      <TraceIcon className="ptp__placeholder-icon" />
      <span className="ptp__eyebrow">Preparing replay</span>
      <strong>{label}</strong>
      <div className="ptp__load-track">
        <span style={{ width: percent === undefined ? '38%' : `${percent}%` }} />
      </div>
      <small>{percent === undefined ? 'Trace data' : `${percent}%`}</small>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="ptp__placeholder">
      <TraceIcon className="ptp__placeholder-icon" />
      <span className="ptp__eyebrow">No source</span>
      <strong>Add a trace URL</strong>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error?: Error; onRetry?: () => void }) {
  return (
    <div className="ptp__placeholder ptp__placeholder--error" role="alert">
      <span className="ptp__error-code">TRACE / ERROR</span>
      <strong>Replay unavailable</strong>
      <p>{error?.message || 'The trace could not be loaded.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          <RetryIcon /> Retry
        </button>
      )}
    </div>
  )
}

function useFrameUrl(
  trace: ParsedTrace | undefined,
  frames: TraceFrame[] | undefined,
  frameIndex: number,
  onError?: (error: Error) => void,
): { url?: string; error?: Error } {
  const cacheRef = useRef<FrameUrlCache | undefined>(undefined)
  const [state, setState] = useState<{ url?: string; error?: Error }>({})

  useEffect(() => {
    const cache = trace ? new FrameUrlCache(trace) : undefined
    cacheRef.current = cache
    setState({})

    return () => {
      cache?.dispose()
      if (cacheRef.current === cache) cacheRef.current = undefined
    }
  }, [trace])

  useEffect(() => {
    const cache = cacheRef.current
    const frame = frames?.[frameIndex]
    if (!cache || !frame || !frames) return
    let active = true

    void cache.urlFor(frame).then(
      (url) => {
        if (active) setState({ url })
      },
      (error: unknown) => {
        if (!active) return
        const resolvedError = error instanceof Error ? error : new Error(String(error))
        setState({ error: resolvedError })
        onError?.(resolvedError)
      },
    )
    cache.prefetch(frames.slice(frameIndex + 1, frameIndex + 3))

    return () => {
      active = false
    }
  }, [frameIndex, frames, onError, trace])

  return state
}

function findFrameIndex(frames: TraceFrame[], time: number): number {
  let low = 0
  let high = frames.length - 1
  let result = 0

  while (low <= high) {
    const middle = (low + high) >> 1
    if (frames[middle]!.time <= time) {
      result = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return result
}

function findActiveAction(actions: TraceAction[], time: number): TraceAction | undefined {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!
    if (action.startTime <= time && time <= Math.max(action.endTime, action.startTime + 1_200)) {
      return action
    }
  }
  return undefined
}

function cleanActionTitle(action: TraceAction, redactInput = false): string {
  if (redactInput) return `${action.method}(•••)`
  return action.title.replace(/^(page|locator|browsercontext)\./i, '') || formatMethod(action.method)
}

function formatMethod(method: string): string {
  return method.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
}

function formatKey(key: string): { value: string; label: string } {
  return KEY_DISPLAY[key] || {
    value: key.length === 1 ? key.toUpperCase() : key,
    label: key,
  }
}

function formatBrowser(browserName?: string): string {
  if (!browserName || browserName === 'unknown') return 'BROWSER'
  return browserName.toUpperCase()
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(Math.max(value, minimum), maximum)
}

function normalizeRate(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}
