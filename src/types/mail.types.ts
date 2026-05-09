export interface EmailAccount {
  id: string
  email: string
  displayName: string
  imapHost: string
  imapPort: number
  lastSyncedAt: string | null
  status: 'active' | 'auth_error' | 'error'
}

export interface EmailHeader {
  id: string
  accountId: string
  uid: number
  folder: string
  subject: string
  fromAddr: string
  fromName: string
  toAddrs: string[]
  sentAt: string
  isRead: boolean
  customerId: string | null
}

export interface EmailBody {
  id: string
  bodyText: string
  bodyHtml: string
}

export interface SyncProgress {
  folder: string
  done: number
  total: number
  phase: 'connecting' | 'scanning' | 'fetching' | 'done' | 'error'
}

export interface AddAccountPayload {
  email: string
  password: string
  imapHost: string
  imapPort: number
  displayName: string
}
