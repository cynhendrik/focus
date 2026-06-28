import { Hash } from 'lucide-react'
import { useChatOverlayStore } from '@/store/chat-overlay.store'
import { useMembersStore } from '@/store/members.store'
import { useAuthStore } from '@/store/auth.store'

/**
 * Linke Spalte der Chat-Kachel: oben der gemeinsame „Team"-Kanal (aktiv),
 * darunter die Mitglieder. Mitglieder sind in dieser Spec inaktiv („bald") —
 * Direktnachrichten kommen in Spec 2.
 */
export function ChatSidebar() {
  const selected = useChatOverlayStore(s => s.selected)
  const select   = useChatOverlayStore(s => s.select)
  const members  = useMembersStore(s => s.members())
  const myId     = useAuthStore(s => s.user?.id)

  const teamActive = selected === 'team'

  return (
    <div style={{
      width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--surface-2)',
    }}>
      <button
        onClick={() => select('team')}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
          background: teamActive ? 'var(--surface)' : 'transparent',
          color: teamActive ? 'var(--fg)' : 'var(--fg-muted)',
          fontSize: 13.5, fontWeight: teamActive ? 700 : 600,
          borderLeft: `2px solid ${teamActive ? 'var(--accent)' : 'transparent'}`,
        }}
      >
        <Hash size={15} /> Team
      </button>

      <div style={{
        padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-dim)',
      }}>
        Mitglieder
      </div>

      {members.map(m => (
        <div
          key={m.id}
          aria-disabled
          title="Direktnachrichten kommen bald"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '8px 12px', cursor: 'default', color: 'var(--fg-dim)', fontSize: 13,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.displayName}{m.id === myId ? ' (du)' : ''}
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--fg-dim)', opacity: 0.7,
          }}>
            bald
          </span>
        </div>
      ))}
    </div>
  )
}
