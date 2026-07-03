import type { Invoice } from '@/types/finance.types'
import { invoke } from '@tauri-apps/api/core'
import { ContactsGateway } from '@/data/contacts.gateway'
import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'
import { useCompanyStore } from '@/store/company.store'
import { MailService } from '@/services/mail.service'
import { FinanceGateway } from '@/data/finance.gateway'
import { begleitmailBody } from '@/lib/templates/mahnung'
import { log } from '@/lib/logger'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

export interface PreparedInvoiceMail {
  to: string
  subject: string
  body: string
  attachmentPath: string
}

/** Bereitet den Versand vor (Empfänger, Betreff aus Firma+Nummer, Begleitmail-Template, PDF). Wirft nie. */
export async function prepareInvoiceMail(
  invoice: Invoice,
): Promise<{ ok: true; data: PreparedInvoiceMail } | { ok: false; error: string }> {
  try {
    const mailAccount = useMailStore.getState().accounts[0]
    if (!mailAccount) return { ok: false, error: 'Kein E-Mail-Konto konfiguriert — unter Mail einrichten.' }

    const account = useAccountsStore.getState().accounts.find(a => a.id === invoice.accountId)
    const contacts = await ContactsGateway.getByAccount(invoice.accountId).catch(() => [])
    const recipient = contacts.find(c => c.email)?.email ?? account?.email
    if (!recipient) return { ok: false, error: 'Keine E-Mail-Adresse für diesen Kunden hinterlegt.' }

    const profile = useCompanyStore.getState().profile
    const nr = invoice.number ?? invoice.id.slice(0, 8)
    const subject = `Rechnung ${nr}${profile.name ? ` von ${profile.name}` : ''}`
    const body = begleitmailBody({ invoiceNumber: nr, total: invoice.total, dueDate: invoice.dueDate })

    try {
      const full = await FinanceGateway.getInvoice(invoice.id)
      const { getInvoicePdfBytes } = await import('@/components/finance/InvoicePDF')
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const bytes = await getInvoicePdfBytes(full, profile, account!)
      const safe = (account?.name ?? 'Kunde').replace(/[/\\:*?"<>|]/g, '_').slice(0, 40)
      const filename = `Rechnung_${nr}_${safe}.pdf`
      const path = await invoke<string>('save_pdf', { bytes: Array.from(bytes), suggestedName: filename })
      return { ok: true, data: { to: recipient, subject, body, attachmentPath: path } }
    } catch (pdfErr) {
      log.warn('invoice PDF generation failed', { invoiceId: invoice.id, err: pdfErr })
      return { ok: false, error: 'Rechnungs-PDF konnte nicht erzeugt werden — Versand abgebrochen.' }
    }
  } catch (err) {
    log.warn('prepareInvoiceMail failed', { invoiceId: invoice.id, err })
    return { ok: false, error: 'Vorbereitung fehlgeschlagen.' }
  }
}

/** Versendet mit (ggf. editierten) Feldern; bei Erfolg Protokoll-Aktivität am Kunden. Wirft nie. */
export async function sendInvoiceMail(
  invoice: Invoice,
  mail: { to: string; subject: string; body: string; attachmentPath: string },
): Promise<{ ok: boolean; error?: string }> {
  const mailAccount = useMailStore.getState().accounts[0]
  if (!mailAccount) return { ok: false, error: 'Kein E-Mail-Konto konfiguriert — unter Mail einrichten.' }

  try {
    await MailService.sendEmail({
      accountId: mailAccount.id,
      to: [mail.to],
      subject: mail.subject,
      bodyText: mail.body,
      attachmentPaths: [mail.attachmentPath],
    })
  } catch (err) {
    log.warn('sendInvoiceMail failed', { invoiceId: invoice.id, err })
    return { ok: false, error: `Versand fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` }
  }

  const nr = invoice.number ?? invoice.id.slice(0, 8)
  try {
    await ActivitiesGateway.create({
      workspaceId: useWorkspaceStore.getState().getActiveWorkspaceId() ?? '',
      createdBy: useAuthStore.getState().user?.id ?? '',
      accountId: invoice.accountId,
      type: 'note',
      title: `Rechnung ${nr} versendet`,
      body: `Per E-Mail an ${mail.to} — mit Rechnungs-PDF.`,
    })
  } catch (protoErr) {
    log.warn('invoice send protocol activity failed', { invoiceId: invoice.id, err: protoErr })
  }

  return { ok: true }
}
