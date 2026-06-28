import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useUiStore } from '@/store/ui.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'
import { openChat } from '@/lib/open-chat'
import { loudUnreadCount } from '@/lib/chat/inbox-grouping'
import type { Notification } from '@/types/notification.types'

const LABEL: Record<Notification['type'], string> = {
  assigned:  'hat dir eine Aufgabe zugewiesen',
  mention:   'hat dich erwähnt',
  comment:   'hat zu deiner Aufgabe kommentiert',
  completed: 'hat deine Aufgabe abgeschlossen',
  dm:        'hat dir geschrieben',
}

/** Glocke = Vorschau der Inbox: Top-12 ungelesen + „Alle ansehen →". */
export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const notifications = useNotificationsStore(s => s.notifications)
  const load          = useNotificationsStore(s => s.load)
  const markRead      = useNotificationsStore(s => s.markRead)
  const myId          = useAuthStore(s => s.user?.id)
  const nameOf        = useMembersStore(s => s.nameOf)
  const setAppView = useUiStore(s => s.setAppView)
  const openTask = useOpenTask()

  useEffect(() => { if (myId) void load(myId) }, [myId, load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const unread = useMemo(() => notifications.filter(n => !n.readAt), [notifications])
  const preview = unread.slice(0, 12)
  const loud = loudUnreadCount(notifications)

  const jump = (n: Notification) => {
    void markRead(n.id)
    setOpen(false)
    if (n.refType === 'task') { openTask(n.refId); return }
    openChat(n.messageId ?? null)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        title={loud > 0 ? `Benachrichtigungen (${loud})` : 'Benachrichtigungen'}
        onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', color: (open || loud > 0) ? 'var(--accent)' : undefined }}
      >
        <Bell size={16} />
        {loud > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, padding: '0 3px',
            borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{loud}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 460,
          overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-2)', zIndex: 200, padding: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 8px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Benachrichtigungen</span>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)' }}>{unread.length} ungelesen</span>
          </div>

          {preview.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12.5 }}>
              Alles gelesen. 🎉
            </div>
          ) : (
            <>
              {preview.map(n => (
                <button
                  key={n.id}
                  onClick={() => jump(n)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 1, width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8,
                    color: 'var(--fg)', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{nameOf(n.actorId)}</span>
                  <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{LABEL[n.type]}</span>
                </button>
              ))}
              <button
                onClick={() => { setAppView('inbox'); setOpen(false) }}
                style={{ width: '100%', textAlign: 'center', padding: '8px', marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Alle ansehen →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
