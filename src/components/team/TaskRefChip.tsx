import { useState, useEffect } from 'react'
import { CheckSquare, Bell, BellOff } from 'lucide-react'
import { useTodosStore } from '@/store/todos.store'
import { useOpenTask } from '@/lib/chat/useOpenTask'
import { useWorkspaceStore } from '@/store/workspace.store'
import { UserPrefsGateway } from '@/data/user-prefs.gateway'

/** Klickbarer Aufgaben-Chip. Verwaiste Referenz → inaktiv, Label „Aufgabe gelöscht".
 *  Für existierende Aufgaben: kleines Bell/BellOff-Toggle zum Stummschalten von
 *  Comment-Notifications für diesen Thread (muted_refs v1). */
export function TaskRefChip({ taskId }: { taskId: string }) {
  const todo = useTodosStore(s => s.allTodos.find(t => t.id === taskId))
  const openTask = useOpenTask()
  const gone = !todo
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const [muted, setMuted] = useState(false)
  const [muteLoading, setMuteLoading] = useState(false)

  useEffect(() => {
    if (!workspaceId || gone) return
    UserPrefsGateway.getMuted(workspaceId)
      .then(list => setMuted(list.includes(taskId)))
      .catch(() => {})
  }, [workspaceId, taskId, gone])

  async function handleToggleMute(e: React.MouseEvent) {
    e.stopPropagation()
    if (!workspaceId || muteLoading) return
    setMuteLoading(true)
    try {
      const next = await UserPrefsGateway.toggleMute(workspaceId, taskId)
      setMuted(next.includes(taskId))
    } catch {
      // ignore — mute is best-effort
    } finally {
      setMuteLoading(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => { if (!gone) openTask(taskId) }}
        disabled={gone}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
          padding: '5px 10px', borderRadius: 8,
          background: gone ? 'oklch(50% 0 0 / 0.06)' : 'var(--accent-soft)',
          color: gone ? 'var(--fg-dim)' : 'var(--accent-ink)',
          border: '1px solid var(--border)', fontSize: 12, fontWeight: 600,
          cursor: gone ? 'default' : 'pointer', maxWidth: '100%',
        }}
      >
        <CheckSquare size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {gone ? 'Aufgabe gelöscht' : todo!.title}
        </span>
        {todo?.dueDate && !gone && (
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', opacity: 0.8 }}>
            {new Date(todo.dueDate).toLocaleDateString('de', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </button>
      {!gone && workspaceId && (
        <button
          onClick={handleToggleMute}
          disabled={muteLoading}
          title={muted ? 'Thread wieder aktivieren' : 'Thread stummschalten'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 4, padding: 4, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: muted ? 'var(--accent-ink)' : 'var(--fg-dim)',
            cursor: muteLoading ? 'wait' : 'pointer',
            opacity: muteLoading ? 0.5 : 1,
          }}
        >
          {muted ? <BellOff size={12} /> : <Bell size={12} />}
        </button>
      )}
    </span>
  )
}
