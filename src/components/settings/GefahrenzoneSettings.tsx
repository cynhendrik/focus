import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useCustomersStore } from '@/store/customers.store'
import { useDealsStore } from '@/store/deals.store'
import { useLeadsStore } from '@/store/leads.store'

interface Props { workspaceId: string }

export function GefahrenzoneSettings({ workspaceId }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [resetDone, setResetDone] = useState(false)

  const handleReset = () => {
    // TODO: actual workspace reset implementation
    setResetDone(true)
    setConfirmText('')
  }
  const customers = useCustomersStore(s => s.customers)
  const deals     = useDealsStore(s => s.deals)
  const leads     = useLeadsStore(s => s.leads)

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      workspaceId,
      customers,
      deals,
      leads,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cynera-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Gefahrenzone</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: 0 }}>Irreversible Aktionen — mit Bedacht verwenden</p>
      </div>

      {/* Export */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Daten exportieren</div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Exportiere alle Kunden, Deals und Leads als JSON-Datei.
        </p>
        <button onClick={handleExport} className="btn-ghost" style={{ fontSize: 12, padding: '7px 16px' }}>
          JSON exportieren
        </button>
      </div>

      {/* Reset */}
      <div style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <AlertTriangle size={15} style={{ color: '#f87171' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171' }}>Workspace zurücksetzen</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-dim)', margin: '0 0 14px' }}>
          Löscht alle Kunden, Deals, Leads und Einstellungen. Nicht rückgängig machbar.
        </p>
        <input
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder='Tippe "zurücksetzen" zum Bestätigen'
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 8, marginBottom: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
            boxSizing: 'border-box' as const,
          }}
        />
        <button
          disabled={confirmText !== 'zurücksetzen'}
          onClick={handleReset}
          style={{
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: confirmText === 'zurücksetzen' ? 'pointer' : 'not-allowed',
            background: confirmText === 'zurücksetzen' ? '#ef4444' : 'var(--surface-2)',
            border: '1px solid ' + (confirmText === 'zurücksetzen' ? '#ef4444' : 'var(--border)'),
            color: confirmText === 'zurücksetzen' ? '#fff' : 'var(--fg-dim)',
            transition: 'background 140ms, color 140ms',
          }}
        >
          {resetDone ? '✓ Zurückgesetzt' : 'Workspace zurücksetzen'}
        </button>
      </div>
    </div>
  )
}
