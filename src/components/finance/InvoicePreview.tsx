import { X, Download } from 'lucide-react'
import type { InvoiceWithItems } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'
import { downloadInvoicePDF } from './InvoicePDF'

interface Props {
  data: InvoiceWithItems
  profile: CompanyProfile
  account: Account
  onClose: () => void
}

const TAX_HINTS: Record<string, string> = {
  reverse_charge:   'Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)',
  kleinunternehmer: 'Gemäß §19 UStG wird keine Mehrwertsteuer berechnet.',
}

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function InvoicePreview({ data, profile, account, onClose }: Props) {
  const { invoice, items } = data
  const noTax = invoice.taxMode === 'reverse_charge' || invoice.taxMode === 'kleinunternehmer'
  const isCancelled = invoice.status === 'cancelled'

  // Bank info: per-invoice JSON first, then profile defaults
  let bankInfo: Record<string, string> = {}
  try { bankInfo = JSON.parse(invoice.bankInfo) } catch {}
  const iban     = bankInfo.iban     || profile.iban     || ''
  const bic      = bankInfo.bic      || profile.bic      || ''
  const bankName = bankInfo.bankName || profile.bankName || ''

  const address = [account.street, `${account.zip ?? ''} ${account.city ?? ''}`.trim(), account.country]
    .filter(Boolean).join('\n')

  // Footer legal
  const legalParts: string[] = []
  if (profile.taxId)            legalParts.push(`USt-IdNr.: ${profile.taxId}`)
  if (profile.handelsregister && profile.registergericht)
    legalParts.push(`${profile.registergericht} · ${profile.handelsregister}`)
  if (profile.geschaeftsfuehrer) legalParts.push(`GF: ${profile.geschaeftsfuehrer}`)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'oklch(0% 0 0 / 0.6)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '32px 24px', overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {invoice.number ?? 'Entwurf'}
            </span>
            {isCancelled && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--danger)', color: '#fff', letterSpacing: '0.04em' }}>
                STORNIERT
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => downloadInvoicePDF(data, profile, account)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> PDF herunterladen
            </button>
            <button className="icon-btn glass" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Invoice paper */}
        <div style={{
          background: '#fff', borderRadius: 12, padding: '52px 56px',
          color: '#111', boxShadow: '0 8px 40px oklch(0% 0 0 / 0.25)',
          opacity: isCancelled ? 0.65 : 1, position: 'relative',
        }}>
          {isCancelled && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <span style={{ fontSize: 72, fontWeight: 900, color: 'rgba(200,0,0,0.07)', letterSpacing: '0.1em', textTransform: 'uppercase', transform: 'rotate(-25deg)', userSelect: 'none' }}>
                STORNIERT
              </span>
            </div>
          )}

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>{profile.name ?? 'Mein Unternehmen'}</div>
              <div style={{ fontSize: 11, color: '#555', lineHeight: 1.7 }}>
                {profile.address && <div>{profile.address}</div>}
                {profile.email   && <div>{profile.email}{profile.phone ? ` · ${profile.phone}` : ''}</div>}
                {profile.website && <div>{profile.website}</div>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: '#111' }}>RECHNUNG</div>
              <div style={{ fontSize: 12, color: '#999', fontFamily: 'monospace', marginTop: 2 }}>{invoice.number ?? 'Entwurf'}</div>
            </div>
          </div>

          <div style={{ height: 1, background: '#e4e4e4', margin: '14px 0 20px' }} />

          {/* Recipient + Meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, gap: 40 }}>
            <div>
              <div style={{ fontSize: 9, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Rechnungsempfänger</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{account.name}</div>
              {address && <div style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{address}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 180, flexShrink: 0 }}>
              {[
                { label: 'Rechnungsdatum', value: invoice.date },
                { label: 'Fällig am',      value: invoice.dueDate },
                { label: 'Rechnungsnr.',   value: invoice.number ?? '—' },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 9, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Intro text */}
          {profile.invoiceIntro && (
            <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6, marginBottom: 18, paddingBottom: 18, borderBottom: '0.5px solid #eeeeee' }}>
              {profile.invoiceIntro}
            </div>
          )}

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid #ddd' }}>
                {['Bezeichnung', 'Menge', 'Einzelpreis', ...(noTax ? [] : ['MwSt']), 'Gesamt'].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 0', paddingRight: i === 0 ? 8 : 0, paddingLeft: i > 0 ? 8 : 0, fontSize: 9, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                  <td style={{ padding: '9px 8px 9px 0' }}>
                    <div style={{ fontWeight: 500 }}>{item.title}</div>
                    {item.description && <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{item.description}</div>}
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 8px', color: '#555' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right', padding: '9px 8px', color: '#555' }}>{fmt(item.unitPrice)}</td>
                  {!noTax && <td style={{ textAlign: 'right', padding: '9px 8px', color: '#555' }}>{item.taxRate}%</td>}
                  <td style={{ textAlign: 'right', padding: '9px 0', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginBottom: 20 }}>
            <TotalRow label="Nettobetrag" value={fmt(invoice.subtotal)} />
            {!noTax && <TotalRow label="MwSt" value={fmt(invoice.taxAmount)} />}
            <div style={{ height: 1, background: '#ddd', width: 250, margin: '3px 0' }} />
            <TotalRow label="Rechnungsbetrag" value={fmt(invoice.total)} bold />
          </div>

          {/* Tax hint */}
          {noTax && TAX_HINTS[invoice.taxMode] && (
            <FootNote>{TAX_HINTS[invoice.taxMode]}</FootNote>
          )}

          {/* Notes */}
          {invoice.notes && <FootNote>{invoice.notes}</FootNote>}

          {/* Bank info */}
          {(iban || bic) && (
            <FootNote>
              <strong>Bankverbindung</strong>
              {bankName && ` · ${bankName}`}
              {iban     && ` · IBAN: ${iban}`}
              {bic      && ` · BIC: ${bic}`}
            </FootNote>
          )}

          {/* Footer */}
          <div style={{ marginTop: 24, paddingTop: 10, borderTop: '0.5px solid #eee', fontSize: 9, color: '#bbb', display: 'flex', justifyContent: 'space-between' }}>
            <span>{profile.name}{profile.address ? ` · ${profile.address}` : ''}</span>
            <span>{legalParts.join(' · ')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 32 }}>
      <span style={{ fontSize: bold ? 13 : 11, fontWeight: bold ? 700 : 400, color: bold ? '#111' : '#777', width: 120, textAlign: 'right' }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 11, fontWeight: bold ? 700 : 400, fontVariantNumeric: 'tabular-nums', minWidth: 90, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function FootNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: '#666', borderTop: '0.5px solid #efefef', paddingTop: 10, marginBottom: 10, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}
