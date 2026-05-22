import {
  Document, Page, Text, View, StyleSheet, pdf, Image,
} from '@react-pdf/renderer'
import { invoke } from '@tauri-apps/api/core'
import type { InvoiceWithItems } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'
import { useDownloadToastStore } from '@/store/download-toast.store'

interface Props {
  data: InvoiceWithItems
  profile: CompanyProfile
  account: Account
}

const TAX_HINTS: Record<string, string> = {
  reverse_charge:   'Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)',
  kleinunternehmer: 'Gemäß §19 UStG wird keine Mehrwertsteuer berechnet.',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

function InitialsBadge({ name }: { name?: string }) {
  const initials = (name || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Helvetica-Bold' }}>{initials}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  page:        { padding: '14mm 16mm', fontSize: 9.5, fontFamily: 'Helvetica', color: '#111' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  company:     { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  companyMeta: { fontSize: 8.5, color: '#555', lineHeight: 1.5 },
  docTitle:    { fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 },
  docNumber:   { fontSize: 9, color: '#999', fontFamily: 'Helvetica', marginTop: 2 },
  rule:        { height: 1.5, backgroundColor: '#e0e0e0', marginBottom: 14 },
  twoCol:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 20 },
  label:       { fontSize: 7.5, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 3 },
  metaBlock:   { flexDirection: 'column', gap: 10, minWidth: 130 },
  metaItem:    { flexDirection: 'column' },
  metaVal:     { fontSize: 9, fontFamily: 'Helvetica' },
  intro:       { fontSize: 9, color: '#444', marginBottom: 14, lineHeight: 1.5 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#d8d8d8', paddingBottom: 5, marginBottom: 2, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  row:         { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eeeeee' },
  colDesc:     { flex: 3 },
  colNum:      { flex: 1, textAlign: 'right' },
  colDate:     { width: 58, textAlign: 'right' as const },
  colQty:      { width: 38, textAlign: 'right' as const },
  colUnit:     { width: 46, textAlign: 'right' as const },
  colPrice:    { width: 60, textAlign: 'right' as const },
  colTax:      { width: 38, textAlign: 'right' as const },
  colTotal:    { width: 60, textAlign: 'right' as const },
  totalsBox:   { alignItems: 'flex-end', marginTop: 14 },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 28, marginBottom: 3 },
  totalLabel:  { width: 110, textAlign: 'right', color: '#666' },
  totalValue:  { width: 80, textAlign: 'right' },
  grandRow:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 28, marginTop: 4 },
  grandLabel:  { width: 110, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  grandValue:  { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  divider:     { height: 0.5, backgroundColor: '#d0d0d0', width: 220, alignSelf: 'flex-end', marginVertical: 4 },
  kleinBox:    { marginTop: 16, borderTopWidth: 0.5, borderColor: '#e4e4e4', paddingTop: 12, paddingLeft: 10, paddingRight: 10, paddingBottom: 10, backgroundColor: '#f9f9f9' },
  kleinText:   { fontSize: 8.5, color: '#666', fontStyle: 'italic', lineHeight: 1.6 },
  paySection:  { marginTop: 16, borderTopWidth: 0.5, borderColor: '#e4e4e4', paddingTop: 12 },
  payText:     { fontSize: 9, color: '#333', lineHeight: 1.7, marginBottom: 5 },
  payBank:     { fontSize: 9, color: '#555' },
  noteText:    { marginTop: 12, fontSize: 8.5, color: '#666', lineHeight: 1.5, borderTopWidth: 0.5, borderColor: '#f0f0f0', paddingTop: 10 },
  footer:      { position: 'absolute', bottom: '10mm', left: '16mm', right: '16mm', borderTopWidth: 0.5, borderColor: '#ebebeb', paddingTop: 7 },
  footerLine1: { textAlign: 'center', fontSize: 8, color: '#aaa', marginBottom: 3 },
  footerLine2: { textAlign: 'center', fontSize: 7, color: '#c0c0c0' },
})

function InvoicePDFDoc({ data, profile, account }: Props) {
  const { invoice, items } = data
  const noTax = invoice.taxMode === 'reverse_charge' || invoice.taxMode === 'kleinunternehmer'

  // Bank info: per-invoice JSON first, then profile defaults
  let bankInfo: Record<string, string> = {}
  try { bankInfo = JSON.parse(invoice.bankInfo) } catch {}
  const iban     = bankInfo.iban     || profile.iban     || ''
  const bankName = bankInfo.bankName || profile.bankName || ''

  // Leistungsdatum: compute from invoice date + profile setting
  const leistungsdatum = (() => {
    const d = new Date(invoice.date)
    if ((profile as { leistungszeitpunkt?: string }).leistungszeitpunkt === 'monatsende') {
      return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
    }
    return invoice.date
  })()

  const address = [account.street, `${account.zip ?? ''} ${account.city ?? ''}`.trim(), account.country]
    .filter(Boolean).join(', ')

  const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}` }
  const daysBetween = (a: string, b: string) =>
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)

  const footerLine1 = [profile.name, profile.address, profile.email, profile.phone]
    .filter(Boolean).join('  ·  ')
  const footerLine2 = [
    iban && `IBAN: ${iban}`,
    bankName || undefined,
    profile.taxId && `USt-IdNr.: ${profile.taxId}`,
    profile.steuernummer && `StNr.: ${profile.steuernummer}`,
    profile.handelsregister && profile.registergericht
      ? `${profile.registergericht} ${profile.handelsregister}`
      : profile.handelsregister || undefined,
    profile.geschaeftsfuehrer && `GF: ${profile.geschaeftsfuehrer}`,
  ].filter(Boolean).join('  ·  ')

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header: Company + Title */}
        <View style={s.header}>
          <View>
            <Text style={s.company}>{profile.name ?? 'Mein Unternehmen'}</Text>
            {profile.address && <Text style={s.companyMeta}>{profile.address}</Text>}
            {profile.email   && <Text style={s.companyMeta}>{profile.email}{profile.phone ? ` · ${profile.phone}` : ''}</Text>}
            {profile.website && <Text style={s.companyMeta}>{profile.website}</Text>}
            {(profile as { steuernummer?: string }).steuernummer && (
              <Text style={s.companyMeta}>StNr.: {(profile as { steuernummer?: string }).steuernummer}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            {profile.logoBase64
              ? <Image src={profile.logoBase64} style={{ width: 48, height: 48, objectFit: 'contain' as const }} />
              : <InitialsBadge name={profile.name} />
            }
            <Text style={s.docTitle}>RECHNUNG</Text>
            <Text style={s.docNumber}>{invoice.number ?? 'Entwurf'}</Text>
          </View>
        </View>

        <View style={s.rule} />

        {/* Recipient + Meta */}
        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Rechnungsempfänger</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 2 }}>{account.name}</Text>
            {address && <Text style={{ fontSize: 8.5, color: '#555', lineHeight: 1.5 }}>{address}</Text>}
          </View>
          <View style={s.metaBlock}>
            {[
              { label: 'Zahlungsziel',   value: `${daysBetween(invoice.date, invoice.dueDate)} Tage` },
              { label: 'Rechnungsdatum', value: fmtDate(invoice.date) },
              { label: 'Leistungsdatum', value: fmtDate(leistungsdatum) },
              { label: 'Fällig am',      value: fmtDate(invoice.dueDate) },
              { label: 'Rechnungsnr.',   value: invoice.number ?? '—' },
            ].map(m => (
              <View key={m.label} style={s.metaItem}>
                <Text style={s.label}>{m.label}</Text>
                <Text style={s.metaVal}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Intro text */}
        {profile.invoiceIntro && (
          <Text style={s.intro}>{profile.invoiceIntro}</Text>
        )}

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={s.colDesc}>Beschreibung</Text>
          <Text style={s.colDate}>Datum</Text>
          <Text style={s.colQty}>Menge</Text>
          <Text style={s.colUnit}>Einheit</Text>
          <Text style={s.colPrice}>Einzelpreis</Text>
          {!noTax && <Text style={s.colTax}>MwSt</Text>}
          <Text style={s.colTotal}>Betrag</Text>
        </View>

        {/* Items */}
        {items.map((item, i) => (
          <View key={i} style={s.row}>
            <View style={s.colDesc}>
              <Text>{item.title}</Text>
              {item.description && (
                <Text style={{ fontSize: 8, color: '#888', marginTop: 1 }}>{item.description}</Text>
              )}
            </View>
            <Text style={s.colDate}>{fmtDate(item.itemDate ?? invoice.date)}</Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            <Text style={s.colUnit}>{item.unit ?? ''}</Text>
            <Text style={s.colPrice}>{item.unitPrice.toFixed(2)} €</Text>
            {!noTax && <Text style={s.colTax}>{item.taxRate}%</Text>}
            <Text style={s.colTotal}>{item.total.toFixed(2)} €</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Nettobetrag</Text>
            <Text style={s.totalValue}>{fmt(invoice.subtotal)}</Text>
          </View>
          {!noTax && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>MwSt</Text>
              <Text style={s.totalValue}>{fmt(invoice.taxAmount)}</Text>
            </View>
          )}
          <View style={s.divider} />
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>Rechnungsbetrag</Text>
            <Text style={s.grandValue}>{fmt(invoice.total)}</Text>
          </View>
        </View>

        {/* Payment section */}
        {noTax
          ? TAX_HINTS[invoice.taxMode] && (
              <View style={s.kleinBox}>
                <Text style={s.kleinText}>{TAX_HINTS[invoice.taxMode]}</Text>
              </View>
            )
          : iban
            ? (
              <View style={s.paySection}>
                <Text style={s.payText}>
                  {'Bitte überweisen Sie den Rechnungsbetrag von '}
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmt(invoice.total)}</Text>
                  {' bis zum '}
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtDate(invoice.dueDate)}</Text>
                  {' unter Angabe der Rechnungsnummer als Verwendungszweck auf folgendes Konto:'}
                </Text>
                <Text style={s.payBank}>
                  {bankName ? `${bankName}  ·  ` : ''}
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>IBAN: {iban}</Text>
                </Text>
              </View>
            )
            : null
        }

        {/* Notes */}
        {invoice.notes && (
          <Text style={s.noteText}>{invoice.notes}</Text>
        )}

        {/* Footer — centered with all company info */}
        <View style={s.footer} fixed>
          <Text style={s.footerLine1}>{footerLine1}</Text>
          {footerLine2 ? <Text style={s.footerLine2}>{footerLine2}</Text> : null}
        </View>

      </Page>
    </Document>
  )
}

async function pdfToBytes(data: InvoiceWithItems, profile: CompanyProfile, account: Account): Promise<Uint8Array> {
  const blob = await pdf(<InvoicePDFDoc data={data} profile={profile} account={account} />).toBlob()
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}

export async function downloadInvoicePDF(data: InvoiceWithItems, profile: CompanyProfile, account: Account) {
  const toast = useDownloadToastStore.getState()
  const fmtAmt = (n: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR'
  const safeClient = account.name.replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
  const filename = `RECHNUNG ${data.invoice.number ?? 'Entwurf'} - ${safeClient} - ${fmtAmt(data.invoice.total)}.pdf`
  try {
    toast.start(filename, false)
    const bytes = await pdfToBytes(data, profile, account)
    toast.setSaving()
    const savedTo = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
    toast.setDone(savedTo)
  } catch {
    toast.setError('Fehler beim Speichern')
  }
}

export async function batchExportInvoicesPDF(
  invoices: Array<{ data: InvoiceWithItems; account: Account }>,
  profile: CompanyProfile,
  suggestedZipName: string,
  onProgress?: (pct: number) => void,
) {
  const toast = useDownloadToastStore.getState()
  try {
    toast.start(suggestedZipName, true)
    const files: Array<{ name: string; bytes: number[] }> = []
    for (let i = 0; i < invoices.length; i++) {
      const { data, account } = invoices[i]
      const bytes = await pdfToBytes(data, profile, account)
      const invoiceNum = data.invoice.number ?? 'Entwurf'
      const clientName = account.name.replace(/[^a-zA-Z0-9\-_äöüÄÖÜß]/g, '_').slice(0, 40)
      files.push({ name: `${invoiceNum}_${clientName}.pdf`, bytes: Array.from(bytes) })
      const pct = Math.round(((i + 1) / invoices.length) * 90)
      toast.setProgress(pct)
      onProgress?.(pct)
    }
    toast.setSaving()
    toast.setProgress(95)
    const savedTo = await invoke<string>('save_zip', { files, suggestedName: suggestedZipName })
    toast.setDone(savedTo)
    onProgress?.(100)
  } catch {
    toast.setError('Fehler beim Exportieren')
  }
}
