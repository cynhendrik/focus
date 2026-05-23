// src/types/mail.types.ts

export interface EmailAccount {
  id: string
  email: string
  displayName: string
  imapHost: string
  imapPort: number
  smtpHost: string          // NEW
  smtpPort: number          // NEW
  smtpStarttls: boolean     // NEW
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

export interface EmailAttachment {
  id: string
  emailId: string
  filename: string
  mimeType: string
  sizeBytes: number
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
  smtpHost?: string
  smtpPort?: number
  smtpStarttls?: boolean
}

export interface SendEmailPayload {
  accountId: string
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  attachmentPaths?: string[]
}

export interface SmtpAutoDetectFailed {
  smtpHost: string
  smtpPort: number
}
