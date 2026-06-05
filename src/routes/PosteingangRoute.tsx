import { useState } from 'react'
import { Mail, Calendar } from 'lucide-react'
import { MailRoute }     from './MailRoute'
import { CalendarRoute } from './CalendarRoute'
import { useMailStore }  from '@/store/mail.store'

type PosteingangTab = 'mails' | 'kalender'

export function PosteingangRoute() {
  const [tab, setTab] = useState<PosteingangTab>('mails')

  const unreadCount = useMailStore(s =>
    s.emails.filter(e => !e.isRead).length
  )

  const TABS: { id: PosteingangTab; label: string; icon: typeof Mail; badge?: number }[] = [
    { id: 'mails',    label: 'Mails',    icon: Mail,     badge: unreadCount || 0 },
    { id: 'kalender', label: 'Kalender', icon: Calendar },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab-Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 24px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        background: 'var(--bg)',
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          const count  = t.badge ?? 0
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                color: active ? 'var(--fg)' : 'var(--fg-dim)',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                transition: 'color 140ms',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  color: active ? 'var(--accent-ink)' : 'var(--fg-dim)',
                  padding: '1px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'mails'    && <MailRoute />}
        {tab === 'kalender' && <CalendarRoute />}
      </div>
    </div>
  )
}
