import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SettingsPage, SettingCard, SettingRow, AuroraToggle } from './index'

afterEach(cleanup)

describe('Aurora primitives', () => {
  it('SettingsPage rendert Titel + Untertitel + Inhalt', () => {
    render(<SettingsPage title="Module" subtitle="Untertitel"><div>Inhalt</div></SettingsPage>)
    expect(screen.getByText('Module')).toBeTruthy()
    expect(screen.getByText('Untertitel')).toBeTruthy()
    expect(screen.getByText('Inhalt')).toBeTruthy()
  })

  it('SettingRow zeigt Titel + Beschreibung + Control', () => {
    render(<SettingRow icon={<svg/>} title="CRM" description="Beschreibung" control={<span>CTL</span>} />)
    expect(screen.getByText('CRM')).toBeTruthy()
    expect(screen.getByText('Beschreibung')).toBeTruthy()
    expect(screen.getByText('CTL')).toBeTruthy()
  })

  it('AuroraToggle spiegelt on-Prop via aria-checked und feuert onChange', () => {
    const onChange = vi.fn()
    render(<AuroraToggle on={true} onChange={onChange} />)
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('SettingCard rendert Inhalt', () => {
    render(<SettingCard><span>Karte</span></SettingCard>)
    expect(screen.getByText('Karte')).toBeTruthy()
  })
})
