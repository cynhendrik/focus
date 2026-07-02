import { useEffect, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { SettingsPage, SettingCard } from './ui'
import { useNotificationSettingsStore } from '@/store/notification-settings.store'

function ToggleRow({ id, label, hint, checked, onChange, disabled }: {
  id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', opacity: disabled ? 0.5 : 1 }}>
      <input
        id={id} type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1 }}>
        <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</label>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{hint}</div>
      </div>
    </div>
  )
}

function TimeRow({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, width: 120 }}>{label}</label>
      <input id={id} type="time" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingCard>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>
      {children}
    </SettingCard>
  )
}

export function BenachrichtigungenSettings() {
  const s = useNotificationSettingsStore()
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    void import('@tauri-apps/plugin-autostart')
      .then(m => m.isEnabled())
      .then(setAutostart)
      .catch(() => setAutostart(null))
  }, [])

  const toggleAutostart = async (on: boolean) => {
    setAutostart(on)
    try {
      const m = await import('@tauri-apps/plugin-autostart')
      if (on) await m.enable(); else await m.disable()
    } catch {
      setAutostart(!on)
    }
  }

  const toggleCloseToTray = (on: boolean) => {
    s.set({ closeToTray: on })
    void invoke('cmd_set_close_to_tray', { enabled: on }).catch(() => {})
  }

  return (
    <SettingsPage
      title="Benachrichtigungen"
      subtitle="Ruhig aber präsent — was sich melden darf und wann Ruhe ist"
      maxWidth={640}
    >
      <Section title="Morgen-Briefing">
        <ToggleRow id="briefing" label="Morgen-Briefing" checked={s.briefingEnabled}
          hint="Werktags eine Benachrichtigung mit dem Tagesüberblick. An leeren Tagen bleibt die App stumm."
          onChange={(v) => s.set({ briefingEnabled: v })} />
        <TimeRow id="briefing-time" label="Uhrzeit" value={s.briefingTime}
          onChange={(v) => s.set({ briefingTime: v })} />
      </Section>

      <Section title="Ereignisse">
        <ToggleRow id="money" label="Geld-Ereignisse" checked={s.moneyEventsEnabled}
          hint="Rechnung überfällig geworden, Zahlung vollständig eingegangen — je Ereignis genau einmal."
          onChange={(v) => s.set({ moneyEventsEnabled: v })} />
        <ToggleRow id="team" label="Team-Ereignisse" checked={s.teamEventsEnabled}
          hint="Zuweisungen, Erwähnungen und Direktnachrichten aus deinem Team."
          onChange={(v) => s.set({ teamEventsEnabled: v })} />
      </Section>

      <Section title="Ruhezeiten">
        <ToggleRow id="quiet" label="Ruhezeiten aktiv" checked={s.quietHoursEnabled}
          hint="In der Ruhezeit sendet Cultera OS keine Benachrichtigungen."
          onChange={(v) => s.set({ quietHoursEnabled: v })} />
        <TimeRow id="quiet-from" label="Ruhe ab" value={s.quietFrom} onChange={(v) => s.set({ quietFrom: v })} />
        <TimeRow id="quiet-until" label="Ruhe bis" value={s.quietUntil} onChange={(v) => s.set({ quietUntil: v })} />
        <ToggleRow id="weekend" label="Wochenende stumm" checked={s.weekendQuiet}
          hint="Samstag und Sonntag keine Benachrichtigungen — auch kein Briefing."
          onChange={(v) => s.set({ weekendQuiet: v })} />
      </Section>

      <Section title="Hintergrund">
        <ToggleRow id="tray" label="Beim Schließen im Hintergrund weiterlaufen" checked={s.closeToTray}
          hint="Cultera OS bleibt im Tray aktiv, damit Briefing und Ereignisse dich erreichen. Beenden jederzeit über das Tray-Menü."
          onChange={toggleCloseToTray} />
        <ToggleRow id="autostart" label="Mit Windows starten" checked={autostart === true}
          hint={autostart === null ? 'Status wird geladen …' : 'Startet Cultera OS beim Anmelden minimiert im Hintergrund.'}
          onChange={toggleAutostart} disabled={autostart === null} />
      </Section>
    </SettingsPage>
  )
}
