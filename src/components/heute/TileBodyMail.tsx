import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Send, Sparkles, Loader } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Invoice } from '@/types/finance.types'
import type { Contact } from '@/types/contact.types'

interface BaseProps {
  onDone: () => Promise<void>
  onSkip: () => void
}

interface TodoMailProps extends BaseProps {
  mode: 'reply_mail' | 'followup'
  todo: Todo
  invoice?: never
}

interface InvoiceReminderProps extends BaseProps {
  mode: 'invoice_reminder'
  invoice: Invoice
  todo?: never
}

type Props = TodoMailProps | InvoiceReminderProps

export function TileBodyMail({ mode, todo, invoice, onDone, onSkip }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const account = mode === 'invoice_reminder'
    ? accounts.find(a => a.id === invoice!.accountId)
    : todo?.customerId ? accounts.find(a => a.id === todo.customerId) : undefined

  const [to, setTo]           = useState('')
  const [subject, setSubject] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending]       = useState(false)
  const [hasDraft, setHasDraft]     = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Nachricht schreiben…' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 100px; font-size: 14px; line-height: 1.65; color: var(--fg); font-family: inherit;',
      },
    },
  })

  // Set To/Subject based on mode — für invoice_reminder E-Mail aus Account oder Primärkontakt
  useEffect(() => {
    if (mode === 'invoice_reminder') {
      setSubject(`Zahlungserinnerung ${invoice!.number ?? ''}`.trim())
      // 1. Direkte Account-E-Mail
      if (account?.email) {
        setTo(account.email)
      } else if (invoice!.accountId) {
        // 2. Primärkontakt des Kunden laden
        invoke<Contact[]>('get_contacts', { accountId: invoice!.accountId })
          .then(contacts => {
            const primary = contacts.find(c => c.isPrimary && c.email) ?? contacts.find(c => c.email)
            if (primary?.email) setTo(primary.email)
          })
          .catch((e: unknown) => log.warn('Konnte Kontakt für Zahlungserinnerung nicht laden', { e }))
      }
    } else if (mode === 'reply_mail' && todo) {
      const notes = todo.notes ?? ''
      const fromAddr = /^fromAddr: (.+)$/m.exec(notes)?.[1]?.trim() ?? ''
      setTo(fromAddr)
      setSubject(`Re: ${todo.title.replace(/ beantworten$/, '')}`)
    } else if (mode === 'followup' && todo) {
      setSubject(todo.title)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, todo?.id, invoice?.id])

  // Auto-generate draft on mount
  useEffect(() => {
    if (!editor) return
    setGenerating(true)

    const draftPromise = (() => {
      if (mode === 'invoice_reminder' && invoice) {
        const daysOverdue = Math.max(0, Math.floor(
          (Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000
        ))
        return generateCorraDraft({
          kind: 'reminder',
          customerName: account?.name ?? '',
          invoiceNumber: invoice.number ?? '',
          amount: invoice.total,
          dueDate: invoice.dueDate,
          daysOverdue,
          dunningLevel: daysOverdue > 21 ? 1 : 0,
        })
      }
      if (mode === 'reply_mail' && todo) {
        const notes = todo.notes ?? ''
        const fromLine = notes.split('\n')[0]?.replace(/^Von: /, '') ?? ''
        return generateCorraDraft({
          kind: 'reply_mail',
          customerName: account?.name ?? '',
          contactName: fromLine,
          subject: todo.title,
          notes: todo.notes,
        })
      }
      if (mode === 'followup' && todo) {
        const notes = todo.notes ?? ''
        const fromLine = notes.split('\n')[0]?.replace(/^Von: /, '') ?? ''
        return generateCorraDraft({
          kind: 'followup',
          customerName: account?.name ?? '',
          contactName: fromLine,
          topic: todo.title,
          notes: todo.notes,
        })
      }
      return Promise.resolve('')
    })()

    draftPromise
      .then(draft => {
        if (draft && editor) {
          editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
          setHasDraft(true)
        }
      })
      .catch((e: unknown) => {
        log.warn('CORRA draft failed', { e })
        editor.commands.setContent('<p>Guten Tag,</p><p>ich melde mich kurz dazu.</p>')
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo?.id ?? invoice?.id, editor])

  const regenerate = useCallback(async () => {
    if (generating || !editor) return
    setGenerating(true)
    try {
      const draft = await (() => {
        if (mode === 'invoice_reminder' && invoice) {
          const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86_400_000))
          return generateCorraDraft({ kind: 'reminder', customerName: account?.name ?? '', invoiceNumber: invoice.number ?? '', amount: invoice.total, dueDate: invoice.dueDate, daysOverdue, dunningLevel: daysOverdue > 21 ? 1 : 0 })
        }
        if (mode === 'reply_mail' && todo) {
          const fromLine = (todo.notes ?? '').split('\n')[0]?.replace(/^Von: /, '') ?? ''
          return generateCorraDraft({ kind: 'reply_mail', customerName: account?.name ?? '', contactName: fromLine, subject, notes: todo.notes })
        }
        if (mode === 'followup' && todo) {
          const fromLine = (todo.notes ?? '').split('\n')[0]?.replace(/^Von: /, '') ?? ''
          return generateCorraDraft({ kind: 'followup', customerName: account?.name ?? '', contactName: fromLine, topic: subject || todo.title, notes: todo.notes })
        }
        return Promise.resolve('')
      })()
      if (draft) {
        editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
        setHasDraft(true)
      }
    } catch {
      showToast({ message: 'CORRA konnte keinen neuen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }, [generating, editor, mode, todo, invoice, account?.name, subject, showToast])

  const handleSend = async () => {
    const bodyText = editor?.getText() ?? ''
    if (!to.trim() || !subject.trim() || !bodyText.trim()) {
      showToast({ message: 'Bitte An, Betreff und Nachricht ausfüllen.', variant: 'error' })
      return
    }
    if (!mailAccounts[0]) {
      showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' })
      return
    }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id,
        to: [to.trim()],
        subject: subject.trim(),
        bodyText,
      })
      showToast({ message: 'E-Mail gesendet.', variant: 'success' })
      await onDone()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const sendLabel = mode === 'invoice_reminder' ? 'Erinnerung senden' : mode === 'reply_mail' ? 'Antwort senden' : 'E-Mail senden'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Compose box */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              background: 'var(--accent)', color: 'var(--accent-ink)',
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            }}>✉ E-Mail</span>
          </div>
          {generating
            ? <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CY-ENTWURF…
              </span>
            : hasDraft
            ? <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>✦ CY-ENTWURF · EDITIERBAR</span>
            : null
          }
        </div>

        {/* To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', width: 52, flexShrink: 0 }}>AN</span>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="E-Mail-Adresse…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }} />
        </div>

        {/* Subject */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', width: 52, flexShrink: 0 }}>BETREFF</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Betreff…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }} />
        </div>

        {/* Body */}
        <div style={{ padding: '12px 16px', minHeight: 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={handleSend} disabled={sending || generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px',
            borderRadius: 99, border: 'none',
            background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)',
            color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            cursor: (sending || generating) ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}>
          <Send size={14} />
          {sending ? 'Wird gesendet…' : sendLabel}
        </button>

        <button type="button" onClick={regenerate} disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          }}>
          {generating ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
          Cy neu
        </button>

        <button type="button" onClick={onSkip}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
