import { create } from 'zustand'
import { MailService } from '@/services/mail.service'
import { log } from '@/lib/logger'
import type { EmailAccount, EmailHeader, EmailBody, SyncProgress, AddAccountPayload } from '@/types/mail.types'
import type { AppError } from '@/types/error.types'
import { formatError } from '@/types/error.types'

interface MailState {
  accounts: EmailAccount[]
  selectedAccountId: string | null
  selectedFolder: string
  emails: EmailHeader[]
  selectedEmail: EmailHeader | null
  emailBody: EmailBody | null
  search: string
  syncProgress: SyncProgress | null
  isSyncing: boolean
  isLoading: boolean
  error: AppError | null

  loadAccounts: () => Promise<void>
  selectAccount: (id: string) => void
  selectFolder: (folder: string) => void
  loadEmails: () => Promise<void>
  selectEmail: (email: EmailHeader | null) => Promise<void>
  setSearch: (q: string) => void
  addAccount: (payload: AddAccountPayload) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  sync: (customersJson: string) => Promise<void>
  setSyncProgress: (p: SyncProgress | null) => void
  markRead: (emailId: string, isRead: boolean) => void
  assignCustomer: (emailId: string, customerId: string | null) => Promise<void>
  deleteEmail: (emailId: string) => Promise<void>
}

export const useMailStore = create<MailState>()((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  selectedFolder: 'INBOX',
  emails: [],
  selectedEmail: null,
  emailBody: null,
  search: '',
  syncProgress: null,
  isSyncing: false,
  isLoading: false,
  error: null,

  loadAccounts: async () => {
    try {
      const accounts = await MailService.getAccounts()
      set(s => ({
        accounts,
        selectedAccountId: s.selectedAccountId ?? accounts[0]?.id ?? null,
      }))
    } catch (err) {
      log.error('Failed to load accounts', { err })
    }
  },

  selectAccount: (id) => {
    set({ selectedAccountId: id, emails: [], selectedEmail: null, emailBody: null })
    get().loadEmails()
  },

  selectFolder: (folder) => {
    set({ selectedFolder: folder, emails: [], selectedEmail: null, emailBody: null })
    get().loadEmails()
  },

  loadEmails: async () => {
    const { selectedAccountId, selectedFolder, search } = get()
    if (!selectedAccountId) return
    set({ isLoading: true })
    try {
      const emails = await MailService.list(selectedAccountId, selectedFolder, 50, 0, search)
      set({ emails, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: { kind: 'Db', message: formatError(err) } })
    }
  },

  selectEmail: async (email) => {
    set({ selectedEmail: email, emailBody: null })
    if (!email) return
    if (!email.isRead) {
      MailService.markRead(email.id, true).catch(() => {})
      set(s => ({ emails: s.emails.map(e => e.id === email.id ? { ...e, isRead: true } : e) }))
    }
    try {
      const body = await MailService.getBody(email.id)
      set({ emailBody: body })
    } catch (err) {
      log.error('Failed to load email body', { err })
    }
  },

  setSearch: (q) => {
    set({ search: q })
    get().loadEmails()
  },

  addAccount: async (payload) => {
    const account = await MailService.addAccount(payload)
    set(s => ({ accounts: [...s.accounts, account], selectedAccountId: account.id }))
    get().loadEmails()
  },

  removeAccount: async (id) => {
    await MailService.removeAccount(id)
    set(s => {
      const accounts = s.accounts.filter(a => a.id !== id)
      return { accounts, selectedAccountId: accounts[0]?.id ?? null, emails: [] }
    })
  },

  sync: async (customersJson) => {
    const { selectedAccountId } = get()
    if (!selectedAccountId) return
    set({ isSyncing: true })
    try {
      await MailService.sync(selectedAccountId, customersJson)
    } finally {
      set({ isSyncing: false, syncProgress: null })
      get().loadEmails()
    }
  },

  setSyncProgress: (p) => set({ syncProgress: p }),

  markRead: (emailId, isRead) => {
    MailService.markRead(emailId, isRead).catch(() => {})
    set(s => ({ emails: s.emails.map(e => e.id === emailId ? { ...e, isRead } : e) }))
  },

  assignCustomer: async (emailId, customerId) => {
    await MailService.assignCustomer(emailId, customerId)
    set(s => ({ emails: s.emails.map(e => e.id === emailId ? { ...e, customerId } : e) }))
  },

  deleteEmail: async (emailId) => {
    await MailService.delete(emailId)
    set(s => ({
      emails: s.emails.filter(e => e.id !== emailId),
      selectedEmail: s.selectedEmail?.id === emailId ? null : s.selectedEmail,
    }))
  },
}))
