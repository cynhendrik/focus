import { useWorkspaceStore } from '@/store/workspace.store'
import { SettingsPage, SettingsSection, SettingCard, Badge } from './ui'

const SEAT_TOTAL = 8

export function LizenzenSettings() {
  const ws = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId))
  // Echte Sitzanzahl, wo billig: aktiver Workspace zählt als 1; sonst Platzhalter.
  const used = ws ? 1 : 1
  const pct = Math.round((used / SEAT_TOTAL) * 100)

  return (
    <SettingsPage title="Lizenzen & Upgrades" subtitle="Plan, Sitze und Abrechnung an einem Ort." maxWidth={720}>
      {/* Plan */}
      <div style={{ borderRadius: 'var(--radius)', padding: 1, background: 'var(--accent-gradient)' }}>
        <div style={{ background: 'var(--surface)', borderRadius: 'calc(var(--radius) - 1px)', padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Aktueller Plan</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>Pro</div>
              <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 2 }}>29 € / Monat · jährlich abgerechnet</div>
            </div>
            <button style={{
              background: 'var(--accent-gradient)', color: '#fff', border: 'none', fontFamily: 'inherit',
              fontWeight: 700, fontSize: 13.5, padding: '11px 20px', borderRadius: 11, cursor: 'pointer',
              boxShadow: '0 10px 30px -8px var(--accent-glow)',
            }}>Auf Business upgraden →</button>
          </div>
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 7 }}>
              <span>Genutzte Sitze</span><span>{used} von {SEAT_TOTAL}</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: 'var(--accent-gradient)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Team-Sitze */}
      <SettingsSection label="Team-Sitze">
        <SettingCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13.5 }}>
              {used} aktiv · {SEAT_TOTAL - used} frei
              <span style={{ color: 'var(--fg-dim)', marginLeft: 8, fontSize: 12 }}>Mitglieder lädst du unter „Unternehmen" ein.</span>
            </div>
            <Badge variant="soft">Seats</Badge>
          </div>
        </SettingCard>
      </SettingsSection>

      {/* Zahlung */}
      <SettingsSection label="Zahlung">
        <SettingCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 28, borderRadius: 6, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--fg-muted)' }}>VISA</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>•••• 4242</div>
              <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Platzhalter — echte Abrechnung folgt mit dem SaaS-Plan.</div>
            </div>
            <Badge variant="neutral">Bald</Badge>
          </div>
        </SettingCard>
      </SettingsSection>
    </SettingsPage>
  )
}
