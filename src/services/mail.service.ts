import { invoke } from '@tauri-apps/api/core'
import type {
  EmailAccount, EmailHeader, EmailBody, EmailAttachment,
  AddAccountPayload, SendEmailPayload, MailFolder,
} from '@/types/mail.types'

export const MailService = {
  getAccounts(): Promise<EmailAccount[]> {
    return invoke<EmailAccount[]>('email_get_accounts')
  },
  listFolders(accountId: string): Promise<MailFolder[]> {
    return invoke<MailFolder[]>('email_list_folders', { accountId })
  },
  detectProvider(email: string): Promise<[string, number] | null> {
    return invoke<[string, number] | null>('email_detect_provider', { email })
  },
  testConnection(email: string, password: string, imapHost: string, imapPort: number): Promise<void> {
    return invoke<void>('email_test_connection', { email, password, imapHost, imapPort })
  },
  addAccount(p: AddAccountPayload): Promise<EmailAccount> {
    return invoke<EmailAccount>('email_add_account', {
      email: p.email, password: p.password,
      imapHost: p.imapHost, imapPort: p.imapPort, displayName: p.displayName,
      smtpHost: p.smtpHost ?? null,
      smtpPort: p.smtpPort ?? null,
      smtpStarttls: p.smtpStarttls ?? null,
    })
  },
  removeAccount(accountId: string): Promise<void> {
    return invoke<void>('email_remove_account', { accountId })
  },
  sync(
    accountId: string,
    customersJson: string,
    folder?: string,
  ): Promise<{ inserted: number; skipped: number }> {
    return invoke('email_sync', {
      accountId,
      folder: folder ?? null,
      customersJson,
    })
  },
  list(accountId: string, folder: string, limit: number, offset: number, search: string): Promise<EmailHeader[]> {
    return invoke<EmailHeader[]>('email_list', { accountId, folder, limit, offset, search })
  },
  getBody(emailId: string): Promise<EmailBody> {
    return invoke<EmailBody>('email_get_body', { emailId })
  },
  markRead(emailId: string, isRead: boolean): Promise<void> {
    return invoke<void>('email_mark_read', { emailId, isRead })
  },
  assignCustomer(emailId: string, customerId: string | null): Promise<void> {
    return invoke<void>('email_assign_customer', { emailId, customerId })
  },
  delete(emailId: string): Promise<void> {
    return invoke<void>('email_delete', { emailId })
  },
  testSmtp(email: string, password: string, smtpHost: string, smtpPort: number, starttls: boolean): Promise<void> {
    return invoke<void>('email_test_smtp', { email, password, smtpHost, smtpPort, starttls })
  },
  sendEmail(payload: SendEmailPayload): Promise<void> {
    return invoke<void>('email_send', { payload })
  },
  getAttachments(emailId: string): Promise<EmailAttachment[]> {
    return invoke<EmailAttachment[]>('email_get_attachments', { emailId })
  },
  downloadAttachment(attachmentId: string): Promise<string> {
    return invoke<string>('email_download_attachment', { attachmentId })
  },
}
