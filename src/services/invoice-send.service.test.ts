import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/mail.service', () => ({ MailService: { sendEmail: vi.fn() } }))
vi.mock('@/data/activities.gateway', () => ({ ActivitiesGateway: { create: vi.fn().mockResolvedValue({}) } }))
vi.mock('@/data/finance.gateway', () => ({ FinanceGateway: { getInvoice: vi.fn() } }))
vi.mock('@/data/contacts.gateway', () => ({ ContactsGateway: { getByAccount: vi.fn() } }))
vi.mock('@/components/finance/InvoicePDF', () => ({
  getInvoicePdfBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('/tmp/rechnung.pdf') }))

import { prepareInvoiceMail, sendInvoiceMail } from './invoice-send.service'
import { MailService } from '@/services/mail.service'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { FinanceGateway } from '@/data/finance.gateway'
import { ContactsGateway } from '@/data/contacts.gateway'
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'

const baseInvoice = {
  id: 'inv1',
  workspaceId: 'ws1',
  createdBy: 'u1',
  accountId: 'acc1',
  number: 'RE-001',
  date: '2026-07-01',
  dueDate: '2026-07-31',
  status: 'open' as const,
  taxMode: 'standard' as const,
  subtotal: 100,
  taxAmount: 19,
  total: 119,
  bankInfo: '',
  isSuggestion: false,
  pendingSync: false,
  createdAt: '',
  updatedAt: '',
}

const mailAccount = { id: 'mail1', email: 'me@company.de' }
const account = { id: 'acc1', name: 'Müller GmbH', email: 'kunden@mueller.de' }
const fullInvoice = { invoice: baseInvoice, items: [] }

describe('prepareInvoiceMail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMailStore.setState({ accounts: [mailAccount] } as never)
    useAccountsStore.setState({ accounts: [account] } as never)
    useCompanyStore.setState({ profile: { name: 'Mein Betrieb' } } as never)
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValue([])
    vi.mocked(FinanceGateway.getInvoice).mockResolvedValue(fullInvoice as never)
  })

  it('kein Mail-Konto → ok:false mit E-Mail-Konto', async () => {
    useMailStore.setState({ accounts: [] } as never)
    const r = await prepareInvoiceMail(baseInvoice)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('E-Mail-Konto')
  })

  it('keine Empfänger-Adresse → ok:false mit E-Mail-Adresse', async () => {
    useAccountsStore.setState({ accounts: [{ ...account, email: undefined }] } as never)
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValue([])
    const r = await prepareInvoiceMail(baseInvoice)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('E-Mail-Adresse')
  })

  it('PDF-Erzeugung wirft → ok:false mit PDF', async () => {
    vi.mocked(FinanceGateway.getInvoice).mockRejectedValue(new Error('DB-Fehler'))
    const r = await prepareInvoiceMail(baseInvoice)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('PDF')
  })

  it('happy path: to aus Kontakt, Betreff enthält Nummer, Body enthält Betrag', async () => {
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValue([
      { id: 'c1', email: 'kontakt@mueller.de' } as never,
    ])
    const r = await prepareInvoiceMail(baseInvoice)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.to).toBe('kontakt@mueller.de')
      expect(r.data.subject).toContain('RE-001')
      expect(r.data.body).toContain('119')
    }
  })
})

describe('sendInvoiceMail', () => {
  const mail = { to: 'kunde@mueller.de', subject: 'Rechnung RE-001', body: 'Text...', attachmentPath: '/tmp/r.pdf' }

  beforeEach(() => {
    vi.clearAllMocks()
    useMailStore.setState({ accounts: [mailAccount] } as never)
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws1' } as never)
    useAuthStore.setState({ user: { id: 'u1' } } as never)
    vi.mocked(MailService.sendEmail).mockResolvedValue(undefined)
    vi.mocked(ActivitiesGateway.create).mockResolvedValue({} as never)
  })

  it('happy: sendEmail mit attachmentPaths aufgerufen + Activity erstellt', async () => {
    const r = await sendInvoiceMail(baseInvoice, mail)
    expect(r.ok).toBe(true)
    expect(MailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ['kunde@mueller.de'],
      attachmentPaths: ['/tmp/r.pdf'],
    }))
    expect(ActivitiesGateway.create).toHaveBeenCalled()
  })

  it('sendEmail wirft → ok:false, keine Activity', async () => {
    vi.mocked(MailService.sendEmail).mockRejectedValue(new Error('SMTP Fehler'))
    const r = await sendInvoiceMail(baseInvoice, mail)
    expect(r.ok).toBe(false)
    expect(ActivitiesGateway.create).not.toHaveBeenCalled()
  })
})
