import { useEffect, useMemo, useState } from 'react'
import { Inbox as InboxIcon, UserPlus, AtSign, MessageCircle, CheckCircle2 } from 'lucide-react'
import { useNotificationsStore } from '@/store/notifications.store'
import { useAuthStore } from '@/store/auth.store'
import { useMembersStore } from '@/store/members.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'
import { openChat } from '@/lib/open-chat'
import { groupNotifications, type NotificationGroup } from '@/lib/chat/inbox-grouping'
import type { Notification, NotificationType } from '@/types/notification.types'

const TYPE_META: Record<NotificationType, { label: string; Icon: typeof InboxIcon }> = {
  assigned:  { label: 'Zugewiesen',      Icon: UserPlus },
  mention:   { label: 'Erwähnungen',     Icon: AtSign },
  comment:   { label: 'Kommentare',      Icon: MessageCircle },
  completed: { label: 'Abgeschlossen',   Icon: CheckCircle2 },
  dm:        { label: 'Nachrichten',     Icon: InboxIcon },
}

export function InboxRoute() {
  const notifications = useNotificationsStore(s => s.notifications)
  const load          = useNotificationsStore(s => s.load)
  const markRead      = useNotificationsStore(s => s.markRead)
  const myId          = useAuthStore(s => s.user?.id)
  const nameOf        = useMembersStore(s => s.nameOf)
  const openTask = useOpenTask()

  useEffect(() => { if (myId) void load(myId) }, [myId, load])

  const unread = useMemo(() => notifications.filter(n => !n.readAt), [notifications])
  const { byType, order } = useMemo(() => groupNotifications(unread), [unread])

  const jump = (n: Notification) => {
    void markRead(n.id)
    if (n.refType === 'task') { openTask(n.refId); return }
    // ref_type === 'message' → Chat-Kachel öffnen + zur Nachricht scrollen (DM oder Team).
    openChat({ messageId: n.messageId, conversationId: n.conversationId, peerId: n.actorId })
  }

  const totalUnread = unread.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Inbox</span>
        <span style={{ fontSize: 11.5, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>{totalUnread} ungelesen</span>
      </div>

      {totalUnread === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--fg-dim)', fontSize: 13.5, padding: 48 }}>
          Inbox Zero — nichts Offenes. 🎉
        </div>
      )}

      {order.map(type => {
        const groups = byType[type]
        if (groups.length === 0) return null
        const { label, Icon } = TYPE_META[type]
        return (
          <div key={type} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)', marginBottom: 6 }}>
              <Icon size={12} /> {label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groups.map(g => <GroupRow key={g.key} group={g} nameOf={nameOf} onJump={jump} onMarkRead={markRead} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GroupRow({ group, nameOf, onJump, onMarkRead }: {
  group: NotificationGroup
  nameOf: (id: string) => string
  onJump: (n: Notification) => void
  onMarkRead: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const head = group.items[0]
  const actors = [...new Set(group.items.map(i => nameOf(i.actorId)))].join(', ')

  if (group.items.length === 1) {
    return (
      <button onClick={() => onJump(head)} style={rowStyle}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{nameOf(head.actorId)}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{labelFor(head)}</span>
      </button>
    )
  }
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
      <button onClick={() => setExpanded(e => !e)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: 'inherit', padding: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{group.items.length} neue · {actors}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && group.items.map(n => (
        <button key={n.id} onClick={() => onJump(n)} style={{ ...rowStyle, marginTop: 6 }}>
          <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{nameOf(n.actorId)} · {labelFor(n)}</span>
        </button>
      ))}
      <button onClick={() => group.items.forEach(n => void onMarkRead(n.id))} style={{ alignSelf: 'flex-end', marginTop: 6, fontSize: 11, color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Alle als gelesen
      </button>
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit',
}

function labelFor(n: Notification): string {
  switch (n.type) {
    case 'assigned':  return 'hat dir eine Aufgabe zugewiesen'
    case 'mention':   return 'hat dich erwähnt'
    case 'comment':   return 'hat zu deiner Aufgabe kommentiert'
    case 'completed': return 'hat deine Aufgabe abgeschlossen'
    case 'dm':        return 'hat dir geschrieben'
  }
}
