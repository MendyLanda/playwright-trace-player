export type TracePlayerActivityMode = 'full' | 'markers-only' | 'hidden'

export interface PlaywrightTracePlayerSettings {
  showTraceResult: boolean
  showBrowserName: boolean
  showPlaywrightCommands: boolean
  keyboardInput: TracePlayerActivityMode
  pointer: TracePlayerActivityMode
}

const DEFAULT_PLAYER_SETTINGS: PlaywrightTracePlayerSettings = {
  showTraceResult: false,
  showBrowserName: true,
  showPlaywrightCommands: true,
  keyboardInput: 'full',
  pointer: 'full',
}

export function createPlayerSettings(
  defaults?: Partial<PlaywrightTracePlayerSettings>,
): PlaywrightTracePlayerSettings {
  return { ...DEFAULT_PLAYER_SETTINGS, ...defaults }
}
