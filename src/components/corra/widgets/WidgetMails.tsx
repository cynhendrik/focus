import { useMailStore } from '@/store/mail.store'
import { useAccountsStore } from '@/store/accounts.store'

export function WidgetMails() {
  const emails   = useMailStore(s => s.emails)
  const accounts = useAccountsStore(s => s.accounts)

  const unread = emails
    .filter(e => !e.isRead && e.customerId != null)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 4)

  const accountName = (id: string | undefined) =>
    id ? (accounts.find(a => a.id === id)?.name ?? null) : null

  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  }

  return (
    <div style={{ minWidth: 300, maxWidth: 380, position: 'relative' }}>
      <div style={{
        position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 140,
        background: 'radial-gradient(ellipse, rgba(59,109,244,0.07) 0%, transparent 70%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />

      <div style={{ fontSize: 9, color: 'rgba(59,109,244,0.5)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', marginBottom: 12 }}>
        UNGELESENE MAILS
      </div>

      <div style={{
        fontSize: 48, fontWeight: 900, color: 'var(--accent)',
        letterSpacing: '-0.04em', lineHeight: 1,
        textShadow: '0 0 40px rgba(59,109,244,0.25)', marginBottom: 20,
      }}>
        {unread.length} neu
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {unread.map((mail, i) => (
          <div key={mail.id}>
            {i > 0 && <div style={{ height: 1, background: 'rgba(59,109,244,0.08)', marginBottom: 12 }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)', boxShadow: '0 0 6px rgba(59,109,244,0.6)',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd', flex: 1 }}>
                {accountName(mail.customerId ?? undefined) ?? mail.fromName ?? mail.fromAddr}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(59,109,244,0.35)', fontFamily: 'var(--font-mono)' }}>
                {fmtTime(mail.sentAt)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(59,109,244,0.4)', paddingLeft: 14, marginTop: 2 }}>
              {mail.subject || '(ohne Betreff)'}
            </div>
          </div>
        ))}
        {unread.length === 0 && (
          <span style={{ fontSize: 13, color: 'rgba(59,109,244,0.4)' }}>Keine ungelesenen Mails ✓</span>
        )}
      </div>
    </div>
  )
}
