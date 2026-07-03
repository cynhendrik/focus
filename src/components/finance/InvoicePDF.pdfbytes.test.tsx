// Regressionstest: PDF-Byte-Erzeugung end-to-end (Repro des §19-italic-Crashes vom 2026-07-03).
// Font-Imports auf absolute Pfade mocken — react-pdf lädt sie im Node-Test per fs.
import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'

vi.mock('@/assets/fonts/LiberationSans-Regular.ttf', () => ({
  default: path.resolve(process.cwd(), 'src/assets/fonts/LiberationSans-Regular.ttf'),
}))
vi.mock('@/assets/fonts/LiberationSans-Bold.ttf', () => ({
  default: path.resolve(process.cwd(), 'src/assets/fonts/LiberationSans-Bold.ttf'),
}))

import { getInvoicePdfBytes } from './InvoicePDF'

const invoice = {
  id: '115c3471-79b9-4797-a5c2-053092b3e04f',
  workspaceId: '2bb6d3c7-1edd-46da-bb52-0e51a159b7f2',
  createdBy: '64665d35-6bad-499d-905c-5890edc97ab4',
  accountId: '8560b848-ef4b-4f25-abc8-3fe9aca72c39',
  number: '2026-00008',
  date: '2026-07-03',
  dueDate: '2026-07-17',
  status: 'open',
  taxMode: 'kleinunternehmer',
  subtotal: 400,
  taxAmount: 0,
  total: 400,
  bankInfo: '{"iban":"DE33 1001 0178 6921 3630 94"}',
  notes: undefined,
  isSuggestion: false,
  pendingSync: true,
  createdAt: '2026-07-03T18:20:17Z',
  updatedAt: '2026-07-03T18:20:17Z',
} as never

const items = [{
  id: '9122008f-32f7-4eaa-950e-bc43a509d807',
  invoiceId: '115c3471-79b9-4797-a5c2-053092b3e04f',
  title: 'Social Media Management',
  description: undefined,
  quantity: 1,
  unitPrice: 400,
  taxRate: 0,
  total: 400,
  sortOrder: 0,
  unit: undefined,
  itemDate: undefined,
}] as never

const profile = {
  name: 'Egeli & Wehe Media Gbr',
  address: 'Hegelstr. 10, 58089 Hagen',
  email: 'team@cultera.de',
  phone: '017641957060',
  website: 'www.growingflow.de',
  taxId: '',
  steuernummer: '321/5875/0949',
  iban: 'DE33 1001 0178 6921 3630 94',
  bankName: 'Commerzbank AG',
  handelsregister: '',
  registergericht: '',
  geschaeftsfuehrer: 'Hendrik Wehe',
  invoiceIntro: 'Vielen Dank für Ihr Vertrauen. Wir stellen Ihnen folgende Leistungen in Rechnung:',
  kleinunternehmer: true,
  zahlungszielTage: 14,
  leistungszeitpunkt: 'rechnungsdatum',
  invoiceAccentColor: '#111111',
} as never

const account = {
  id: '8560b848-ef4b-4f25-abc8-3fe9aca72c39',
  name: 'Testkunde',
  email: 'kunde@test.de',
  workspaceId: '2bb6d3c7-1edd-46da-bb52-0e51a159b7f2',
} as never

describe('InvoicePDF — Byte-Erzeugung (Regression §19-italic-Crash)', () => {
  it('erzeugt PDF-Bytes für eine Kleinunternehmer-Rechnung (0 % / §19-Hinweisbox)', async () => {
    const bytes = await getInvoicePdfBytes({ invoice, items } as never, profile, account)
    expect(bytes.length).toBeGreaterThan(1000)
    // %PDF-Magic am Anfang
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF')
  }, 30_000)

  it('erzeugt PDF-Bytes für eine Standard-Rechnung (19 %)', async () => {
    const std = {
      ...(invoice as object),
      taxMode: 'standard', taxAmount: 76, total: 476,
    } as never
    const stdItems = [{ ...(items as unknown as object[])[0], taxRate: 19, total: 476 }] as never
    const stdProfile = { ...(profile as object), kleinunternehmer: false } as never
    const bytes = await getInvoicePdfBytes({ invoice: std, items: stdItems } as never, stdProfile, account)
    expect(bytes.length).toBeGreaterThan(1000)
  }, 30_000)
})
