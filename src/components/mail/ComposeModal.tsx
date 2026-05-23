// src/components/mail/ComposeModal.tsx

import { useState, useRef } from 'react'
import { X, Paperclip } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import type { EmailHeader, SendEmailPayload } from '@/types/mail.types'

interface ComposeModalProps {
  mode: 'new' | 'reply' | 'forward'
  replyTo?: EmailHeader
  replyBody?: string
  accountId: string
  onClose: () => void
  onSent: () => void
}

function tagInputInitial(mode: 'new' | 'reply' | 'forward', replyTo?: EmailHeader): string[] {
  if (mode === 'reply' && replyTo) return [replyTo.fromAddr]
  return []
}

function subjectInitial(mode: 'new' | 'reply' | 'forward', replyTo?: EmailHeader): string {
  if (!replyTo) return ''
  if (mode === 'reply')   return `Re: ${replyTo.subject}`
  if (mode === 'forward') return `Fwd: ${replyTo.subject}`
  return ''
}

function bodyInitial(mode: 'new' | 'reply' | 'forward', replyTo?: EmailHeader, replyBody?: string): string {
  if (!replyTo || !replyBody) return ''
  const date = new Date(replyTo.sentAt).toLocaleString('de-DE')
  if (mode === 'reply') {
    const quoted = replyBody.split('\n').slice(0, 20).map(l => `> ${l}`).join('\n')
    return `\n\n---\nAm ${date} schrieb ${replyTo.fromName || replyTo.fromAddr}:\n\n${quoted}`
  }
  if (mode === 'forward') {
    return `\n\n---\nWeitergeleitete Nachricht:\nVon: ${replyTo.fromAddr}\nDatum: ${date}\nBetreff: ${replyTo.subject}\n\n${replyBody}`
  }
  return ''
}

// ── Tag Input component ───────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px',
      border: '1px solid var(--border)', borderRadius: 8, minHeight: 36,
      background: 'var(--surface-2)',
    }}>
      {tags.map(tag => (
        <span key={tag} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--accent)', color: 'var(--accent-ink)',
          borderRadius: 6, padding: '2px 8px', fontSize: 12,
        }}>
          {tag}
          <button
            onClick={() => onChange(tags.filter(t => t !== tag))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7 }}
          >×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
          if (e.key === 'Backspace' && !input && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{
          flex: 1, minWidth: 120, background: 'none', border: 'none',
          outline: 'none', fontSize: 13, color: 'var(--fg)',
        }}
      />
    </div>
  )
}

// ── ComposeModal ──────────────────────────────────────────────────────────────

export function ComposeModal({
  mode, replyTo, replyBody, accountId, onClose, onSent,
}: ComposeModalProps) {
  const { sendEmail, isSending } = useMailStore()

  const [to, setTo]           = useState<string[]>(tagInputInitial(mode, replyTo))
  const [cc, setCc]           = useState<string[]>([])
  const [showCc, setShowCc]   = useState(false)
  const [subject, setSubject] = useState(subjectInitial(mode, replyTo))
  const [body, setBody]       = useState(bodyInitial(mode, replyTo, replyBody))
  const [files, setFiles]     = useState<File[]>([])
  const [error, setError]     = useState('')
  const fileRef               = useRef<HTMLInputElement>(null)

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    const oversized = selected.filter(f => f.size > 25 * 1024 * 1024)
    if (oversized.length) {
      setError(`Anhang zu groß (max. 25 MB): ${oversized.map(f => f.name).join(', ')}`)
      return
    }
    setFiles(prev => [...prev, ...selected])
    e.target.value = ''
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleSend = async () => {
    if (!to.length)      { setError('Bitte mindestens einen Empfänger angeben'); return }
    if (!subject.trim()) { setError('Betreff darf nicht leer sein'); return }
    setError('')

    const payload: SendEmailPayload = {
      accountId,
      to,
      cc: cc.length ? cc : undefined,
      subject: subject.trim(),
      bodyText: body,
      attachmentPaths: [],
    }

    try {
      await sendEmail(payload)
      onSent()
      onClose()
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 998,
        }}
      />

      {/* Slideout panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--bg)', borderLeft: '1px solid var(--border)',
        zIndex: 999, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
            {mode === 'new' ? 'Neue E-Mail' : mode === 'reply' ? 'Antworten' : 'Weiterleiten'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* An */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>An *</label>
            <TagInput tags={to} onChange={setTo} placeholder="E-Mail-Adresse eingeben, Enter drücken" />
          </div>

          {/* CC */}
          {!showCc ? (
            <button
              onClick={() => setShowCc(true)}
              style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              CC hinzufügen
            </button>
          ) : (
            <div>
              <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>CC</label>
              <TagInput tags={cc} onChange={setCc} placeholder="CC-Adresse, Enter drücken" />
            </div>
          )}

          {/* Betreff */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Betreff *</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Nachricht */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', display: 'block', marginBottom: 4 }}>Nachricht</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--fg)', outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', width: '100%',
              }}
            />
          </div>

          {/* Anhang-Chips */}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {files.map((f, i) => (
                <span key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', borderRadius: 20, fontSize: 12,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg)',
                }}>
                  📄 {f.name} · {formatSize(f.size)}
                  <button
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--fg-dim)' }}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
          >
            <Paperclip size={16} /> Anhang
          </button>
          <input ref={fileRef} type="file" multiple onChange={handleFiles} style={{ display: 'none' }} />

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                background: 'none', border: '1px solid var(--border)', color: 'var(--fg)',
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSend}
              disabled={isSending}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none',
                opacity: isSending ? 0.6 : 1,
              }}
            >
              {isSending ? 'Sendet…' : 'Senden'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
