// ─────────────────────────────────────────────────────────────────────────────
// Quick Capture — Inbox fuer Gedanken, ungeordnet, ohne Format.
// Spaeter sortiert der User von hier in To-Dos oder Notizen.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from 'react'
import { Inbox, Send, Trash2 } from 'lucide-react'
import { usePrivateInboxStore } from '@/store/private-inbox.store'

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  const min = Math.floor((Date.now() - t) / 60_000)
  if (min < 1)  return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.floor(min / 60)
  if (h < 24)   return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d === 1)  return 'gestern'
  if (d < 30)   return `vor ${d} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

export function QuickCaptureRoute() {
  const items  = usePrivateInboxStore(s => s.items)
  const add    = usePrivateInboxStore(s => s.add)
  const remove = usePrivateInboxStore(s => s.remove)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const submit = () => {
    const v = text.trim()
    if (!v) return
    add(v)
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="priv-section-label">
        <Inbox size={11} /> Quick Capture
      </div>

      <h1 className="priv-title">
        Kopf frei. <span className="muted">Rein damit.</span>
      </h1>
      <p className="priv-subtitle">
        Alles, was dir durch den Kopf geht, landet hier — ungeordnet. Später
        sortierst du es in Ruhe zu To-Dos oder Notizen.
      </p>

      {/* ── Input-Card ─────────────────────────────────────────────────── */}
      <div className="priv-card" style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--priv-fg-dim)', fontWeight: 600,
          marginBottom: 10,
        }}>
          Was geht dir durch den Kopf?
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="Tippen und Enter…"
            className="priv-input"
            style={{ flex: 1, padding: '14px 16px', fontSize: 15 }}
            autoFocus
          />
          <button
            onClick={submit}
            title="Festhalten"
            style={{
              width: 44, height: 44, borderRadius: 11,
              background: 'var(--priv-accent)',
              color: '#3a1f10',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 140ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--priv-accent-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--priv-accent)' }}
          >
            <Send size={15} />
          </button>
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--priv-fg-dim)', marginTop: 10,
        }}>
          Kein Sortieren, kein Nachdenken. Einfach festhalten.
        </div>
      </div>

      {/* ── Inbox ──────────────────────────────────────────────────────── */}
      <div className="priv-section-label" style={{ marginBottom: 12 }}>
        Inbox <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--priv-fg-dim)',
          fontWeight: 400, letterSpacing: '0.05em', textTransform: 'none',
        }}>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: '24px 20px', borderRadius: 12,
          border: '1px dashed var(--priv-border)',
          color: 'var(--priv-fg-dim)', fontSize: 12.5,
          textAlign: 'center',
        }}>
          Noch nichts notiert. Tipp oben rein, der Rest folgt.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => <InboxRow key={it.id} text={it.text} time={it.createdAt} onRemove={() => remove(it.id)} />)}
        </div>
      )}
    </div>
  )
}

function InboxRow({ text, time, onRemove }: { text: string; time: string; onRemove: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px', borderRadius: 12,
        background: 'var(--priv-surface)',
        border: '1px solid var(--priv-border)',
        transition: 'border-color 140ms',
        borderColor: hover ? 'oklch(100% 0 0 / 0.14)' : undefined,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 99,
        background: 'var(--priv-accent)', flexShrink: 0,
      }} />
      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--priv-fg)' }}>
        {text}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5,
        color: 'var(--priv-fg-dim)', whiteSpace: 'nowrap',
      }}>
        {relTime(time)}
      </span>
      {hover && (
        <button
          onClick={onRemove}
          title="Loeschen"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--priv-fg-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}
