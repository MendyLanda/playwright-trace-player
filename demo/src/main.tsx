import { StrictMode, useState, type KeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { PlaywrightTracePlayer } from 'playwright-trace-player/react'
import '../../src/react/player.css'
import './site.css'

const code = `<PlaywrightTracePlayer
  traceUrl="https://example.com/trace.zip"
  className="w-80"
/>`

const traceBaseUrl = import.meta.env.DEV
  ? '/demo-traces'
  : 'https://files.mendylanda.com/playwright-trace-player/traces/v1'

const installCommands = {
  npm: 'npm install playwright-trace-player',
  pnpm: 'pnpm add playwright-trace-player',
  bun: 'bun add playwright-trace-player',
  yarn: 'yarn add playwright-trace-player',
} as const

type PackageManager = keyof typeof installCommands
const packageManagers = Object.keys(installCommands) as PackageManager[]

interface DemoTrace {
  id: string
  name: string
  note: string
  url: string
  size: string
  frames: string
  duration: string
  viewport: string
  browser: string
  source?: string
  license: string
}

const demoTraces: DemoTrace[] = [
  {
    id: 'vscode',
    name: 'VS Code',
    note: 'Electron canvas app',
    url: `${traceBaseUrl}/vscode-electron.zip?v=2`,
    size: '2.5 MB',
    frames: '77 frames',
    duration: '4.7 sec',
    viewport: '1024 × 768',
    browser: 'Electron',
    source: 'https://github.com/ruifigueira/vscode-test-playwright',
    license: 'Source · Apache-2.0',
  },
  {
    id: 'sample',
    name: 'Simple failure',
    note: 'Small project fixture',
    url: `${traceBaseUrl}/sample.zip?v=2`,
    size: '9 KB',
    frames: '6 frames',
    duration: '5.2 sec',
    viewport: '1280 × 720',
    browser: 'Chromium',
    license: 'Project fixture · MIT',
  },
  {
    id: 'desktop',
    name: 'Desktop',
    note: 'Playwright website',
    url: `${traceBaseUrl}/desktop-chromium.zip?v=2`,
    size: '1.2 MB',
    frames: '9 frames',
    duration: '1.0 sec',
    viewport: '1280 × 720',
    browser: 'Chromium',
    source: 'https://github.com/felixlohmeier/playwright-github-action',
    license: 'Source · MIT',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    note: 'Narrow phone viewport',
    url: `${traceBaseUrl}/mobile-chromium.zip?v=2`,
    size: '1.0 MB',
    frames: '5 frames',
    duration: '0.4 sec',
    viewport: '393 × 727',
    browser: 'Chromium',
    source: 'https://github.com/felixlohmeier/playwright-github-action',
    license: 'Source · MIT',
  },
  {
    id: 'robot',
    name: 'Robot run',
    note: 'Large-trace stress test',
    url: `${traceBaseUrl}/robot-navigation.zip?v=2`,
    size: '127.2 MB',
    frames: '4,250 frames',
    duration: '1 min 13 sec',
    viewport: '1280 × 720',
    browser: 'Chromium',
    source: 'https://github.com/kzxp/browser-automation-challenges-trace-archive',
    license: 'Source · No license',
  },
  {
    id: 'failed-app',
    name: 'Failed app',
    note: 'Long failed workflow',
    url: `${traceBaseUrl}/benzi-failed.zip?v=2`,
    size: '14.9 MB',
    frames: '541 frames',
    duration: '2 min 58 sec',
    viewport: '1280 × 720',
    browser: 'Chromium',
    source: 'https://github.com/f4br1z10/Benzi',
    license: 'Source · No license',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    note: 'Date-picker challenge',
    url: `${traceBaseUrl}/calendar-picker.zip?v=2`,
    size: '35.7 MB',
    frames: '1,113 frames',
    duration: '38.4 sec',
    viewport: '1280 × 720',
    browser: 'Chromium',
    source: 'https://github.com/kzxp/browser-automation-challenges-trace-archive',
    license: 'Source · No license',
  },
  {
    id: 'math',
    name: 'Math solver',
    note: 'Dense interaction run',
    url: `${traceBaseUrl}/math-questions.zip?v=2`,
    size: '38.1 MB',
    frames: '2,730 frames',
    duration: '1 min 1 sec',
    viewport: '1280 × 720',
    browser: 'Chromium',
    source: 'https://github.com/kzxp/browser-automation-challenges-trace-archive',
    license: 'Source · No license',
  },
]

const query = new URLSearchParams(window.location.search)
const externalTraceUrl = query.get('trace')
const requestedSample = query.get('sample')
const customTrace: DemoTrace | undefined = externalTraceUrl
  ? {
      id: 'url',
      name: 'URL trace',
      note: 'Loaded from the query string',
      url: externalTraceUrl,
      size: 'Remote',
      frames: 'Trace metadata',
      duration: 'Read on load',
      viewport: 'From trace',
      browser: 'From trace',
      license: 'User-provided URL',
    }
  : undefined
const availableTraces = customTrace ? [customTrace, ...demoTraces] : demoTraces
const initialTraceId = customTrace
  ? customTrace.id
  : demoTraces.some((trace) => trace.id === requestedSample)
    ? requestedSample!
    : demoTraces[0]!.id

export function App() {
  const [selectedTraceId, setSelectedTraceId] = useState(initialTraceId)
  const [packageManager, setPackageManager] = useState<PackageManager>('npm')
  const [copied, setCopied] = useState(false)
  const selectedTrace =
    availableTraces.find((trace) => trace.id === selectedTraceId) || availableTraces[0]!

  const selectTrace = (trace: DemoTrace, focus = false) => {
    setSelectedTraceId(trace.id)
    if (trace.id !== 'url') {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('trace')
      if (trace.id === demoTraces[0]!.id) nextUrl.searchParams.delete('sample')
      else nextUrl.searchParams.set('sample', trace.id)
      window.history.replaceState({}, '', nextUrl)
    }
    if (focus) {
      requestAnimationFrame(() => document.getElementById(`trace-tab-${trace.id}`)?.focus())
    }
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = availableTraces.findIndex((trace) => trace.id === selectedTrace.id)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % availableTraces.length
    else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + availableTraces.length) % availableTraces.length
    } else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = availableTraces.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    selectTrace(availableTraces[nextIndex]!, true)
  }

  const selectPackageManager = (nextPackageManager: PackageManager, focus = false) => {
    setPackageManager(nextPackageManager)
    setCopied(false)
    if (focus) {
      requestAnimationFrame(() => {
        document.getElementById(`install-tab-${nextPackageManager}`)?.focus()
      })
    }
  }

  const handleInstallTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = packageManagers.indexOf(packageManager)
    let nextIndex: number | undefined
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % packageManagers.length
    else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + packageManagers.length) % packageManagers.length
    } else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = packageManagers.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    selectPackageManager(packageManagers[nextIndex]!, true)
  }

  const copyInstallCommand = async () => {
    await navigator.clipboard.writeText(installCommands[packageManager])
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <main>
      <nav className="nav-shell">
        <a className="wordmark" href="#top" aria-label="Trace Player home">
          trace<span>/</span>player
        </a>
        <div className="nav-links">
          <a href="#install">Install</a>
          <a href="https://github.com/MendyLanda/playwright-trace-player">GitHub ↗</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="overline">PLAYWRIGHT / BROWSER / REPLAY</p>
          <h1>See the failure.<br />Skip the download.</h1>
          <p className="lede">
            Turn a Playwright trace URL into a video-like replay inside your product. No server, ffmpeg, or video export.
          </p>
          <div className="proof">
            <span>MIT licensed</span>
            <span>Framework-free core</span>
            <span>React ready</span>
          </div>
        </div>
        <div className="index-card" aria-hidden="true">
          <span>01</span>
          <strong>TRACE.ZIP</strong>
          <i>↓</i>
          <span>02</span>
          <strong>BROWSER REPLAY</strong>
        </div>
      </section>

      <section className="demo-section" aria-labelledby="demo-title">
        <div className="section-label">
          <span>LIVE TRACE RACK</span>
          <span id="demo-title">Eight traces, from 9 KB to 127 MB</span>
        </div>

        <div
          className="trace-tabs"
          role="tablist"
          aria-label="Demo traces"
          onKeyDown={handleTabKeyDown}
        >
          {availableTraces.map((trace, index) => {
            const selected = trace.id === selectedTrace.id
            return (
              <button
                className={`trace-tab ${selected ? 'trace-tab--active' : ''}`}
                id={`trace-tab-${trace.id}`}
                key={trace.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="trace-demo-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTrace(trace)}
              >
                <span className="trace-tab__index">{String(index + 1).padStart(2, '0')}</span>
                <strong>{trace.name}</strong>
                <small>{trace.size} / {trace.duration}</small>
              </button>
            )
          })}
        </div>

        <div
          className="trace-panel"
          id="trace-demo-panel"
          role="tabpanel"
          aria-labelledby={`trace-tab-${selectedTrace.id}`}
        >
          <div className="trace-panel__head">
            <div>
              <p className="trace-kicker">NOW PLAYING / {selectedTrace.note}</p>
              <h2>{selectedTrace.name}</h2>
            </div>
            <dl className="trace-facts">
              <div><dt>Weight</dt><dd>{selectedTrace.size}</dd></div>
              <div><dt>Timeline</dt><dd>{selectedTrace.frames} · {selectedTrace.duration}</dd></div>
              <div><dt>Surface</dt><dd>{selectedTrace.browser} · {selectedTrace.viewport}</dd></div>
              <div>
                <dt>Rights</dt>
                <dd>
                  {selectedTrace.source ? (
                    <a href={selectedTrace.source} target="_blank" rel="noreferrer">
                      {selectedTrace.license} ↗
                    </a>
                  ) : selectedTrace.license}
                </dd>
              </div>
            </dl>
          </div>
          <div className="player-frame">
            <PlaywrightTracePlayer key={selectedTrace.id} traceUrl={selectedTrace.url} />
          </div>
        </div>
      </section>

      <section className="install" id="install">
        <div>
          <p className="overline">TWO IMPORTS. ONE PROP.</p>
          <h2>Drop it where the failure belongs.</h2>
          <p>The core only reads the trace screenshots. Your trace stays in the browser.</p>
        </div>
        <div className="code-card install-card">
          <div
            className="install-tabs"
            role="tablist"
            aria-label="Package manager"
            onKeyDown={handleInstallTabKeyDown}
          >
            {packageManagers.map((manager) => (
              <button
                className={`install-tab ${manager === packageManager ? 'install-tab--active' : ''}`}
                id={`install-tab-${manager}`}
                key={manager}
                type="button"
                role="tab"
                aria-selected={manager === packageManager}
                aria-controls="install-command"
                tabIndex={manager === packageManager ? 0 : -1}
                onClick={() => selectPackageManager(manager)}
              >
                {manager}
              </button>
            ))}
          </div>
          <div
            className="install-command"
            id="install-command"
            role="tabpanel"
            aria-labelledby={`install-tab-${packageManager}`}
          >
            <code>{installCommands[packageManager]}</code>
            <button type="button" onClick={copyInstallCommand} aria-label="Copy install command">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="code-head"><span>component.tsx</span><span>TSX</span></div>
          <pre><code>{`import { PlaywrightTracePlayer } from
  'playwright-trace-player/react'
import 'playwright-trace-player/styles.css'

${code}`}</code></pre>
        </div>
      </section>

      <footer>
        <span>PLAYWRIGHT TRACE PLAYER</span>
        <span>build with love by Mendy Landa</span>
      </footer>
    </main>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode><App /></StrictMode>,
  )
}
