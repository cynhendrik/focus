import type { EmailHeader } from '@/types/mail.types'

interface DashboardEmailWidgetProps {
  emails: EmailHeader[]   // bereits gefiltert (ungelesen), max 8, desc sentAt
  isLoading: boolean
  hasAccount: boolean     // false → "Kein Mail-Konto verbunden"
  onEmailClick: (email: EmailHeader) => void
}

function getInitials(name: string, addr: string): string {
  const src = name.trim() || addr
  return src
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  if (min < 1)   return 'gerade eben'
  if (min < 60)  return `vor ${min} Min.`
  if (hrs < 24)  return `vor ${hrs} Std.`
  const d         = new Date(iso)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export function DashboardEmailWidget({
  emails,
  isLoading,
  hasAccount,
  onEmailClick,
}: DashboardEmailWidgetProps) {
  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Ungelesene E-Mails</h2>
        {emails.length > 0 && (
          <span className="chip" data-tone="bad">{emails.length} ungelesen</span>
        )}
      </div>

      {/* Lade-Zustand */}
      {isLoading && emails.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {/* Kein Konto */}
      {!isLoading && !hasAccount && (
        <p className="empty" style={{ padding: '24px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Kein Mail-Konto verbunden
        </p>
      )}

      {/* Alle gelesen */}
      {!isLoading && hasAccount && emails.length === 0 && (
        <p className="empty" style={{ padding: '24px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
          Keine ungelesenen E-Mails ✓
        </p>
      )}

      {/* E-Mail-Liste */}
      {emails.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {emails.map(email => (
            <div
              key={email.id}
              className="client-row"
              onClick={() => onEmailClick(email)}
            >
              <div className="avatar">
                {getInitials(email.fromName, email.fromAddr)}
              </div>
              <div>
                <div className="client-name" style={{ fontWeight: 600 }}>
                  {email.subject || '(Kein Betreff)'}
                </div>
                <div className="client-meta">
                  {email.fromName || email.fromAddr}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', whiteSpace: 'nowrap' }}>
                {formatRelativeTime(email.sentAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
