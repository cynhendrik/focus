import { useEffect, useMemo, useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { FolderKanban, ChevronRight } from 'lucide-react'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import { ProjectsTimeline } from '@/components/projects/ProjectsTimeline'
import { ProjectsArchiveList } from '@/components/projects/ProjectsArchiveList'
import { rollingWeeks } from '@/lib/projects/timeline-weeks'
import { projectSignals } from '@/lib/projects/signals'

type Filter = 'alle' | 'brauchen' | 'gate'

export function ProjectsOverviewRoute() {
  const projects = useProjectsStore(s => s.projects)
  const loadProjects = useProjectsStore(s => s.load)
  const phasesByProject = useProjectsStore(s => s.phasesByProject)
  const loadPhases = useProjectsStore(s => s.loadPhases)
  const customers = useCustomersStore(s => s.customers)
  const setSelectedProjectId = useUiStore(s => s.setSelectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [filter, setFilter] = useState<Filter>('alle')
  const [showArchive, setShowArchive] = useState(false)

  const today = useMemo(() => new Date(), [])
  const weeks = useMemo(() => rollingWeeks(today), [today])

  useEffect(() => { if (workspaceId) loadProjects(workspaceId) }, [workspaceId, loadProjects])

  const active = useMemo(() => projects.filter(p => p.status === 'active'), [projects])

  // Die Timeline braucht Phasen ALLER aktiven Projekte gleichzeitig (Balken,
  // Gates, Signale) -- anders als ProjectDetailRoute, das nur die Phasen des
  // gerade geöffneten Projekts lädt.
  useEffect(() => {
    active.forEach(p => { if (!phasesByProject[p.id]) loadPhases(p.id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.map(p => p.id).join(',')])

  const customerNameFor = (accountId: string) =>
    customers.find(c => c.id === accountId)?.name ?? 'Unbekannter Kunde'

  function openProject(id: string) {
    setSelectedProjectId(id)
    setAppView('project_detail')
  }

  const decisions = useMemo(
    () => active.flatMap(p => projectSignals(phasesByProject[p.id] ?? [], today).map(sig => ({ project: p, sig }))),
    [active, phasesByProject, today],
  )

  const filteredProjects = useMemo(() => {
    if (filter === 'alle') return active
    if (filter === 'brauchen') return active.filter(p => decisions.some(d => d.project.id === p.id))
    return active.filter(p => (phasesByProject[p.id] ?? []).some(ph => ph.gateState === 'open'))
  }, [active, filter, decisions, phasesByProject])

  const mrr = active.reduce((s, p) => s + p.retainerMonthly, 0)
  const needs = active.filter(p => decisions.some(d => d.project.id === p.id)).length

  return (
    <div className="main-inner" style={{ padding: '24px 28px 40px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span style={{ display: 'block', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 8 }}>
            Portfolio
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 650, margin: 0, letterSpacing: '-0.01em' }}>Projekte</h1>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 11, color: 'var(--fg-muted)' }}>
          <span><b style={{ color: 'var(--fg)' }}>{active.length}</b> laufend</span>
          <span><b style={{ color: 'var(--fg)' }}>{mrr.toLocaleString('de-DE')} €</b> Retainer / Monat</span>
          {needs > 0 && <span style={{ color: 'var(--warn)' }}><b style={{ color: 'var(--warn)' }}>{needs}</b> brauchen dich</span>}
          <button className="btn-primary" onClick={() => setShowNewProjectModal(true)}>+ Neues Projekt</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999 }}>
          {([['alle', 'Alle'], ['brauchen', 'Brauchen dich'], ['gate', 'Gate offen']] as [Filter, string][]).map(([id, label]) => (
            <button
              key={id} onClick={() => { setFilter(id); setShowArchive(false) }}
              style={{
                padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: !showArchive && filter === id ? 'var(--surface)' : 'transparent',
                color: !showArchive && filter === id ? 'var(--fg)' : 'var(--fg-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowArchive(a => !a)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fg-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {showArchive ? 'Zur Timeline' : 'Archiv (pausiert / abgeschlossen)'} <ChevronRight size={13} />
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 20px', color: 'var(--fg-dim)', textAlign: 'center' }}>
          <FolderKanban size={32} />
          <div>Noch keine Projekte angelegt.</div>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setShowNewProjectModal(true)}>+ Neues Projekt</button>
        </div>
      ) : showArchive ? (
        <ProjectsArchiveList projects={projects} customerNameFor={customerNameFor} onOpen={openProject} />
      ) : (
        <>
          <ProjectsTimeline
            projects={filteredProjects} phasesByProject={phasesByProject}
            customerNameFor={customerNameFor} weeks={weeks} today={today} onOpen={openProject}
          />

          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Diese Woche wird entschieden</h3>
              <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{decisions.length} Punkte</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {decisions.map(({ project, sig }) => (
                <button
                  key={sig.phaseId} onClick={() => openProject(project.id)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 2px',
                    borderTop: '1px solid var(--border)', textAlign: 'left', width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flex: 'none', background: sig.tone === 'bad' ? 'var(--danger)' : 'var(--warn)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 12.5, fontWeight: 550 }}>{sig.label} — {project.title}</strong>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>{sig.detail}</span>
                  </span>
                </button>
              ))}
              {decisions.length === 0 && (
                <div style={{ padding: '14px 2px', fontSize: 12.5, color: 'var(--fg-dim)' }}>Nichts brennt diese Woche.</div>
              )}
            </div>
          </div>
        </>
      )}

      {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} />}
    </div>
  )
}
