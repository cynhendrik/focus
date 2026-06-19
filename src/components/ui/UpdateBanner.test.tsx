import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner'
import { useUpdateStore } from '@/store/update.store'

vi.mock('@/services/updater', () => ({
  startDownload: vi.fn(),
  restartApp: vi.fn(),
}))

beforeEach(() => useUpdateStore.getState().reset())
afterEach(cleanup)

describe('UpdateBanner', () => {
  it('rendert nichts im idle-Zustand', () => {
    const { container } = render(<UpdateBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('zeigt im available-Zustand Version + Laden-Button', () => {
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall: vi.fn() })
    render(<UpdateBanner />)
    expect(screen.getByText(/2\.1\.0/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /laden/i })).toBeTruthy()
  })

  it('zeigt im downloading-Zustand den Fortschritt', () => {
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall: vi.fn() })
    useUpdateStore.getState().setDownloading()
    useUpdateStore.getState().setProgress(42)
    render(<UpdateBanner />)
    expect(screen.getByText(/42\s*%/)).toBeTruthy()
  })

  it('zeigt im ready-Zustand den Neu-starten-Button', () => {
    useUpdateStore.getState().setReady()
    render(<UpdateBanner />)
    expect(screen.getByRole('button', { name: /neu starten/i })).toBeTruthy()
  })
})
