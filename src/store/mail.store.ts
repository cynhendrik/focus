import { create } from 'zustand'
import { MailService } from '@/services/mail.service'
import { log } from '@/lib/logger'
import type {
  EmailAccount, EmailHeader, EmailBody, EmailAttachment,
  SyncProgress, AddAccountPayload, SendEmailPayload, MailFolder,
} from '@/types/mail.types'
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
  attachments: EmailAttachment[]
  isSending: boolean

  // Folder-Tree
  folders: MailFolder[]
  expandedFolders: Set<string>
  foldersLastFetched: number
  isFolderLoading: boolean

  loadAccounts: () => Promise<void>
  selectAccount: (id: string) => void
  selectFolder: (folder: string) => Promise<void>

  loadFolders: (accountId: string) => Promise<void>
  toggleFolder: (path: string) => void
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
  sendEmail: (payload: SendEmailPayload) => Promise<void>
  getAttachments: (emailId: string) => Promise<void>
  downloadAttachment: (attachmentId: string) => Promise<void>
}

function buildFolderTree(flat: MailFolder[]): MailFolder[] {
  const byPath = new Map(flat.map(f => [f.path, { ...f, children: [] as MailFolder[] }]))
  const roots: MailFolder[] = []
  for (const folder of byPath.values()) {
    if (folder.parentPath && byPath.has(folder.parentPath)) {
      byPath.get(folder.parentPath)!.children!.push(folder)
    } else {
      roots.push(folder)
    }
  }
  // INBOX zuerst
  const PRIORITY_PATHS = ['INBOX']
  roots.sort((a, b) => {
    const ai = PRIORITY_PATHS.indexOf(a.path)
    const bi = PRIORITY_PATHS.indexOf(b.path)
    if (ai !== -1 && bi === -1) return -1
    if (bi !== -1 && ai === -1) return 1
    return 0
  })
  return roots
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
  attachments: [],
  isSending: false,
  folders: [],
  expandedFolders: new Set<string>(),
  foldersLastFetched: 0,
  isFolderLoading: false,

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

  selectFolder: async (folder) => {
    set({ selectedFolder: folder, emails: [], selectedEmail: null, emailBody: null })
    await get().loadEmails()
    // On-demand Sync: wenn kein Kunden-Filter-Ordner und Ergebnis leer → Ordner synchronisieren
    const { emails, selectedAccountId, isSyncing } = get()
    if (
      folder !== 'UNASSIGNED' &&
      emails.length === 0 &&
      selectedAccountId &&
      !isSyncing
    ) {
      set({ isFolderLoading: true })
      try {
        await MailService.sync(selectedAccountId, '[]', folder)
        await get().loadEmails()
      } catch (err) {
        log.error('On-demand folder sync failed', { err })
      } finally {
        set({ isFolderLoading: false })
      }
    }
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
    set({ selectedEmail: email, emailBody: null, attachments: [] })
    if (!email) return
    if (!email.isRead) {
      MailService.markRead(email.id, true).catch(() => {})
      set(s => ({ emails: s.emails.map(e => e.id === email.id ? { ...e, isRead: true } : e) }))
    }
    try {
      const [body, attachments] = await Promise.all([
        MailService.getBody(email.id),
        MailService.getAttachments(email.id),
      ])
      set({ emailBody: body, attachments })
    } catch (err) {
      log.error('Failed to load email body or attachments', { err })
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

  getAttachments: async (emailId) => {
    try {
      const attachments = await MailService.getAttachments(emailId)
      set({ attachments })
    } catch (err) {
      log.error('Failed to load attachments', { err })
      set({ attachments: [] })
    }
  },

  sendEmail: async (payload) => {
    set({ isSending: true })
    try {
      await MailService.sendEmail(payload)
    } finally {
      set({ isSending: false })
    }
  },

  downloadAttachment: async (attachmentId) => {
    try {
      await MailService.downloadAttachment(attachmentId)
    } catch (err) {
      log.error('Failed to download attachment', { err })
      throw err
    }
  },

  loadFolders: async (accountId) => {
    try {
      const flat = await MailService.listFolders(accountId)
      const tree = buildFolderTree(flat)
      set({ folders: tree, foldersLastFetched: Date.now() })
    } catch (err) {
      log.error('Failed to load folders', { err })
    }
  },

  toggleFolder: (path) => {
    set(s => {
      const next = new Set(s.expandedFolders)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return { expandedFolders: next }
    })
  },
}))
