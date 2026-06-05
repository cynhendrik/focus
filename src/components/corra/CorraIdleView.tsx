import { useState, useRef } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { CorraSuggestedPrompts } from './CorraSuggestedPrompts'
import { useUiStore } from '@/store/ui.store'

interface Props {
  onSend: (text: string) => void
  loading: boolean
}

export function CorraIdleView({ onSend, loading }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const theme = useUiStore(s => s.theme)
  const isDark = theme === 'dark'

  const glowX = useMotionValue(-9999)
  const glowY = useMotionValue(-9999)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDark) return
    const rect = e.currentTarget.getBoundingClientRect()
    glowX.set(e.clientX - rect.left - 260)
    glowY.set(e.clientY - rect.top - 260)
  }

  const handleMouseLeave = () => { glowX.set(-9999); glowY.set(-9999) }

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
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow — nur Dark Mode */}
      {isDark && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -60%)',
          width: 700, height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(163,230,53,0.08) 0%, rgba(163,230,53,0.03) 45%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none', zIndex: 0,
        }} />
      )}

      {/* Mouse-following glow — nur Dark Mode */}
      {isDark && (
        <motion.div
          style={{
            position: 'absolute', top: 0, left: 0,
            width: 520, height: 520,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(163,230,53,0.18) 0%, rgba(163,230,53,0.06) 40%, transparent 70%)',
            filter: 'blur(52px)',
            x: glowX, y: glowY,
            pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}

      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: isDark
          ? 'radial-gradient(circle, rgba(163,230,53,0.1) 1px, transparent 1px)'
          : 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        zIndex: 0,
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px' }}>
        {/* Orb + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 36 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: isDark ? 'var(--accent)' : 'oklch(14% 0 0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isDark ? '0 0 32px rgba(163,230,53,0.35)' : '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <span style={{ color: isDark ? 'var(--accent-ink)' : '#fff', fontSize: 18 }}>✦</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9,
              color: isDark ? 'oklch(92% 0.2 125 / 0.5)' : 'var(--fg-dim)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              CORRA INTELLIGENCE
            </div>
            <div style={{
              fontSize: 26, fontWeight: 700,
              color: isDark ? '#fff' : 'var(--fg)',
              letterSpacing: '-0.025em', lineHeight: 1.2,
            }}>
              Was möchtest du wissen?
            </div>
          </div>
        </div>

        {/* Input */}
        <div style={{
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: isDark ? '1px solid rgba(163,230,53,0.2)' : '1px solid var(--border)',
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
              fontSize: 14,
              color: isDark ? '#fff' : 'var(--fg)',
              outline: 'none',
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
              background: input.trim() && !loading
                ? 'var(--accent)'
                : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              color: input.trim() && !loading
                ? 'var(--accent-ink)'
                : isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 180ms',
              boxShadow: input.trim() && !loading && isDark ? '0 0 12px rgba(163,230,53,0.4)' : 'none',
              fontSize: 16,
            }}
          >
            ↑
          </button>
        </div>

        {/* Suggested prompts */}
        <CorraSuggestedPrompts onSelect={text => { setInput(''); onSend(text) }} />
      </div>
    </div>
  )
}
