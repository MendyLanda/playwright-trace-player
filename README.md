# Playwright Trace Player

Replay any Playwright trace as a video-like view in the browser. Pass a trace URL to the React component to review or share any run.

The package reads the screencast frames that Playwright already stores in `trace.zip`. It needs no server process, ffmpeg, video export, or Playwright runtime. It keeps screenshots compressed until playback reaches them and holds only a small set of image URLs, so large traces do not expand all at once.

In browsers, trace download, ZIP parsing, and screenshot inflation run in a module Worker automatically. React users do not need to create or manage it. Apps with a strict Content Security Policy must allow workers from the app origin with `worker-src 'self'`.

## Install

```sh
npm install playwright-trace-player
```

## React

```tsx
import { PlaywrightTracePlayer } from 'playwright-trace-player/react'
import 'playwright-trace-player/styles.css'

export function TraceReplay({ traceUrl }: { traceUrl: string }) {
  return (
    <PlaywrightTracePlayer
      traceUrl={traceUrl}
      className="w-80"
    />
  )
}
```

The player has play, pause, seek, speed, keyboard, and full-screen controls. Its display settings can show Playwright commands, recorded cursor movement, click markers, keyboard input, browser details, and the trace result.

### Props

| Prop | Type | Default | Use |
| --- | --- | --- | --- |
| `traceUrl` | `string` | — | URL of a Playwright `trace.zip` |
| `trace` | `URL \| File \| Blob \| ArrayBuffer \| Uint8Array` | — | Direct trace source; takes priority over `traceUrl` |
| `pageId` | `string` | page with most frames | Select a page when a trace has popups |
| `autoPlay` | `boolean` | `false` | Start after the trace loads |
| `loop` | `boolean` | `false` | Start again at the end |
| `playbackRate` | `number` | `1` | Initial speed |
| `showControls` | `boolean` | `true` | Show the control bar |
| `defaultSettings` | `Partial<PlaywrightTracePlayerSettings>` | all visible | Set the initial choices in the display-settings popover |
| `className` | `string` | — | Apply CSS, Tailwind utilities, or design-system classes |
| `style` | `PlaywrightTracePlayerStyle` | — | Apply inline CSS and typed player theme tokens |
| `requestInit` | `RequestInit` | — | Send headers or credentials with the trace request |
| `onLoad` | `(trace) => void` | — | Read parsed trace data |
| `onError` | `(error) => void` | — | Handle a load or parse error |
| `onTimeUpdate` | `(seconds) => void` | — | Follow playback time |

### Styling

The player exposes four main CSS tokens. Map them to your app's design tokens once; every player will follow the active theme:

```css
[data-playwright-trace-player] {
  --ptp-background: var(--app-background);
  --ptp-accent: var(--app-accent);
  --ptp-radius: var(--app-radius);
  --ptp-font-family: var(--app-font);
}
```

For a Tailwind v4 theme with semantic colors, put the mapping in your global CSS:

```css
@layer components {
  [data-playwright-trace-player] {
    --ptp-background: var(--color-background);
    --ptp-foreground: var(--color-foreground);
    --ptp-accent: var(--color-primary);
    --ptp-accent-foreground: var(--color-primary-foreground);
    --ptp-radius: var(--radius-lg);
    --ptp-font-family: var(--font-sans);
  }
}
```

Then use normal Tailwind utilities for size and layout:

```tsx
<PlaywrightTracePlayer
  traceUrl={traceUrl}
  className="w-80 max-w-full"
/>
```

Current shadcn themes can map their base tokens directly:

```css
@layer components {
  [data-playwright-trace-player] {
    --ptp-background: var(--background);
    --ptp-foreground: var(--foreground);
    --ptp-accent: var(--primary);
    --ptp-accent-foreground: var(--primary-foreground);
    --ptp-radius: var(--radius);
    --ptp-font-family: inherit;
  }
}
```

Player tokens inherit, so you can also set them on a theme wrapper. Dark-mode and tenant themes then work without changing the player. If your system uses different token names, change only the mapping.

For more control, set `--ptp-muted`, `--ptp-danger`, `--ptp-border-color`, `--ptp-viewport-background`, or `--ptp-max-viewport-height`. The typed `style` prop remains available for one-off values, while `className` accepts normal CSS and layout utilities.

The ref exposes `play()`, `pause()`, and `seek(seconds)`.

The keyboard and pointer settings use three display levels:

```tsx
<PlaywrightTracePlayer
  traceUrl={traceUrl}
  defaultSettings={{
    keyboardInput: 'markers-only',
    pointer: 'full',
    showPlaywrightCommands: false,
  }}
/>
```

- `keyboardInput: 'full'` shows keys such as `Tab`, `Enter`, and the arrow keys, plus typed values when the trace contains them. Use `'markers-only'` to show that keyboard input happened while redacting its value from both the key overlay and command caption, or `'hidden'` to remove it.
- `pointer: 'full'` shows recorded movement and click feedback. Use `'markers-only'` for click feedback alone, or `'hidden'` to remove both.

The other settings are `showTraceResult`, `showBrowserName`, and `showPlaywrightCommands`. Each is a boolean. The trace result is hidden by default; when shown, it reports whether the selected page timeline contains recorded action errors. Cursor movement is only as detailed as the trace: explicit mouse moves provide a path, while many locator actions provide only a click point.

## Framework-free core

Use the parser without React and bring your own view:

```ts
import { loadTrace, selectTraceTimeline } from 'playwright-trace-player'

const trace = await loadTrace('https://example.com/trace.zip')
const timeline = selectTraceTimeline(trace)

console.log(timeline.frames, timeline.actions, timeline.duration)
const firstScreenshot = await trace.readFrame(timeline.frames[0])
trace.dispose()
```

`loadTrace` accepts the same URL, file, blob, and byte sources as the React component. In browsers it uses the same automatic Worker. It can report download progress and accepts an abort signal. Frame data loads on demand. Call `dispose()` when a framework-free player no longer needs the trace. The React component does this for you.

```ts
const trace = await loadTrace(traceUrl, {
  signal: controller.signal,
  requestInit: { credentials: 'include' },
  onProgress: ({ phase, loadedBytes, totalBytes }) => {
    console.log(phase, loadedBytes, totalBytes)
  },
})
```

## Record usable traces

Playwright must save screenshots in the trace. The test runner does this for its normal trace modes. Use `on` to record every run, or choose another mode that fits your retention policy:

```ts
// playwright.config.ts
export default defineConfig({
  use: {
    trace: 'on',
  },
})
```

If you use the tracing API yourself, turn screenshots on:

```ts
await context.tracing.start({ screenshots: true, snapshots: true })
// ...run the automation...
await context.tracing.stop({ path: 'trace.zip' })
```

## Serving traces

The browser must be able to fetch the full ZIP. If the trace sits on another host, that host must allow your app origin with CORS. Signed object-store URLs work well.

```http
Access-Control-Allow-Origin: https://your-app.example
Content-Type: application/zip
```

Large traces use more browser memory because the player unzips their screencast images locally. Keep trace retention and size limits in mind.

## What this is not

This package replays screenshots. It does not render an MP4, rebuild an interactive DOM, or show the full network and source panels from Playwright Trace Viewer. It aims to answer one quick question: “What happened during this run?”

## Credit

This project takes inspiration from [playwright-recast](https://github.com/ThePatriczek/playwright-recast), an MIT-licensed tool for turning Playwright traces into videos.

## License

MIT
