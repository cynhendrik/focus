import { Hash } from 'lucide-react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMessagesStore } from '@/store/messages.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'

function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span style={{
      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--accent)',
      color: 'var(--accent-ink)', fontSize: 10.5, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{n > 99 ? '99+' : n}</span>
  )
}

export function ChatSidebar() {
  const selected = useChatOverlayStore(s => s.selected)
  const select   = useChatOverlayStore(s => s.select)
  const members  = useMembersStore(s => s.members())
  const myId     = useAuthStore(s => s.user?.id)
  const conversations = useMessagesStore(s => s.conversations)
  const unreadTeam    = useMessagesStore(s => s.unreadTeam)
  const getOrCreateDm = useMessagesStore(s => s.getOrCreateDm)
  const workspaceId   = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const teamActive = selected === 'team'

  const openDm = async (peerId: string) => {
    if (!workspaceId) return
    const conversationId = await getOrCreateDm(workspaceId, peerId)
    select({ conversationId, peerId })
  }

  const unreadFor = (peerId: string) =>
    conversations.find(c => c.peerId === peerId)?.unreadCount ?? 0

  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--surface-2)' }}>
      <button
        onClick={() => select('team')}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: 'none', cursor: 'pointer',
          textAlign: 'left', width: '100%', background: teamActive ? 'var(--surface)' : 'transparent',
          color: teamActive ? 'var(--fg)' : 'var(--fg-muted)', fontSize: 13.5, fontWeight: teamActive ? 700 : 600,
          borderLeft: `2px solid ${teamActive ? 'var(--accent)' : 'transparent'}`,
        }}
      >
        <Hash size={15} /> <span style={{ flex: 1 }}>Team</span> <Badge n={unreadTeam} />
      </button>

      <div style={{ padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
        Mitglieder
      </div>

      {members.filter(m => m.id !== myId).map(m => {
        const active = typeof selected === 'object' && selected.peerId === m.id
        return (
          <button
            key={m.id}
            onClick={() => void openDm(m.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', cursor: 'pointer',
              textAlign: 'left', width: '100%', background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--fg)' : 'var(--fg-muted)', fontSize: 13, fontWeight: active ? 700 : 500,
              borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayName}</span>
            <Badge n={unreadFor(m.id)} />
          </button>
        )
      })}
    </div>
  )
}
