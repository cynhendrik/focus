import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader, Sparkles, X } from 'lucide-react'
import { CorraMessage } from './CorraMessage'
import type { CorraMessage as CorraMessageType, CorraActionItem } from '@/lib/ai/corra-intelligence'

interface Props {
  messages: CorraMessageType[]
  loading: boolean
  onSend: (text: string) => void
  onFocusActions: (actions: CorraActionItem[]) => void
  onClear: () => void
}

export function CorraChatPanel({ messages, loading, onSend, onFocusActions, onClear }: Props) {
  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, y: 20 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 40, y: 20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        position: 'absolute', bottom: 24, right: 24, zIndex: 10,
        width: 280,
      }}
    >
      <div style={{
        background: 'rgba(10,10,10,0.95)',
        border: '1px solid rgba(163,230,53,0.18)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '1px solid rgba(163,230,53,0.1)',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px rgba(163,230,53,0.4)',
          }}>
            <Sparkles size={10} style={{ color: 'var(--accent-ink)' }} />
          </div>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            CORRA
          </span>
          <button type="button" onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', color: 'rgba(163,230,53,0.4)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
            {expanded ? '−' : '+'}
          </button>
          <button type="button" onClick={onClear}
            style={{ background: 'none', border: 'none', color: 'rgba(163,230,53,0.4)', cursor: 'pointer', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              {/* Messages */}
              <div style={{ maxHeight: 220, overflowY: 'auto', padding: '10px 0' }}>
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <CorraMessage key={msg.id ?? String(i)} message={msg} onFocusActions={onFocusActions} />
                  ))}
                </AnimatePresence>
                {loading && (
                  <div style={{ display: 'flex', padding: '6px 14px', gap: 8, alignItems: 'center' }}>
                    <Loader size={10} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 11, color: 'rgba(163,230,53,0.4)' }}>CORRA denkt…</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(163,230,53,0.08)' }}>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: 'rgba(163,230,53,0.04)', border: '1px solid rgba(163,230,53,0.12)',
                  borderRadius: 10, padding: '7px 10px',
                }}>
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Weiterfragen…"
                    style={{
                      flex: 1, background: 'transparent', border: 'none',
                      fontSize: 12, color: '#ddd', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || loading}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', border: 'none', flexShrink: 0,
                      background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                      color: input.trim() && !loading ? 'var(--accent-ink)' : 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                      fontSize: 12,
                    }}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </motion.div>
  )
}
