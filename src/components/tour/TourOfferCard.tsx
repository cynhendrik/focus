import { useTourStore } from '@/store/tour.store'
import { useOnboardingStore } from '@/store/onboarding.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

export function TourOfferCard() {
  const seen   = useTourStore(s => s.seen)
  const active = useTourStore(s => s.active)
  const start  = useTourStore(s => s.start)
  const finish = useTourStore(s => s.finish)
  const companyDone   = useOnboardingStore(s => s.companyDone)
  const bootstrapped  = useOnboardingStore(s => s.bootstrapped)
  const nameDone      = useOnboardingStore(s => s.nameDone)
  const user          = useAuthStore(s => s.user)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  // Reihenfolge: erst die Namensabfrage (NamePrompt) erledigen, DANN die Tour anbieten.
  const nameResolved = nameDone || !!((user?.user_metadata?.full_name as string | undefined)?.trim())
  if (!companyDone || !bootstrapped || !activeWorkspaceId || !nameResolved || seen || active) return null

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 920, background: 'oklch(0% 0 0 / 0.35)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 921,
        width: 'min(420px, calc(100vw - 48px))', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: 'var(--shadow-2)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-gradient)', boxShadow: '0 0 8px var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>✦</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>KORA zeigt dir die App</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          In 2 Minuten führe ich dich einmal durch alles — mit Beispiel-Daten, die danach wieder verschwinden. Dein Workspace bleibt sauber.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button onClick={() => finish()} style={{ fontSize: 12.5, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 12px' }}>Später</button>
          <button onClick={() => start()} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>Tour starten</button>
        </div>
      </div>
    </>
  )
}
