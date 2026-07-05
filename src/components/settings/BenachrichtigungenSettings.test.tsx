import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BenachrichtigungenSettings } from './BenachrichtigungenSettings'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
}))

describe('BenachrichtigungenSettings', () => {
  beforeEach(() => {
    useNotificationSettingsStore.setState({
      briefingEnabled: true, briefingTime: '08:30', moneyEventsEnabled: true,
      teamEventsEnabled: true, quietHoursEnabled: true, quietFrom: '18:00',
      quietUntil: '07:00', weekendQuiet: true, closeToTray: true,
    })
  })

  it('zeigt die Kernschalter', () => {
    render(<BenachrichtigungenSettings />)
    expect(screen.getByLabelText('Morgen-Briefing')).toBeChecked()
    expect(screen.getByLabelText('Geld-Ereignisse')).toBeChecked()
    expect(screen.getByLabelText('Team-Ereignisse')).toBeChecked()
  })

  it('Briefing-Schalter schreibt in den Store', () => {
    render(<BenachrichtigungenSettings />)
    fireEvent.click(screen.getByLabelText('Morgen-Briefing'))
    expect(useNotificationSettingsStore.getState().briefingEnabled).toBe(false)
  })

  it('Briefing-Zeit ist editierbar', () => {
    render(<BenachrichtigungenSettings />)
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '07:45' } })
    expect(useNotificationSettingsStore.getState().briefingTime).toBe('07:45')
  })
})
