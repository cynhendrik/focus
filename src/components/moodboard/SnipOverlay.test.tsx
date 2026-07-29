import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SnipOverlay } from './SnipOverlay'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SnipOverlay', () => {
  beforeEach(() => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'cmd_get_snip_background') return Promise.resolve([137, 80, 78, 71])
      return Promise.resolve(undefined)
    })
  })

  it('laedt den Hintergrund-Screenshot beim Mounten', async () => {
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
  })

  it('sendet das gezogene Rechteck skaliert mit devicePixelRatio an finish_screen_snip', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    const surface = container.firstChild as HTMLElement
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 20 })
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 120 })
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 120 })
    expect(invokeMock).toHaveBeenCalledWith('cmd_finish_screen_snip', {
      rect: { x: 20, y: 40, width: 100, height: 200 },
    })
  })

  it('normalisiert ein von unten-rechts nach oben-links gezogenes Rechteck', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    const surface = container.firstChild as HTMLElement
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(surface, { clientX: 40, clientY: 30 })
    fireEvent.pointerUp(surface, { clientX: 40, clientY: 30 })
    expect(invokeMock).toHaveBeenCalledWith('cmd_finish_screen_snip', {
      rect: { x: 40, y: 30, width: 60, height: 70 },
    })
  })

  it('bricht bei Escape ab, ohne finish_screen_snip aufzurufen', async () => {
    render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(invokeMock).toHaveBeenCalledWith('cmd_cancel_screen_snip')
    expect(invokeMock).not.toHaveBeenCalledWith('cmd_finish_screen_snip', expect.anything())
  })

  it('bricht bei Rechtsklick ab', async () => {
    const { container } = render(<SnipOverlay />)
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cmd_get_snip_background'))
    fireEvent.contextMenu(container.firstChild as HTMLElement)
    expect(invokeMock).toHaveBeenCalledWith('cmd_cancel_screen_snip')
  })
})
