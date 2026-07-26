import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
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
import { useMentionPopoverState, extractMentionQuery } from '@/components/tasks/MentionPopover'
import { buildTaskMentionCandidates, markerForTask } from '@/components/tasks/task-mentions'
import type { TaskMentionCandidate } from '@/components/tasks/task-mentions'
import { TaskMentionPopover, filterTaskCandidates } from '@/components/tasks/TaskMentionPopover'
import { insertMentionMarker, stripResolvedMentions, getInputCaretAnchor } from '@/components/tasks/plain-input-mention'
import type { ResolvedInputMention } from '@/components/tasks/plain-input-mention'
import { Target, Milestone } from 'lucide-react'
import { TabBar } from '@/components/shared/TabBar'
import { ProjectCockpit } from '@/components/projects/ProjectCockpit'
import { formatDateDe } from '@/lib/projects/signals'

function Stepper({ phases, currentPhaseId, onDeletePhase, onUpdateProgress }: {
  phases: { id: string; name: string; orderIndex: number; progressPercent: number }[]
  currentPhaseId: string | null
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const currentIndex = phases.findIndex(p => p.id === currentPhaseId)

  const handleConfirmDelete = async (phaseId: string) => {
    setDeletingId(phaseId)
    try {
      await onDeletePhase(phaseId)
      setConfirmId(null)
    } catch {
      // Fehler wird bereits vom Elternteil (phaseError) angezeigt -- hier nur
      // verhindern, dass confirmId geloescht wird, und keine unhandled rejection.
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22,
      padding: '28px 34px 22px', marginBottom: 28,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phases.length || 1}, 1fr)`, position: 'relative' }}>
        {phases.map((phase, i) => {
          const state = currentIndex < 0 ? 'upcoming' : i < currentIndex ? 'done' : i === currentIndex ? 'now' : 'upcoming'
          const isCurrent = phase.id === currentPhaseId
          return (
            <div key={phase.id} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
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
              {state === 'now' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="range" min={0} max={100} value={phase.progressPercent}
                    onChange={e => onUpdateProgress(phase.id, Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                  <span style={{ fontSize: 10.5, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
                    {phase.progressPercent}%
                  </span>
                </div>
              )}
              {!isCurrent && (
                confirmId === phase.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleConfirmDelete(phase.id)}
                      disabled={deletingId === phase.id}
                      style={{ fontSize: 10.5, color: 'oklch(72% 0.18 25)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 650 }}
                    >
                      {deletingId === phase.id ? 'Löscht…' : 'Wirklich löschen'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={deletingId === phase.id}
                      style={{ fontSize: 10.5, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(phase.id)} title="Phase löschen"
                    style={{ display: 'flex', alignItems: 'center', color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Trash2 size={11} />
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewPhaseForm({ onCreate }: {
  onCreate: (name: string, startDate: string, endDate: string, gateName: string) => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [gateName, setGateName] = useState('Freigabe')

  const canCreate = name.trim() !== '' && startDate !== '' && endDate !== '' && gateName.trim() !== ''

  const submit = () => {
    if (!canCreate) return
    onCreate(name.trim(), startDate, endDate, gateName.trim())
    setName(''); setStartDate(''); setEndDate(''); setGateName('Freigabe')
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Name</label>
        <input
          className="mock-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="z.B. Review" style={{ fontSize: 13, width: 180 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Start</label>
        <input
          className="mock-input" type="date" value={startDate}
          onChange={e => setStartDate(e.target.value)} style={{ fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Ende</label>
        <input
          className="mock-input" type="date" value={endDate}
          onChange={e => setEndDate(e.target.value)} style={{ fontSize: 13 }}
        />
      </div>
      <div>
        <label style={{ fontSize: 10.5, color: 'var(--fg-dim)', display: 'block', marginBottom: 3 }}>Gate-Name</label>
        <input
          className="mock-input" value={gateName} onChange={e => setGateName(e.target.value)}
          placeholder="Freigabe" style={{ fontSize: 13, width: 140 }}
        />
      </div>
      <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={!canCreate} onClick={submit}>
        + Phase
      </button>
    </div>
  )
}

function NewTaskForm({ members, onCreate }: {
  members: MemberProfile[]
  onCreate: (title: string, assigneeId: string | undefined) => void
}) {
  const [text, setText] = useState('')
  const [resolvedMentions, setResolvedMentions] = useState<ResolvedInputMention[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { ctx, setCtx, activeIdx, setActiveIdx, close } = useMentionPopoverState()

  const candidates = useMemo(() => buildTaskMentionCandidates(members, []), [members])
  const filtered = useMemo(() => filterTaskCandidates(candidates, ctx.query), [candidates, ctx.query])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setText(value)
    const cursor = e.target.selectionStart ?? value.length
    const found = extractMentionQuery(value.slice(0, cursor))
    if (found) {
      setCtx({ open: true, query: found.query, startOffset: found.startOffset, anchor: getInputCaretAnchor(e.target) })
    } else {
      close()
    }
  }

  const pick = (cand: TaskMentionCandidate) => {
    if (!ctx.open || !inputRef.current) return
    const marker = markerForTask(cand)
    const cursor = inputRef.current.selectionStart ?? text.length
    const { value, cursor: newCursor } = insertMentionMarker(text, ctx.startOffset, cursor, marker)
    setText(value)
    setResolvedMentions(prev => [
      ...prev.filter(m => m.marker.toLowerCase() !== marker.toLowerCase()),
      { marker, id: cand.id },
    ])
    close()
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(newCursor, newCursor))
  }

  const submit = () => {
    close()
    const { cleanTitle, assigneeId } = stripResolvedMentions(text, resolvedMentions)
    if (!cleanTitle.trim()) return
    onCreate(cleanTitle.trim(), assigneeId)
    setText('')
    setResolvedMentions([])
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      <input
        ref={inputRef} className="mock-input" value={text} onChange={handleChange}
        placeholder="Neue Aufgabe, @Name zum Zuweisen" style={{ fontSize: 13 }}
        onKeyDown={e => {
          if (ctx.open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(Math.min(activeIdx + 1, filtered.length - 1)); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(Math.max(activeIdx - 1, 0)); return }
            if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx]); return }
            if (e.key === 'Escape') { close(); return }
          }
          if (e.key === 'Enter') submit()
        }}
      />
      <TaskMentionPopover
        open={ctx.open} query={ctx.query} candidates={candidates} anchor={ctx.anchor}
        activeIdx={activeIdx} setActiveIdx={setActiveIdx} onSelect={pick} onClose={close}
      />
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        disabled={!text.trim()}
        onClick={submit}
      >
        + Aufgabe
      </button>
    </div>
  )
}

function NewNoteForm({ onCreate }: { onCreate: (body: string) => void }) {
  const [body, setBody] = useState('')

  const submit = () => {
    if (!body.trim()) return
    onCreate(body.trim())
    setBody('')
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
    }}>
      <textarea
        className="mock-input" value={body} onChange={e => setBody(e.target.value)}
        placeholder="Neue Notiz" rows={2} style={{ fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <button
        className="btn-primary" style={{ fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        disabled={!body.trim()}
        onClick={submit}
      >
        + Notiz
      </button>
    </div>
  )
}

export function ProjectDetailRoute() {
  const selectedProjectId = useUiStore(s => s.selectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const activeTab = useUiStore(s => s.activeProjectTab)
  const setActiveTab = useUiStore(s => s.setActiveProjectTab)
  const project = useProjectsStore(s => s.projects.find(p => p.id === selectedProjectId))
  const phases = useProjectsStore(s => s.phasesByProject[selectedProjectId ?? ''] ?? [])
  const loadPhases = useProjectsStore(s => s.loadPhases)
  const advancePhase = useProjectsStore(s => s.advancePhase)
  const setStatus = useProjectsStore(s => s.setStatus)
  const createPhase = useProjectsStore(s => s.createPhase)
  const deletePhase = useProjectsStore(s => s.deletePhase)
  const updatePhaseProgress = useProjectsStore(s => s.updatePhaseProgress)
  const createActivity = useActivitiesStore(s => s.create)
  const userEmail = useAuthStore(s => s.user?.email ?? 'user')
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
  const [phaseError, setPhaseError] = useState<string | null>(null)
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
  const today = useMemo(() => new Date(), [])

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

  const handleDeletePhase = async (phaseId: string) => {
    setPhaseError(null)
    try {
      await deletePhase(phaseId, project.id)
    } catch (err) {
      setPhaseError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  const handleCreateNote = async (body: string) => {
    await createActivity({
      workspaceId, createdBy: userEmail, accountId: project.accountId,
      customerId: project.accountId, projectId: project.id, type: 'note', body,
    })
    await refreshActivities(project.id)
  }

  const isLastPhase = phases.length > 0 && phases[phases.length - 1]?.id === project.currentPhaseId
  const canPause = project.status !== 'completed'

  const pendingGateCount = phases.filter(p => p.gateState === 'pending').length
  const tabs = [
    { id: 'cockpit', label: 'Cockpit', icon: Target },
    { id: 'phasen', label: 'Phasen', icon: Milestone, count: pendingGateCount > 0 ? pendingGateCount : undefined },
  ]

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
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 6 }}>
            Retainer {project.retainerMonthly.toLocaleString('de-DE')} € / Monat · {project.retainerHours} Std. inkl. · seit {formatDateDe(project.createdAt.slice(0, 10))}
          </div>
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

      <TabBar tabs={tabs} activeId={activeTab} onChange={id => setActiveTab(id as 'cockpit' | 'phasen')} />

      <div style={{ paddingTop: 24 }}>
        {activeTab === 'cockpit' && (
          <ProjectCockpit
            phases={phases} currentPhaseId={project.currentPhaseId} today={today}
            onGoToPhases={() => setActiveTab('phasen')}
          />
        )}

        {activeTab === 'phasen' && (
          <>
            {phaseError && (
              <div style={{ fontSize: 12, color: 'oklch(72% 0.18 25)', marginBottom: 12 }}>
                Phase konnte nicht gelöscht werden: {phaseError}
              </div>
            )}

            {phases.length === 0 ? (
              <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
                createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
            ) : (
              <>
                <Stepper
                  phases={phases} currentPhaseId={project.currentPhaseId} onDeletePhase={handleDeletePhase}
                  onUpdateProgress={(phaseId, progressPercent) => updatePhaseProgress(phaseId, project.id, progressPercent)}
                />
                <NewPhaseForm onCreate={(name, startDate, endDate, gateName) =>
                  createPhase({ projectId: project.id, name, startDate, endDate, gateName })} />
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
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
                <NewNoteForm onCreate={handleCreateNote} />
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
          </>
        )}
      </div>
    </div>
  )
}
