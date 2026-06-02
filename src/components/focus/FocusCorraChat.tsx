import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getApiKey, MissingApiKeyError } from '@/lib/ai/briefing'
import type { Todo } from '@/types/todo.types'
import { Send, Sparkles, Loader, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  stack: Todo[]
  currentIndex: number
  onClose: () => void
}

interface AnthropicTextBlock { type: 'text'; text: string }
interface AnthropicResponse  { content: Array<AnthropicTextBlock | { type: string }> }

function buildFocusContext(stack: Todo[], currentIndex: number): string {
  const current = stack[currentIndex]
  const remaining = stack.length - currentIndex - 1
  const byType = stack.reduce<Record<string, number>>((acc, t) => {
    const key = t.actionType ?? 'task'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const lines = [
    `Der Nutzer ist im Fokus-Modus. ${stack.length} Aktionen heute, davon ${remaining} noch offen.`,
    '',
    'Aufschlüsselung:',
    ...Object.entries(byType).map(([k, v]) => `- ${k}: ${v}`),
    '',
  ]

  if (current) {
    lines.push(`Aktuelle Kachel: "${current.title}"`)
    if (current.notes) lines.push(`Kontext: ${current.notes}`)
    if (current.actionType) lines.push(`Typ: ${current.actionType}`)
  }

  return lines.join('\n')
}

const CORRA_CHAT_SYSTEM = `Du bist CORRA, ein persönlicher KI-Assistent in einer CRM-App für Berater und Agenturen.
Du bist im Fokus-Modus — der Nutzer arbeitet gerade seine Tagesaufgaben ab.

Deine Aufgabe:
- Beantworte Fragen zum aktuellen Fokus-Stack
- Hilf beim Formulieren von Mails, Mahnungen, Follow-Ups
- Gib kurze, direkte Einschätzungen — kein Berater-Speak
- Ton: locker-professionell, wie ein smarter Kollege

Antworte immer auf Deutsch. Sei knapp (max. 3-4 Sätze) außer du wirst explizit nach mehr gefragt.`

export function FocusCorraChat({ stack, currentIndex, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `Hey! Ich bin CORRA. Du hast heute ${stack.length} Aktionen — ich helfe dir dabei. Was brauchst du?`,
    },
  ])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const apiKey = getApiKey()
      if (!apiKey) throw new MissingApiKeyError()

      const focusCtx = buildFocusContext(stack, currentIndex)
      const history = [...messages, userMsg]

      const response = await invoke<AnthropicResponse>('cmd_anthropic_messages', {
        apiKey,
        body: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: [
            {
              type: 'text',
              text: `${CORRA_CHAT_SYSTEM}\n\n--- KONTEXT ---\n${focusCtx}`,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: history.map(m => ({ role: m.role, content: m.text })),
        },
      })

      const block = response.content.find((b): b is AnthropicTextBlock => b.type === 'text')
      const reply = block?.text.trim() ?? '(keine Antwort)'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (e) {
      const errMsg = e instanceof MissingApiKeyError
        ? 'Kein API-Key konfiguriert — bitte in den Einstellungen hinterlegen.'
        : 'Fehler beim Verbinden mit CORRA.'
      setMessages(prev => [...prev, { role: 'assistant', text: errMsg }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{
      width: 340, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--border)',
      height: '100%',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 99,
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px var(--accent)',
          }}>
            <Sparkles size={13} style={{ color: 'var(--accent-ink)' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', letterSpacing: '-0.01em' }}>CORRA</div>
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
              KI-ASSISTENT
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 99, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding: '0 16px',
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '86%',
              padding: '10px 13px',
              borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
              color: msg.role === 'user' ? 'var(--accent-ink)' : 'var(--fg)',
              fontSize: 13,
              lineHeight: 1.55,
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ padding: '0 16px', display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 14px', borderRadius: '12px 12px 12px 4px',
              background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--fg-dim)',
            }}>
              <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
              CORRA denkt…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Frag CORRA…"
          rows={1}
          style={{
            flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 12px',
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
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            width: 34, height: 34, borderRadius: 99, border: 'none', flexShrink: 0,
            background: input.trim() && !loading ? 'var(--accent)' : 'var(--surface-3)',
            color: input.trim() && !loading ? 'var(--accent-ink)' : 'var(--fg-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            transition: 'all 160ms',
          }}
        >
          <Send size={14} />
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
