import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { InvoicePreview } from './InvoicePreview'
import type { InvoiceWithItems, TaxMode } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'

afterEach(cleanup)

const profile = { name: 'Cultera', taxId: 'DE123456789' } as unknown as CompanyProfile
const profileNoTaxId = { name: 'Cultera' } as unknown as CompanyProfile
const account = (vatId?: string) =>
  ({ name: 'Kunde GmbH', street: 'Straße 1', zip: '12345', city: 'Stadt', vatId } as unknown as Account)

function makeData(
  items: Array<{ title: string; quantity: number; unitPrice: number; taxRate: number }>,
  taxMode: TaxMode = 'standard',
): InvoiceWithItems {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const taxAmount = items.reduce((s, i) => s + (i.quantity * i.unitPrice * i.taxRate) / 100, 0)
  return {
    invoice: {
      id: 'inv1', number: 'RE-2026-001', date: '2026-06-14', dueDate: '2026-06-28',
      taxMode, status: 'open', subtotal, taxAmount, total: subtotal + taxAmount,
      bankInfo: '{}', notes: '',
    },
    items: items.map((it, i) => ({
      id: `i${i}`, ...it,
      total: Math.round(it.quantity * it.unitPrice * (1 + it.taxRate / 100) * 100) / 100,
    })),
  } as unknown as InvoiceWithItems
}

describe('InvoicePreview', () => {
  it('mixed tax rates → net + MwSt per rate (§14)', () => {
    render(<InvoicePreview onClose={() => {}} profile={profile} account={account()}
      data={makeData([
        { title: 'Beratung', quantity: 1, unitPrice: 800, taxRate: 19 },
        { title: 'Buch', quantity: 1, unitPrice: 200, taxRate: 7 },
      ])} />)
    expect(screen.getByText('Netto 19%')).toBeTruthy()
    expect(screen.getByText('MwSt 19%')).toBeTruthy()
    expect(screen.getByText('Netto 7%')).toBeTruthy()
    expect(screen.getByText('MwSt 7%')).toBeTruthy()
  })

  it('single rate → Nettobetrag + MwSt with rate', () => {
    render(<InvoicePreview onClose={() => {}} profile={profile} account={account()}
      data={makeData([{ title: 'Beratung', quantity: 2, unitPrice: 100, taxRate: 19 }])} />)
    expect(screen.getByText('Nettobetrag')).toBeTruthy()
    expect(screen.getByText('MwSt 19%')).toBeTruthy()
  })

  it('kleinunternehmer → §19 hint, no MwSt column', () => {
    render(<InvoicePreview onClose={() => {}} profile={profile} account={account()}
      data={makeData([{ title: 'Leistung', quantity: 1, unitPrice: 500, taxRate: 0 }], 'kleinunternehmer')} />)
    expect(screen.getByText(/§19 UStG/)).toBeTruthy()
    expect(screen.queryByText('MwSt 0%')).toBeNull()
  })

  it('renders recipient USt-IdNr. when set', () => {
    render(<InvoicePreview onClose={() => {}} profile={profile} account={account('DE999888777')}
      data={makeData([{ title: 'A', quantity: 1, unitPrice: 100, taxRate: 19 }])} />)
    expect(screen.getByText(/USt-IdNr\.: DE999888777/)).toBeTruthy()
  })

  it('hides USt-IdNr. entirely when neither sender nor recipient has one', () => {
    render(<InvoicePreview onClose={() => {}} profile={profileNoTaxId} account={account()}
      data={makeData([{ title: 'A', quantity: 1, unitPrice: 100, taxRate: 19 }])} />)
    expect(screen.queryByText(/USt-IdNr\./)).toBeNull()
  })
})
