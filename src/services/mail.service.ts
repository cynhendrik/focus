import { invoke } from '@tauri-apps/api/core'
import type { EmailAccount, EmailHeader, EmailBody, AddAccountPayload } from '@/types/mail.types'

export const MailService = {
  getAccounts(): Promise<EmailAccount[]> {
    return invoke<EmailAccount[]>('email_get_accounts')
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
    })
  },
  removeAccount(accountId: string): Promise<void> {
    return invoke<void>('email_remove_account', { accountId })
  },
  sync(accountId: string, customersJson: string): Promise<{ inserted: number; skipped: number }> {
    return invoke('email_sync', { accountId, customersJson })
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
}
