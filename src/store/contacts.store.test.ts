import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/data/contacts.gateway', () => ({
  ContactsGateway: { getByAccount: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
}))
vi.mock('@/store/workspace.store', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'ws1' }) } }))
vi.mock('@/store/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }))

import { ContactsGateway } from '@/data/contacts.gateway'
import { useContactsStore } from './contacts.store'
import type { Contact } from '@/types/contact.types'

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'c1', workspaceId: 'ws1', createdBy: 'u1', accountId: 'a1',
  firstName: 'Anna', isPrimary: false, createdAt: '2026-01-01', updatedAt: '2026-01-02', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  useContactsStore.setState({ contacts: [], currentAccountId: null, isLoading: false })
})

describe('useContactsStore', () => {
  it('loadByAccount: routet übers Gateway und merkt sich currentAccountId', async () => {
    vi.mocked(ContactsGateway.getByAccount).mockResolvedValueOnce([contact()])
    await useContactsStore.getState().loadByAccount('a1')
    expect(ContactsGateway.getByAccount).toHaveBeenCalledWith('a1')
    expect(useContactsStore.getState().contacts).toHaveLength(1)
    expect(useContactsStore.getState().currentAccountId).toBe('a1')
  })

  it('upsert: ergänzt workspaceId/createdBy und routet übers Gateway', async () => {
    vi.mocked(ContactsGateway.upsert).mockResolvedValueOnce(contact({ id: 'new' }))
    const result = await useContactsStore.getState().upsert({ accountId: 'a1', firstName: 'Bob' })
    expect(ContactsGateway.upsert).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'a1', firstName: 'Bob', workspaceId: 'ws1', createdBy: 'u1',
    }))
    expect(result.id).toBe('new')
    expect(useContactsStore.getState().contacts.map(c => c.id)).toContain('new')
  })

  it('upsert: ersetzt vorhandenen Kontakt statt zu duplizieren', async () => {
    useContactsStore.setState({ contacts: [contact({ id: 'c1', firstName: 'Alt' })] })
    vi.mocked(ContactsGateway.upsert).mockResolvedValueOnce(contact({ id: 'c1', firstName: 'Neu' }))
    await useContactsStore.getState().upsert({ id: 'c1', accountId: 'a1', firstName: 'Neu' })
    const contacts = useContactsStore.getState().contacts
    expect(contacts).toHaveLength(1)
    expect(contacts[0].firstName).toBe('Neu')
  })

  it('remove: routet übers Gateway und entfernt aus dem Store', async () => {
    useContactsStore.setState({ contacts: [contact({ id: 'c1' })] })
    vi.mocked(ContactsGateway.delete).mockResolvedValueOnce(undefined)
    await useContactsStore.getState().remove('c1')
    expect(ContactsGateway.delete).toHaveBeenCalledWith('c1')
    expect(useContactsStore.getState().contacts).toHaveLength(0)
  })
})
