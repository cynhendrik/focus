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

  it('standard + 0%-Posten: Kategorie Z (zero-rated), kein S mit rate 0', () => {
    const zeroItems = [{ id: 'z1', invoiceId: 'i1', title: 'Export-Leistung', quantity: 1, unitPrice: 100, taxRate: 0, total: 100, sortOrder: 0, unit: 'Stk' }]
    const xml = buildCiiXml(inv({ taxMode: 'standard', subtotal: 100, taxAmount: 0, total: 100 }, zeroItems), profile, account)
    expect(xml).toContain('<ram:CategoryCode>Z</ram:CategoryCode>')
    expect(xml).not.toMatch(/<ram:CategoryCode>S<\/ram:CategoryCode>/)
    expect(xml).toContain('<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>')
    expect(xml).toContain('<ram:GrandTotalAmount>100.00</ram:GrandTotalAmount>')
  })
})
