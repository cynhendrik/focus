import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/store/chat.store'
import type { ChatSender } from '@/types/chat.types'

interface Props {
  customerId: string
}

export function KommunikationPane({ customerId }: Props) {
  const { messages, loadForCustomer, add, remove } = useChatStore()
  const [text, setText] = useState('')
  const [sender, setSender] = useState<ChatSender>('user')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const content = text.trim()
    if (!content) return
    await add({ customerId, content, sender })
    setText('')
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pb-4" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-8">Noch keine Nachrichten</p>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-2 group ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm relative
                ${msg.sender === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-[var(--bg1)] text-[var(--text)] rounded-bl-sm'
                }`}
            >
              {msg.content}
              <span className={`text-[10px] mt-1 block ${msg.sender === 'user' ? 'text-white/60' : 'text-[var(--text2)]'}`}>
                {new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <button
              onClick={() => remove(msg.id)}
              className="opacity-0 group-hover:opacity-100 self-center text-[var(--text2)] hover:text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
        <select
          value={sender}
          onChange={e => setSender(e.target.value as ChatSender)}
          className="text-xs px-2 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none"
        >
          <option value="user">Ich</option>
          <option value="customer">Kunde</option>
        </select>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Nachricht…"
          className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={send}
          className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
        >
          Senden
        </button>
      </div>
    </div>
  )
}
