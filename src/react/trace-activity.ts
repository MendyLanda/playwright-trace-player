import type { TraceAction, TracePoint } from '../core'

export interface PointerActivity {
  id: string
  point: TracePoint
  time: number
}

export interface ClickActivity extends PointerActivity {
  expiresAt: number
}

export type KeyboardActivity =
  | {
      id: string
      kind: 'keys'
      keys: string[]
      time: number
      expiresAt: number
    }
  | {
      id: string
      kind: 'text'
      label: string
      text: string
      time: number
      expiresAt: number
    }

export interface TraceActivityTimeline {
  pointer: PointerActivity[]
  clicks: ClickActivity[]
  keyboard: KeyboardActivity[]
}

const CLICK_METHODS = new Set([
  'check',
  'click',
  'dblclick',
  'mousedown',
  'setchecked',
  'tap',
  'uncheck',
])

const KEYBOARD_METHODS = new Set([
  'fill',
  'inserttext',
  'keydown',
  'keyup',
  'press',
  'presssequentially',
  'type',
])

export function isKeyboardInputAction(action: TraceAction): boolean {
  return KEYBOARD_METHODS.has(action.method.toLowerCase())
}

export function buildTraceActivityTimeline(actions: TraceAction[]): TraceActivityTimeline {
  const pointer: PointerActivity[] = []
  const clicks: ClickActivity[] = []
  const keyboard: KeyboardActivity[] = []
  let lastPoint: TracePoint | undefined

  for (const action of actions) {
    const point = readPointerPoint(action)
    if (point) {
      lastPoint = point
      pointer.push({ id: action.callId, point, time: action.startTime })
    }

    if (CLICK_METHODS.has(action.method.toLowerCase())) {
      const clickPoint = point || lastPoint
      if (clickPoint) {
        clicks.push({
          id: action.callId,
          point: clickPoint,
          time: action.startTime,
          expiresAt: action.startTime + 700,
        })
      }
    }

    const keyboardActivity = readKeyboardActivity(action)
    if (keyboardActivity) keyboard.push(keyboardActivity)
  }

  return { pointer, clicks, keyboard }
}

export function findPointerActivity(
  activities: PointerActivity[],
  time: number,
): PointerActivity | undefined {
  const index = findLastStartedIndex(activities, time)
  return index >= 0 ? activities[index] : undefined
}

export function findClickActivity(
  activities: ClickActivity[],
  time: number,
): ClickActivity | undefined {
  const index = findLastStartedIndex(activities, time)
  const activity = index >= 0 ? activities[index] : undefined
  return activity && time <= activity.expiresAt ? activity : undefined
}

export function findKeyboardActivity(
  activities: KeyboardActivity[],
  time: number,
): KeyboardActivity | undefined {
  const index = findLastStartedIndex(activities, time)
  const activity = index >= 0 ? activities[index] : undefined
  return activity && time <= activity.expiresAt ? activity : undefined
}

function readPointerPoint(action: TraceAction): TracePoint | undefined {
  if (action.point) return action.point
  if (action.method.toLowerCase() !== 'mousemove') return undefined
  const x = action.params.x
  const y = action.params.y
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined
}

function readKeyboardActivity(action: TraceAction): KeyboardActivity | undefined {
  const method = action.method.toLowerCase()
  const expiresAt = Math.max(action.endTime, action.startTime + 1_200)

  if (method === 'press' || method === 'keydown' || method === 'keyup') {
    const key = readString(action.params.key)
    if (!key) return undefined
    return {
      id: action.callId,
      kind: 'keys',
      keys: splitKeyCombination(key),
      time: action.startTime,
      expiresAt,
    }
  }

  if (method === 'fill') {
    return makeTextActivity(action, 'Fill', readString(action.params.value), expiresAt)
  }
  if (method === 'type' || method === 'presssequentially') {
    return makeTextActivity(action, 'Type', readString(action.params.text), expiresAt)
  }
  if (method === 'inserttext') {
    return makeTextActivity(action, 'Insert', readString(action.params.text), expiresAt)
  }

  return undefined
}

function makeTextActivity(
  action: TraceAction,
  label: string,
  text: string | undefined,
  expiresAt: number,
): KeyboardActivity | undefined {
  if (text === undefined) return undefined
  return {
    id: action.callId,
    kind: 'text',
    label,
    text,
    time: action.startTime,
    expiresAt,
  }
}

function splitKeyCombination(key: string): string[] {
  if (key === '+') return [key]
  const keys = key.split('+').filter(Boolean)
  return keys.length ? keys : [key]
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function findLastStartedIndex(
  activities: Array<{ time: number }>,
  time: number,
): number {
  let low = 0
  let high = activities.length - 1
  let result = -1

  while (low <= high) {
    const middle = (low + high) >> 1
    if (activities[middle]!.time <= time) {
      result = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return result
}
