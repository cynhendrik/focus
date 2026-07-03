import { useMemo } from 'react'
import { usePreparedItemsStore } from '@/store/prepared-items.store'
import { useAuthStore } from '@/store/auth.store'
import { visiblePreparedItems, sortVisible } from '@/lib/stapel/visible'
import { TYPE_LABEL } from './StapelCard'

const QUEUE_CAP = 7

/** Rechte Rail: wartende Karten — klickbar, holt die Karte in den Fokus. */
export function StapelQueue() {
  const myId = useAuthStore(s => s.user?.id)
  const items = usePreparedItemsStore(s => s.items)
  const focusId = usePreparedItemsStore(s => s.focusId)

  const { queued, overflow } = useMemo(() => {
    const now = new Date().toISOString()
    const visible = sortVisible(visiblePreparedItems(items, myId, now))
    const focusItemId = (focusId != null && visible.some(i => i.id === focusId))
      ? focusId
      : visible[0]?.id
    const queuedAll = visible.filter(i => i.id !== focusItemId)
    const overflow = Math.max(0, queuedAll.length - QUEUE_CAP)
    return { queued: queuedAll.slice(0, QUEUE_CAP), overflow }
  }, [items, myId, focusId])

  if (queued.length === 0) return null

  return (
    <div className="hd-fill">
      <div className="hd-lhead">
        <span className="t">WAS NOCH KOMMT</span>
        <span className="c">{queued.length + overflow}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: '1 1 0' }}>
        {queued.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => usePreparedItemsStore.getState().setFocusId(item.id)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              width: '100%', textAlign: 'left',
              background: 'none', border: 'none', borderTop: '1px solid var(--border)',
              padding: '10px 20px', cursor: 'pointer',
              transition: 'background 100ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase',
            }}>
              {TYPE_LABEL[item.type]}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--fg)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.payload.title}
            </span>
            <span style={{
              fontSize: 11, color: 'var(--fg-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.payload.why}
            </span>
          </button>
        ))}
        {overflow > 0 && (
          <div style={{
            padding: '8px 20px', fontSize: 12, color: 'var(--fg-dim)',
            borderTop: '1px solid var(--border)',
          }}>
            + {overflow} weitere
          </div>
        )}
      </div>
    </div>
  )
}
