import { useState } from 'react'
import { Plus, Edit2, Trash2, Pause, Play } from 'lucide-react'
import { useVertraege } from '@/store/vertraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import { intervalLabel, calcVertragTotals } from '@/types/vertrag.types'
import { VertragForm } from './VertragForm'
import type { Vertrag } from '@/types/vertrag.types'

function fmtEur(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function VertraegeTab() {
  const vertraege     = useVertraege(s => s.vertraege)
  const deleteVertrag = useVertraege(s => s.deleteVertrag)
  const updateVertrag = useVertraege(s => s.updateVertrag)
  const accounts      = useAccountsStore(s => s.accounts)

  const [showForm,    setShowForm]    = useState(false)
  const [editVertrag, setEditVertrag] = useState<Vertrag | null>(null)

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  const statusColor = (s: Vertrag['status']) =>
    s === 'active' ? 'var(--accent)' : 'var(--fg-dim)'

  const statusLabel = (s: Vertrag['status']) =>
    s === 'active' ? 'AKTIV' : s === 'paused' ? 'PAUSIERT' : 'BEENDET'

  return (
    <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Verträge</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-dim)' }}>
            Wiederkehrende Rechnungen werden automatisch als Entwurf erstellt.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
          borderRadius: 10, border: 'none', background: 'var(--accent)',
          color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} /> Neuer Vertrag
        </button>
      </div>

      {vertraege.length === 0 ? (
        <div style={{
          padding: '64px 0', textAlign: 'center', color: 'var(--fg-dim)',
          border: '1px dashed var(--border)', borderRadius: 14,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6 }}>
            Noch keine Verträge
          </div>
          <div style={{ fontSize: 12 }}>
            Lege einen Vertrag an — Rechnungen werden automatisch erstellt.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vertraege.map(v => {
            const totals = calcVertragTotals(v.items, v.taxMode)
            return (
              <div key={v.id} style={{
                padding: '16px 20px', borderRadius: 14,
                border: '1px solid var(--border)', background: 'var(--bg-2)',
                display: 'flex', alignItems: 'center', gap: 16,
                opacity: v.status === 'ended' ? 0.5 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{v.title}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 99,
                      background: `${statusColor(v.status)}18`,
                      color: statusColor(v.status),
                      fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em',
                    }}>
                      {statusLabel(v.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{accountName(v.accountId)}</span>
                    <span>·</span>
                    <span>{intervalLabel(v.intervalValue, v.intervalUnit)}</span>
                    {v.status === 'active' && (
                      <>
                        <span>·</span>
                        <span>nächste: {relDate(v.nextBillingDate)}</span>
                      </>
                    )}
                    {v.endDate && (
                      <>
                        <span>·</span>
                        <span>bis {relDate(v.endDate)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)' }}>
                    {fmtEur(totals.total)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>brutto</div>
                </div>

                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setEditVertrag(v)} style={{
                    width: 30, height: 30, borderRadius: 7, border: 'none',
                    background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Edit2 size={13} />
                  </button>
                  {v.status !== 'ended' && (
                    <button
                      onClick={() => updateVertrag(v.id, { status: v.status === 'active' ? 'paused' : 'active' })}
                      title={v.status === 'active' ? 'Pausieren' : 'Fortsetzen'}
                      style={{
                        width: 30, height: 30, borderRadius: 7, border: 'none',
                        background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {v.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                  )}
                  <button onClick={() => {
                    if (confirm(`Vertrag "${v.title}" löschen?`)) deleteVertrag(v.id)
                  }} style={{
                    width: 30, height: 30, borderRadius: 7, border: 'none',
                    background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm    && <VertragForm onClose={() => setShowForm(false)} />}
      {editVertrag && <VertragForm vertrag={editVertrag} onClose={() => setEditVertrag(null)} />}
    </div>
  )
}
