import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Receipt, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuftraege } from '@/store/auftraege.store'
import { useAccountsStore } from '@/store/accounts.store'
import { AuftragForm } from '@/components/zeitmanagement/AuftragForm'
import { ZeiterfassungForm } from '@/components/zeitmanagement/ZeiterfassungForm'
import { AuftragAbrechnen } from '@/components/zeitmanagement/AuftragAbrechnen'
import type { Auftrag } from '@/types/auftrag.types'

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} Min`
  if (min === 0) return `${h} Std`
  return `${h} Std ${min} Min`
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function AuftragRow({ auftrag, onEdit, onAbrechnen }: {
  auftrag: Auftrag
  onEdit: () => void
  onAbrechnen: () => void
}) {
  const [open, setOpen] = useState(false)
  const zeiteintraege     = useAuftraege(s => s.zeiteintraege.filter(z => z.auftragId === auftrag.id))
  const unbilledMins      = useAuftraege(s => s.unbilledMinutes(auftrag.id))
  const unbilledAmount    = useAuftraege(s => s.unbilledAmount(auftrag.id))
  const removeZeiteintrag = useAuftraege(s => s.removeZeiteintrag)
  const deleteAuftrag     = useAuftraege(s => s.deleteAuftrag)
  const accounts          = useAccountsStore(s => s.accounts)
  const account           = accounts.find(a => a.id === auftrag.accountId)

  const hasUnbilled = unbilledMins > 0 || (auftrag.type === 'fixed' && auftrag.status !== 'billed')
  const totalMins   = zeiteintraege.reduce((s, z) => s + z.minutes, 0)

  const statusColor =
    auftrag.status === 'billed'    ? 'oklch(60% 0.01 0)' :
    auftrag.status === 'completed' ? 'oklch(72% 0.18 180)' :
    'var(--accent)'

  const statusLabel =
    auftrag.status === 'billed'    ? 'Abgerechnet' :
    auftrag.status === 'completed' ? 'Fertig' : 'Aktiv'

  return (
    <div style={{
      borderRadius: 14, border: '1px solid var(--border)',
      background: 'var(--bg-2)', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
              {auftrag.title}
            </span>
            {hasUnbilled && auftrag.status !== 'billed' && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: 'oklch(92% 0.2 125 / 0.15)', color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
              }}>
                NICHT ABGERECHNET
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--fg-dim)' }}>
            <span>{account?.name ?? '—'}</span>
            <span>·</span>
            <span>{auftrag.type === 'hourly'
              ? `${fmtEur(auftrag.hourlyRate ?? 0)}/Std`
              : `Pauschal ${fmtEur(auftrag.fixedAmount ?? 0)}`}
            </span>
            {totalMins > 0 && <><span>·</span><span>{fmtMinutes(totalMins)} gesamt</span></>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {hasUnbilled && auftrag.status !== 'billed' && (
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 18, fontWeight: 700, color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
              }}>
                {fmtEur(unbilledAmount)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
                offen
              </div>
            </div>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
            background: `${statusColor}18`, color: statusColor,
            fontFamily: 'var(--font-mono)',
          }}>
            {statusLabel}
          </span>
          {auftrag.status !== 'billed' && (
            <button onClick={onAbrechnen} title="Abrechnen" style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Receipt size={13} /> Abrechnen
            </button>
          )}
          <button onClick={onEdit} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Edit2 size={13} />
          </button>
          <button onClick={() => {
            if (confirm(`Auftrag "${auftrag.title}" und alle Zeiteinträge löschen?`)) deleteAuftrag(auftrag.id)
          }} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trash2 size={13} />
          </button>
          <button onClick={() => setOpen(o => !o)} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zeiteintraege.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '4px 0' }}>
              Noch keine Zeiteinträge.
            </div>
          ) : zeiteintraege.map(z => (
            <div key={z.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', borderRadius: 8,
              background: z.billed ? 'transparent' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${z.billed ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
              opacity: z.billed ? 0.5 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{z.description}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{z.date}{z.billed ? ' · abgerechnet' : ''}</div>
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                {fmtMinutes(z.minutes)}
              </div>
              {!z.billed && (
                <button onClick={() => removeZeiteintrag(z.id)} style={{
                  width: 24, height: 24, borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ZeitmanagementRoute() {
  const auftraege     = useAuftraege(s => s.auftraege)
  const zeiteintraege = useAuftraege(s => s.zeiteintraege)

  const [showForm,       setShowForm]       = useState(false)
  const [editAuftrag,    setEditAuftrag]    = useState<Auftrag | null>(null)
  const [abrechnAuftrag, setAbrechnAuftrag] = useState<Auftrag | null>(null)

  const aktiveAuftraege = useMemo(
    () => auftraege.filter(a => a.status !== 'billed'),
    [auftraege]
  )

  const unbilledTotal = useMemo(() => {
    const s = useAuftraege.getState()
    return auftraege
      .filter(a => a.status !== 'billed')
      .reduce((acc, a) => acc + s.unbilledAmount(a.id), 0)
  }, [auftraege, zeiteintraege])

  const weekMins = useMemo(() => {
    const mon = new Date()
    const day = mon.getDay()
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1))
    mon.setHours(0, 0, 0, 0)
    return zeiteintraege
      .filter(z => new Date(z.date) >= mon)
      .reduce((s, z) => s + z.minutes, 0)
  }, [zeiteintraege])

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 28px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 6,
          }}>Zeitmanagement</div>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--fg)', margin: 0 }}>
            Aufträge
          </h1>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
          borderRadius: 10, border: 'none', background: 'var(--accent)',
          color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={15} /> Neuer Auftrag
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Nicht abgerechnet', value: fmtEur(unbilledTotal), accent: unbilledTotal > 0 },
          { label: 'Diese Woche', value: fmtMinutes(weekMins), accent: false },
        ].map(k => (
          <div key={k.label} style={{
            padding: '16px 20px', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 6,
            }}>{k.label}</div>
            <div style={{
              fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
              color: k.accent ? 'var(--accent)' : 'var(--fg)',
            }}>
              {weekMins === 0 && !k.accent ? '—' : k.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 28 }}>
        <ZeiterfassungForm auftraege={aktiveAuftraege} />
      </div>

      {auftraege.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--fg-dim)' }}>
          <Clock size={36} style={{ opacity: 0.18, marginBottom: 14, display: 'block', margin: '0 auto 14px' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 6 }}>
            Noch keine Aufträge
          </div>
          <div style={{ fontSize: 13 }}>
            Lege einen Auftrag an um Zeit zu erfassen und abzurechnen.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {auftraege.map(a => (
            <AuftragRow
              key={a.id}
              auftrag={a}
              onEdit={() => setEditAuftrag(a)}
              onAbrechnen={() => setAbrechnAuftrag(a)}
            />
          ))}
        </div>
      )}

      {showForm && <AuftragForm onClose={() => setShowForm(false)} />}
      {editAuftrag && <AuftragForm auftrag={editAuftrag} onClose={() => setEditAuftrag(null)} />}
      {abrechnAuftrag && <AuftragAbrechnen auftrag={abrechnAuftrag} onClose={() => setAbrechnAuftrag(null)} />}
    </div>
  )
}
