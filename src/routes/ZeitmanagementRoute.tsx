import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Receipt, Clock, ChevronDown, ChevronUp, Archive } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
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

// ── Auftrags-Zeile ────────────────────────────────────────────────────────────

function AuftragRow({ auftrag, onEdit }: { auftrag: Auftrag; onEdit: () => void }) {
  const deleteAuftrag  = useAuftraege(s => s.deleteAuftrag)
  const updateAuftrag  = useAuftraege(s => s.updateAuftrag)
  const unbilledMins   = useAuftraege(s => s.unbilledMinutes(auftrag.id))
  const isArchived     = auftrag.status === 'archived'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 16px', borderRadius: 10,
      border: '1px solid var(--border)',
      background: isArchived ? 'transparent' : 'var(--bg-2)',
      opacity: isArchived ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{auftrag.title}</span>
        {auftrag.defaultHourlyRate != null && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 10 }}>
            {auftrag.defaultHourlyRate}€/h
          </span>
        )}
      </div>
      {unbilledMins > 0 && !isArchived && (
        <span style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 99,
          background: 'oklch(92% 0.2 245 / 0.12)', color: 'var(--accent)',
          fontFamily: 'var(--font-mono)', fontWeight: 700,
        }}>
          {fmtMinutes(unbilledMins)} offen
        </span>
      )}
      <button onClick={onEdit} style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Edit2 size={12} />
      </button>
      <button
        onClick={() => updateAuftrag(auftrag.id, { status: isArchived ? 'active' : 'archived' })}
        title={isArchived ? 'Reaktivieren' : 'Archivieren'}
        style={{
          width: 28, height: 28, borderRadius: 6, border: 'none',
          background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Archive size={12} />
      </button>
      <button onClick={() => {
        if (confirm(`Auftrag "${auftrag.title}" löschen?`)) deleteAuftrag(auftrag.id)
      }} style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Kunden-Gruppe (unbilled) ─────────────────────────────────────────────────

function KundeUnbilledRow({
  accountId, accountName, onAbrechnen,
}: { accountId: string; accountName: string; onAbrechnen: () => void }) {
  const [open, setOpen]       = useState(false)
  const summary               = useAuftraege(s => s.unbilledForAccount(accountId))
  const removeZeiteintrag     = useAuftraege(s => s.removeZeiteintrag)
  const auftraege             = useAuftraege(s => s.auftraege)

  if (summary.entries.length === 0) return null

  return (
    <div style={{
      borderRadius: 12, border: '1px solid var(--border)',
      background: 'var(--bg-2)', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{accountName}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
            {summary.entries.length} {summary.entries.length === 1 ? 'Eintrag' : 'Einträge'} · {fmtMinutes(summary.totalMinutes)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 20, fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
          }}>
            {summary.totalAmount > 0 ? fmtEur(summary.totalAmount) : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>offen</div>
        </div>
        <button onClick={onAbrechnen} style={{
          padding: '7px 14px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--accent)', cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Receipt size={13} /> Abrechnen
        </button>
        <button onClick={() => setOpen(o => !o)} style={{
          width: 28, height: 28, borderRadius: 6, border: 'none',
          background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {summary.entries.map(z => (
            <div key={z.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 7,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{z.description}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                  {z.date}
                  {z.auftragId && <span> · {auftraege.find(a => a.id === z.auftragId)?.title ?? '—'}</span>}
                </div>
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', flexShrink: 0 }}>
                {fmtMinutes(z.minutes)}
              </div>
              <button onClick={() => removeZeiteintrag(z.id)} style={{
                width: 24, height: 24, borderRadius: 5, border: 'none',
                background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Haupt-Route ──────────────────────────────────────────────────────────────

export function ZeitmanagementRoute() {
  const auftraege     = useAuftraege(s => s.auftraege)
  const zeiteintraege = useAuftraege(s => s.zeiteintraege)
  const accounts      = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))

  const [showForm,    setShowForm]    = useState(false)
  const [editAuftrag, setEditAuftrag] = useState<Auftrag | null>(null)
  const [abrechnAccount, setAbrechnAccount] = useState<{ id: string; name: string } | null>(null)
  const [showArchived, setShowArchived]     = useState(false)

  const aktiveAuftraege    = useMemo(() => auftraege.filter(a => a.status === 'active'),   [auftraege])
  const archiviertAuftraege = useMemo(() => auftraege.filter(a => a.status === 'archived'), [auftraege])

  // Welche Kunden haben unbilled Zeit?
  const accountsWithUnbilled = useMemo(() => {
    const ids = new Set(zeiteintraege.filter(z => !z.billed && z.accountId).map(z => z.accountId!))
    return accounts.filter(a => ids.has(a.id))
  }, [zeiteintraege, accounts])

  // KPIs
  const weekMins = useMemo(() => {
    const mon = new Date()
    const day = mon.getDay()
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1))
    mon.setHours(0, 0, 0, 0)
    return zeiteintraege.filter(z => new Date(z.date) >= mon).reduce((s, z) => s + z.minutes, 0)
  }, [zeiteintraege])

  const totalUnbilled = useMemo(() => {
    const s = useAuftraege.getState()
    return accountsWithUnbilled.reduce((acc, a) => acc + s.unbilledForAccount(a.id).totalAmount, 0)
  }, [accountsWithUnbilled, zeiteintraege])

  return (
    <div className="main-inner">
      <PageHeader
        title="Aufträge & Zeit"
        right={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> Neuer Auftrag
          </button>
        }
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Nicht abgerechnet', value: totalUnbilled > 0 ? fmtEur(totalUnbilled) : '—', accent: totalUnbilled > 0 },
          { label: 'Diese Woche', value: weekMins > 0 ? fmtMinutes(weekMins) : '—', accent: false },
        ].map(k => (
          <div key={k.label} style={{
            padding: '16px 20px', borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}>
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 6,
            }}>{k.label}</div>
            <div style={{
              fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
              color: k.accent ? 'var(--accent)' : 'var(--fg)',
            }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Zeiterfassung */}
      <div style={{ marginBottom: 32 }}>
        <ZeiterfassungForm auftraege={aktiveAuftraege} />
      </div>

      {/* Nicht abgerechnet — pro Kunde */}
      {accountsWithUnbilled.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 10,
          }}>
            Nicht abgerechnet
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accountsWithUnbilled.map(a => (
              <KundeUnbilledRow
                key={a.id}
                accountId={a.id}
                accountName={a.name}
                onAbrechnen={() => setAbrechnAccount({ id: a.id, name: a.name })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Aufträge — globale Liste */}
      <section>
        <div style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 10,
        }}>
          Aufträge
        </div>

        {aktiveAuftraege.length === 0 && archiviertAuftraege.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)' }}>
            <Clock size={32} style={{ opacity: 0.18, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Noch keine Aufträge
            </div>
            <div style={{ fontSize: 12 }}>
              Lege Aufträge an (z.B. "Beratung", "Webentwicklung") und wähle sie beim Zeiterfassen aus.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {aktiveAuftraege.map(a => (
              <AuftragRow key={a.id} auftrag={a} onEdit={() => setEditAuftrag(a)} />
            ))}

            {archiviertAuftraege.length > 0 && (
              <button
                onClick={() => setShowArchived(o => !o)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--fg-dim)', padding: '6px 0',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {showArchived ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {archiviertAuftraege.length} archivierte Aufträge
              </button>
            )}

            {showArchived && archiviertAuftraege.map(a => (
              <AuftragRow key={a.id} auftrag={a} onEdit={() => setEditAuftrag(a)} />
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {showForm    && <AuftragForm onClose={() => setShowForm(false)} />}
      {editAuftrag && <AuftragForm auftrag={editAuftrag} onClose={() => setEditAuftrag(null)} />}
      {abrechnAccount && (
        <AuftragAbrechnen
          accountId={abrechnAccount.id}
          accountName={abrechnAccount.name}
          onClose={() => setAbrechnAccount(null)}
        />
      )}
    </div>
  )
}
