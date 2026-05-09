import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useKpisStore } from '@/store/kpis.store'

interface Props {
  customerId: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function buildSystemPrompt(customerName: string, todos: string[], kpis: string[]): string {
  return [
    `Du bist ein Geschäftsassistent für den Kunden "${customerName}".`,
    todos.length ? `Offene Todos: ${todos.join(', ')}.` : '',
    kpis.length ? `KPIs: ${kpis.join(', ')}.` : '',
    'Antworte auf Deutsch, präzise und hilfreich.',
  ].filter(Boolean).join(' ')
}

export function FocusAiPane({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const todos = useTodosStore(s => s.todos)
  const kpis = useKpisStore(s => s.kpis)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setError('')

    const openTodos = todos.filter(t => t.status !== 'done').map(t => t.title)
    const kpiSummary = kpis.map(k => `${k.label}: ${k.value ?? '?'}${k.unit ?? ''}`).slice(0, 5)
    const systemMsg: Message = {
      role: 'assistant',
      content: buildSystemPrompt(customer?.name ?? customerId, openTodos, kpiSummary),
    }

    const userMsg: Message = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)

    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages(m => [...m, assistantMsg])
    setStreaming(true)

    const unlisten = await listen<string>('ai-chunk', e => {
      setMessages(m => {
        const last = m[m.length - 1]
        return [...m.slice(0, -1), { ...last, content: last.content + e.payload }]
      })
    })

    const unlistenDone = await listen('ai-done', () => {
      setStreaming(false)
      unlisten()
      unlistenDone()
    })

    try {
      await invoke('focus_ai_chat', { messages: [systemMsg, ...history] })
    } catch (e) {
      setError(String(e))
      setStreaming(false)
      unlisten()
      unlistenDone()
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-8">
            Frag mich etwas über {customer?.name ?? 'diesen Kunden'}…
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap
              ${msg.role === 'user'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-[var(--bg1)] text-[var(--text)] rounded-bl-sm'
              }`}
            >
              {msg.content || (streaming && msg.role === 'assistant' ? '…' : '')}
            </div>
          </div>
        ))}
        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Frage stellen…"
          disabled={streaming}
          className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {streaming ? '…' : 'Senden'}
        </button>
      </div>
    </div>
  )
}
