import { FileText, Plus } from 'lucide-react'
import { InvoiceRow } from '@/components/finance/InvoiceRow'
import type { Invoice, Payment } from '@/types/finance.types'
import type { Project } from '@/types/project.types'

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function ProjectInvoices({ project, invoices, payments, pdfBusy, onAssignProject, onCreateInvoice, onPayment, onDownload }: {
  project: Project
  invoices: Invoice[]
  payments: Payment[]
  pdfBusy: string | null
  onAssignProject: (invoiceId: string, projectId: string | null) => void
  onCreateInvoice: () => void
  onPayment: (inv: Invoice) => void
  onDownload: (inv: Invoice) => void
}) {
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const totalOpen = invoices.filter(i => i.status === 'open' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const totalBilled = invoices.filter(i => i.status !== 'draft').reduce((s, i) => s + i.total, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="pcard">
        <div className="pcard-h">
          <h3><FileText size={13} style={{ marginRight: 6 }} />Rechnungen · {project.title}</h3>
          <button className="pbtn" style={{ fontSize: 11.5 }} onClick={onCreateInvoice}>
            <Plus size={12} /> Neue Rechnung
          </button>
        </div>

        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--fg-dim)', padding: '10px 0' }}>Keine Rechnungen</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {['Nummer', 'Datum', 'Fällig', 'Betrag', 'Status', 'Projekt', ''].map(h => (
                  <th key={h} style={{ padding: '8px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)', textAlign: h === 'Betrag' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <InvoiceRow
                  key={inv.id} inv={inv} payments={payments} pdfBusy={pdfBusy}
                  projects={[project]} onPayment={onPayment} onDownload={onDownload}
                  onAssignProject={onAssignProject}
                />
              ))}
            </tbody>
          </table>
        )}

        <div className="pp-money" style={{ marginTop: 14 }}>
          <span>Bezahlt {fmt(totalPaid)}</span>
          <span>Offen {fmt(totalOpen)}</span>
          <b>Gestellt {fmt(totalBilled)}</b>
        </div>
      </div>
    </div>
  )
}
