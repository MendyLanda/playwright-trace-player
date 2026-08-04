// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('playwright-trace-player/react', () => ({
  PlaywrightTracePlayer: ({ traceUrl }: { traceUrl: string }) => (
    <div data-testid="trace-player-url">{traceUrl}</div>
  ),
}))

import { App } from '../demo/src/main'

describe('demo trace rack', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'))

  it('keeps the requested trace order and switches hosted traces', async () => {
    const user = userEvent.setup()
    render(<App />)

    const traceTablist = screen.getByRole('tablist', { name: 'Demo traces' })
    const tabs = within(traceTablist).getAllByRole('tab')
    expect(tabs).toHaveLength(8)
    expect(tabs[0]).toHaveTextContent('VS Code')
    expect(tabs[1]).toHaveTextContent('Simple failure')
    expect(tabs[4]).toHaveTextContent('Robot run')
    expect(tabs[5]).toHaveTextContent('Failed app')
    expect(screen.queryByRole('tab', { name: /Smoke test/ })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /VS Code/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('trace-player-url')).toHaveTextContent(
      '/vscode-electron.zip?v=2',
    )

    await user.click(screen.getByRole('tab', { name: /Robot run/ }))

    expect(screen.getByRole('tab', { name: /Robot run/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('heading', { name: 'Robot run' })).toBeInTheDocument()
    expect(screen.getByTestId('trace-player-url')).toHaveTextContent(
      '/robot-navigation.zip?v=2',
    )
    expect(window.location.search).toBe('?sample=robot')
  })

  it('shows install commands for npm, pnpm, bun, and yarn', async () => {
    const user = userEvent.setup()
    render(<App />)

    const installTabs = screen.getByRole('tablist', { name: 'Package manager' })
    expect(within(installTabs).getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByText('npm install playwright-trace-player')).toBeInTheDocument()

    await user.click(within(installTabs).getByRole('tab', { name: 'pnpm' }))

    expect(screen.getByText('pnpm add playwright-trace-player')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy install command' })).toBeInTheDocument()
  })
})
