// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import type { ParsedTrace } from '../src/core'
import { PlaywrightTracePlayer } from '../src/react'
import { makeTraceFixture } from './fixture'

const playerCss = readFileSync('src/react/player.css', 'utf8')

describe('PlaywrightTracePlayer', () => {
  it('loads a trace and exposes video-like controls', async () => {
    const onLoad = vi.fn()
    const { container } = render(
      <PlaywrightTracePlayer trace={makeTraceFixture()} onLoad={onLoad} />,
    )

    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Trace position' })).toBeInTheDocument()
    expect(screen.getByText('CHROMIUM')).toBeInTheDocument()
    expect(screen.queryByText('No recorded errors')).not.toBeInTheDocument()
    expect(container.querySelector('.ptp')).toHaveAttribute('data-playwright-trace-player')
    expect(
      within(container.querySelector('.ptp__viewport') as HTMLElement).getByText('CHROMIUM'),
    ).toBeInTheDocument()
    expect(onLoad).toHaveBeenCalledOnce()
  })

  it('configures overlays from a compact settings popover', async () => {
    const user = userEvent.setup()
    const { container } = render(<PlaywrightTracePlayer trace={makeTraceFixture()} />)

    await screen.findByRole('button', { name: 'Play' })
    fireEvent.change(screen.getByRole('slider', { name: 'Trace position' }), {
      target: { value: '200' },
    })

    expect(screen.getByText('CHROMIUM')).toBeInTheDocument()
    expect(screen.getByText('click("Save")')).toBeInTheDocument()
    expect(container.querySelector('.ptp__pointer')).toBeInTheDocument()
    expect(container.querySelector('.ptp__click')).toBeInTheDocument()

    const settingsButton = screen.getByRole('button', { name: 'Display settings' })
    expect(container.querySelector('.ptp__controls')).toContainElement(settingsButton)
    expect(settingsButton).toHaveAttribute('aria-expanded', 'false')
    await user.click(settingsButton)

    const settingsPanel = screen.getByRole('dialog', { name: 'Display settings' })
    expect(settingsButton).toHaveAttribute('aria-expanded', 'true')
    const pointerModes = within(settingsPanel).getByRole('radiogroup', {
      name: 'Pointer display',
    })
    const keyboardModes = within(settingsPanel).getByRole('radiogroup', {
      name: 'Keyboard input display',
    })
    expect(within(pointerModes).getByRole('radio', { name: 'Full' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    const browserSwitch = within(settingsPanel).getByRole('switch', { name: 'Browser name' })
    const commandsSwitch = within(settingsPanel).getByRole('switch', {
      name: 'Playwright commands',
    })
    const resultSwitch = within(settingsPanel).getByRole('switch', { name: 'Trace result' })
    expect(resultSwitch).toHaveAttribute('aria-checked', 'false')

    await user.click(resultSwitch)
    expect(resultSwitch).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('No recorded errors')).toBeInTheDocument()

    await user.click(browserSwitch)
    await user.click(commandsSwitch)
    expect(screen.queryByText('CHROMIUM')).not.toBeInTheDocument()
    expect(screen.queryByText('click("Save")')).not.toBeInTheDocument()

    await user.click(within(pointerModes).getByRole('radio', { name: 'Clicks' }))
    expect(container.querySelector('.ptp__pointer')).not.toBeInTheDocument()
    expect(container.querySelector('.ptp__click')).toBeInTheDocument()

    await user.click(commandsSwitch)
    fireEvent.change(screen.getByRole('slider', { name: 'Trace position' }), {
      target: { value: '500' },
    })
    expect(screen.getByLabelText('Keys: Control plus ArrowDown')).toBeInTheDocument()
    expect(screen.getByLabelText('Arrow Down')).toHaveTextContent('↓')

    fireEvent.change(screen.getByRole('slider', { name: 'Trace position' }), {
      target: { value: '700' },
    })
    expect(screen.getByLabelText('Fill: draft note')).toBeInTheDocument()

    await user.click(within(keyboardModes).getByRole('radio', { name: 'Markers' }))
    expect(container.querySelector('.ptp__keyboard--marker')).toBeInTheDocument()
    expect(screen.queryByLabelText('Arrow Down')).not.toBeInTheDocument()
    expect(screen.queryByText('fill("draft note")')).not.toBeInTheDocument()
    expect(screen.getByText('fill(•••)')).toBeInTheDocument()

    await user.click(within(keyboardModes).getByRole('radio', { name: 'Hidden' }))
    expect(container.querySelector('.ptp__keyboard')).not.toBeInTheDocument()

    await user.click(within(settingsPanel).getByRole('button', { name: 'Reset' }))
    expect(within(keyboardModes).getByRole('radio', { name: 'Full' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByText('CHROMIUM')).toBeInTheDocument()
    expect(screen.getByLabelText('Fill: draft note')).toBeInTheDocument()

    fireEvent.keyDown(settingsPanel, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Display settings' })).not.toBeInTheDocument()
    expect(settingsButton).toHaveFocus()
  })

  it('uses caller-provided default display modes', async () => {
    const { container } = render(
      <PlaywrightTracePlayer
        trace={makeTraceFixture()}
        defaultSettings={{
          keyboardInput: 'hidden',
          pointer: 'markers-only',
          showBrowserName: false,
          showPlaywrightCommands: false,
        }}
      />,
    )

    await screen.findByRole('button', { name: 'Play' })
    fireEvent.change(screen.getByRole('slider', { name: 'Trace position' }), {
      target: { value: '200' },
    })

    expect(screen.queryByText('CHROMIUM')).not.toBeInTheDocument()
    expect(screen.queryByText('click("Save")')).not.toBeInTheDocument()
    expect(container.querySelector('.ptp__pointer')).not.toBeInTheDocument()
    expect(container.querySelector('.ptp__click')).toBeInTheDocument()
  })

  it('offers a compact playback speed menu', async () => {
    const user = userEvent.setup()
    render(<PlaywrightTracePlayer trace={makeTraceFixture()} />)

    await screen.findByRole('button', { name: 'Play' })
    const speedControl = screen.getByRole('button', { name: 'Playback speed 1 times' })
    await user.click(speedControl)

    const speedMenu = screen.getByRole('menu', { name: 'Playback speed options' })
    expect(speedMenu).toBeInTheDocument()
    await user.click(within(speedMenu).getByRole('menuitemradio', { name: '0.25×' }))

    expect(screen.getByRole('button', { name: 'Playback speed 0.25 times' })).toHaveTextContent(
      '0.25×',
    )
    expect(screen.queryByRole('menu', { name: 'Playback speed options' })).not.toBeInTheDocument()
  })

  it('keeps playback and settings labels compact in the real CSS cascade', async () => {
    const style = document.createElement('style')
    style.textContent = playerCss
    document.head.append(style)

    try {
      const user = userEvent.setup()
      render(<PlaywrightTracePlayer trace={makeTraceFixture()} />)

      await screen.findByRole('button', { name: 'Play' })
      const speedControl = screen.getByRole('button', { name: 'Playback speed 1 times' })
      expect(getComputedStyle(speedControl).fontSize).toBe('10px')

      await user.click(screen.getByRole('button', { name: 'Display settings' }))
      const settingsPanel = screen.getByRole('dialog', { name: 'Display settings' })
      const keyboardModes = within(settingsPanel).getByRole('radiogroup', {
        name: 'Keyboard input display',
      })
      expect(
        getComputedStyle(within(keyboardModes).getByRole('radio', { name: 'Full' })).fontSize,
      ).toBe('9px')
      expect(
        getComputedStyle(within(settingsPanel).getByRole('switch', { name: 'Trace result' }))
          .fontSize,
      ).toBe('9px')
    } finally {
      style.remove()
    }
  })

  it('accepts typed theme tokens on the root element', async () => {
    const { container } = render(
      <PlaywrightTracePlayer
        trace={makeTraceFixture()}
        style={{
          '--ptp-background': '#020617',
          '--ptp-accent': '#38bdf8',
          '--ptp-radius': '8px',
          '--ptp-font-family': 'Inter, sans-serif',
        }}
      />,
    )

    await screen.findByRole('button', { name: 'Play' })
    const player = container.querySelector('.ptp') as HTMLElement
    expect(player.style.getPropertyValue('--ptp-background')).toBe('#020617')
    expect(player.style.getPropertyValue('--ptp-accent')).toBe('#38bdf8')
    expect(player.style.getPropertyValue('--ptp-radius')).toBe('8px')
    expect(player.style.getPropertyValue('--ptp-font-family')).toBe('Inter, sans-serif')
  })

  it('lets a design-system class override theme defaults regardless of CSS order', async () => {
    const style = document.createElement('style')
    style.textContent = `.trace-theme {
      --ptp-background: #020617;
      --ptp-accent: #38bdf8;
      --ptp-radius: 8px;
      --ptp-font-family: Inter, sans-serif;
    }\n${playerCss}`
    document.head.append(style)

    try {
      const { container } = render(
        <PlaywrightTracePlayer trace={makeTraceFixture()} className="trace-theme" />,
      )

      await screen.findByRole('button', { name: 'Play' })
      const player = container.querySelector('.ptp') as HTMLElement
      const computed = getComputedStyle(player)
      expect(computed.getPropertyValue('--ptp-background')).toBe('#020617')
      expect(computed.getPropertyValue('--ptp-accent')).toBe('#38bdf8')
      expect(computed.getPropertyValue('--ptp-radius')).toBe('8px')
      expect(computed.getPropertyValue('--ptp-font-family').replaceAll(' ', '')).toBe(
        'Inter,sans-serif',
      )
    } finally {
      style.remove()
    }
  })

  it('inherits player tokens from an app theme scope', async () => {
    const style = document.createElement('style')
    style.textContent = `.app-theme {
      --ptp-background: #020617;
      --ptp-accent: #38bdf8;
      --ptp-radius: 8px;
      --ptp-font-family: Inter, sans-serif;
    }\n${playerCss}`
    document.head.append(style)

    try {
      const { container } = render(
        <div className="app-theme">
          <PlaywrightTracePlayer trace={makeTraceFixture()} />
        </div>,
      )

      await screen.findByRole('button', { name: 'Play' })
      const computed = getComputedStyle(container.querySelector('.ptp') as HTMLElement)
      expect(computed.getPropertyValue('--ptp-background')).toBe('#020617')
      expect(computed.getPropertyValue('--ptp-accent')).toBe('#38bdf8')
      expect(computed.getPropertyValue('--ptp-radius')).toBe('8px')
      expect(computed.getPropertyValue('--ptp-font-family').replaceAll(' ', '')).toBe(
        'Inter,sans-serif',
      )
    } finally {
      style.remove()
    }
  })

  it('plays and pauses from the main control', async () => {
    const user = userEvent.setup()
    render(<PlaywrightTracePlayer trace={makeTraceFixture()} />)

    const play = await screen.findByRole('button', { name: 'Play' })
    await user.click(play)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('disposes its trace when it unmounts', async () => {
    let loadedTrace: ParsedTrace | undefined
    const { unmount } = render(
      <PlaywrightTracePlayer
        trace={makeTraceFixture()}
        onLoad={(trace) => {
          loadedTrace = trace
        }}
      />,
    )

    await screen.findByRole('button', { name: 'Play' })
    expect(loadedTrace).toBeDefined()
    unmount()
    await expect(loadedTrace!.readFrame(loadedTrace!.frames[0]!)).rejects.toMatchObject({
      code: 'TRACE_DISPOSED',
    })
  })

  it('shows a useful error for a trace without frames', async () => {
    const invalid = zipSync({
      'trace.trace': strToU8('{"type":"context-options"}\n'),
    })
    render(<PlaywrightTracePlayer trace={invalid} />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no screencast frames'))
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('reports an unknown page without crashing', async () => {
    const onError = vi.fn()
    render(
      <PlaywrightTracePlayer
        trace={makeTraceFixture()}
        pageId="missing-page"
        onError={onError}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'missing-page',
    )
    expect(onError).toHaveBeenCalledOnce()
  })

  it('creates URLs for only the current and nearby frames', async () => {
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((() => `blob:nearby-${createUrl.mock.calls.length}`) as typeof URL.createObjectURL)
    const events = Array.from({ length: 50 }, (_, index) => ({
      type: 'screencast-frame',
      pageId: 'page@many',
      sha1: `frame-${index}.jpeg`,
      width: 800,
      height: 600,
      timestamp: index * 100,
    }))
    const entries: Record<string, Uint8Array> = {
      'trace.trace': strToU8(events.map((event) => JSON.stringify(event)).join('\n')),
    }
    for (const event of events) {
      entries[`resources/${event.sha1}`] = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    }

    render(<PlaywrightTracePlayer trace={zipSync(entries)} />)

    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument()
    await waitFor(() => expect(createUrl).toHaveBeenCalled())
    expect(createUrl.mock.calls.length).toBeLessThanOrEqual(3)
    createUrl.mockRestore()
  })
})
