import { useEffect, useState } from 'react'
import { FileText, Tag } from 'lucide-react'
import { FinanceService } from '@/services/finance.service'
import type { Invoice, Offer } from '@/types/finance.types'

interface Props { customerId: string }

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const STATUS_TONE: Record<string, string> = {
  draft: '', open: 'warn', paid: 'ok', overdue: 'bad',
  sent: 'info', accepted: 'ok', rejected: 'bad',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', overdue: 'Überfällig',
  sent: 'Versendet', accepted: 'Angenommen', rejected: 'Abgelehnt',
}

export function FinanzPane({ customerId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [offers,   setOffers]   = useState<Offer[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      FinanceService.getInvoicesByAccount(customerId),
      FinanceService.getOffersByAccount(customerId),
    ]).then(([inv, off]) => {
      setInvoices(inv)
      setOffers(off)
    }).finally(() => setLoading(false))
  }, [customerId])

  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const totalOpen    = invoices.filter(i => i.status === 'open').reduce((s, i) => s + i.total, 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--fg-dim)', fontSize: 13 }}>Laden…</div>
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary */}
      <div className="row-3" style={{ marginBottom: 0 }}>
        {[
          { label: 'Gesamtumsatz', value: totalPaid,    tone: 'ok'   },
          { label: 'Offen',        value: totalOpen,    tone: 'warn' },
          { label: 'Überfällig',   value: totalOverdue, tone: 'bad'  },
        ].map(({ label, value, tone }) => (
          <div key={label} className="card" style={{ padding: '14px 16px' }}>
            <div className="card-label" style={{ marginBottom: 6 }}>{label}</div>
            <div className="chip" data-tone={value > 0 ? tone : ''} style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: 0, background: 'none', letterSpacing: '-0.02em' }}>
              {fmt(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Invoices */}
      <Section title="Rechnungen" icon={<FileText size={13} />} empty={invoices.length === 0} emptyText="Keine Rechnungen">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nummer', 'Datum', 'Fällig', 'Betrag', 'Status'].map(h => (
                  <th key={h} className="card-label" style={{ padding: '8px 14px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={td}><span className="mono" style={{ fontSize: 11 }}>{inv.number ?? '—'}</span></td>
                  <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.date)}</td>
                  <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.dueDate)}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.total)}</td>
                  <td style={td}>
                    <span className="chip" data-tone={STATUS_TONE[inv.status] ?? ''}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Offers */}
      <Section title="Angebote" icon={<Tag size={13} />} empty={offers.length === 0} emptyText="Keine Angebote">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nummer', 'Titel', 'Gültig bis', 'Betrag', 'Status'].map(h => (
                  <th key={h} className="card-label" style={{ padding: '8px 14px', fontWeight: 500, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map(offer => (
                <tr key={offer.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={td}><span className="mono" style={{ fontSize: 11 }}>{offer.number ?? '—'}</span></td>
                  <td style={{ ...td, fontSize: 12 }}>{offer.title}</td>
                  <td style={{ ...td, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(offer.validUntil)}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(offer.total)}</td>
                  <td style={td}>
                    <span className="chip" data-tone={STATUS_TONE[offer.status] ?? ''}>
                      {STATUS_LABEL[offer.status] ?? offer.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, icon, children, empty, emptyText }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; empty: boolean; emptyText: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ color: 'var(--fg-muted)' }}>{icon}</span>
        <span className="card-label">{title}</span>
      </div>
      {empty
        ? <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '10px 0' }}>{emptyText}</div>
        : children
      }
    </div>
  )
}

const td: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'middle' }
