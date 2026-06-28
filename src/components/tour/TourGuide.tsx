import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTourStore, TOUR_STEP_COUNT } from '@/store/tour.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { applyTourFixtures, clearTourFixtures } from '@/lib/tour/apply'
import { TOUR_CUSTOMER_ID } from '@/lib/tour/fixtures'

interface Stop { text: string; go: (nav: { setAppView: (v: any) => void; openCustomerAt: (id: string, tab?: any) => void }) => void }

const STOPS: Stop[] = [
  { text: 'Das ist dein Tag — Umsatz, fällige Aufgaben und meine Queue auf einen Blick.', go: n => n.setAppView('dashboard') },
  { text: 'Die Kundenakte: Timeline, Aufgaben, Notizen und Finanzen an einem Ort.', go: n => n.openCustomerAt(TOUR_CUSTOMER_ID, 'verlauf') },
  { text: 'Finanzen: Rechnungen, Angebote, Mahnwesen — die rote Rechnung ist überfällig.', go: n => n.setAppView('invoices') },
  { text: 'Akquise: Leads wandern durch die Phasen, bis sie Kunden werden.', go: n => n.setAppView('leverage_leads') },
  { text: 'Und ich bin immer hier — frag mich nach deinem Tag. Jetzt bist du dran!', go: n => n.setAppView('corra') },
]

export function TourGuide() {
  const active = useTourStore(s => s.active)
  const step   = useTourStore(s => s.step)
  const next   = useTourStore(s => s.next)
  const prev   = useTourStore(s => s.prev)
  const skip   = useTourStore(s => s.skip)
  const finish = useTourStore(s => s.finish)
  const setAppView     = useUiStore(s => s.setAppView)
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const activeWorkspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  // Fixtures injizieren solange aktiv; beim Beenden verwerfen.
  useEffect(() => {
    if (!active) return
    applyTourFixtures()
    return () => { clearTourFixtures(useWorkspaceStore.getState().activeWorkspaceId ?? '') }
  }, [active])

  // Pro Stopp in die passende Ansicht navigieren.
  useEffect(() => {
    if (!active) return
    STOPS[step]?.go({ setAppView, openCustomerAt })
  }, [active, step, setAppView, openCustomerAt])

  if (!active) return null
  const isLast = step >= TOUR_STEP_COUNT - 1

  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 940, background: 'oklch(0% 0 0 / 0.45)', pointerEvents: 'none' }} />
      <div style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 950,
        width: 'min(460px, calc(100vw - 40px))', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 24px 60px -16px oklch(0% 0 0 / 0.5)', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-gradient)', boxShadow: '0 0 8px var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>✦</span>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--fg-dim)' }}>KORA</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-dim)' }}>{step + 1}/{TOUR_STEP_COUNT}</span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.5 }}>{STOPS[step]?.text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button onClick={skip} style={{ fontSize: 12, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Überspringen</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {step > 0 && <button onClick={prev} style={{ fontSize: 13, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', cursor: 'pointer' }}>Zurück</button>}
            <button onClick={() => (isLast ? finish() : next())} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>
              {isLast ? 'Los geht’s' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
