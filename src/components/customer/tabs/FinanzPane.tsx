import { useEffect, useState, useMemo } from 'react'
import { FileText, Tag, Clock, ChevronRight, Download, Banknote } from 'lucide-react'
import { FinanceService } from '@/services/finance.service'
import { useFinanceStore } from '@/store/finance.store'
import { useAuftraege }   from '@/store/auftraege.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore }      from '@/store/auth.store'
import { useUiStore }        from '@/store/ui.store'
import { useCompanyStore }   from '@/store/company.store'
import { useAccountsStore }  from '@/store/accounts.store'
import { useToastStore }     from '@/store/toast.store'
import { isOverdue, paidAmount, remaining, displayInvoiceStatus } from '@/lib/invoice-status'
import { PaymentModal }      from '@/components/finance/PaymentModal'
import type { Invoice, Offer, Payment } from '@/types/finance.types'
import type { Zeiteintrag }   from '@/types/auftrag.types'

interface Props { customerId: string }

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
function fmtH(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function todayISO() { return new Date().toLocaleDateString('sv') }
function dueDateISO() {
  const d = new Date(); d.setDate(d.getDate() + 14)
  return d.toLocaleDateString('sv')
}

const STATUS_TONE: Record<string, string> = {
  draft: '', open: 'warn', paid: 'ok', overdue: 'bad', partly: 'info',
  sent: 'info', accepted: 'ok', rejected: 'bad',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', overdue: 'Überfällig', partly: 'Teilbezahlt',
  sent: 'Versendet', accepted: 'Angenommen', rejected: 'Abgelehnt',
}

// ── Unbilled group ────────────────────────────────────────────────────────────

interface AuftragGroup {
  auftragId:    string | null
  auftragTitle: string
  hourlyRate:   number
  entries:      Zeiteintrag[]
  totalMinutes: number
  totalAmount:  number
}

// ── Aurora table header style ─────────────────────────────────────────────────
const thS: React.CSSProperties = {
  padding: '8px 14px',
  fontFamily: 'var(--font-mono)', fontSize: 10.5,
  fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--fg-dim)', textAlign: 'left',
}

const tdS: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'middle' }

// ── Row sub-components with hover state ───────────────────────────────────────

function InvoiceRow({ inv, payments, pdfBusy, onPayment, onDownload }: {
  inv: Invoice
  payments: Payment[]
  pdfBusy: string | null
  onPayment: (inv: Invoice) => void
  onDownload: (inv: Invoice) => void
}) {
  const [hover, setHover] = useState(false)
  const paid = paidAmount(payments, inv.id)
  const s = displayInvoiceStatus(inv, paid)
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background 100ms',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td style={tdS}><span className="mono" style={{ fontSize: 11 }}>{inv.number ?? '—'}</span></td>
      <td style={{ ...tdS, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.date)}</td>
      <td style={{ ...tdS, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(inv.dueDate)}</td>
      <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(inv.total)}</td>
      <td style={tdS}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="chip" data-tone={STATUS_TONE[s] ?? ''}>{STATUS_LABEL[s] ?? s}</span>
          {s === 'partly' && (
            <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(remaining(inv, paid))} offen
            </span>
          )}
        </span>
      </td>
      <td style={{ ...tdS, textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
          {inv.status !== 'draft' && inv.status !== 'cancelled' && (
            <button onClick={() => onPayment(inv)} title="Zahlung erfassen"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 11, transition: 'border-color 100ms, color 100ms' }}>
              <Banknote size={12} /> Zahlung
            </button>
          )}
          <button onClick={() => onDownload(inv)} disabled={pdfBusy === inv.id} title="Rechnung als PDF"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)', cursor: pdfBusy === inv.id ? 'wait' : 'pointer', fontSize: 11 }}>
            <Download size={12} /> {pdfBusy === inv.id ? '…' : 'PDF'}
          </button>
        </div>
      </td>
    </tr>
  )
}

function OfferRow({ offer, pdfBusy, onDownload }: {
  offer: Offer
  pdfBusy: string | null
  onDownload: (o: Offer) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: hover ? 'var(--surface-2)' : 'transparent',
        transition: 'background 100ms',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td style={tdS}><span className="mono" style={{ fontSize: 11 }}>{offer.number ?? '—'}</span></td>
      <td style={{ ...tdS, fontSize: 12 }}>{offer.title}</td>
      <td style={{ ...tdS, color: 'var(--fg-dim)', fontSize: 12 }}>{relDate(offer.validUntil)}</td>
      <td style={{ ...tdS, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(offer.total)}</td>
      <td style={tdS}><span className="chip" data-tone={STATUS_TONE[offer.status] ?? ''}>{STATUS_LABEL[offer.status] ?? offer.status}</span></td>
      <td style={{ ...tdS, textAlign: 'right' }}>
        <button onClick={() => onDownload(offer)} disabled={pdfBusy === offer.id} title="Angebot als PDF"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)', cursor: pdfBusy === offer.id ? 'wait' : 'pointer', fontSize: 11 }}>
          <Download size={12} /> {pdfBusy === offer.id ? '…' : 'PDF'}
        </button>
      </td>
    </tr>
  )
}

export function FinanzPane({ customerId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [offers,   setOffers]   = useState<Offer[]>([])
  const [loading,  setLoading]  = useState(true)

  const profile = useCompanyStore(s => s.profile)
  const account = useAccountsStore(s => s.accounts.find(a => a.id === customerId))
  const toast   = useToastStore(s => s.show)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const downloadInvoice = async (inv: Invoice) => {
    if (!profile || !account) { toast({ message: 'Firmenprofil oder Kunde fehlt für das PDF.', variant: 'error' }); return }
    setPdfBusy(inv.id)
    try {
      const full = await FinanceService.getInvoice(inv.id)
      const { downloadInvoicePDF } = await import('@/components/finance/InvoicePDF')
      await downloadInvoicePDF(full, profile, account)
    } catch (e) {
      toast({ message: `PDF fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally { setPdfBusy(null) }
  }

  const downloadOffer = async (o: Offer) => {
    if (!profile || !account) { toast({ message: 'Firmenprofil oder Kunde fehlt für das PDF.', variant: 'error' }); return }
    setPdfBusy(o.id)
    try {
      const full = await FinanceService.getOffer(o.id)
      const { downloadOfferPDF } = await import('@/components/finance/OfferPDF')
      await downloadOfferPDF(full, profile, account)
    } catch (e) {
      toast({ message: `PDF fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally { setPdfBusy(null) }
  }
  const [creating, setCreating] = useState(false)

  const auftraege         = useAuftraege(s => s.auftraege)
  const zeiteintraege     = useAuftraege(s => s.zeiteintraege)
  const markBilledEntries = useAuftraege(s => s.markBilledEntries)
  const createInvoice     = useFinanceStore(s => s.createInvoice)
  const createOffer       = useFinanceStore(s => s.createOffer)
  const workspaceId       = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const userId            = useAuthStore(s => s.user?.id) ?? ''
  const setAppView        = useUiStore(s => s.setAppView)
  const payments          = useFinanceStore(s => s.payments)
  const loadPayments      = useFinanceStore(s => s.loadPayments)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)

  useEffect(() => {
    setLoading(true)
    if (workspaceId) loadPayments(workspaceId)
    Promise.all([
      FinanceService.getInvoicesByAccount(customerId),
      FinanceService.getOffersByAccount(customerId),
    ]).then(([inv, off]) => {
      setInvoices(inv)
      setOffers(off)
    }).finally(() => setLoading(false))
  }, [customerId, workspaceId, loadPayments])

  // Group unbilled entries by Auftrag
  const groups: AuftragGroup[] = useMemo(() => {
    const unbilled = zeiteintraege.filter(z => z.accountId === customerId && !z.billed)
    const map = new Map<string, AuftragGroup>()
    for (const z of unbilled) {
      const key = z.auftragId ?? '__none__'
      const auf = auftraege.find(a => a.id === z.auftragId)
      const rate = z.hourlyRate ?? auf?.defaultHourlyRate ?? 0
      const amount = Math.round((z.minutes / 60) * rate * 100) / 100
      if (!map.has(key)) {
        map.set(key, {
          auftragId:    z.auftragId,
          auftragTitle: auf?.title ?? 'Ohne Auftrag',
          hourlyRate:   rate,
          entries:      [],
          totalMinutes: 0,
          totalAmount:  0,
        })
      }
      const g = map.get(key)!
      g.entries.push(z)
      g.totalMinutes += z.minutes
      g.totalAmount  = Math.round((g.totalAmount + amount) * 100) / 100
    }
    return Array.from(map.values())
  }, [zeiteintraege, auftraege, customerId])

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Reset selection when groups change
  useEffect(() => { setSelected(new Set(groups.map(g => g.auftragId ?? '__none__'))) }, [groups.length])

  const allSelected = groups.length > 0 && selected.size === groups.length
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(groups.map(g => g.auftragId ?? '__none__')))
  const toggleGroup = (key: string) => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const selectedGroups  = groups.filter(g => selected.has(g.auftragId ?? '__none__'))
  const selectedMinutes = selectedGroups.reduce((s, g) => s + g.totalMinutes, 0)
  const selectedAmount  = Math.round(selectedGroups.reduce((s, g) => s + g.totalAmount, 0) * 100) / 100
  const subtotal        = Math.round(selectedAmount * 100) / 100
  const taxAmount       = Math.round(subtotal * 0.19 * 100) / 100
  const total           = Math.round((subtotal + taxAmount) * 100) / 100

  const buildItems = () => selectedGroups.map((g, i) => ({
    title:       g.auftragTitle,
    description: `${fmtH(g.totalMinutes)} Zeiterfassung`,
    quantity:    Math.round((g.totalMinutes / 60) * 100) / 100,
    unitPrice:   g.hourlyRate,
    taxRate:     19,
    total:       g.totalAmount,
    sortOrder:   i,
    unit:        'Std',
  }))

  const billedEntryIds = () => selectedGroups.flatMap(g => g.entries.map(e => e.id))

  const handleCreateInvoice = async () => {
    if (!selectedGroups.length || creating) return
    setCreating(true)
    try {
      const result = await createInvoice({
        workspaceId, createdBy: userId, accountId: customerId,
        date: todayISO(), dueDate: dueDateISO(),
        status: 'draft',
        subtotal, taxAmount, total,
        items: buildItems(),
      })
      markBilledEntries(billedEntryIds(), result.invoice.id)
      setAppView('invoices')
    } finally { setCreating(false) }
  }

  const handleCreateOffer = async () => {
    if (!selectedGroups.length || creating) return
    setCreating(true)
    try {
      const result = await createOffer({
        workspaceId, createdBy: userId, accountId: customerId,
        title: `Angebot ${new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
        validUntil: dueDateISO(),
        subtotal, taxAmount, total,
        items: buildItems(),
      })
      markBilledEntries(billedEntryIds(), result.offer.id)
      setAppView('invoices')
    } finally { setCreating(false) }
  }

  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const totalOpen    = invoices.filter(i => i.status === 'open').reduce((s, i) => s + i.total, 0)
  const totalOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--fg-dim)', fontSize: 13 }}>Laden…</div>
  }

  return (
    <div style={{ padding: '20px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto', flex: 1 }}>
      {/* Summary */}
      <div className="row-3" style={{ marginBottom: 0 }}>
        {[
          { label: 'Gesamtumsatz', value: totalPaid,    tone: 'ok'   },
          { label: 'Offen',        value: totalOpen,    tone: 'warn' },
          { label: 'Überfällig',   value: totalOverdue, tone: 'bad'  },
        ].map(({ label, value, tone }) => (
          <div key={label} className="card" style={{ padding: '14px 16px', boxShadow: 'var(--card-shadow)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <div className="card-label" style={{ marginBottom: 6 }}>{label}</div>
            <div className="chip" data-tone={value > 0 ? tone : ''} style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: 0, background: 'none', letterSpacing: '-0.02em' }}>
              {fmt(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Nicht abgerechnet */}
      {groups.length > 0 && (
        <Section title="Nicht abgerechnet" icon={<Clock size={13} />}>
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--card-shadow)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 90px', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
              {['Auftrag', 'Zeit', 'Betrag'].map(h => (
                <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)' } as React.CSSProperties}>{h}</span>
              ))}
            </div>

            {groups.map(g => {
              const key = g.auftragId ?? '__none__'
              const checked = selected.has(key)
              return (
                <div
                  key={key}
                  onClick={() => toggleGroup(key)}
                  style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 90px', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: checked ? 'var(--nav-active-bg)' : 'transparent', transition: 'background 100ms' }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleGroup(key)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{g.auftragTitle}</span>
                  <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{fmtH(g.totalMinutes)}</span>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: checked ? 'var(--accent-text)' : 'var(--fg-muted)' }}>{fmt(g.totalAmount)}</span>
                </div>
              )
            })}

            {/* Footer: Summe + Buttons */}
            <div style={{ padding: '12px 14px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--fg-muted)' }}>
                <span>{fmtH(selectedMinutes)}</span>
                <span style={{ fontWeight: 700, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{fmt(selectedAmount)} zzgl. 19% MwSt = {fmt(total)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCreateOffer}
                  disabled={!selectedGroups.length || creating}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: selectedGroups.length ? 'var(--fg)' : 'var(--fg-dim)', fontSize: 12, fontWeight: 600, cursor: selectedGroups.length ? 'pointer' : 'not-allowed', transition: 'all 140ms' }}
                >
                  <Tag size={12} /> Angebot
                </button>
                <button
                  onClick={handleCreateInvoice}
                  disabled={!selectedGroups.length || creating}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: selectedGroups.length ? 'var(--accent-gradient)' : 'var(--surface-3)', color: selectedGroups.length ? '#fff' : 'var(--fg-dim)', fontSize: 12, fontWeight: 600, cursor: selectedGroups.length ? 'pointer' : 'not-allowed', transition: 'all 140ms', boxShadow: selectedGroups.length ? '0 4px 14px -4px var(--accent-glow)' : 'none' }}
                >
                  <ChevronRight size={12} /> {creating ? 'Erstellt…' : 'Rechnung'}
                </button>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Invoices */}
      <Section title="Rechnungen" icon={<FileText size={13} />} empty={invoices.length === 0} emptyText="Keine Rechnungen">
        <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--card-shadow)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {['Nummer', 'Datum', 'Fällig', 'Betrag', 'Status', ''].map(h => (
                  <th key={h} style={{ ...thS, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <InvoiceRow key={inv.id} inv={inv} payments={payments} pdfBusy={pdfBusy} onPayment={setPaymentInvoice} onDownload={downloadInvoice} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Offers */}
      <Section title="Angebote" icon={<Tag size={13} />} empty={offers.length === 0} emptyText="Keine Angebote">
        <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--card-shadow)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {['Nummer', 'Titel', 'Gültig bis', 'Betrag', 'Status', ''].map(h => (
                  <th key={h} style={{ ...thS, textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map(offer => (
                <OfferRow key={offer.id} offer={offer} pdfBusy={pdfBusy} onDownload={downloadOffer} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {paymentInvoice && (
        <PaymentModal invoice={paymentInvoice} onClose={() => setPaymentInvoice(null)} />
      )}
    </div>
  )
}

function Section({ title, icon, children, empty, emptyText }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; empty?: boolean; emptyText?: string
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
