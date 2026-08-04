import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'

interface DemoFrame {
  time: number
  file: string
  search?: string
  selected?: boolean
  running?: boolean
  failed?: boolean
}

const frames: DemoFrame[] = [
  { time: 1_000, file: 'frame-0.svg' },
  { time: 1_900, file: 'frame-1.svg', search: 'Invoice' },
  { time: 2_800, file: 'frame-2.svg', search: 'Invoice', selected: true },
  { time: 3_900, file: 'frame-3.svg', search: 'Invoice', selected: true, running: true },
  { time: 5_000, file: 'frame-4.svg', search: 'Invoice', selected: true, failed: true },
  { time: 6_200, file: 'frame-5.svg', search: 'Invoice', selected: true, failed: true },
]

const events = [
  {
    type: 'context-options',
    browserName: 'chromium',
    platform: 'macOS',
    playwrightVersion: '1.62.1',
    wallTime: 1_775_204_400_000,
    options: { viewport: { width: 1280, height: 720 } },
  },
  action('call@1', 'page.goto("https://ops.example.test/runs")', 'goto', 1_020, 1_620),
  action('call@2', 'locator.fill("Invoice")', 'fill', 1_680, 2_120, { x: 936, y: 128 }),
  action('call@3', 'locator.click("Invoice sync")', 'click', 2_520, 2_940, { x: 407, y: 289 }),
  action('call@4', 'locator.click("Run now")', 'click', 3_420, 3_980, { x: 1090, y: 180 }),
  action(
    'call@5',
    'expect(locator("Status")).toHaveText("Complete")',
    'toHaveText',
    4_300,
    5_760,
    undefined,
    'Expected status "Complete", received "Failed"',
  ),
  ...frames.map((frame) => ({
    type: 'screencast-frame',
    pageId: 'page@demo',
    sha1: frame.file,
    width: 1280,
    height: 720,
    timestamp: frame.time,
  })),
].flat()

const output = resolve('demo/public/sample-trace.zip')
mkdirSync(dirname(output), { recursive: true })

const entries: Record<string, Uint8Array> = {
  'trace.trace': strToU8(events.map((event) => JSON.stringify(event)).join('\n')),
}

for (const [index, frame] of frames.entries()) {
  entries[`resources/${frame.file}`] = strToU8(makeFrame(frame, index))
}

writeFileSync(output, zipSync(entries, { level: 6 }))
console.log(`Wrote ${output}`)

function action(
  callId: string,
  title: string,
  method: string,
  startTime: number,
  endTime: number,
  point?: { x: number; y: number },
  error?: string,
) {
  return [
    {
      type: 'before',
      callId,
      pageId: 'page@demo',
      title,
      class: method === 'goto' ? 'Page' : 'Locator',
      method,
      params: {},
      startTime,
    },
    ...(point ? [{ type: 'input', callId, point }] : []),
    {
      type: 'after',
      callId,
      endTime,
      ...(error ? { error: { message: error } } : {}),
    },
  ]
}

function makeFrame(frame: DemoFrame, index: number): string {
  const rows = [
    ['Invoice sync', 'Every 15 min', frame.failed ? 'FAILED' : frame.running ? 'RUNNING' : 'HEALTHY', '2m ago'],
    ['CRM enrichment', 'Every hour', 'HEALTHY', '18m ago'],
    ['Lead routing', 'On webhook', 'HEALTHY', '31m ago'],
    ['Usage digest', 'Daily at 08:00', 'PAUSED', 'Yesterday'],
  ]
  const tableRows = rows
    .map(([name, schedule, status, lastRun], rowIndex) => {
      const y = 260 + rowIndex * 68
      const visible = !frame.search || name.toLowerCase().includes(frame.search.toLowerCase())
      if (!visible) return ''
      const statusColor = status === 'FAILED' ? '#ef604f' : status === 'RUNNING' ? '#d6f450' : status === 'PAUSED' ? '#807e76' : '#68d29b'
      return `
        <g opacity="${visible ? 1 : 0.25}">
          <rect x="88" y="${y - 30}" width="1104" height="58" rx="7" fill="${rowIndex === 0 && frame.selected ? '#20251e' : '#191b18'}" stroke="${rowIndex === 0 && frame.selected ? '#d6f450' : '#292c27'}"/>
          <circle cx="112" cy="${y}" r="4" fill="${statusColor}"/>
          <text x="130" y="${y + 5}" class="row-title">${name}</text>
          <text x="485" y="${y + 5}" class="cell">${schedule}</text>
          <rect x="746" y="${y - 12}" width="90" height="24" rx="12" fill="${statusColor}" fill-opacity=".12"/>
          <text x="791" y="${y + 4}" text-anchor="middle" class="status" fill="${statusColor}">${status}</text>
          <text x="1022" y="${y + 5}" class="cell">${lastRun}</text>
          <path d="M1150 ${y - 4}l5 5 5-5" fill="none" stroke="#777b71" stroke-width="1.5"/>
        </g>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <style>
      text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.brand{font-family:Georgia,serif;font-size:24px;font-weight:700;fill:#f2f0e8}.nav{font-size:12px;fill:#777b71}.label{font-size:10px;font-weight:700;letter-spacing:1.5px;fill:#777b71}.title{font-family:Georgia,serif;font-size:31px;fill:#f2f0e8}.row-title{font-size:13px;font-weight:700;fill:#e9e7df}.cell{font-size:11px;fill:#8e9287}.status{font-size:9px;font-weight:800;letter-spacing:.7px}.small{font-size:10px;fill:#8e9287}
    </style>
    <rect width="1280" height="720" fill="#10120f"/>
    <rect width="1280" height="62" fill="#171915"/>
    <path d="M0 62h1280" stroke="#2b2e28"/>
    <text x="42" y="39" class="brand">relay<tspan fill="#d6f450">/</tspan>ops</text>
    <text x="210" y="37" class="nav" fill="#f2f0e8">AUTOMATIONS</text><text x="335" y="37" class="nav">RUNS</text><text x="401" y="37" class="nav">ALERTS</text>
    <circle cx="1216" cy="31" r="15" fill="#282b25"/><text x="1216" y="35" text-anchor="middle" class="small" fill="#d6f450">ML</text>
    <text x="88" y="112" class="label">WORKSPACE / PRODUCTION</text>
    <text x="88" y="153" class="title">Automations</text>
    <text x="88" y="178" class="small">Monitor and replay the jobs that keep your data moving.</text>
    <rect x="898" y="103" width="294" height="42" rx="5" fill="#191b18" stroke="#31352e"/>
    <path d="M918 121a6 6 0 1 0 0 12 6 6 0 0 0 0-12m4 10 5 5" fill="none" stroke="#777b71" stroke-width="1.5"/>
    <text x="942" y="130" font-size="11" fill="${frame.search ? '#f2f0e8' : '#666a61'}">${frame.search || 'Search automations'}</text>
    <text x="88" y="222" class="label">NAME</text><text x="485" y="222" class="label">SCHEDULE</text><text x="746" y="222" class="label">STATUS</text><text x="1022" y="222" class="label">LAST RUN</text>
    ${tableRows}
    ${frame.selected ? detailPanel(frame) : ''}
    <text x="1192" y="688" text-anchor="end" class="small">FRAME ${String(index + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}</text>
  </svg>`
}

function detailPanel(frame: DemoFrame): string {
  const status = frame.failed ? 'FAILED' : frame.running ? 'RUNNING' : 'READY'
  const color = frame.failed ? '#ef604f' : frame.running ? '#d6f450' : '#68d29b'
  return `
    <rect x="690" y="160" width="502" height="470" rx="10" fill="#151713" stroke="#353930"/>
    <rect x="690" y="160" width="502" height="58" rx="10" fill="#1b1e19"/>
    <text x="718" y="195" class="row-title">Invoice sync / Run details</text>
    <text x="718" y="251" class="label">CURRENT STATUS</text>
    <circle cx="724" cy="280" r="5" fill="${color}"/><text x="741" y="284" class="status" fill="${color}">${status}</text>
    <rect x="1017" y="238" width="145" height="42" rx="4" fill="#d6f450"/>
    <text x="1089" y="264" text-anchor="middle" font-size="11" font-weight="800" fill="#11120f">RUN NOW</text>
    <text x="718" y="329" class="label">LATEST EVENTS</text>
    <circle cx="725" cy="363" r="3" fill="#68d29b"/><text x="742" y="367" class="small" fill="#d9d8d0">Opened billing workspace</text>
    <path d="M725 372v25" stroke="#34372f"/>
    <circle cx="725" cy="405" r="3" fill="#68d29b"/><text x="742" y="409" class="small" fill="#d9d8d0">Found 24 pending invoices</text>
    <path d="M725 414v25" stroke="#34372f"/>
    <circle cx="725" cy="447" r="3" fill="${frame.failed ? '#ef604f' : frame.running ? '#d6f450' : '#55594f'}"/>
    <text x="742" y="451" class="small" fill="#d9d8d0">${frame.failed ? 'Payment provider returned HTTP 429' : frame.running ? 'Pushing records to payment provider…' : 'Waiting to run'}</text>
    ${frame.failed ? '<rect x="718" y="485" width="444" height="94" rx="5" fill="#241714" stroke="#5a2923"/><text x="738" y="514" class="label" fill="#ef604f">AUTOMATION FAILED</text><text x="738" y="541" class="small" fill="#e8b8b1">Rate limit exceeded. Retry after 60 seconds.</text><text x="738" y="563" class="small">error_code: provider_rate_limited</text>' : ''}
  `
}
