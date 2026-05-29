import { MessageCircle } from 'lucide-react'

export function ChatRoute() {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <MessageCircle size={20} style={{ color: 'var(--fg-muted)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Chat</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>WhatsApp & Messenger-Integration. Kommt bald.</p>
    </div>
  )
}
