import { useEffect, useMemo, useRef, useState } from 'react'
import { useActivitiesStore } from '@/store/activities.store'
import { useAuthStore } from '@/store/auth.store'
import { useProjectsStore } from '@/store/projects.store'
import { useUiStore } from '@/store/ui.store'
import { useCustomersStore } from '@/store/customers.store'
import { useTodosStore } from '@/store/todos.store'
import { useMembersStore } from '@/store/members.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useCompanyStore } from '@/store/company.store'
import { useAccountsStore } from '@/store/accounts.store'
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
import { Target, Milestone, Image as ImageIcon, FileText } from 'lucide-react'
import { TabBar } from '@/components/shared/TabBar'
import { ProjectCockpit } from '@/components/projects/ProjectCockpit'
import { formatDateDe } from '@/lib/projects/signals'
import { ProjectPhasesList } from '@/components/projects/ProjectPhasesList'
import { ProjectMoodboard } from '@/components/projects/ProjectMoodboard'
import { ProjectInvoices } from '@/components/projects/ProjectInvoices'
import { InvoiceForm } from '@/components/finance/InvoiceForm'
import { PaymentModal } from '@/components/finance/PaymentModal'
import { ProjectsGateway } from '@/data/projects.gateway'
import { FinanceGateway } from '@/data/finance.gateway'
import { FinanceService } from '@/services/finance.service'
import { useFinanceStore } from '@/store/finance.store'
import { useToastStore } from '@/store/toast.store'
import type { Invoice } from '@/types/finance.types'

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
  const requestGate = useProjectsStore(s => s.requestGate)
  const approveGate = useProjectsStore(s => s.approveGate)
  const updateDeliverables = useProjectsStore(s => s.updateDeliverables)
  const updateAssignees = useProjectsStore(s => s.updateAssignees)
  const updateMoodboardItems = useProjectsStore(s => s.updateMoodboardItems)
  const uploadMoodboardImage = useProjectsStore(s => s.uploadMoodboardImage)
  const showToast = useToastStore(s => s.show)
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
  const setInvoiceProject = useFinanceStore(s => s.setInvoiceProject)
  const payments = useFinanceStore(s => s.payments)
  const profile = useCompanyStore(s => s.profile)
  const account = useAccountsStore(s => s.accounts.find(a => a.id === project?.accountId))
  const toast = useToastStore(s => s.show)

  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [phaseError, setPhaseError] = useState<string | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const [projectInvoices, setProjectInvoices] = useState<Invoice[]>([])
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)

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

  useEffect(() => {
    if (!project) return
    FinanceGateway.getInvoicesByProject(project.id).then(setProjectInvoices)
  }, [project])

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

  const downloadInvoice = async (inv: Invoice) => {
    if (!profile || !account) { toast({ message: 'Firmenprofil oder Kunde fehlt für das PDF.', variant: 'error' }); return }
    setPdfBusy(inv.id)
    try {
      const full = await FinanceService.getInvoice(inv.id)
      const { downloadInvoicePDF } = await import('@/components/finance/InvoicePDF')
      await downloadInvoicePDF(full, profile, account)
    } catch (e) {
      toast({ message: `PDF fehlgeschlagen: ${String(e)}`, variant: 'error' })
    } finally { setPdfBusy(null) }
  }

  const isLastPhase = phases.length > 0 && phases[phases.length - 1]?.id === project.currentPhaseId
  const canPause = project.status !== 'completed'

  const pendingGateCount = phases.filter(p => p.gateState === 'pending').length
  const tabs = [
    { id: 'cockpit', label: 'Cockpit', icon: Target },
    { id: 'phasen', label: 'Phasen', icon: Milestone, count: pendingGateCount > 0 ? pendingGateCount : undefined },
    { id: 'moodboard', label: 'Moodboard', icon: ImageIcon },
    { id: 'rechnungen', label: 'Rechnungen', icon: FileText },
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

      <TabBar tabs={tabs} activeId={activeTab} onChange={id => setActiveTab(id as 'cockpit' | 'phasen' | 'moodboard' | 'rechnungen')} />

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
                <ProjectPhasesList
                  phases={phases} currentPhaseId={project.currentPhaseId}
                  onDeletePhase={handleDeletePhase}
                  onUpdateProgress={(phaseId, progressPercent) => updatePhaseProgress(phaseId, project.id, progressPercent)}
                  onRequestGate={(phaseId, gateDate) => requestGate(phaseId, project.id, gateDate)}
                  onApproveGate={(phaseId, approvedBy) => approveGate(phaseId, project.id, approvedBy)}
                  onUpdateDeliverables={(phaseId, deliverables) => updateDeliverables(phaseId, project.id, deliverables)}
                  onRemind={() => showToast({ message: 'Erinnerung vorbereitet (Mail-Versand folgt in einer späteren Runde)' })}
                  members={members} nameOf={nameOf}
                  onUpdateAssignees={(phaseId, assigneeIds) => updateAssignees(phaseId, project.id, assigneeIds)}
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

        {activeTab === 'moodboard' && (
          <ProjectMoodboard
            items={project.moodboardItems}
            onChange={items => updateMoodboardItems(project.id, items)}
            onUploadImage={(itemId, file) => uploadMoodboardImage(workspaceId, project.id, itemId, file)}
            onRemoveImage={itemId => {
              const item = project.moodboardItems.find(i => i.id === itemId)
              if (item?.kind === 'image' && item.storageKey) {
                void ProjectsGateway.deleteMoodboardImage(workspaceId, item.storageKey)
              }
            }}
            readImage={(_itemId, storageKey) => ProjectsGateway.readMoodboardImage(workspaceId, storageKey)}
          />
        )}

        {activeTab === 'rechnungen' && (
          <ProjectInvoices
            project={project} invoices={projectInvoices} payments={payments} pdfBusy={pdfBusy}
            onAssignProject={async (invoiceId, projectId) => {
              await setInvoiceProject(invoiceId, projectId)
              const refreshed = await FinanceGateway.getInvoicesByProject(project.id)
              setProjectInvoices(refreshed)
            }}
            onCreateInvoice={() => setShowInvoiceForm(true)}
            onPayment={setPaymentInvoice}
            onDownload={downloadInvoice}
          />
        )}
      </div>

      {showInvoiceForm && (
        <InvoiceForm
          initialAccountId={project.accountId}
          initialProjectId={project.id}
          onClose={() => setShowInvoiceForm(false)}
          onSaved={async () => {
            setShowInvoiceForm(false)
            const refreshed = await FinanceGateway.getInvoicesByProject(project.id)
            setProjectInvoices(refreshed)
          }}
        />
      )}

      {paymentInvoice && (
        <PaymentModal invoice={paymentInvoice} onClose={() => setPaymentInvoice(null)} />
      )}
    </div>
  )
}
