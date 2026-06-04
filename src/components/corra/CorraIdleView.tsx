import { useState, useRef } from 'react'
import { CorraSuggestedPrompts } from './CorraSuggestedPrompts'

interface Props {
  onSend: (text: string) => void
  loading: boolean
}

export function CorraIdleView({ onSend, loading }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#080808',
      overflow: 'hidden',
    }}>
      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(163,230,53,0.07) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />

      {/* Animated lime blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'rgba(163,230,53,0.13)',
          filter: 'blur(100px)',
          bottom: '-10%', left: '-8%',
          animation: 'blob1 14s ease-in-out infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'rgba(163,230,53,0.09)',
          filter: 'blur(90px)',
          top: '-15%', right: '-10%',
          animation: 'blob2 18s ease-in-out infinite',
          willChange: 'transform',
        }} />
        <div style={{
          position: 'absolute', width: 380, height: 380, borderRadius: '50%',
          background: 'rgba(163,230,53,0.07)',
          filter: 'blur(80px)',
          top: '40%', left: '55%',
          animation: 'blob3 22s ease-in-out infinite',
          willChange: 'transform',
        }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px' }}>
        {/* Orb + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 36 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px rgba(163,230,53,0.35)',
          }}>
            <span style={{ color: 'var(--accent-ink)', fontSize: 18 }}>✦</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9, color: 'oklch(92% 0.2 125 / 0.5)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              CORRA INTELLIGENCE
            </div>
            <div style={{
              fontSize: 26, fontWeight: 700, color: '#fff',
              letterSpacing: '-0.025em', lineHeight: 1.2,
            }}>
              Was möchtest du wissen?
            </div>
          </div>
        </div>

        {/* Input */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(163,230,53,0.2)',
          borderRadius: 16, padding: '14px 16px',
          display: 'flex', alignItems: 'flex-end', gap: 10,
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Frag CORRA — Umsatz, Todos, Mails, Deals…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 14, color: '#fff', outline: 'none',
              resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 140, overflowY: 'auto',
              caretColor: 'var(--accent)',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: input.trim() && !loading ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              color: input.trim() && !loading ? 'var(--accent-ink)' : 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 180ms',
              boxShadow: input.trim() && !loading ? '0 0 12px rgba(163,230,53,0.4)' : 'none',
              fontSize: 16,
            }}
          >
            ↑
          </button>
        </div>

        {/* Suggested prompts */}
        <CorraSuggestedPrompts onSelect={text => { setInput(''); onSend(text) }} />
      </div>

      <style>{`
        @keyframes blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25%       { transform: translate(60px, -50px) scale(1.08); }
          50%       { transform: translate(20px, 40px) scale(0.95); }
          75%       { transform: translate(-40px, -20px) scale(1.03); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          30%       { transform: translate(-70px, 50px) scale(1.06); }
          60%       { transform: translate(50px, -30px) scale(0.92); }
          80%       { transform: translate(-20px, 60px) scale(1.04); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          20%       { transform: translate(-40px, -60px) scale(1.1); }
          55%       { transform: translate(60px, 30px) scale(0.9); }
          80%       { transform: translate(-10px, -40px) scale(1.05); }
        }
      `}</style>
    </div>
  )
}
