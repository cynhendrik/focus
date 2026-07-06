import { useEffect, useMemo, useState } from 'react'
import { useProjectsStore } from '@/store/projects.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Project } from '@/types/project.types'
import { FolderKanban } from 'lucide-react'
import { NewProjectModal } from '@/components/projects/NewProjectModal'

function ProjectRow({ project, customerName, onOpen }: {
  project: Project
  customerName: string
  onOpen: () => void
}) {
  // Phasen werden je Detail-Ansicht geladen (Task 8) -- hier reicht der Status
  // fuer Bucket-Zuordnung und Chip; die Segment-Leiste braucht die Phasenliste
  // nicht zwingend, wenn wir uns auf Status+Zeitangaben beschraenken.
  const statusChip = project.status === 'paused'
    ? { label: '⏸ pausiert', style: { background: 'var(--surface-3)', color: 'var(--fg-muted)' } }
    : project.status === 'completed'
      ? { label: '✓ abgeschlossen', style: { background: 'var(--ok-soft)', color: 'var(--ok)' } }
      : { label: '● aktiv', style: { background: 'var(--accent-soft)', color: 'var(--accent-text)' } }

  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '16px 20px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--fg-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {customerName}
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--fg)' }}>{project.title}</div>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 650,
        padding: '5px 10px', borderRadius: 20, whiteSpace: 'nowrap', ...statusChip.style,
      }}>
        {statusChip.label}
      </span>
    </div>
  )
}

function Bucket({ title, projects, customerNameFor, onOpen }: {
  title: string
  projects: Project[]
  customerNameFor: (accountId: string) => string
  onOpen: (id: string) => void
}) {
  if (projects.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700,
        letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 10,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 20,
          background: 'var(--surface-3)', color: 'var(--fg-muted)', fontSize: 10.5, fontWeight: 700,
        }}>
          {projects.length}
        </span>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {projects.map(p => (
          <ProjectRow key={p.id} project={p} customerName={customerNameFor(p.accountId)} onOpen={() => onOpen(p.id)} />
        ))}
      </div>
    </div>
  )
}

export function ProjectsOverviewRoute() {
  const projects = useProjectsStore(s => s.projects)
  const loadProjects = useProjectsStore(s => s.load)
  const customers = useCustomersStore(s => s.customers)
  const setSelectedProjectId = useUiStore(s => s.setSelectedProjectId)
  const setAppView = useUiStore(s => s.setAppView)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [showNewProjectModal, setShowNewProjectModal] = useState(false)

  useEffect(() => { if (workspaceId) loadProjects(workspaceId) }, [workspaceId, loadProjects])

  const customerNameFor = (accountId: string) =>
    customers.find(c => c.id === accountId)?.name ?? 'Unbekannter Kunde'

  // Zwei getrennte State-Aenderungen wie an jeder anderen Detail-Navigation in
  // dieser App (siehe CommandPalette.tsx: setLeverageLead(id); setAppView(...)),
  // nicht in einem Setter gebuendelt.
  function openProject(id: string) {
    setSelectedProjectId(id)
    setAppView('project_detail')
  }

  const { active, paused, completed } = useMemo(() => ({
    active: projects.filter(p => p.status === 'active'),
    paused: projects.filter(p => p.status === 'paused'),
    completed: projects.filter(p => p.status === 'completed'),
  }), [projects])

  return (
    <div className="main-inner" style={{ padding: '24px 28px 40px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 650, margin: '0 0 5px', letterSpacing: '-0.01em' }}>
            Alle Projekte
          </h1>
          <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 14 }}>
            {projects.length} Projekt{projects.length === 1 ? '' : 'e'} insgesamt — {active.length} aktiv, {paused.length} pausiert.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowNewProjectModal(true)}>
          + Neues Projekt
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '48px 20px', color: 'var(--fg-dim)', textAlign: 'center',
        }}>
          <FolderKanban size={32} />
          <div>Noch keine Projekte angelegt.</div>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setShowNewProjectModal(true)}>
            + Neues Projekt
          </button>
        </div>
      ) : (
        <>
          <Bucket title="Aktiv" projects={active} customerNameFor={customerNameFor} onOpen={openProject} />
          <Bucket title="Pausiert" projects={paused} customerNameFor={customerNameFor} onOpen={openProject} />
          <Bucket title="Abgeschlossen" projects={completed} customerNameFor={customerNameFor} onOpen={openProject} />
        </>
      )}
      {showNewProjectModal && <NewProjectModal onClose={() => setShowNewProjectModal(false)} />}
    </div>
  )
}
