import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import type { OfferWithItems } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

interface Props {
  data: OfferWithItems
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
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Helvetica-Bold' }}>{initials}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  page:        { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#111' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
  company:     { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  companyMeta: { fontSize: 9, color: '#666', marginTop: 2 },
  docTitle:    { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docNumber:   { fontSize: 9, color: '#888' },
  recipientBox:{ marginBottom: 28 },
  label:       { fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  metaRow:     { flexDirection: 'row', gap: 32, marginBottom: 20 },
  metaItem:    { flexDirection: 'column' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 6, marginBottom: 4, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  row:         { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eee' },
  colTitle:    { flex: 3 },
  colNum:      { flex: 1, textAlign: 'right' },
  colDate:     { width: 58, textAlign: 'right' as const },
  colQty:      { width: 38, textAlign: 'right' as const },
  colUnit:     { width: 46, textAlign: 'right' as const },
  colPrice:    { width: 60, textAlign: 'right' as const },
  colTax:      { width: 38, textAlign: 'right' as const },
  colTotal:    { width: 60, textAlign: 'right' as const },
  totalsBox:   { alignItems: 'flex-end', marginTop: 16 },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 32, marginBottom: 3 },
  totalLabel:  { width: 100, textAlign: 'right', color: '#555' },
  totalValue:  { width: 80, textAlign: 'right' },
  grandLabel:  { width: 100, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  grandValue:  { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  hint:        { marginTop: 20, fontSize: 9, color: '#666', borderTopWidth: 0.5, borderColor: '#ddd', paddingTop: 10 },
  footer:      { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#aaa', textAlign: 'center' },
})

function OfferPDFDoc({ data, profile, account }: Props) {
  const { offer, items } = data
  const noTax = offer.taxMode === 'reverse_charge' || offer.taxMode === 'kleinunternehmer'
  const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}` }

  const address = [account.street, `${account.zip ?? ''} ${account.city ?? ''}`.trim(), account.country]
    .filter(Boolean).join(', ')

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.company}>{profile.name ?? 'Mein Unternehmen'}</Text>
            <Text style={s.companyMeta}>{profile.address ?? ''}</Text>
            <Text style={s.companyMeta}>{profile.email ?? ''}{profile.phone ? ` · ${profile.phone}` : ''}</Text>
            {profile.taxId && <Text style={s.companyMeta}>USt-IdNr.: {profile.taxId}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            {profile.logoBase64
              ? <Image src={profile.logoBase64} style={{ width: 44, height: 44, objectFit: 'contain' as const }} />
              : <InitialsBadge name={profile.name} />
            }
            <Text style={s.docTitle}>ANGEBOT</Text>
            <Text style={s.docNumber}>{offer.number ?? '—'}</Text>
          </View>
        </View>

        <View style={s.recipientBox}>
          <Text style={s.label}>Empfänger</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{account.name}</Text>
          {address && <Text style={{ color: '#555', fontSize: 9 }}>{address}</Text>}
        </View>

        <View style={s.metaRow}>
          {[
            { label: 'Angebotsnr.',  value: offer.number ?? '—' },
            { label: 'Titel',        value: offer.title },
            { label: 'Gültig bis',   value: offer.validUntil },
          ].map(m => (
            <View key={m.label} style={s.metaItem}>
              <Text style={s.label}>{m.label}</Text>
              <Text>{m.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.tableHeader}>
          <Text style={s.colTitle}>Beschreibung</Text>
          <Text style={s.colDate}>Datum</Text>
          <Text style={s.colQty}>Menge</Text>
          <Text style={s.colUnit}>Einheit</Text>
          <Text style={s.colPrice}>Einzel €</Text>
          {!noTax && <Text style={s.colTax}>MwSt%</Text>}
          <Text style={s.colTotal}>Gesamt €</Text>
        </View>
        {items.map((item, i) => (
          <View key={i} style={s.row}>
            <Text style={s.colTitle}>{item.title}</Text>
            <Text style={s.colDate}>{fmtDate(item.itemDate ?? offer.validUntil)}</Text>
            <Text style={s.colQty}>{item.quantity}</Text>
            <Text style={s.colUnit}>{item.unit ?? ''}</Text>
            <Text style={s.colPrice}>{item.unitPrice.toFixed(2)}</Text>
            {!noTax && <Text style={s.colTax}>{item.taxRate}%</Text>}
            <Text style={s.colTotal}>{item.total.toFixed(2)}</Text>
          </View>
        ))}

        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Nettobetrag</Text>
            <Text style={s.totalValue}>{fmt(offer.subtotal)}</Text>
          </View>
          {!noTax && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>MwSt</Text>
              <Text style={s.totalValue}>{fmt(offer.taxAmount)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.grandLabel}>Angebotsbetrag</Text>
            <Text style={s.grandValue}>{fmt(offer.total)}</Text>
          </View>
        </View>

        {noTax && TAX_HINTS[offer.taxMode] && (
          <Text style={s.hint}>{TAX_HINTS[offer.taxMode]}</Text>
        )}
        {offer.notes && <Text style={[s.hint, { marginTop: 12 }]}>{offer.notes}</Text>}

        <Text style={s.footer}>
          {profile.name} · {profile.address} · {profile.website}
        </Text>
      </Page>
    </Document>
  )
}

export async function downloadOfferPDF(data: OfferWithItems, profile: CompanyProfile, account: Account) {
  const blob = await pdf(<OfferPDFDoc data={data} profile={profile} account={account} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Angebot-${data.offer.number ?? 'Entwurf'}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
