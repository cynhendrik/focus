import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/dunning.service', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/dunning.service')>()
  return { ...mod, sendReminder: vi.fn() }
})
vi.mock('@/services/mail.service', () => ({ MailService: { sendEmail: vi.fn() } }))
vi.mock('@/data/activities.gateway', () => ({ ActivitiesGateway: { create: vi.fn().mockResolvedValue({}) } }))

import { approvePreparedItem } from './stapel-actions.service'
import { sendReminder } from '@/services/dunning.service'
import { MailService } from '@/services/mail.service'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'

const base = {
  id: 'p1', workspaceId: 'ws1', assignee: null, score: 0, status: 'pending',
  snoozeUntil: null, ruleId: '', createdAt: '', updatedAt: '', approvedAt: null,
} as const

describe('approvePreparedItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mahnung: ruft sendReminder mit Karten-Entwurf als bodyOverride', async () => {
    useTodosStore.setState({ allTodos: [] } as never)
    useFinanceStore.setState({ invoices: [{ id: 'inv1', accountId: 'a', total: 100, dueDate: '2026-06-01', status: 'overdue' }] } as never)
    vi.mocked(sendReminder).mockResolvedValueOnce({ invoiceId: 'inv1', ok: true })
    const r = await approvePreparedItem({
      ...base, type: 'mahnung', sourceKind: 'invoice_reminder', sourceId: 'inv1:1',
      payload: { title: '', why: '', level: 0, draftBody: 'ENTWURF' },
    } as never)
    expect(r.ok).toBe(true)
    expect(sendReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv1' }), 0, { bodyOverride: 'ENTWURF' })
  })

  it('mahnung: fehlende Rechnung → verstaendlicher Fehler', async () => {
    useFinanceStore.setState({ invoices: [] } as never)
    const r = await approvePreparedItem({
      ...base, type: 'mahnung', sourceKind: 'invoice_reminder', sourceId: 'nix:0',
      payload: { title: '', why: '', level: 0 },
    } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Rechnung')
  })

  it('mahnung: Karte level 1 aber Mahn-Zustand sagt level 0 → nicht mehr fällig', async () => {
    useTodosStore.setState({ allTodos: [] } as never)
    useFinanceStore.setState({ invoices: [{ id: 'inv2', accountId: 'a', total: 100, dueDate: '2026-06-01', status: 'overdue' }] } as never)
    const r = await approvePreparedItem({
      ...base, type: 'mahnung', sourceKind: 'invoice_reminder', sourceId: 'inv2:1',
      payload: { title: '', why: '', level: 1 },
    } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('nicht mehr fällig')
  })

  it('followup: sendet Mail an Kontakt und markiert das Follow-up erledigt', async () => {
    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer', email: 'info@meyer.de' }] } as never)
    const crmUpsert = vi.fn().mockResolvedValue(undefined)
    useCrmStore.setState({
      allFollowUps: [{ id: 'fu1', customerId: 'acc1', title: 'Nachfassen', dueDate: '2026-07-01', status: 'offen', priority: 'normal', createdAt: '' }],
      upsert: crmUpsert,
    } as never)
    const r = await approvePreparedItem({
      ...base, type: 'followup', sourceKind: 'crm_follow_up', sourceId: 'fu1',
      payload: { title: '', why: '', draftSubject: 'S', draftBody: 'B' },
    } as never)
    expect(r.ok).toBe(true)
    expect(MailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ['info@meyer.de'], subject: 'S', bodyText: 'B' }))
    expect(crmUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'fu1', status: 'erledigt' }))
  })

  it('followup ohne E-Mail-Adresse → Fehler statt stiller Versand', async () => {
    useMailStore.setState({ accounts: [{ id: 'mail1' }] } as never)
    useAccountsStore.setState({ accounts: [{ id: 'acc1', name: 'Meyer', email: undefined }] } as never)
    useCrmStore.setState({
      allFollowUps: [{ id: 'fu1', customerId: 'acc1', title: 'x', dueDate: '2026-07-01', status: 'offen', priority: 'normal', createdAt: '' }],
    } as never)
    const r = await approvePreparedItem({
      ...base, type: 'followup', sourceKind: 'crm_follow_up', sourceId: 'fu1',
      payload: { title: '', why: '', draftSubject: 'S', draftBody: 'B' },
    } as never)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('E-Mail')
  })

  it('aufgabe: hakt das Todo ab via complete (kein Datenverlust)', async () => {
    const complete = vi.fn().mockResolvedValue(undefined)
    useTodosStore.setState({
      allTodos: [{ id: 't1', title: 'Anrufen', status: 'open', priority: 'p2', bucket: 'today', checklist: [], tags: [], createdAt: '', updatedAt: '' }],
      complete,
    } as never)
    const r = await approvePreparedItem({
      ...base, type: 'aufgabe', sourceKind: 'todo', sourceId: 't1',
      payload: { title: 'Anrufen', why: '' },
    } as never)
    expect(r.ok).toBe(true)
    expect(complete).toHaveBeenCalledWith('t1')
  })
})
