import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Send, Loader } from 'lucide-react'
import { CorraMessage } from './CorraMessage'
import { CorraSuggestedPrompts } from './CorraSuggestedPrompts'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  messages: CorraMessageType[]
  loading: boolean
  onSend: (text: string) => void
  onFocusActions: (actions: CorraActionItem[]) => void
  onExport: () => void
  onClear: () => void
}

export function CorraChat({ messages, loading, onSend, onFocusActions, onExport, onClear }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleSuggest = (prompt: string) => {
    setInput('')
    onSend(prompt)
  }

  const showSuggestions = messages.length <= 1 && !loading

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(124,58,237,0.45)',
          }}>
            <span style={{ color: '#fff', fontSize: 14 }}>✦</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.02em' }}>
              CORRA Intelligence
            </div>
            <div style={{
              fontSize: 9, color: 'var(--fg-dim)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            }}>
              KI-ASSISTENT · CYNERA
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onExport} style={{
            padding: '6px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--fg-dim)', fontSize: 10, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            ↗ Kopieren
          </button>
          <button type="button" onClick={onClear} style={{
            padding: '6px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--fg-dim)', fontSize: 10, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            ✕ Leeren
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 0',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <CorraMessage
              key={msg.id ?? String(i)}
              message={msg}
              onFocusActions={onFocusActions}
            />
          ))}
        </AnimatePresence>

        {loading && (
          <div style={{ display: 'flex', padding: '0 24px', gap: 10, alignItems: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontSize: 12 }}>✦</span>
            </div>
            <div style={{
              padding: '10px 14px',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: '14px 14px 14px 4px',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--fg-dim)',
            }}>
              <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
              CORRA denkt…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '14px 24px 18px', borderTop: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '10px 12px',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Frag CORRA — Todos, Rechnungen, Mails, Deals…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 13, color: 'var(--fg)', outline: 'none',
              resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 120, overflowY: 'auto',
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
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                : 'var(--surface-3)',
              color: input.trim() && !loading ? '#fff' : 'var(--fg-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 160ms',
              boxShadow: input.trim() && !loading
                ? '0 0 10px rgba(124,58,237,0.4)' : 'none',
            }}
          >
            <Send size={13} />
          </button>
        </div>

        {showSuggestions && <CorraSuggestedPrompts onSelect={handleSuggest} />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
