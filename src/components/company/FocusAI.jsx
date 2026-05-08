import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import { Avatar } from '../ui/Avatar'
import { healthColor, uid } from '../../utils/helpers'
import { SYSTEM_PROMPT, buildCustomerContext, streamAICompletion, IS_TAURI } from '../../utils/focusAI'

// Inject cursor + pulse keyframes once
const STYLES = '@keyframes focusai-blink{0%,100%{opacity:1}50%{opacity:0}}' +
  '.focusai-cursor{display:inline-block;width:2px;height:.85em;background:var(--p);margin-left:2px;vertical-align:text-bottom;border-radius:1px;animation:focusai-blink .7s step-end infinite}' +
  '@keyframes focusai-pulse{0%,80%,100%{transform:scale(0);opacity:.4}40%{transform:scale(1);opacity:1}}'

function injectStyles() {
  if (document.getElementById('focusai-styles')) return
  const el = document.createElement('style')
  el.id = 'focusai-styles'
  el.textContent = STYLES
  document.head.appendChild(el)
}

// ── Minimal markdown renderer ─────────────────────────────────────────────────

function renderInline(text) {
  const parts = []
  let i = 0, cur = ''
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '*') {
      if (cur) { parts.push(cur); cur = '' }
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        parts.push(<strong key={i} style={{ fontWeight: 700 }}>{text.slice(i + 2, end)}</strong>)
        i = end + 2; continue
      }
    }
    if (text[i] === '`' && text[i + 1] !== '`') {
      if (cur) { parts.push(cur); cur = '' }
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        parts.push(<code key={i} style={{ fontFamily: 'monospace', fontSize: '0.88em', padding: '1px 5px', borderRadius: 4, background: 'var(--bg3)', color: 'var(--p)' }}>{text.slice(i + 1, end)}</code>)
        i = end + 1; continue
      }
    }
    cur += text[i++]
  }
  if (cur) parts.push(cur)
  return parts
}

function MessageContent({ content }) {
  return (
    <div style={{ lineHeight: 1.7, fontSize: 14, color: 'var(--text)' }}>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <div key={i} style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em', marginTop: 14, marginBottom: 3 }}>{renderInline(line.slice(4))}</div>
        if (line.startsWith('## '))  return <div key={i} style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', marginTop: 16, marginBottom: 4 }}>{renderInline(line.slice(3))}</div>
        if (line.startsWith('# '))   return <div key={i} style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em', marginTop: 18, marginBottom: 6 }}>{renderInline(line.slice(2))}</div>
        if (line.startsWith('- ') || line.startsWith('* ')) return (
          <div key={i} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <span style={{ color: 'var(--p)', flexShrink: 0, fontWeight: 700, lineHeight: 1.7 }}>•</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        )
        const num = line.match(/^(\d+)\.\s+(.*)/)
        if (num) return (
          <div key={i} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <span style={{ color: 'var(--p)', flexShrink: 0, fontWeight: 600, minWidth: 16, lineHeight: 1.7 }}>{num[1]}.</span>
            <span>{renderInline(num[2])}</span>
          </div>
        )
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />
        return <div key={i} style={{ marginTop: 3 }}>{renderInline(line)}</div>
      })}
    </div>
  )
}

// ── API Key Setup ─────────────────────────────────────────────────────────────

function ApiKeySetup({ onSave }) {
  const [key, setKey] = useState('')
  const valid = key.trim().length > 10
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <svg width="26" height="26" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 6 }}>FOCUS AI einrichten</h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.65, marginBottom: 24 }}>
          Verbinde deinen kostenlosen Groq API-Key. Kostenlos verfügbar auf{' '}
          <span style={{ color: 'var(--p)', fontWeight: 600 }}>console.groq.com</span>
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>
            Groq API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && valid && onSave(key.trim())}
            placeholder="gsk_..."
            autoFocus
            style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', letterSpacing: '0.04em', transition: 'border-color 0.15s' }}
            onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
            onBlur={e => e.target.style.borderColor = 'var(--border2)'}
          />
        </div>

        <button
          onClick={() => valid && onSave(key.trim())}
          disabled={!valid}
          style={{ width: '100%', padding: '11px 0', borderRadius: 'var(--r-md)', background: valid ? 'var(--p)' : 'var(--bg3)', border: 'none', color: valid ? '#fff' : 'var(--text3)', fontSize: 14, fontWeight: 700, cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'all 0.15s' }}
          onMouseEnter={e => { if (valid) e.currentTarget.style.background = 'var(--p2)' }}
          onMouseLeave={e => { if (valid) e.currentTarget.style.background = 'var(--p)' }}
        >
          FOCUS AI aktivieren
        </button>

        <p style={{ fontSize: 11, color: 'var(--text4)', marginTop: 12, textAlign: 'center' }}>
          Dein Key wird nur lokal gespeichert und niemals weitergegeben.
        </p>
      </div>
    </div>
  )
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg, isLive }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 18, gap: 10 }}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 3 }}>
          <svg width="13" height="13" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
        </div>
      )}

      <div style={{
        maxWidth: '74%',
        padding: isUser ? '10px 16px' : '14px 18px',
        borderRadius: isUser
          ? '14px 14px 4px 14px'
          : '14px 14px 14px 4px',
        background: isUser ? 'var(--p)' : 'var(--bg1)',
        border: isUser ? 'none' : '1px solid var(--border)',
        color: isUser ? '#fff' : 'var(--text)',
        boxShadow: isUser ? 'none' : '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {isUser
          ? <div style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          : <>{<MessageContent content={msg.content} />}{isLive && <span className="focusai-cursor" />}</>
        }
      </div>

      {isUser && <div style={{ width: 28, flexShrink: 0 }} />}
    </div>
  )
}

// ── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
      <div style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 3 }}>
        <svg width="13" height="13" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
      </div>
      <div style={{ padding: '14px 18px', borderRadius: '14px 14px 14px 4px', background: 'var(--bg1)', border: '1px solid var(--border)', display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--p)', animation: `focusai-pulse 1.4s ${delay}s ease-in-out infinite` }} />
        ))}
      </div>
    </div>
  )
}

// ── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ customer }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ width: 68, height: 68, borderRadius: 24, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
        <svg width="32" height="32" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
        </svg>
      </div>
      <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 8 }}>
        FOCUS AI
      </h3>
      <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, maxWidth: 340, marginBottom: 20 }}>
        {customer
          ? <>Ich habe die Daten von <strong style={{ color: 'var(--text)' }}>{customer.name}</strong> geladen. Frag mich alles — Analyse, Health, Reels oder Strategie.</>
          : 'Dein intelligenter Business-Partner für Kunden, Social Media, Health Scores und Wachstumsstrategie.'
        }
      </p>
      {customer && (
        <span style={{ fontSize: 12, padding: '4px 14px', borderRadius: 'var(--r-pill)', background: 'var(--p5)', color: 'var(--p)', fontWeight: 600, border: '1px solid var(--border3)' }}>
          Kontext: {customer.name}
        </span>
      )}
    </div>
  )
}

// ── Context Panel ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS_CUSTOMER = [
  { label: 'Kunden vollständig analysieren',   prompt: 'Analysiere diesen Kunden vollständig. Welche Risiken, Chancen und konkreten nächsten Schritte siehst du?' },
  { label: 'Health Score erklären',            prompt: 'Erkläre den Health Score dieses Kunden. Warum ist er so? Was sind die 3 wichtigsten Schritte zur Verbesserung?' },
  { label: 'Reels & Content analysieren',      prompt: 'Analysiere die Instagram Reels und Social Media Performance. Gib mir bessere Hooks, Content-Empfehlungen und eine Posting-Strategie.' },
  { label: 'Follow-Up Strategie erstellen',    prompt: 'Erstelle eine konkrete Follow-Up-Strategie für diesen Kunden. Was sind die nächsten Schritte?' },
  { label: 'Umsatz-Insights & KPIs',           prompt: 'Analysiere die KPIs dieses Kunden und gib mir konkrete Empfehlungen zur Umsatzsteigerung.' },
  { label: 'Risiken & Chancen erkennen',       prompt: 'Welche konkreten Risiken und Chancen siehst du bei diesem Kunden? Was sollte ich sofort angehen?' },
]
const QUICK_ACTIONS_GENERAL = [
  { label: 'Business-Strategie Tipps',         prompt: 'Gib mir die wichtigsten Tipps für eine erfolgreiche Agentur- oder Business-Strategie.' },
  { label: 'Content-Strategie für Instagram',  prompt: 'Was sind aktuell die effektivsten Content-Strategien für Instagram Reels? Gib konkrete Tipps.' },
  { label: 'Wie funktioniert FOCUS AI?',       prompt: 'Erkläre mir, wie ich FOCUS AI am effektivsten nutzen kann und was du alles kannst.' },
]

function ContextPanel({ customer, todos, notes, kpis, health, igCache, onAction, streaming }) {
  return (
    <div style={{ width: 270, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg1)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 14px' }}>

        {/* Section: Kontext */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 10 }}>Kontext</div>

        {customer ? (
          <>
            {/* Customer card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 10 }}>
              <Avatar name={customer.name} id={customer.id} size={32} radius={9} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.name}</div>
                {customer.company && <div style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.company}</div>}
              </div>
            </div>

            {/* Health badge */}
            {health && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Health Score</span>
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: healthColor(health.score) }}>{health.score}</span>
              </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
              {[
                { label: 'Todos', val: todos.filter(t => !t.completed).length },
                { label: 'Notizen', val: notes.length },
                { label: 'KPIs', val: kpis.length },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', padding: '7px 4px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {igCache?.reels?.length > 0 && (
              <div style={{ padding: '7px 12px', borderRadius: 'var(--r-md)', background: 'rgba(124,58,237,0.05)', border: '1px solid var(--border3)', marginBottom: 14, fontSize: 12, color: 'var(--text2)' }}>
                <span style={{ color: 'var(--p)', fontWeight: 700 }}>{igCache.reels.length}</span> Instagram Reels geladen
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '12px', borderRadius: 'var(--r-md)', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              Wähle einen Kunden in der Sidebar, damit FOCUS AI Kundendaten laden kann.
            </div>
          </div>
        )}

        {/* Section: Schnellanalyse */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text4)', marginBottom: 8 }}>
          {customer ? 'Schnellanalyse' : 'Schnellstart'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(customer ? QUICK_ACTIONS_CUSTOMER : QUICK_ACTIONS_GENERAL).map((a, i) => (
            <button key={i} onClick={() => !streaming && onAction(a.prompt)} disabled={streaming}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 12, fontWeight: 500, cursor: streaming ? 'not-allowed' : 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s', opacity: streaming ? 0.5 : 1, lineHeight: 1.4 }}
              onMouseEnter={e => { if (!streaming) { e.currentTarget.style.background = 'var(--p5)'; e.currentTarget.style.color = 'var(--p)'; e.currentTarget.style.borderColor = 'var(--border3)' } }}
              onMouseLeave={e => { if (!streaming) { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
            >{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function FocusAI() {
  const focusAiApiKey    = useStore(s => s.focusAiApiKey)
  const setFocusAiApiKey = useStore(s => s.setFocusAiApiKey)
  const selectedId       = useStore(s => s.selectedId)
  const customers        = useStore(s => s.customers)
  const todos            = useStore(s => s.todos)
  const notes            = useStore(s => s.notes)
  const kpis             = useStore(s => s.kpis)
  const healthScores     = useStore(s => s.healthScores)
  const instagramCache   = useStore(s => s.instagramCache)

  const customer = customers.find(c => c.id === selectedId) ?? null
  const cTodos   = todos.filter(t => t.customerId === selectedId)
  const cNotes   = notes.filter(n => n.customerId === selectedId)
  const cKpis    = kpis.filter(k => k.customerId === selectedId)
  const health   = healthScores.find(h => h.customerId === selectedId) ?? null
  const igCache  = instagramCache.find(c => c.customerId === selectedId) ?? null

  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [streaming,  setStreaming]  = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error,      setError]      = useState(null)

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => { injectStyles() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const sendMessage = useCallback(async (text) => {
    const trimmed = text?.trim()
    if (!trimmed || streaming) return

    const userMsg    = { id: uid(), role: 'user', content: trimmed }
    const nextMsgs   = [...messages, userMsg]
    setMessages(nextMsgs)
    setInput('')
    if (textareaRef.current) { textareaRef.current.style.height = 'auto' }
    setStreaming(true)
    setStreamText('')
    setError(null)

    const contextStr    = customer ? buildCustomerContext(customer, { todos: cTodos, notes: cNotes, kpis: cKpis, health, igCache }) : null
    const systemContent = contextStr ? `${SYSTEM_PROMPT}\n\n---\n\nAktuelle Kundendaten:\n${contextStr}` : SYSTEM_PROMPT
    const apiMessages   = [
      { role: 'system', content: systemContent },
      ...nextMsgs.map(m => ({ role: m.role, content: m.content })),
    ]

    let full = ''
    await streamAICompletion({
      apiKey: focusAiApiKey,
      messages: apiMessages,
      onChunk: (chunk) => { full += chunk; setStreamText(full) },
      onDone:  () => {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: full }])
        setStreamText(''); setStreaming(false)
        setTimeout(() => inputRef.current?.focus(), 50)
      },
      onError: (msg) => { setError(msg); setStreaming(false); setStreamText('') },
    })
  }, [messages, streaming, customer, cTodos, cNotes, cKpis, health, igCache, focusAiApiKey])

  // In Tauri: key is in the binary, no setup needed.
  // In browser (dev only): ask for Groq key as fallback.
  if (!IS_TAURI && !focusAiApiKey) {
    return <ApiKeySetup onSave={key => setFocusAiApiKey(key)} />
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Chat Column ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--p5)', border: '1px solid var(--border3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="15" height="15" fill="none" stroke="var(--p)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>FOCUS AI</div>
              <div style={{ fontSize: 10, color: 'var(--text4)', letterSpacing: '0.04em' }}>
                {IS_TAURI ? 'llama-3.1-8b · Groq (Sicher)' : 'llama-3.1-8b · Groq (Dev)'}
              </div>
            </div>
            {customer && (
              <div style={{ marginLeft: 4, fontSize: 11, padding: '3px 10px', borderRadius: 'var(--r-pill)', background: 'var(--p5)', color: 'var(--p)', fontWeight: 600, border: '1px solid var(--border3)' }}>
                {customer.name}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setError(null) }}
                style={{ padding: '5px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text3)' }}
              >Chat leeren</button>
            )}
            <button onClick={() => setFocusAiApiKey('')}
              style={{ padding: '5px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text3)' }}
            >API Key ändern</button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 8px', display: 'flex', flexDirection: 'column' }}>
          {messages.length === 0 && !streaming
            ? <WelcomeScreen customer={customer} />
            : <>
                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} isLive={false} />)}
                {streaming && streamText  && <MessageBubble msg={{ id: 'live', role: 'assistant', content: streamText }} isLive={true} />}
                {streaming && !streamText && <TypingIndicator />}
              </>
          }

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>
              Fehler: {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{ padding: '10px 16px 14px', background: 'var(--bg1)', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderRadius: 14, border: '1px solid var(--border2)', background: 'var(--bg2)', padding: '8px 10px 8px 14px', transition: 'border-color 0.15s' }}
            onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.45)'}
            onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          >
            <textarea
              ref={el => { textareaRef.current = el; inputRef.current = el }}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
              }}
              placeholder={customer ? `Frag mich etwas über ${customer.name}…` : 'Frag FOCUS AI etwas…'}
              rows={1}
              disabled={streaming}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: 14, color: 'var(--text)', lineHeight: 1.65, overflowY: 'hidden', minHeight: 22, paddingTop: 1 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              style={{ width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0, cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed', background: input.trim() && !streaming ? 'var(--p)' : 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (input.trim() && !streaming) e.currentTarget.style.background = 'var(--p2)' }}
              onMouseLeave={e => { if (input.trim() && !streaming) e.currentTarget.style.background = 'var(--p)' }}
            >
              <svg width="15" height="15" fill="none" stroke={input.trim() && !streaming ? '#fff' : 'var(--text3)'} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m-7 7l7-7 7 7"/>
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 5, textAlign: 'center', letterSpacing: '0.02em' }}>
            Enter senden · Shift+Enter Zeilenumbruch
          </div>
        </div>
      </div>

      {/* ── Context Panel ───────────────────────────────────────── */}
      <ContextPanel
        customer={customer}
        todos={cTodos}
        notes={cNotes}
        kpis={cKpis}
        health={health}
        igCache={igCache}
        onAction={sendMessage}
        streaming={streaming}
      />
    </div>
  )
}
