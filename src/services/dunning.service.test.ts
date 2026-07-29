import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_DUNNING_FEES, dunningFee, parseFeeTag, reminderFeeTags,
  dueReminders, escalatedInvoices,
  recordReminderSent, reminderBreakdown,
} from './dunning.service'
import type { Invoice } from '@/types/finance.types'

// vi.mock wird gehoistet — die Mock-Fn via vi.hoisted bereitstellen,
// sonst "Cannot access 'mockUpsert' before initialization".
const { mockUpsert } = vi.hoisted(() => ({ mockUpsert: vi.fn() }))
vi.mock('@/store/todos.store', () => ({
  useTodosStore: { getState: () => ({ upsert: mockUpsert, allTodos: [] }) },
}))

vi.mock('@/data/finance.gateway', () => ({ FinanceGateway: { getInvoice: vi.fn() } }))
vi.mock('@/data/contacts.gateway', () => ({ ContactsGateway: { getByAccount: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/lib/ai/corra', () => ({ generateCorraDraft: vi.fn().mockRejectedValue(new Error('offline')) }))
vi.mock('@/components/finance/InvoicePDF', () => ({ getInvoicePdfBytes: vi.fn().mockResolvedValue(new Uint8Array([])) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('/tmp/test.pdf') }))

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1', workspaceId: 'w', createdBy: 'u', accountId: 'a',
  date: '2020-01-01', dueDate: '2020-01-15', status: 'open',
  taxMode: 'standard', subtotal: 100, taxAmount: 19, total: 119,
  bankInfo: '', isSuggestion: false, pendingSync: false,
  createdAt: '', updatedAt: '', ...over,
})
const accounts = [{ id: 'a', name: 'Acme GmbH' }] as any

describe('dunningFee', () => {
  it('uses default staffel 0/5/10 by level', () => {
    expect(dunningFee(0)).toBe(0)
    expect(dunningFee(1)).toBe(5)
    expect(dunningFee(2)).toBe(10)
  })
  it('clamps levels beyond the config to the last fee', () => {
    expect(dunningFee(3)).toBe(10)
  })
  it('honours a custom fee config', () => {
    expect(dunningFee(1, [0, 7.5, 15])).toBe(7.5)
  })
  it('falls back to 0 for an empty config', () => {
    expect(dunningFee(1, [])).toBe(0)
  })
})

describe('parseFeeTag', () => {
  it('parses cent tags to euro', () => {
    expect(parseFeeTag('fee:500')).toBe(5)
    expect(parseFeeTag('fee:0')).toBe(0)
  })
  it('ignores non-fee tags', () => {
    expect(parseFeeTag('priority:p1')).toBe(0)
  })
})

describe('reminderFeeTags', () => {
  it('snapshots the level fee as a cent tag', () => {
    expect(reminderFeeTags(1)).toEqual(['fee:500'])
    expect(reminderFeeTags(2, [0, 5, 12])).toEqual(['fee:1200'])
  })
  it('emits fee:0 for the free Zahlungserinnerung', () => {
    expect(reminderFeeTags(0)).toEqual(['fee:0'])
  })
  it('exposes the default staffel', () => {
    expect(DEFAULT_DUNNING_FEES).toEqual([0, 5, 10])
  })
})

describe('dueReminders', () => {
  it('lists a fresh overdue invoice with level 0 and customer name', () => {
    const res = dueReminders([inv()], [], accounts, [0, 5, 10], [])
    expect(res).toHaveLength(1)
    expect(res[0].customerName).toBe('Acme GmbH')
    expect(res[0].level).toBe(0)
    expect(res[0].amountDue).toBe(119) // remaining + 0 fees + level-0 fee 0
  })
  it('skips suggestions and non-overdue invoices', () => {
    const notDue = inv({ id: 'i2', dueDate: '2999-01-01' })
    const suggestion = inv({ id: 'i3', isSuggestion: true })
    expect(dueReminders([notDue, suggestion], [], accounts, [0, 5, 10], [])).toHaveLength(0)
  })
})

describe('escalatedInvoices', () => {
  it('lists invoices past the 2. Mahnung', () => {
    const done = (i: number) => ({
      id: 'r' + i, title: 'x', status: 'done', priority: 'p2', bucket: 'done',
      checklist: [], tags: ['fee:0'], source: 'finance', actionType: 'send_reminder',
      sourceRef: 'inv1', createdAt: '', updatedAt: '2020-02-01T00:00:00.000Z',
    }) as any
    const res = escalatedInvoices([inv()], [done(1), done(2), done(3)], accounts)
    expect(res.map(r => r.invoice.id)).toEqual(['inv1'])
  })
})

describe('reminderBreakdown', () => {
  it('splits remaining vs fees (accrued + pending level fee)', () => {
    // total 119, no payments, no prior reminders, level 1 → base 119, fee 5, total 124
    const b = reminderBreakdown(inv(), [], [], 1, [0, 5, 10])
    expect(b.base).toBe(119)
    expect(b.fee).toBe(5)
    expect(b.total).toBe(124)
  })
  it('includes accrued fees from prior done reminders', () => {
    const prior = {
      id: 'r1', title: 'x', status: 'done', priority: 'p2', bucket: 'done',
      checklist: [], tags: ['fee:500'], source: 'finance', actionType: 'send_reminder',
      sourceRef: 'inv1', createdAt: '', updatedAt: '2020-02-01T00:00:00.000Z',
    } as any
    // prior fee 5 (accrued) + pending level-2 fee 10 = 15; base 119; total 134
    const b = reminderBreakdown(inv(), [], [prior], 2, [0, 5, 10])
    expect(b.base).toBe(119)
    expect(b.fee).toBe(15)
    expect(b.total).toBe(134)
  })
  it('no fee at level 0', () => {
    const b = reminderBreakdown(inv(), [], [], 0, [0, 5, 10])
    expect(b.fee).toBe(0)
    expect(b.total).toBe(119)
  })
})

describe('recordReminderSent', () => {
  it('creates a DONE send_reminder todo with the fee snapshot tag', async () => {
    mockUpsert.mockClear()
    await recordReminderSent(inv({ accountId: 'a' }), 1, [0, 5, 10])
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const payload = mockUpsert.mock.calls[0][0]
    expect(payload.status).toBe('done')
    expect(payload.bucket).toBe('done')
    expect(payload.actionType).toBe('send_reminder')
    expect(payload.sourceRef).toBe('inv1')
    expect(payload.customerId).toBe('a')
    expect(payload.tags).toEqual(['fee:500'])
  })
})

describe('prepareReminder: Template statt KI', () => {
  it('nutzt den deterministischen Mahntext und ruft KORA nicht auf', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { generateCorraDraft } = await import('@/lib/ai/corra')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { FinanceGateway } = await import('@/data/finance.gateway')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer GmbH', email: 'info@meyer.de' }] } as never)
    vi.mocked(FinanceGateway.getInvoice).mockRejectedValueOnce(new Error('kein PDF im Test'))
    vi.mocked(generateCorraDraft).mockClear()

    const invoice = { id: 'inv1', accountId: 'acc1', number: 'R-100', dueDate: '2026-06-01', total: 1000, status: 'overdue' } as never
    await prepareReminder(invoice, 0)
    expect(vi.mocked(generateCorraDraft)).not.toHaveBeenCalled()
  })

  it('bodyOverride ersetzt den Template-Text', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    // Kein account → PDF-Block wird übersprungen, Vorbereitung gelingt ohne Gateway.
    useAccountsStore.setState({ accounts: [] } as never)
    const { ContactsGateway } = await import('@/data/contacts.gateway')
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValueOnce([{ email: 'x@y.de' }] as never)

    const invoice = { id: 'inv2', accountId: 'accX', number: 'R-200', dueDate: '2026-06-01', total: 500, status: 'overdue' } as never
    const result = await prepareReminder(invoice, 0, { bodyOverride: 'MEIN EIGENER TEXT' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.body).toBe('MEIN EIGENER TEXT')
  })
})

describe('prepareReminder: PDF-Pflicht', () => {
  it('bricht ab, wenn das Rechnungs-PDF nicht erzeugt werden kann', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { FinanceGateway } = await import('@/data/finance.gateway')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer GmbH', email: 'info@meyer.de' }] } as never)
    vi.mocked(FinanceGateway.getInvoice).mockRejectedValueOnce(new Error('db locked'))

    const invoice = {
      id: 'inv1', accountId: 'acc1', number: 'R-100', dueDate: '2026-06-01',
      total: 1190, status: 'overdue',
    } as never

    const result = await prepareReminder(invoice, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('PDF')
  })
})

describe('prepareReminder: Kontakt-Lookup-Fehler', () => {
  it('loggt eine Warnung wenn der Kontakt-Lookup fehlschlaegt, faellt aber auf Konto-E-Mail zurueck', async () => {
    const { prepareReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { useCompanyStore } = await import('@/store/company.store')
    const { ContactsGateway } = await import('@/data/contacts.gateway')
    const { FinanceGateway } = await import('@/data/finance.gateway')
    const { getInvoicePdfBytes } = await import('@/components/finance/InvoicePDF')
    const { log } = await import('@/lib/logger')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer GmbH', email: 'info@meyer.de' }] } as never)
    useCompanyStore.setState({ profile: { dunningFees: [0, 5, 10] } } as never)
    vi.mocked(ContactsGateway.getByAccount).mockRejectedValueOnce(new Error('db timeout'))
    vi.mocked(FinanceGateway.getInvoice).mockResolvedValueOnce({
      id: 'inv1', accountId: 'acc1', workspaceId: 'w', createdBy: 'u', number: 'R-1',
      dueDate: '2026-06-01', date: '2026-06-01', status: 'overdue', total: 100, subtotal: 100,
      taxAmount: 0, taxMode: 'standard', isSuggestion: false, pendingSync: false,
      bankInfo: '', createdAt: '', updatedAt: '',
    } as never)
    vi.mocked(getInvoicePdfBytes).mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
    const warnSpy = vi.spyOn(log, 'warn')

    const invoice = { id: 'inv1', accountId: 'acc1', number: 'R-1', dueDate: '2026-06-01', total: 100, status: 'overdue' } as never
    const result = await prepareReminder(invoice, 0)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.to).toEqual(['info@meyer.de'])
    expect(warnSpy).toHaveBeenCalledWith(
      'contact lookup failed, falling back to account email',
      expect.objectContaining({ invoiceId: 'inv1' })
    )
    warnSpy.mockRestore()
  })
})

describe('sendReminder: Protokollbuch-Fehler', () => {
  it('gibt eine Warnung zurueck wenn die Aktivitaet nicht protokolliert werden konnte, Versand zaehlt trotzdem als ok', async () => {
    const { sendReminder } = await import('./dunning.service')
    const { useMailStore } = await import('@/store/mail.store')
    const { useAccountsStore } = await import('@/store/accounts.store')
    const { MailService } = await import('@/services/mail.service')
    const { ActivitiesGateway } = await import('@/data/activities.gateway')
    const { ContactsGateway } = await import('@/data/contacts.gateway')

    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [] } as never) // kein PDF-Block noetig
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValueOnce([{ email: 'x@y.de' }] as never)
    vi.spyOn(MailService, 'sendEmail').mockResolvedValueOnce(undefined as never)
    vi.spyOn(ActivitiesGateway, 'create').mockRejectedValueOnce(new Error('offline'))

    const invoice = { id: 'inv1', accountId: 'accX', number: 'R-1', dueDate: '2026-06-01', total: 100, status: 'overdue' } as never
    const result = await sendReminder(invoice, 0)

    expect(result.ok).toBe(true)
    expect(result.warning).toBe('Mahnung gesendet, aber nicht im Kundenverlauf protokolliert.')
  })
})
