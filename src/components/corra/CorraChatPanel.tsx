// src/components/corra/CorraChatPanel.tsx
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { CorraMessage } from './CorraMessage'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  messages:  CorraMessageType[]
  loading:   boolean
  onSend:    (text: string) => void
  onExecute: (action: CorraActionItem) => Promise<void>
  onClear:   () => void
  onDismiss?: (id: string) => void
  actionStatus?: Record<string, 'done' | 'dismissed'>
}

export function CorraChatPanel({ messages, loading, onSend, onExecute, onClear, onDismiss, actionStatus }: Props) {
  const [input, setInput]   = useState('')
  const bottomRef           = useRef<HTMLDivElement>(null)
  const textareaRef         = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const openCount = messages.filter(
    m => m.role === 'assistant' && m.actions && m.actions.length > 0
  ).reduce((s, m) => s + (m.actions?.length ?? 0), 0)

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--fg) 6%, transparent) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />

      {/* Topbar */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 40%, transparent)',
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: 'var(--accent)',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
        }}>KORA INTELLIGENCE</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {openCount > 0 && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--accent)', letterSpacing: '0.1em',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              padding: '2px 8px', borderRadius: 99,
            }}>
              {openCount} OFFEN
            </span>
          )}
          <button
            type="button"
            onClick={onClear}
            title="Neue Unterhaltung"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--fg-dim)', display: 'flex', alignItems: 'center',
              gap: 5, fontSize: 11, padding: '4px 8px', borderRadius: 6,
            }}
          >
            <RotateCcw size={12} /> Neu
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1,
        padding: '24px 0',
      }}>
        <div style={{
          maxWidth: 760, margin: '0 auto',
          padding: '0 24px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <CorraMessage
                key={msg.id ?? String(i)}
                message={msg}
                onExecute={onExecute}
                onDismiss={onDismiss}
                statusMap={actionStatus}
              />
            ))}
          </AnimatePresence>

          {loading && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent-gradient)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, boxShadow: '0 0 10px var(--accent-glow)',
              }}>✦</div>
              <div style={{ paddingTop: 6, display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `koraPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    opacity: 0.6,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{
        position: 'relative', zIndex: 1,
        padding: '16px 24px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          maxWidth: 760, margin: '0 auto',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', gap: 10, alignItems: 'flex-end',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Frag KORA — Umsatz, offene Rechnungen, was heute ansteht…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 13, color: 'var(--fg)', outline: 'none',
              resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 120, overflowY: 'auto',
              caretColor: 'var(--accent)',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: input.trim() && !loading ? 'var(--accent-gradient)' : 'color-mix(in srgb, var(--fg) 8%, transparent)',
              color: input.trim() && !loading ? 'var(--accent-ink)' : 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              fontSize: 15, transition: 'all 160ms',
              boxShadow: input.trim() && !loading ? '0 0 10px var(--accent-glow)' : 'none',
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes koraPulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50%       { transform: scale(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
