import { SettingsPage, SettingCard, Badge } from './ui'

export function LizenzenSettings() {
  return (
    <SettingsPage title="Lizenzen & Abrechnung" subtitle="Plan und Abrechnung." maxWidth={720}>
      <SettingCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><Badge variant="soft">Testphase</Badge></div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Du bist in der Testphase</div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            Alle Funktionen sind frei freigeschaltet. Die Abrechnung kommt später — du musst jetzt nichts tun.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-dim)' }}>
            Mitglieder lädst du unter „Unternehmen" ein.
          </p>
        </div>
      </SettingCard>
    </SettingsPage>
  )
}
