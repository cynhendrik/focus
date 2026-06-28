import { useUiStore } from '@/store/ui.store'
import { useTourStore } from '@/store/tour.store'

export function DashboardEmptyState() {
  const setAppView = useUiStore(s => s.setAppView)
  const startTour  = useTourStore(s => s.start)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 24, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Leg los 👋</div>
      <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
        Noch nichts hier. Leg deinen ersten Kunden an — oder lass dir von KORA die App zeigen.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => setAppView('clients')} className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}>Ersten Kunden anlegen</button>
        <button onClick={() => startTour()} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg)', cursor: 'pointer' }}>Tour wiederholen</button>
      </div>
    </div>
  )
}
