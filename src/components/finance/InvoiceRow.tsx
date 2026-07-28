import { useState } from 'react'
import { Banknote, Download } from 'lucide-react'
import { paidAmount, remaining, displayInvoiceStatus } from '@/lib/invoice-status'
import type { Invoice, Payment } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

const STATUS_TONE: Record<string, string> = {
  draft: '', open: 'warn', paid: 'ok', overdue: 'bad', partly: 'info',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf', open: 'Offen', paid: 'Bezahlt', overdue: 'Überfällig', partly: 'Teilbezahlt',
}

const tdS: React.CSSProperties = { padding: '9px 14px', verticalAlign: 'middle' }

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
function relDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function InvoiceRow({ inv, payments, pdfBusy, projects, onPayment, onDownload, onAssignProject }: {
  inv: Invoice
  payments: Payment[]
  pdfBusy: string | null
  projects: Project[]
  onPayment: (inv: Invoice) => void
  onDownload: (inv: Invoice) => void
  onAssignProject: (invoiceId: string, projectId: string | null) => void
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
      <td style={tdS}>
        <select
          value={inv.projectId ?? ''}
          onChange={e => onAssignProject(inv.id, e.target.value || null)}
          style={{ fontSize: 11.5, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-muted)' }}
        >
          <option value="">Kein Projekt</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
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
