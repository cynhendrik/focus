import { useMemo } from 'react'
import { Mail, ExternalLink, Inbox } from 'lucide-react'
import { useMailStore } from '@/store/mail.store'
import { useUiStore } from '@/store/ui.store'

interface Props {
  customerId: string
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Gestern'
  if (diffDays < 7)  return d.toLocaleDateString('de-DE', { weekday: 'short' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: diffDays > 365 ? '2-digit' : undefined })
}

export function KommunikationPane({ customerId }: Props) {
  const emails      = useMailStore(s => s.emails)
  const selectEmail = useMailStore(s => s.selectEmail)
  const setAppView  = useUiStore(s => s.setAppView)

  const customerMails = useMemo(
    () => [...emails.filter(e => e.customerId === customerId)]
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [emails, customerId],
  )

  const unreadCount = customerMails.filter(e => !e.isRead).length

  const openMail = (e: typeof emails[0]) => {
    selectEmail(e)
    setAppView('mail')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      padding: '20px 24px 0',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mail size={15} style={{ color: 'var(--fg-dim)' }} />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Mails</span>
          {customerMails.length > 0 && (
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              padding: '2px 8px', borderRadius: 99,
            }}>
              {customerMails.length}
            </span>
          )}
          {unreadCount > 0 && (
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
              color: 'var(--accent-ink)', background: 'var(--accent)',
              padding: '2px 8px', borderRadius: 99,
            }}>
              {unreadCount} ungelesen
            </span>
          )}
        </div>
        <button
          onClick={() => setAppView('mail')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 12,
            fontFamily: 'inherit', transition: 'border-color 140ms, color 140ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <ExternalLink size={11} /> Mail öffnen
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 32 }}>
        {customerMails.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 12, height: '60%',
            color: 'var(--fg-dim)',
          }}>
            <Inbox size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13, textAlign: 'center' }}>
              Keine verknüpften Mails für diesen Kunden.
              <br />
              <span style={{ fontSize: 12, color: 'var(--fg-dim)', opacity: 0.7 }}>
                Mails werden automatisch verknüpft, wenn die Adresse übereinstimmt.
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {customerMails.map((mail, i) => (
              <button
                key={mail.id}
                onClick={() => openMail(mail)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '10px 1fr auto',
                  alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit', color: 'var(--fg)',
                  transition: 'background 120ms',
                  borderBottom: i < customerMails.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* Unread dot */}
                <span style={{
                  width: 7, height: 7, borderRadius: 99, flexShrink: 0,
                  background: mail.isRead ? 'transparent' : 'var(--accent)',
                  border: mail.isRead ? '1.5px solid var(--border-strong)' : 'none',
                  margin: '0 auto',
                }} />

                {/* Content */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 13, fontWeight: mail.isRead ? 500 : 700,
                      color: 'var(--fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '55%',
                    }}>
                      {mail.fromName || mail.fromAddr}
                    </span>
                    <span style={{
                      fontSize: 12.5, color: mail.isRead ? 'var(--fg-muted)' : 'var(--fg)',
                      fontWeight: mail.isRead ? 400 : 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {mail.subject || '(ohne Betreff)'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
                  }}>
                    {mail.fromAddr}
                  </span>
                </div>

                {/* Date */}
                <span style={{
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                  color: 'var(--fg-dim)', letterSpacing: '0.03em',
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  {fmtDate(mail.sentAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
