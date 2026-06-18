import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useUiStore } from '@/store/ui.store'
import { useMailStore } from '@/store/mail.store'
import { useTodosStore } from '@/store/todos.store'

interface Props {
  onSend: (text: string) => void
  loading: boolean
}

const HEADLINES = [
  'Was möchtest du wissen?',
  'Welche Rechnungen sind überfällig?',
  'Was steht heute an?',
  'Wer hat sich zuletzt gemeldet?',
  'Wie läuft die Pipeline?',
]


export function CorraIdleView({ onSend, loading }: Props) {
  const [input, setInput]               = useState('')
  const [isFocused, setIsFocused]       = useState(false)
  const [headlineIdx, setHeadlineIdx]   = useState(0)
  const [headlineShow, setHeadlineShow] = useState(true)
  const [time, setTime]                 = useState(() =>
    new Date().toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const theme    = useUiStore(s => s.theme)
  const isDark   = theme === 'dark'
  const unread   = useMailStore(s => s.emails.filter(e => !e.isRead).length)
  const today    = new Date().toISOString().slice(0, 10)
  const tasks    = useTodosStore(s =>
    s.allTodos.filter(t => t.status !== 'done' && (t.bucket === 'today' || t.scheduledAt?.slice(0, 10) === today)).length
  )

  const mouseRef = useRef<{ x: number; y: number } | null>(null)


  // Rotating headline
  useEffect(() => {
    const id = setInterval(() => {
      setHeadlineShow(false)
      setTimeout(() => {
        setHeadlineIdx(i => (i + 1) % HEADLINES.length)
        setHeadlineShow(true)
      }, 380)
    }, 3800)
    return () => clearInterval(id)
  }, [])

  // Live clock
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' }))
    }, 30_000)
    return () => clearInterval(id)
  }, [])


  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseLeave = () => { mouseRef.current = null }

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const contextItems = [
    tasks > 0   ? `${tasks} AUFGABEN`  : null,
    unread > 0  ? `${unread} UNGELESEN` : null,
    time,
  ].filter(Boolean) as string[]

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', overflow: 'hidden',
      }}
    >
      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: isDark
          ? 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)'
          : 'radial-gradient(circle, rgba(0,0,0,0.14) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }} />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px' }}>

        {/* Orb + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          {loading ? (
            <div className="corra-spinner" />
          ) : (
            <motion.div
              animate={{ scale: isFocused ? 1.1 : 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            >
              <div className="corra-dots" data-focused={isFocused ? 'true' : 'false'}>
                <div className="cd cd-center" />
                <div className="cd cd-1" />
                <div className="cd cd-2" />
                <div className="cd cd-3" />
                <div className="cd cd-4" />
                <div className="cd cd-5" />
                <div className="cd cd-6" />
              </div>
            </motion.div>
          )}

          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 9,
              color: isDark ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--fg-dim)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.18em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              KORA INTELLIGENCE
            </div>
            <div style={{
              fontSize: 26, fontWeight: 700,
              color: isDark ? '#fff' : 'var(--fg)',
              letterSpacing: '-0.025em', lineHeight: 1.2,
              transition: 'opacity 380ms ease, transform 380ms ease',
              opacity: headlineShow ? 1 : 0,
              transform: headlineShow ? 'translateY(0)' : 'translateY(-10px)',
            }}>
              {HEADLINES[headlineIdx]}
            </div>
          </div>
        </div>

        {/* Context bar */}
        {contextItems.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: 0, marginBottom: 14,
          }}>
            {contextItems.map((item, i) => (
              <span key={item} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && (
                  <span style={{
                    margin: '0 10px',
                    fontSize: 9, fontFamily: 'var(--font-mono)',
                    color: isDark ? 'rgba(59,109,244,0.25)' : 'var(--fg-dim)',
                    opacity: 0.5,
                  }}>·</span>
                )}
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.12em',
                  color: isDark ? 'rgba(59,109,244,0.6)' : 'var(--fg-dim)',
                }}>
                  {item}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          className="corra-input-wrap"
          data-focused={isFocused ? 'true' : 'false'}
          style={{
            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'flex-end', gap: 10,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Frag KORA — Umsatz, Todos, Mails, Deals…"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              fontSize: 14, color: isDark ? '#fff' : 'var(--fg)',
              outline: 'none', resize: 'none', lineHeight: 1.5,
              fontFamily: 'inherit', maxHeight: 140, overflowY: 'auto',
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
              boxShadow: input.trim() && !loading && isDark ? '0 0 12px rgba(59,109,244,0.4)' : 'none',
              fontSize: 16,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
