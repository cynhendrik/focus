// src/components/focus/cockpit/CockpitMailForm.tsx
import { useEffect, useImperativeHandle, forwardRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { invoke } from '@tauri-apps/api/core'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import type { Contact } from '@/types/contact.types'
import { log } from '@/lib/logger'

export interface CockpitMailFormRef {
  fillDraft: (subject: string, body: string) => void
}

interface Props {
  customerId: string | undefined
  customerName: string
  /** Signals to parent that a CORRA draft can be triggered (for lamp) */
  onSubjectChange: (subject: string) => void
}

export const CockpitMailForm = forwardRef<CockpitMailFormRef, Props>(
  function CockpitMailForm({ customerId, customerName, onSubjectChange }, ref) {
    const mailAccounts = useMailStore(s => s.accounts)
    const showToast    = useToastStore(s => s.show)

    const [to, setTo]           = useState('')
    const [subject, setSubject] = useState('')
    const [sending, setSending] = useState(false)

    // Load primary contact email
    useEffect(() => {
      if (!customerId) return
      invoke<Contact[]>('get_contacts', { accountId: customerId })
        .then(contacts => {
          const primary = contacts.find(c => c.email)
          if (primary?.email) setTo(primary.email)
        })
        .catch((err: unknown) => log.warn('Failed to load contacts for cockpit mail', { err }))
    }, [customerId])

    const editor = useEditor({
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: 'Nachricht schreiben — oder CORRA-Lampe klicken für Entwurf…' }),
      ],
      editorProps: {
        attributes: {
          style: 'outline: none; min-height: 60px; font-size: 13px; line-height: 1.7; color: var(--fg); font-family: inherit;',
        },
      },
    })

    // Expose fillDraft for external pre-fill (from invoice CORRA)
    useImperativeHandle(ref, () => ({
      fillDraft(newSubject: string, body: string) {
        setSubject(newSubject)
        editor?.commands.setContent(`<p>${body.replace(/\n/g, '</p><p>')}</p>`)
      },
    }))

    // Notify parent of subject changes (for lamp state)
    useEffect(() => {
      onSubjectChange(subject)
    }, [subject, onSubjectChange])

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
        setTo('')
        setSubject('')
        editor?.commands.clearContent()
      } catch {
        showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
      } finally {
        setSending(false)
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* AN */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', width: 40, flexShrink: 0 }}>AN</span>
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="E-Mail-Adresse…"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--fg)', fontSize: 12, outline: 'none',
            }}
          />
        </div>

        {/* BETREFF */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', width: 40, flexShrink: 0 }}>BETREFF</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Betreff…"
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--fg)', fontSize: 12, fontWeight: 600, outline: 'none',
            }}
          />
        </div>

        {/* TipTap body */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 9, padding: '10px 12px', minHeight: 72,
        }}>
          <EditorContent editor={editor} />
        </div>

        {/* Send button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: '7px 20px', borderRadius: 99, border: 'none',
              background: sending ? 'var(--surface-2)' : 'var(--accent)',
              color: sending ? 'var(--fg-dim)' : 'var(--accent-ink)',
              fontSize: 12, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Wird gesendet…' : '↑ Senden'}
          </button>
        </div>
      </div>
    )
  }
)
