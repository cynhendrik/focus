import { useState, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Send, Sparkles, Loader } from 'lucide-react'
import { useAccountsStore } from '@/store/accounts.store'
import { useMailStore } from '@/store/mail.store'
import { useToastStore } from '@/store/toast.store'
import { MailService } from '@/services/mail.service'
import { generateCorraDraft } from '@/lib/ai/corra'
import { log } from '@/lib/logger'
import type { Todo } from '@/types/todo.types'

interface Props {
  todo: Todo
  onComplete: () => Promise<void>
  onSkip: () => void
  onPostpone: () => Promise<void>
}

export function parseNotes(notes: string | undefined): { fromAddr: string; sentAt: string; fromLine: string } {
  const text = notes ?? ''
  const fromAddr = /^fromAddr: (.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const sentAt   = /^sentAt: (.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const fromLine = text.split('\n')[0]?.replace(/^Von: /, '') ?? ''
  return { fromAddr, sentAt, fromLine }
}

export function FocusBodyEmail({ todo, onComplete, onSkip, onPostpone }: Props) {
  const accounts     = useAccountsStore(s => s.accounts)
  const mailAccounts = useMailStore(s => s.accounts)
  const showToast    = useToastStore(s => s.show)

  const account  = todo.customerId ? accounts.find(a => a.id === todo.customerId) : undefined
  const isReply  = todo.actionType === 'reply_mail'

  const { fromAddr, sentAt, fromLine } = parseNotes(todo.notes)

  const [to, setTo]       = useState(fromAddr)
  const [subject, setSubject] = useState(
    isReply ? `Re: ${todo.title.replace(/ beantworten$/, '')}` : ''
  )
  const [originalBody, setOriginalBody]         = useState<string | null>(null)
  const [originalLoading, setOriginalLoading]   = useState(false)
  const [sending, setSending]                   = useState(false)
  const [generating, setGenerating]             = useState(false)
  const [hasCorraDraft, setHasCorraDraft]       = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Nachricht schreiben…' }),
    ],
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 80px; font-size: 14px; line-height: 1.65; color: var(--fg); font-family: inherit;',
      },
    },
  })

  useEffect(() => {
    if (!todo.sourceRef) return
    setOriginalLoading(true)
    MailService.getBody(todo.sourceRef)
      .then(b => setOriginalBody(b.bodyText))
      .catch((err: unknown) => {
        log.warn('Could not load original mail body', { err })
        setOriginalBody(null)
      })
      .finally(() => setOriginalLoading(false))
  }, [todo.sourceRef])

  useEffect(() => {
    if (!editor) return
    setGenerating(true)
    generateCorraDraft(
      isReply
        ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName: fromLine, subject: todo.title, notes: todo.notes }
        : { kind: 'followup', customerName: account?.name ?? '', contactName: fromLine, topic: todo.title, notes: todo.notes }
    )
      .then(draft => {
        if (draft) {
          editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
          setHasCorraDraft(true)
        }
      })
      .catch(() => {
        editor.commands.setContent(
          '<p>Guten Tag,</p><p>vielen Dank für Ihre Nachricht. Ich melde mich kurz dazu.</p>'
        )
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id, editor])

  const regenerate = useCallback(async () => {
    if (generating || !editor) return
    setGenerating(true)
    try {
      const draft = await generateCorraDraft(
        isReply
          ? { kind: 'reply_mail', customerName: account?.name ?? '', contactName: fromLine, subject, notes: todo.notes }
          : { kind: 'followup', customerName: account?.name ?? '', contactName: fromLine, topic: subject || todo.title, notes: todo.notes }
      )
      if (draft) {
        editor.commands.setContent(`<p>${draft.replace(/\n/g, '</p><p>')}</p>`)
        setHasCorraDraft(true)
      }
    } catch {
      showToast({ message: 'CORRA konnte keinen Entwurf generieren.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }, [generating, editor, account?.name, fromLine, subject, todo.notes, showToast, isReply, todo.title])

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
      await onComplete()
    } catch {
      showToast({ message: 'Senden fehlgeschlagen.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const sentAtFormatted = sentAt
    ? (() => { try { return new Date(sentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return null } })()
    : null

  return (
    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Original mail block */}
      {todo.sourceRef && (
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)',
            }}>Original</span>
            <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 600 }}>{fromLine}</span>
            {sentAtFormatted && (
              <span style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 'auto' }}>{sentAtFormatted}</span>
            )}
          </div>
          <div style={{ padding: '12px 16px', maxHeight: 180, overflowY: 'auto' }}>
            {originalLoading ? (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Lade Mail…
              </span>
            ) : originalBody ? (
              <pre style={{
                fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'pre-wrap',
                wordBreak: 'break-word', margin: 0, fontFamily: 'inherit', lineHeight: 1.6,
              }}>
                {originalBody}
              </pre>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Nachrichtentext nicht verfügbar.</span>
            )}
          </div>
        </div>
      )}

      {/* Compose block */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)',
          }}>
            {isReply ? 'Antwort verfassen' : 'E-Mail verfassen'}
          </span>
          {hasCorraDraft && !generating && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Sparkles size={9} /> CORRA-ENTWURF · EDITIERBAR
            </span>
          )}
          {generating && (
            <span style={{
              fontSize: 9, color: 'var(--fg-dim)', display: 'flex', alignItems: 'center',
              gap: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            }}>
              <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> CORRA DENKT…
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 52,
          }}>AN</span>
          <input
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="E-Mail-Adresse…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', flexShrink: 0, width: 52,
          }}>BETREFF</span>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Betreff…"
            style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--fg)', fontWeight: 600, outline: 'none' }}
          />
        </div>

        <div style={{ padding: '12px 16px', minHeight: 100 }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px',
            borderRadius: 99, border: 'none',
            background: (sending || generating) ? 'var(--surface-3)' : 'var(--accent)',
            color: (sending || generating) ? 'var(--fg-muted)' : 'var(--accent-ink)',
            fontSize: 13, fontWeight: 700,
            boxShadow: (sending || generating) ? 'none' : '0 4px 16px -6px var(--accent-glow)',
            cursor: (sending || generating) ? 'not-allowed' : 'pointer',
            transition: 'all 200ms',
          }}
        >
          <Send size={14} />
          {sending ? 'Wird gesendet…' : isReply ? 'Antwort senden' : 'E-Mail senden'}
        </button>

        <button
          type="button"
          onClick={regenerate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: generating ? 'var(--fg-dim)' : 'var(--fg)',
            fontSize: 13, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating
            ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Sparkles size={13} />
          }
          Corra neu
        </button>

        <button
          type="button"
          onClick={() => { onPostpone().catch(() => {}) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px',
            borderRadius: 99, border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer',
          }}
        >
          Morgen <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)' }}>M</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
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
