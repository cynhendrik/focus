# E-Rechnung (ZUGFeRD/Factur-X, ausgehend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Jede ausgehende Rechnung wird ein ZUGFeRD/Factur-X-PDF: das bestehende Sicht-PDF mit eingebettetem EN-16931-konformem CII-XML (`factur-x.xml`) + Factur-X-XMP-Metadaten.

**Architecture:** Pure-JS im bestehenden Stack. Neue `src/lib/erechnung/`-Module bauen das CII-XML (mit reinen Mapping-Helfern) und betten es per `pdf-lib` in das `@react-pdf`-PDF ein. `getInvoicePdfBytes()` orchestriert. Readiness-Check warnt bei fehlenden Stammdaten.

**Tech Stack:** TypeScript, React, `@react-pdf/renderer` 4.5.1, **`pdf-lib`** (neu), Vite-Asset-Imports, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-21-erechnung-zugferd-outgoing-design.md`

**Wichtig — nicht anfassen (uncommittete WIP):** `src/App.tsx`, `src/components/leads/LeadDetailModal.tsx`, `src/routes/leverage/LeverageLeadsRoute.tsx`, `src-tauri/Cargo.toml`. Nie `git add -A` — immer nur die in der Task genannten Dateien.

**Test-Befehle:** `npx vitest run <pfad>`; voll `npm run test:run`; Typecheck `npx tsc --noEmit`.

---

### Task 1: Dependency `pdf-lib`

**Files:** `package.json`

- [ ] **Step 1: Installieren**

Run: `npm install pdf-lib@^1.17.1`
Expected: `pdf-lib` steht unter dependencies, `npm ls pdf-lib` zeigt 1.17.x.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add pdf-lib for e-Rechnung PDF post-processing"
```

---

### Task 2: USt-Kategorie-Mapping (`vat-category.ts`)

**Files:**
- Create: `src/lib/erechnung/vat-category.ts`
- Test: `src/lib/erechnung/vat-category.test.ts`

- [ ] **Step 1: Failing test**

`src/lib/erechnung/vat-category.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { vatCategory } from './vat-category'

describe('vatCategory', () => {
  it('standard → S mit Item-Satz', () => {
    expect(vatCategory('standard', 19)).toEqual({ code: 'S', rate: 19 })
  })
  it('reduced → S mit Item-Satz', () => {
    expect(vatCategory('reduced', 7)).toEqual({ code: 'S', rate: 7 })
  })
  it('reverse_charge → AE, Satz 0, §13b-Grund', () => {
    const r = vatCategory('reverse_charge', 19)
    expect(r.code).toBe('AE'); expect(r.rate).toBe(0)
    expect(r.exemptionReason).toMatch(/13b/)
  })
  it('kleinunternehmer → E, Satz 0, §19-Grund', () => {
    const r = vatCategory('kleinunternehmer', 19)
    expect(r.code).toBe('E'); expect(r.rate).toBe(0)
    expect(r.exemptionReason).toMatch(/19/)
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run src/lib/erechnung/vat-category.test.ts`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implement**

`src/lib/erechnung/vat-category.ts`:

```ts
import type { TaxMode } from '@/types/finance.types'

export interface VatCategory {
  /** EN16931 BT-151/BT-95: S=Standard, AE=Reverse Charge, E=steuerbefreit. */
  code: 'S' | 'AE' | 'E'
  rate: number
  exemptionReason?: string
}

/** USt-Kategorie + Satz für die E-Rechnung aus dem Rechnungs-Steuermodus ableiten. */
export function vatCategory(taxMode: TaxMode, itemRate: number): VatCategory {
  switch (taxMode) {
    case 'reverse_charge':
      return { code: 'AE', rate: 0, exemptionReason: 'Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)' }
    case 'kleinunternehmer':
      return { code: 'E', rate: 0, exemptionReason: 'Gemäß §19 UStG wird keine Mehrwertsteuer berechnet.' }
    case 'standard':
    case 'reduced':
    default:
      return { code: 'S', rate: itemRate }
  }
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/erechnung/vat-category.test.ts` (4 pass)

- [ ] **Step 5: Commit**

```bash
git add src/lib/erechnung/vat-category.ts src/lib/erechnung/vat-category.test.ts
git commit -m "feat(erechnung): VAT category mapping (S/AE/E)"
```

---

### Task 3: Einheit-Code-Mapping (`unit-codes.ts`)

**Files:**
- Create: `src/lib/erechnung/unit-codes.ts`
- Test: `src/lib/erechnung/unit-codes.test.ts`

- [ ] **Step 1: Failing test**

`src/lib/erechnung/unit-codes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { unitCode } from './unit-codes'

describe('unitCode (UN/ECE Rec 20)', () => {
  it('Stunden-Varianten → HUR', () => {
    for (const u of ['Std', 'std', 'Stunde', 'Stunden', 'h', 'hr']) expect(unitCode(u)).toBe('HUR')
  })
  it('Tag → DAY', () => { expect(unitCode('Tag')).toBe('DAY'); expect(unitCode('tage')).toBe('DAY') })
  it('Stück/Pauschale → C62', () => {
    for (const u of ['Stk', 'Stück', 'stueck', 'x', 'Pauschale']) expect(unitCode(u)).toBe('C62')
  })
  it('km → KMT, Monat → MON', () => { expect(unitCode('km')).toBe('KMT'); expect(unitCode('Monat')).toBe('MON') })
  it('leer/unbekannt → Fallback C62', () => {
    expect(unitCode('')).toBe('C62'); expect(unitCode(undefined)).toBe('C62'); expect(unitCode('blubb')).toBe('C62')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/erechnung/unit-codes.test.ts`

- [ ] **Step 3: Implement**

`src/lib/erechnung/unit-codes.ts`:

```ts
/** Freitext-Einheit → UN/ECE-Rec-20-Code (EN16931 BT-130). Fallback C62 (Stück). */
const MAP: Record<string, string> = {
  std: 'HUR', st  : 'HUR', stunde: 'HUR', stunden: 'HUR', h: 'HUR', hr: 'HUR', 'h.': 'HUR',
  tag: 'DAY', tage: 'DAY', day: 'DAY', days: 'DAY',
  stk: 'C62', 'stk.': 'C62', stueck: 'C62', 'stück': 'C62', stueckk: 'C62', x: 'C62',
  pauschale: 'C62', psch: 'C62', pcs: 'C62', piece: 'C62', stueckzahl: 'C62',
  km: 'KMT', kilometer: 'KMT',
  monat: 'MON', monate: 'MON', month: 'MON',
  pkt: 'C62', stk_: 'C62',
}

export function unitCode(unit?: string | null): string {
  if (!unit) return 'C62'
  const key = unit.trim().toLowerCase()
  if (!key) return 'C62'
  return MAP[key] ?? 'C62'
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/erechnung/unit-codes.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/erechnung/unit-codes.ts src/lib/erechnung/unit-codes.test.ts
git commit -m "feat(erechnung): UN/ECE unit code mapping"
```

---

### Task 4: Ländercode-Mapping (`country-codes.ts`)

**Files:**
- Create: `src/lib/erechnung/country-codes.ts`
- Test: `src/lib/erechnung/country-codes.test.ts`

- [ ] **Step 1: Failing test**

`src/lib/erechnung/country-codes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { countryCode } from './country-codes'

describe('countryCode (ISO 3166-1 alpha-2)', () => {
  it('Deutschland-Varianten → DE', () => {
    for (const c of ['Deutschland', 'germany', 'DE', 'de']) expect(countryCode(c)).toBe('DE')
  })
  it('Österreich → AT, Schweiz → CH', () => {
    expect(countryCode('Österreich')).toBe('AT'); expect(countryCode('Schweiz')).toBe('CH')
  })
  it('bereits 2-stelliger Code → uppercase durchgereicht', () => {
    expect(countryCode('fr')).toBe('FR')
  })
  it('leer/unbekannt → Fallback DE', () => {
    expect(countryCode('')).toBe('DE'); expect(countryCode(undefined)).toBe('DE'); expect(countryCode('Atlantis')).toBe('DE')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/erechnung/country-codes.test.ts`

- [ ] **Step 3: Implement**

`src/lib/erechnung/country-codes.ts`:

```ts
/** Freitext-Land → ISO-3166-1 alpha-2 (EN16931 BT-40/BT-55). Fallback DE. */
const NAMES: Record<string, string> = {
  deutschland: 'DE', germany: 'DE',
  österreich: 'AT', oesterreich: 'AT', austria: 'AT',
  schweiz: 'CH', switzerland: 'CH',
  frankreich: 'FR', france: 'FR',
  niederlande: 'NL', netherlands: 'NL',
  italien: 'IT', italy: 'IT',
  spanien: 'ES', spain: 'ES',
  belgien: 'BE', belgium: 'BE',
  polen: 'PL', poland: 'PL',
  luxemburg: 'LU', luxembourg: 'LU',
}
const ISO2 = /^[A-Za-z]{2}$/

export function countryCode(country?: string | null): string {
  if (!country) return 'DE'
  const raw = country.trim()
  if (!raw) return 'DE'
  if (ISO2.test(raw)) return raw.toUpperCase()
  return NAMES[raw.toLowerCase()] ?? 'DE'
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/erechnung/country-codes.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/erechnung/country-codes.ts src/lib/erechnung/country-codes.test.ts
git commit -m "feat(erechnung): country code mapping"
```

---

### Task 5: CII-XML-Generator (`cii-invoice.ts`)

**Files:**
- Create: `src/lib/erechnung/cii-invoice.ts`
- Test: `src/lib/erechnung/cii-invoice.test.ts`

Kontext: `Invoice` hat `subtotal` (Netto), `taxAmount`, `total`, `bankInfo` (JSON-String mit ggf. `iban`), `taxMode`, `date`, `dueDate`, `number`. `InvoiceItem` hat `title`, `quantity`, `unitPrice`, `taxRate`, `unit?`, `itemDate?`. `CompanyProfile` hat `name`, `address`, `taxId`, `steuernummer`, `iban`. `Account` hat `name`, `street`, `zip`, `city`, `country`, `vatId`. Monetäre Summen aus den `invoice`-Feldern nehmen (damit XML == PDF), Aufschlüsselung aus `computeTaxRateGroups`.

- [ ] **Step 1: Failing test**

`src/lib/erechnung/cii-invoice.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCiiXml } from './cii-invoice'
import type { InvoiceWithItems } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

const profile: CompanyProfile = {
  name: 'Muster GmbH', address: 'Hauptstr. 1, 10115 Berlin',
  taxId: 'DE123456789', iban: 'DE89370400440532013000',
}
const account: Account = {
  id: 'a1', workspaceId: 'ws1', createdBy: 'u1', name: 'Kunde AG',
  kind: 'company', status: 'aktiv', priority: 'normal', tags: [], goals: [],
  isPrivate: false, socialLinks: '{}', leadScore: 0, scoreFactors: {},
  street: 'Kundenweg 2', zip: '20095', city: 'Hamburg', country: 'Deutschland',
  vatId: 'DE987654321', archivedAt: null, createdAt: '', updatedAt: '',
}
function inv(over: Partial<InvoiceWithItems['invoice']>, items: InvoiceWithItems['items']): InvoiceWithItems {
  return {
    invoice: {
      id: 'i1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
      number: 'RE-2026-001', date: '2026-06-01', dueDate: '2026-06-15',
      status: 'open', taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
      bankInfo: '{}', isSuggestion: false, pendingSync: false, createdAt: '', updatedAt: '',
      ...over,
    },
    items,
  }
}
const stdItems = [{ id: 'it1', invoiceId: 'i1', title: 'Beratung', quantity: 2, unitPrice: 50, taxRate: 19, total: 119, sortOrder: 0, unit: 'Std' }]

describe('buildCiiXml', () => {
  it('Standard 19%: well-formed, EN16931-Profil, Nr/Summen/Kategorie/Einheit/IBAN', () => {
    const xml = buildCiiXml(inv({}, stdItems), profile, account)
    expect(xml).toContain('<rsm:CrossIndustryInvoice')
    expect(xml).toContain('urn:cen.eu:en16931:2017')
    expect(xml).toContain('<ram:ID>RE-2026-001</ram:ID>')
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>')
    expect(xml).toContain('schemeID="VA">DE123456789')   // Verkäufer USt-IdNr
    expect(xml).toContain('>DE987654321<')                // Käufer USt-IdNr
    expect(xml).toContain('<ram:CategoryCode>S</ram:CategoryCode>')
    expect(xml).toContain('unitCode="HUR"')
    expect(xml).toContain('DE89370400440532013000')       // IBAN
    expect(xml).toContain('<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>')
    expect(xml).toContain('<ram:TaxBasisTotalAmount>100.00</ram:TaxBasisTotalAmount>')
    expect(xml.startsWith('<?xml')).toBe(true)
  })

  it('gemischte Sätze: zwei ApplicableTradeTax-Blöcke (19% und 7%)', () => {
    const items = [
      { id: 'a', invoiceId: 'i1', title: 'A', quantity: 1, unitPrice: 100, taxRate: 19, total: 119, sortOrder: 0, unit: 'Stk' },
      { id: 'b', invoiceId: 'i1', title: 'B', quantity: 1, unitPrice: 100, taxRate: 7, total: 107, sortOrder: 1, unit: 'Stk' },
    ]
    const xml = buildCiiXml(inv({ subtotal: 200, taxAmount: 26, total: 226 }, items), profile, account)
    expect((xml.match(/<ram:RateApplicablePercent>19.00<\/ram:RateApplicablePercent>/g) || []).length).toBeGreaterThanOrEqual(1)
    expect((xml.match(/<ram:RateApplicablePercent>7.00<\/ram:RateApplicablePercent>/g) || []).length).toBeGreaterThanOrEqual(1)
  })

  it('Reverse-Charge: Kategorie AE, Steuer 0, §13b-Grund', () => {
    const xml = buildCiiXml(inv({ taxMode: 'reverse_charge', subtotal: 100, taxAmount: 0, total: 100 }, stdItems), profile, account)
    expect(xml).toContain('<ram:CategoryCode>AE</ram:CategoryCode>')
    expect(xml).toContain('13b')
    expect(xml).toContain('<ram:GrandTotalAmount>100.00</ram:GrandTotalAmount>')
  })

  it('Kleinunternehmer: Kategorie E, Steuer 0, §19-Grund', () => {
    const xml = buildCiiXml(inv({ taxMode: 'kleinunternehmer', subtotal: 100, taxAmount: 0, total: 100 }, stdItems), profile, account)
    expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>')
    expect(xml).toContain('19')
  })

  it('escaped Sonderzeichen in Namen', () => {
    const xml = buildCiiXml(inv({}, stdItems), profile, { ...account, name: 'Müller & Co <GmbH>' })
    expect(xml).toContain('Müller &amp; Co &lt;GmbH&gt;')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/erechnung/cii-invoice.test.ts`

- [ ] **Step 3: Implement**

`src/lib/erechnung/cii-invoice.ts`:

```ts
import type { InvoiceWithItems } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'
import { computeTaxRateGroups } from '@/lib/invoice-tax'
import { vatCategory } from './vat-category'
import { unitCode } from './unit-codes'
import { countryCode } from './country-codes'

const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)
const n4 = (n: number): string => (Math.round(n * 10000) / 10000).toFixed(4)
const ymd = (iso: string): string => (iso || '').slice(0, 10).replace(/-/g, '')

/** Adresse "Straße, PLZ Ort" grob in Bestandteile; nur Fallback für das Profil. */
function profileAddress(profile: CompanyProfile): { line: string } {
  return { line: profile.address ?? '' }
}

function sellerTaxRegistration(profile: CompanyProfile): string {
  if (profile.taxId) return `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(profile.taxId)}</ram:ID></ram:SpecifiedTaxRegistration>`
  if (profile.steuernummer) return `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(profile.steuernummer)}</ram:ID></ram:SpecifiedTaxRegistration>`
  return ''
}

/** EN16931 CrossIndustryInvoice (Factur-X) als String. */
export function buildCiiXml(data: InvoiceWithItems, profile: CompanyProfile, account: Account): string {
  const { invoice, items } = data
  let bank: Record<string, string> = {}
  try { bank = JSON.parse(invoice.bankInfo || '{}') } catch { /* ignore */ }
  const iban = bank.iban || profile.iban || ''

  // USt-Aufschlüsselung
  const isExemptMode = invoice.taxMode === 'reverse_charge' || invoice.taxMode === 'kleinunternehmer'
  const tradeTaxBlocks: string[] = []
  if (isExemptMode) {
    const cat = vatCategory(invoice.taxMode, 0)
    tradeTaxBlocks.push(`
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${cat.exemptionReason ? `<ram:ExemptionReason>${esc(cat.exemptionReason)}</ram:ExemptionReason>` : ''}
        <ram:BasisAmount>${n2(invoice.subtotal)}</ram:BasisAmount>
        <ram:CategoryCode>${cat.code}</ram:CategoryCode>
        <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`)
  } else {
    for (const g of computeTaxRateGroups(items)) {
      tradeTaxBlocks.push(`
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${n2(g.tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${n2(g.net)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${n2(g.rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`)
    }
  }

  // Positionen
  const lineItems = items.map((it, i) => {
    const cat = vatCategory(invoice.taxMode, it.taxRate)
    const lineNet = it.quantity * it.unitPrice
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(it.title)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${n4(it.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode(it.unit)}">${n4(it.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${cat.code}</ram:CategoryCode>
          <ram:RateApplicablePercent>${n2(cat.rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${n2(lineNet)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
  }).join('')

  const sellerAddr = profileAddress(profile)

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(invoice.number ?? '')}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${ymd(invoice.date)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(profile.name ?? '')}</ram:Name>
        <ram:PostalTradeAddress><ram:CountryID>DE</ram:CountryID><ram:LineOne>${esc(sellerAddr.line)}</ram:LineOne></ram:PostalTradeAddress>
        ${sellerTaxRegistration(profile)}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(account.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(account.zip ?? '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(account.street ?? '')}</ram:LineOne>
          <ram:CityName>${esc(account.city ?? '')}</ram:CityName>
          <ram:CountryID>${countryCode(account.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${account.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(account.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ''}${tradeTaxBlocks.join('')}
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(invoice.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${n2(invoice.subtotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${n2(invoice.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${n2(invoice.taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${n2(invoice.total)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${n2(invoice.total)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/erechnung/cii-invoice.test.ts` (5 pass)

- [ ] **Step 5: Commit**

```bash
git add src/lib/erechnung/cii-invoice.ts src/lib/erechnung/cii-invoice.test.ts
git commit -m "feat(erechnung): EN16931 CII XML generator"
```

---

### Task 6: Readiness-Check (`erechnung-readiness.ts`)

**Files:**
- Create: `src/lib/erechnung/erechnung-readiness.ts`
- Test: `src/lib/erechnung/erechnung-readiness.test.ts`

- [ ] **Step 1: Failing test**

`src/lib/erechnung/erechnung-readiness.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { checkErechnungReadiness } from './erechnung-readiness'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

const fullProfile: CompanyProfile = { name: 'Muster GmbH', address: 'Hauptstr. 1, 10115 Berlin', taxId: 'DE123', iban: 'DE89...' }
const fullAccount = { name: 'Kunde AG', street: 'Weg 2', zip: '20095', city: 'Hamburg' } as Account

describe('checkErechnungReadiness', () => {
  it('vollständige Daten → keine fehlenden Felder', () => {
    expect(checkErechnungReadiness(fullProfile, fullAccount)).toEqual([])
  })
  it('fehlende USt-IdNr UND StNr → meldet Steuer-ID', () => {
    const missing = checkErechnungReadiness({ ...fullProfile, taxId: undefined, steuernummer: undefined }, fullAccount)
    expect(missing.join(' ')).toMatch(/USt-IdNr|Steuernummer/)
  })
  it('StNr statt USt-IdNr reicht', () => {
    expect(checkErechnungReadiness({ ...fullProfile, taxId: undefined, steuernummer: '30/123' }, fullAccount)).toEqual([])
  })
  it('fehlende IBAN und fehlender Kundenname werden gemeldet', () => {
    const missing = checkErechnungReadiness({ ...fullProfile, iban: undefined }, { ...fullAccount, name: '' } as Account)
    expect(missing.join(' ')).toMatch(/IBAN/)
    expect(missing.join(' ')).toMatch(/Kunde/)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/erechnung/erechnung-readiness.test.ts`

- [ ] **Step 3: Implement**

`src/lib/erechnung/erechnung-readiness.ts`:

```ts
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

/** Liefert die für eine gültige E-Rechnung fehlenden Stammdaten-Felder (leer = bereit). */
export function checkErechnungReadiness(profile: CompanyProfile, account: Account): string[] {
  const missing: string[] = []
  if (!profile.name) missing.push('Unternehmensname')
  if (!profile.address) missing.push('Unternehmensadresse')
  if (!profile.taxId && !profile.steuernummer) missing.push('USt-IdNr. oder Steuernummer')
  if (!profile.iban) missing.push('IBAN')
  if (!account.name) missing.push('Kundenname')
  if (!account.street || !account.zip || !account.city) missing.push('Kundenadresse')
  return missing
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/erechnung/erechnung-readiness.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/erechnung/erechnung-readiness.ts src/lib/erechnung/erechnung-readiness.test.ts
git commit -m "feat(erechnung): master-data readiness check"
```

---

### Task 7: Factur-X-Einbettung (`facturx-embed.ts`)

**Files:**
- Create: `src/lib/erechnung/facturx-embed.ts`
- Test: `src/lib/erechnung/facturx-embed.test.ts`

Kontext: `pdf-lib` `PDFDocument.load(bytes)` → `doc.attach(uint8, 'factur-x.xml', { mimeType: 'application/xml', description: 'Factur-X', afRelationship: AFRelationship.Alternative })` hängt die Datei als Associated File an. Zusätzlich schreiben wir ein XMP-Metadaten-Paket (PDF/A-3 + Factur-X-Extension-Schema) in den Catalog `/Metadata`. Das Test-PDF erzeugen wir minimal mit `pdf-lib` selbst (kein @react-pdf im Unit-Test).

- [ ] **Step 1: Failing test**

`src/lib/erechnung/facturx-embed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { embedFacturX } from './facturx-embed'

async function minimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return doc.save()
}

describe('embedFacturX', () => {
  it('hängt factur-x.xml an und setzt XMP/Factur-X-Metadaten', async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice/>'
    const out = await embedFacturX(await minimalPdf(), xml)
    const text = Buffer.from(out).toString('latin1')
    expect(text).toContain('factur-x.xml')          // Dateiname im EmbeddedFiles-Namebaum
    expect(text).toContain('pdfaid')                 // PDF/A XMP-Namespace
    expect(text).toContain('CrossIndustryDocument')  // Factur-X-Extension
    // Reload bestätigt valides PDF
    const reloaded = await PDFDocument.load(out)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('produziert größeres PDF als das Original (Anhang vorhanden)', async () => {
    const base = await minimalPdf()
    const out = await embedFacturX(base, '<x>data here padding padding</x>')
    expect(out.length).toBeGreaterThan(base.length)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/erechnung/facturx-embed.test.ts`

- [ ] **Step 3: Implement**

`src/lib/erechnung/facturx-embed.ts`:

```ts
import { PDFDocument, AFRelationship, PDFName, PDFString, PDFHexString } from 'pdf-lib'

const FX_FILENAME = 'factur-x.xml'

function buildXmp(): string {
  // PDF/A-3B + Factur-X-Extension-Schema (Profil EN 16931).
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>version of the Factur-X standard</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>conformance level</pdfaProperty:description></rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * Bettet das CII-XML als Factur-X-Anhang in ein vorhandenes PDF ein und setzt
 * die PDF/A-3-/Factur-X-XMP-Metadaten. Liefert die neuen PDF-Bytes.
 */
export async function embedFacturX(pdfBytes: Uint8Array, ciiXml: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  const xmlBytes = new TextEncoder().encode(ciiXml)

  await doc.attach(xmlBytes, FX_FILENAME, {
    mimeType: 'application/xml',
    description: 'Factur-X / ZUGFeRD invoice data',
    afRelationship: AFRelationship.Alternative,
    creationDate: new Date(),
    modificationDate: new Date(),
  })

  // XMP-Metadaten in den Catalog schreiben.
  const xmp = buildXmp()
  const metaStream = doc.context.stream(xmp, {
    Type: 'Metadata',
    Subtype: 'XML',
  })
  const metaRef = doc.context.register(metaStream)
  doc.catalog.set(PDFName.of('Metadata'), metaRef)

  return doc.save()
}

// Hinweis: PDFString/PDFHexString importiert für evtl. spätere OutputIntent-Erweiterung (Task 9b).
void PDFString; void PDFHexString
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run src/lib/erechnung/facturx-embed.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/erechnung/facturx-embed.ts src/lib/erechnung/facturx-embed.test.ts
git commit -m "feat(erechnung): embed factur-x.xml + PDF/A-3 XMP via pdf-lib"
```

---

### Task 8: Integration in `getInvoicePdfBytes` + Readiness-Warnung

**Files:**
- Modify: `src/components/finance/InvoicePDF.tsx`

- [ ] **Step 1: `getInvoicePdfBytes` um die Einbettung erweitern**

In `src/components/finance/InvoicePDF.tsx` die Imports ergänzen:

```ts
import { buildCiiXml } from '@/lib/erechnung/cii-invoice'
import { embedFacturX } from '@/lib/erechnung/facturx-embed'
import { checkErechnungReadiness } from '@/lib/erechnung/erechnung-readiness'
```

`getInvoicePdfBytes` ersetzen durch:

```ts
export async function getInvoicePdfBytes(
  data: InvoiceWithItems,
  profile: CompanyProfile,
  account: Account,
): Promise<Uint8Array> {
  const blob = await pdf(<InvoicePDFDoc data={data} profile={profile} account={account} />).toBlob()
  const buf = await blob.arrayBuffer()
  const visualPdf = new Uint8Array(buf)
  // ZUGFeRD/Factur-X: CII-XML erzeugen und einbetten. Schlägt das fehl, liefern
  // wir das reine Sicht-PDF zurück (besser eine PDF ohne XML als gar keine).
  try {
    const xml = buildCiiXml(data, profile, account)
    return await embedFacturX(visualPdf, xml)
  } catch {
    return visualPdf
  }
}
```

- [ ] **Step 2: Readiness-Warnung im Download-Pfad**

In `downloadInvoicePDF` (gleiche Datei) NACH `toast.setDone(savedTo)` die Warnung ergänzen. Ersetze den `try`-Block-Inhalt so, dass bei fehlenden Feldern ein Hinweis erscheint:

```ts
  try {
    toast.start(filename, false)
    const bytes = await pdfToBytes(data, profile, account)
    toast.setSaving()
    const savedTo = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
    toast.setDone(savedTo)
    const missing = checkErechnungReadiness(profile, account)
    if (missing.length > 0) {
      const { useToastStore } = await import('@/store/toast.store')
      useToastStore.getState().show(`E-Rechnung unvollständig — fehlt: ${missing.join(', ')}. In Einstellungen ergänzen.`, 'warning')
    }
  } catch {
    toast.setError('Fehler beim Speichern')
  }
```

Hinweis: Vor Implementierung `src/store/toast.store.ts` lesen und die EXAKTE Show-API verwenden (Funktionsname/Signatur/Severity-Wert können abweichen). Wenn die API anders ist, entsprechend anpassen — die Warnung muss eine sichtbare, nicht-blockierende Meldung sein.

- [ ] **Step 3: Typecheck + relevante Tests**

Run: `npx tsc --noEmit`
Run: `npx vitest run src/lib/erechnung/`
Expected: grün.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/InvoicePDF.tsx
git commit -m "feat(erechnung): produce ZUGFeRD on invoice export + readiness warning"
```

---

### Task 9: PDF/A-3-Härtung — eingebetteter Font + sRGB-OutputIntent (additiv, best-effort)

Ziel: striktere PDF/A-3-Konformität. **Wenn** ein TTF-Font und ein sRGB-ICC-Profil beschafft werden können, einbetten; sonst diese Task als DONE_WITH_CONCERNS melden (Kern aus Task 1–8 bleibt gültig).

**Files:**
- Create: `src/assets/fonts/` (TTF), `src/assets/icc/` (ICC)
- Modify: `src/components/finance/InvoicePDF.tsx` (Font.register), `src/lib/erechnung/facturx-embed.ts` (OutputIntent)

- [ ] **Step 1: Assets beschaffen**

Besorge einen frei lizenzierten TTF (regular + bold), z. B. DejaVu Sans oder Liberation Sans, und ein sRGB-ICC-Profil (z. B. `sRGB2014.icc` von color.org). Lege sie unter `src/assets/fonts/` bzw. `src/assets/icc/` ab. Wenn kein Bezug möglich ist (Netz/Lizenz): Step 2–4 überspringen, Task als DONE_WITH_CONCERNS melden mit Begründung.

- [ ] **Step 2: Font in `@react-pdf` registrieren (Layout erhalten)**

In `InvoicePDF.tsx` oben:

```ts
import { Font } from '@react-pdf/renderer'
import fontRegular from '@/assets/fonts/DejaVuSans.ttf'
import fontBold from '@/assets/fonts/DejaVuSans-Bold.ttf'

Font.register({ family: 'Invoice', fonts: [
  { src: fontRegular, fontWeight: 'normal' },
  { src: fontBold, fontWeight: 'bold' },
] })
```

Dann in den Styles `fontFamily: 'Helvetica'` → `'Invoice'` und `'Helvetica-Bold'` → `{ fontFamily: 'Invoice', fontWeight: 'bold' }` ersetzen. Schriftgrößen/Abstände unverändert lassen, damit das Layout gleich bleibt.

- [ ] **Step 3: OutputIntent in `embedFacturX` ergänzen**

`embedFacturX` so erweitern, dass — sofern ICC-Bytes übergeben — ein OutputIntent mit sRGB-ICC gesetzt wird. Signatur erweitern: `embedFacturX(pdfBytes, ciiXml, iccBytes?)`. Wenn `iccBytes` vorhanden: ICC als Stream einbetten, OutputIntent-Dict (`S=/GTS_PDFA1`, `OutputConditionIdentifier=sRGB`, `DestOutputProfile=<iccStream>`, `N=3`) bauen und in `catalog /OutputIntents` (Array) eintragen. ICC im Aufrufer (`InvoicePDF.tsx`) via Vite-URL laden:

```ts
import iccUrl from '@/assets/icc/sRGB2014.icc?url'
// in getInvoicePdfBytes:
let icc: Uint8Array | undefined
try { icc = new Uint8Array(await (await fetch(iccUrl)).arrayBuffer()) } catch { icc = undefined }
return await embedFacturX(visualPdf, xml, icc)
```

Konkrete pdf-lib-OutputIntent-Implementierung (in `facturx-embed.ts`):

```ts
// innerhalb embedFacturX, nach dem Metadata-Set, vor doc.save(), wenn iccBytes:
if (iccBytes && iccBytes.length > 0) {
  const iccStream = doc.context.stream(iccBytes, { N: 3, Subtype: 'ICCBased' /* nur Hinweis; reiner ICC-Stream */ })
  // Reiner ICC-Stream (kein /Type) für DestOutputProfile:
  const iccRef = doc.context.register(doc.context.flateStream(iccBytes, { N: 3 }))
  const oi = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  })
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([oi]))
  void iccStream
}
```

(Falls eine pdf-lib-API hier nicht exakt passt, äquivalent mit `doc.context.obj`/`register` umsetzen — Ziel: gültiger OutputIntent mit eingebettetem sRGB-ICC.)

- [ ] **Step 4: Tests + Typecheck**

`facturx-embed.test.ts` um einen Fall erweitern: mit ICC-Bytes → Ergebnis enthält `OutputIntent` (Byte-Suche). Ohne ICC → wie bisher (kein OutputIntent, kein Fehler).

Run: `npx vitest run src/lib/erechnung/ && npx tsc --noEmit`
Expected: grün.

- [ ] **Step 5: Commit**

```bash
git add src/assets src/components/finance/InvoicePDF.tsx src/lib/erechnung/facturx-embed.ts src/lib/erechnung/facturx-embed.test.ts
git commit -m "feat(erechnung): PDF/A-3 hardening — embedded font + sRGB OutputIntent"
```

---

### Task 10: Verifikation

**Files:** keine.

- [ ] **Step 1: Voller Testlauf** — `npm run test:run` → alle grün (bestehende + neue erechnung-Tests).
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → keine Fehler.
- [ ] **Step 3: Manuell (User):** App starten, eine Rechnung exportieren, das erzeugte PDF in einem kostenlosen Online-ZUGFeRD/Mustang-Validator prüfen; Befund notieren. Bei Validierungs-Fehlern → Folge-Fix.

---

## Self-Review Notes

- **Spec-Abdeckung:** CII-XML (Task 5), Mappings vat/unit/country (2–4), Einbettung XML+XMP (7), PDF/A-3-Härtung Font+OutputIntent (9), Integration + Default-ZUGFeRD (8), Readiness-Warnung (6+8), Tests (jede Task) + manuelle Validierung (10). Out-of-scope (Eingang/XRechnung/Validator/Angebote) bleibt unberührt.
- **Typ-Konsistenz:** `vatCategory`→`{code,rate,exemptionReason?}` einheitlich genutzt in cii-invoice; `unitCode`/`countryCode`/`checkErechnungReadiness`/`buildCiiXml`/`embedFacturX` Signaturen durchgängig.
- **Risiko/known:** Strikte veraPDF-PDF/A-3-Konformität hängt an Task 9 (Assets). Kern (1–8) liefert valides eingebettetes EN16931-XML + Factur-X-XMP unabhängig davon. Manuelle Validierung (10) deckt Rest-Lücken auf.
- **WIP-Dateien** (App.tsx, LeadDetailModal, LeverageLeadsRoute, Cargo.toml) werden nicht angefasst.
