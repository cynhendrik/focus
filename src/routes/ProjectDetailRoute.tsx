import { useEffect, useMemo, useRef, useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useUiStore } from '@/store/ui.store'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useMembersStore } from '@/store/members.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { activityToTodo } from '@/data/todos.mapper'
import type { Activity } from '@/types/pipeline.types'
import type { Todo } from '@/types/todo.types'
import type { MemberProfile } from '@/types/profile.types'

function Stepper({ phases, currentPhaseId }: {
  phases: { id: string; name: string; orderIndex: number }[]
  currentPhaseId: string | null
}) {
  const currentIndex = phases.findIndex(p => p.id === currentPhaseId)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22,
      padding: '28px 34px 22px', marginBottom: 28,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phases.length || 1}, 1fr)`, position: 'relative' }}>
        {phases.map((phase, i) => {
          const state = currentIndex < 0 ? 'upcoming' : i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'upcoming'
          return (
            <div key={phase.id} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{
                width: state === 'now' ? 52 : 44, height: state === 'now' ? 52 : 44, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: state === 'now' ? 18 : 16, fontWeight: 700,
                border: state === 'upcoming' ? '2px solid var(--border-strong)' : 'none',
                background: state === 'done' ? 'var(--ok)' : state === 'now' ? 'var(--accent-gradient)' : 'var(--surface-2)',
                color: state === 'done' ? 'var(--bg)' : state === 'now' ? '#2a1208' : 'var(--fg-dim)',
                boxShadow: state === 'now' ? '0 0 0 6px var(--accent-soft)' : 'none',
              }}>
                {state === 'done' ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 14, fontWeight: 650, color: state === 'now' ? 'var(--accent-text)' : 'var(--fg)' }}>
                {phase.name}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewPhaseForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      <input
        className="mock-input" value={name} onChange={e => setName(e.target.value)}
        placeholder="Neue Phase, z.B. Review" style={{ fontSize: 13, flex: 1, maxWidth: 260 }}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onCreate(name.trim()); setName('') } }}
      />
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}
        disabled={!name.trim()}
        onClick={() => { if (name.trim()) { onCreate(name.trim()); setName('') } }}
      >
        + Phase
      </button>
    </div>
  )
}

function NewTaskForm({ members, onCreate }: {
  members: MemberProfile[]
  onCreate: (title: string, assigneeId: string | undefined) => void
}) {
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onCreate(title.trim(), assigneeId || undefined)
    setTitle('')
    setAssigneeId('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      <input
        className="mock-input" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Neue Aufgabe" style={{ fontSize: 13 }}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
      {members.length > 0 && (
        <select
          className="mock-input" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
          style={{ fontSize: 12 }}
        >
          <option value="">— Niemand —</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.displayName}</option>
          ))}
        </select>
      )}
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        disabled={!title.trim()}
        onClick={submit}
      >
        + Aufgabe
      </button>
    </div>
  )
}

export function ProjectDetailRoute() {
  const selectedProjectId = useUiStore(s => s.selectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const project = useProjectsStore(s => s.projects.find(p => p.id === selectedProjectId))
  const phases = useProjectsStore(s => s.phasesByProject[selectedProjectId ?? ''] ?? [])
  const loadPhases = useProjectsStore(s => s.loadPhases)
  const advancePhase = useProjectsStore(s => s.advancePhase)
  const setStatus = useProjectsStore(s => s.setStatus)
  const createPhase = useProjectsStore(s => s.createPhase)
  const customers = useCustomersStore(s => s.customers)
  const upsertTodo = useTodosStore(s => s.upsert)
  const setTodoAssignee = useTodosStore(s => s.setAssignee)
  const members = useMembersStore(s => s.members())
  const loadMembers = useMembersStore(s => s.load)
  const nameOf = useMembersStore(s => s.nameOf)
  const isShared = useWorkspaceStore(s => s.isActiveWorkspaceShared())
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const activeProjectIdRef = useRef<string | null>(null)

  const refreshActivities = (projectId: string) =>
    ActivitiesGateway.getByProject(projectId).then(fetched => {
      if (activeProjectIdRef.current === projectId) setActivities(fetched)
    })

  useEffect(() => {
    if (!selectedProjectId) return
    activeProjectIdRef.current = selectedProjectId
    loadPhases(selectedProjectId)
    setLoadingActivities(true)
    refreshActivities(selectedProjectId).finally(() => {
      if (activeProjectIdRef.current === selectedProjectId) setLoadingActivities(false)
    })
  }, [selectedProjectId, loadPhases])

  useEffect(() => {
    if (workspaceId && isShared) loadMembers(workspaceId)
  }, [workspaceId, isShared, loadMembers])

  const customerName = project ? (customers.find(c => c.id === project.accountId)?.name ?? 'Unbekannter Kunde') : ''

  const notes = useMemo(() => activities.filter(a => a.type === 'note'), [activities])
  const tasks = useMemo<Todo[]>(
    () => activities.filter(a => a.type === 'task').map(activityToTodo),
    [activities],
  )
  const tasksInCurrentPhase = useMemo(
    () => tasks.filter(t => (t.projectPhaseId ?? null) === (project?.currentPhaseId ?? null)),
    [tasks, project?.currentPhaseId],
  )
  const currentPhase = phases.find(p => p.id === project?.currentPhaseId)

  if (!project) {
    return (
      <div className="main-inner" style={{ padding: 28 }}>
        <button onClick={() => setAppView('projects')}>← Alle Projekte</button>
        <p style={{ color: 'var(--fg-dim)' }}>Projekt nicht gefunden.</p>
      </div>
    )
  }

  const handleCreateTask = async (title: string, assigneeId: string | undefined) => {
    const created = await upsertTodo({
      title,
      customerId: project.accountId,
      projectId: project.id,
      projectPhaseId: project.currentPhaseId ?? undefined,
    })
    if (assigneeId) await setTodoAssignee(created.id, assigneeId)
    await refreshActivities(project.id)
  }

  const isLastPhase = phases.length > 0 && phases[phases.length - 1]?.id === project.currentPhaseId
  const canPause = project.status !== 'completed'

  return (
    <div className="main-inner" style={{ padding: '24px 28px 40px', overflowY: 'auto', height: '100%' }}>
      <div style={{ marginBottom: 18 }}>
        <button
          onClick={() => setAppView('projects')}
          style={{ background: 'none', border: 'none', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          ← Alle Projekte
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 650, marginBottom: 4 }}>
            {customerName}
          </div>
          <h1 style={{ fontSize: 24, margin: 0, fontWeight: 650, letterSpacing: '-0.01em' }}>{project.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canPause && (
            <button
              className="btn-ghost"
              onClick={() => setStatus(project.id, project.status === 'paused' ? 'active' : 'paused')}
            >
              {project.status === 'paused' ? 'Fortsetzen' : 'Pausieren'}
            </button>
          )}
          {project.status !== 'completed' && phases.length > 0 && (
            <button className="btn-primary" onClick={() => advancePhase(project.id)}>
              {isLastPhase ? 'Projekt abschließen' : 'Phase abschließen'}
            </button>
          )}
        </div>
      </div>

      {phases.length === 0 ? (
        <NewPhaseForm onCreate={name => createPhase({ projectId: project.id, name })} />
      ) : (
        <>
          <Stepper phases={phases} currentPhaseId={project.currentPhaseId} />
          <NewPhaseForm onCreate={name => createPhase({ projectId: project.id, name })} />
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>🖼️ Moodboard</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Bild-Upload folgt in einer späteren Runde.</div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>📝 Notizen &amp; Konzeption</div>
          {loadingActivities ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch keine Notizen.</div>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>{n.body}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 8 }}>
            ✅ Aufgaben{currentPhase ? ` — ${currentPhase.name}` : ''}
          </div>
          {loadingActivities ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Lädt…</div>
          ) : tasksInCurrentPhase.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Keine Aufgaben in dieser Phase.</div>
          ) : (
            tasksInCurrentPhase.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: t.status === 'done' ? 'var(--fg-dim)' : 'var(--fg)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                  {t.title}
                  {t.assignee && (
                    <span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}> · {nameOf(t.assignee)}</span>
                  )}
                </span>
              </div>
            ))
          )}
          <NewTaskForm members={members} onCreate={handleCreateTask} />
        </div>
      </div>
    </div>
  )
}
