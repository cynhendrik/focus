import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'

function fmtTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(messages) {
  const groups = {}
  ;[...messages].reverse().forEach(m => {
    const day = m.createdAt.slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(m)
  })
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

function dayLabel(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Heute'
  const yest = new Date(now); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'Gestern'
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
}

export function ClientChatView({ customerId }) {
  const customers        = useStore(s => s.customers)
  const chatMessages     = useStore(s => s.chatMessages)
  const addChatMessage   = useStore(s => s.addChatMessage)
  const markChatRead     = useStore(s => s.markChatRead)
  const deleteChatMessage = useStore(s => s.deleteChatMessage)

  const [text,       setText]       = useState('')
  const [simMode,    setSimMode]    = useState(false)
  const [senderName, setSenderName] = useState('')
  const bottomRef = useRef(null)

  const customer  = customers.find(c => c.id === customerId)
  const messages  = chatMessages.filter(m => m.customerId === customerId)
  const grouped   = groupByDate(messages)
  const unread    = messages.filter(m => m.sender === 'customer' && !m.read).length

  useEffect(() => {
    markChatRead(customerId)
  }, [customerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = (sender = 'me') => {
    if (!text.trim()) return
    addChatMessage(customerId, {
      text: text.trim(),
      sender,
      senderName: sender === 'customer' ? (senderName || customer?.name || 'Kunde') : 'Ich',
    })
    setText('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Chat · {customer?.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{messages.length} Nachrichten{unread > 0 ? ` · ${unread} ungelesen` : ''}</div>
        </div>
        <button
          onClick={() => setSimMode(s => !s)}
          style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: `1px solid ${simMode ? 'var(--border3)' : 'var(--border)'}`, background: simMode ? 'var(--p5)' : 'var(--bg2)', color: simMode ? 'var(--p)' : 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {simMode ? 'Antwort-Modus aktiv' : 'Kundenantwort simulieren'}
        </button>
      </div>

      {/* Simulation sender name */}
      {simMode && (
        <div style={{ padding: '8px 24px', background: 'var(--p5)', borderBottom: '1px solid var(--border3)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--p)', fontWeight: 600 }}>Absendername:</span>
          <input
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            placeholder={customer?.name || 'Kunde'}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border3)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', outline: 'none', maxWidth: 200 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Nächste Nachricht wird als Kunden-Nachricht gesendet</span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text4)', fontSize: 13 }}>
            Noch keine Nachrichten. Starte das Gespräch.
          </div>
        )}

        {grouped.map(([day, msgs]) => (
          <div key={day}>
            <div style={{ textAlign: 'center', margin: '16px 0 10px' }}>
              <span style={{ fontSize: 11, color: 'var(--text4)', background: 'var(--bg2)', padding: '3px 12px', borderRadius: 99 }}>{dayLabel(day)}</span>
            </div>
            {msgs.map(m => {
              const isMe = m.sender === 'me'
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                  <div style={{ maxWidth: '72%', position: 'relative' }}
                    onMouseEnter={e => e.currentTarget.querySelector('.del-btn')?.style && (e.currentTarget.querySelector('.del-btn').style.opacity = '1')}
                    onMouseLeave={e => e.currentTarget.querySelector('.del-btn')?.style && (e.currentTarget.querySelector('.del-btn').style.opacity = '0')}
                  >
                    {!isMe && (
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', marginBottom: 3, paddingLeft: 4 }}>
                        {m.senderName || customer?.name || 'Kunde'}
                      </div>
                    )}
                    <div style={{
                      padding: '9px 13px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: isMe ? 'var(--p)' : 'var(--bg1)',
                      border: isMe ? 'none' : '1px solid var(--border)',
                      color: isMe ? '#fff' : 'var(--text)',
                      fontSize: 13, lineHeight: 1.5,
                    }}>
                      {m.text}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 3, textAlign: isMe ? 'right' : 'left', paddingLeft: isMe ? 0 : 4, paddingRight: isMe ? 4 : 0 }}>
                      {fmtTime(m.createdAt)}
                    </div>
                    <button
                      className="del-btn"
                      onClick={() => deleteChatMessage(m.id)}
                      style={{ position: 'absolute', top: 0, [isMe ? 'left' : 'right']: -24, opacity: 0, transition: 'opacity 0.15s', width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text4)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >×</button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 24px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={simMode ? `Als ${senderName || customer?.name || 'Kunde'} schreiben…` : 'Nachricht schreiben…'}
            rows={2}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                simMode ? send('customer') : send('me')
              }
            }}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10,
              background: 'var(--bg2)', border: '1px solid var(--border2)',
              color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
              outline: 'none', resize: 'none', lineHeight: 1.5,
              borderColor: simMode ? 'var(--border3)' : 'var(--border2)',
            }}
            onFocus={e => e.target.style.borderColor = simMode ? 'var(--p)' : 'rgba(124,58,237,0.4)'}
            onBlur={e => e.target.style.borderColor = simMode ? 'var(--border3)' : 'var(--border2)'}
          />
          <button
            onClick={() => simMode ? send('customer') : send('me')}
            disabled={!text.trim()}
            style={{
              width: 42, height: 42, borderRadius: 10, border: 'none', flexShrink: 0,
              background: simMode ? 'rgba(124,58,237,0.15)' : 'var(--p)',
              color: simMode ? 'var(--p)' : '#fff',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
              opacity: text.trim() ? 1 : 0.4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 6 }}>Enter zum Senden · Shift+Enter für neue Zeile</div>
      </div>
    </div>
  )
}
