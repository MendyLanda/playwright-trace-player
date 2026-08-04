import { strToU8, zipSync } from 'fflate'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

export function makeTraceFixture(): Uint8Array {
  const events = [
    {
      type: 'context-options',
      browserName: 'chromium',
      platform: 'linux',
      playwrightVersion: '1.50.0',
      wallTime: 123,
      options: { viewport: { width: 800, height: 600 } },
    },
    {
      type: 'before',
      callId: 'call@move',
      pageId: 'page@1',
      title: 'mouse.move(40, 60)',
      class: 'Mouse',
      method: 'mouseMove',
      params: { x: 40, y: 60 },
      startTime: 1_050,
    },
    { type: 'after', callId: 'call@move', endTime: 1_060 },
    {
      type: 'before',
      callId: 'call@1',
      pageId: 'page@1',
      title: 'locator.click("Save")',
      class: 'Locator',
      method: 'click',
      params: {},
      startTime: 1_100,
    },
    { type: 'input', callId: 'call@1', point: { x: 100, y: 200 } },
    { type: 'after', callId: 'call@1', endTime: 1_400 },
    {
      type: 'before',
      callId: 'call@key',
      pageId: 'page@1',
      title: 'keyboard.press("Control+ArrowDown")',
      class: 'Keyboard',
      method: 'press',
      params: { key: 'Control+ArrowDown' },
      startTime: 1_450,
    },
    { type: 'after', callId: 'call@key', endTime: 1_490 },
    {
      type: 'before',
      callId: 'call@fill',
      pageId: 'page@1',
      title: 'locator.fill("draft note")',
      class: 'Locator',
      method: 'fill',
      params: { value: 'draft note' },
      startTime: 1_600,
    },
    { type: 'after', callId: 'call@fill', endTime: 1_680 },
    { type: 'screencast-frame', pageId: 'page@1', sha1: 'one.jpeg', width: 800, height: 600, timestamp: 1_000 },
    { type: 'screencast-frame', pageId: 'page@1', sha1: 'two.jpeg', width: 800, height: 600, timestamp: 2_000 },
    { type: 'screencast-frame', pageId: 'page@popup', sha1: 'popup.jpeg', width: 400, height: 300, timestamp: 1_500 },
  ]

  return zipSync({
    'trace.trace': strToU8(events.map((event) => JSON.stringify(event)).join('\n')),
    'resources/one.jpeg': jpeg,
    'resources/two.jpeg': jpeg,
    'resources/popup.jpeg': jpeg,
    'resources/network-body.txt': strToU8('not needed'),
  })
}
