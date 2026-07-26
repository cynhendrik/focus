import type { Project } from '@/types/project.types'

function ProjectRow({ project, customerName, onOpen }: {
  project: Project
  customerName: string
  onOpen: () => void
}) {
  const statusChip = project.status === 'paused'
    ? { label: '⏸ pausiert', style: { background: 'var(--surface-3)', color: 'var(--fg-muted)' } }
    : { label: '✓ abgeschlossen', style: { background: 'var(--ok-soft)', color: 'var(--ok)' } }

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

export function ProjectsArchiveList({ projects, customerNameFor, onOpen }: {
  projects: Project[]
  customerNameFor: (accountId: string) => string
  onOpen: (id: string) => void
}) {
  const paused = projects.filter(p => p.status === 'paused')
  const completed = projects.filter(p => p.status === 'completed')

  if (paused.length === 0 && completed.length === 0) {
    return (
      <div style={{ padding: '32px 20px', color: 'var(--fg-dim)', textAlign: 'center', fontSize: 13 }}>
        Kein pausiertes oder abgeschlossenes Projekt.
      </div>
    )
  }

  return (
    <>
      <Bucket title="Pausiert" projects={paused} customerNameFor={customerNameFor} onOpen={onOpen} />
      <Bucket title="Abgeschlossen" projects={completed} customerNameFor={customerNameFor} onOpen={onOpen} />
    </>
  )
}
