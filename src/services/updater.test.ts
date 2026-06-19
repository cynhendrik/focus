import { describe, it, expect, beforeEach, vi } from 'vitest'

const check = vi.fn()
const relaunch = vi.fn()
const isTauri = vi.fn(() => true)

vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...a: unknown[]) => check(...a) }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: (...a: unknown[]) => relaunch(...a) }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }))

import { checkForUpdate, startDownload, restartApp } from './updater'
import { useUpdateStore } from '@/store/update.store'

beforeEach(() => {
  check.mockReset(); relaunch.mockReset(); isTauri.mockReturnValue(true)
  useUpdateStore.getState().reset()
  useUpdateStore.setState({ dismissedVersion: null })
})

describe('checkForUpdate', () => {
  it('no-op außerhalb von Tauri', async () => {
    isTauri.mockReturnValue(false)
    await checkForUpdate()
    expect(check).not.toHaveBeenCalled()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })

  it('kein Update verfügbar → bleibt idle', async () => {
    check.mockResolvedValue(null)
    await checkForUpdate()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })

  it('Update verfügbar → phase=available', async () => {
    check.mockResolvedValue({ version: '2.1.0', downloadAndInstall: vi.fn() })
    await checkForUpdate()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('available')
    expect(s.version).toBe('2.1.0')
  })

  it('bereits abgelehnte Version wird nicht erneut angezeigt', async () => {
    useUpdateStore.setState({ dismissedVersion: '2.1.0' })
    check.mockResolvedValue({ version: '2.1.0', downloadAndInstall: vi.fn() })
    await checkForUpdate()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })
})

describe('startDownload', () => {
  it('berechnet Fortschritt aus Events und endet bei ready', async () => {
    const downloadAndInstall = vi.fn(async (onEvent: (e: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      onEvent({ event: 'Progress', data: { chunkLength: 40 } })
      onEvent({ event: 'Progress', data: { chunkLength: 60 } })
      onEvent({ event: 'Finished' })
    })
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall })
    await startDownload()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.progress).toBe(100)
  })

  it('Fehler beim Download → phase=error', async () => {
    const downloadAndInstall = vi.fn(async () => { throw new Error('netz weg') })
    useUpdateStore.getState().setAvailable({ version: '2.1.0', downloadAndInstall })
    await startDownload()
    const s = useUpdateStore.getState()
    expect(s.phase).toBe('error')
    expect(s.errorMsg).toContain('netz weg')
  })
})

describe('restartApp', () => {
  it('ruft relaunch', async () => {
    await restartApp()
    expect(relaunch).toHaveBeenCalledOnce()
  })
})
