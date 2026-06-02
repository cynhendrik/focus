import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'
import type { Contact } from '@/types/contact.types'
import { Send, Sparkles, Loader, Mail } from 'lucide-react'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

const ACCENT = 'oklch(65% 0.18 50)'

export function FocusCardFollowUp({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const account = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const isReplyMail = todo.actionType === 'reply_mail'
  const accentColor = isReplyMail ? 'oklch(60% 0.15 240)' : ACCENT

  const [contactName, setContactName] = useState('')
  const [recipient, setRecipient]     = useState('')
  const [subject, setSubject]         = useState(isReplyMail ? 'Re: …' : 'Kurz nachgehakt')
  const [body, setBody]               = useState('')
  const [sending, setSending]         = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [hasCorraDraft, setHasCorraDraft] = useState(false)

  useEffect(() => {
    if (!todo.customerId) return
    invoke<Contact[]>('get_contacts', { accountId: todo.customerId })
      .then(contacts => {
        const primary = contacts.find(c => c.email)
        if (primary) {
          setRecipient(primary.email ?? '')
          setContactName([primary.firstName, primary.lastName].filter(Boolean).join(' '))
        }
      })
      .catch((err: unknown) => log.warn('Failed to load contacts for followup', { err }))
  }, [todo.customerId])

  useEffect(() => {
    setGenerating(true)
    generateCorraDraft(
      isReplyMail
        ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName, subject: todo.title, notes: todo.notes }
        : { kind: 'followup', customerName: account?.name ?? '', contactName, topic: todo.title, notes: todo.notes }
    )
      .then(draft => {
        if (draft) { setBody(draft); setHasCorraDraft(true) }
      })
      .catch(() => {
        setBody(isReplyMail
          ? 'Danke für deine Nachricht! Ich schaue mir das an und melde mich kurz bei dir.'
          : 'Wollte kurz nachfragen, wie es läuft — gibt es Neuigkeiten von deiner Seite?'
        )
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id])

  const regenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const draft = await generateCorraDraft(
        isReplyMail
          ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName, subject: todo.title, notes: todo.notes }
          : { kind: 'followup', customerName: account?.name ?? '', contactName, topic: todo.title, notes: todo.notes }
      )
      if (draft) { setBody(draft); setHasCorraDraft(true) }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    if (!mailAccounts[0]) { showToast({ message: 'Kein E-Mail-Konto konfiguriert.', variant: 'error' }); return }
    if (!recipient.trim()) { showToast({ message: 'Bitte eine Empfänger-E-Mail angeben.', variant: 'error' }); return }
    setSending(true)
    try {
      await MailService.sendEmail({
        accountId: mailAccounts[0].id,
        to: [recipient.trim()],
        subject: subject.trim(),
        bodyText: body.trim(),
      })
      showToast({ message: isReplyMail ? 'Antwort gesendet.' : 'Follow-Up gesendet.', variant: 'success' })
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const badgeLabel = isReplyMail ? '✉ ANTWORTEN' : '↻ FOLLOW-UP'
  const titleLabel = isReplyMail ? 'Antwort schreiben' : todo.title
  const contextText = todo.notes
    ?? (isReplyMail ? 'Eine Antwort ist fällig — CORRA hat einen Entwurf vorbereitet.' : 'Kein aktiver Kontakt — Zeit für eine kurze Nachricht.')

  return (
    <div style={{
      background: 'var(--surface-2)',
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: 18,
      padding: '32px 36px',
      boxShadow: '0 8px 40px -12px oklch(0% 0 0 / 0.3)',
      display: 'flex', flexDirection: 'column', gap: 24,
    }}>

      {/* Title block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: accentColor, background: `${accentColor}18`,
            padding: '3px 9px', borderRadius: 99,
          }}>
            {badgeLabel}
          </span>
          {account && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>· {account.name}</span>}
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34, fontWeight: 700,
          letterSpacing: '-0.03em', lineHeight: 1.0,
          margin: 0, color: 'var(--fg)',
        }}>
          {titleLabel}
        </h1>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ color: accentColor, fontSize: 14, marginTop: 1, flexShrink: 0 }}>→</span>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.6 }}>{contextText}</p>
        </div>
      </div>

      {/* Compose area */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {/* Channel + CORRA label */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <button type="button" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            border: 'none', fontSize: 12, fontWeight: 600, cursor: 'default',
          }}>
            <Mail size={12} /> E-Mail
          </button>
          {hasCorraDraft && !generating && (
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={9} /> CORRA-ENTWURF · EDITIERBAR
            </span>
          )}
          {generating && (
            <span style={{ fontSize: 9, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CORRA DENKT…
            </span>
          )}
        </div>

        {/* AN */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>AN</span>
          <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>
            {contactName || account?.name || '—'}
            {recipient && <span style={{ color: 'var(--fg-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)', fontSize: 12 }}> &lt;{recipient}&gt;</span>}
          </span>
          {!recipient && (
            <input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="E-Mail eingeben…"
              style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }}
            />
          )}
        </div>

        {/* BETREFF */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 44 }}>BETREFF</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }}
          />
        </div>

        {/* Body */}
        <textarea
          value={generating ? '…' : body}
          onChange={e => setBody(e.target.value)}
          disabled={generating}
          rows={5}
          style={{
            width: '100%', background: 'transparent', border: 'none',
            padding: '14px 16px', fontSize: 14, color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            outline: 'none', resize: 'none', lineHeight: 1.65,
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 99, border: 'none',
            background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)',
            color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            cursor: (sending || generating) ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={14} />
          {sending ? 'Wird gesendet…' : isReplyMail ? 'Antwort senden' : 'Nachfassen'}
        </button>

        <button
          type="button"
          onClick={regenerate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '11px 18px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
          Corra neu
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '11px 16px', borderRadius: 99,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Morgen
          <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none',
            color: 'var(--fg-dim)', fontSize: 13, cursor: 'pointer', padding: '11px 4px',
          }}
        >
          Überspringen <span style={{ opacity: 0.5 }}>→</span>
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
