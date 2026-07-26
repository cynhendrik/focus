import type { Project, ProjectPhase } from '@/types/project.types'
import type { TimelineWeek } from '@/lib/projects/timeline-weeks'
import { dateToTimelineOffset } from '@/lib/projects/timeline-weeks'
import { projectHealthZeit, projectHealthBudget, projectHealthStimmung, type HealthLevel } from '@/lib/projects/signals'

const HEALTH_COLOR: Record<HealthLevel, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)',
}

const GATE_COLOR: Record<ProjectPhase['gateState'], string> = {
  approved: 'var(--ok)', pending: 'var(--warn)', open: 'var(--border-strong)',
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function pct(offset: number, totalWeeks: number): string {
  return `${(offset / totalWeeks) * 100}%`
}

function ProjectLane({ project, phases, customerName, weeks, today, onOpen }: {
  project: Project
  phases: ProjectPhase[]
  customerName: string
  weeks: TimelineWeek[]
  today: Date
  onOpen: () => void
}) {
  const totalWeeks = weeks.length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderTop: '1px solid var(--border)' }}>
      <button
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          borderRight: '1px solid var(--border)', textAlign: 'left', background: 'none', border: 'none',
          borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--border)', cursor: 'pointer', width: '100%',
        }}
      >
        <span style={{
          width: 30, height: 30, flex: 'none', borderRadius: 9, border: '1px solid var(--border-strong)',
          display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)', background: 'var(--surface-3)',
        }}>
          {initials(customerName)}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: 'block', fontSize: 13.5, fontWeight: 560, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.title}
          </strong>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {customerName}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 3, flex: 'none' }} title="Zeit · Budget · Stimmung">
          {([projectHealthZeit(phases, today), projectHealthBudget(), projectHealthStimmung()] as HealthLevel[]).map((h, i) => (
            <i key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: HEALTH_COLOR[h], display: 'block' }} />
          ))}
        </span>
      </button>

      <div style={{ position: 'relative', height: 62, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${totalWeeks},1fr)`, pointerEvents: 'none' }}>
          {weeks.map((w, i) => <i key={i} style={{ borderLeft: i === 0 ? 'none' : '1px solid var(--border)', opacity: 0.5 }} />)}
        </div>

        {phases.map(phase => {
          const from = dateToTimelineOffset(phase.startDate, weeks)
          const to = dateToTimelineOffset(phase.endDate, weeks)
          const startDate = new Date(`${phase.startDate}T00:00:00`)
          const endDate = new Date(`${phase.endDate}T00:00:00`)
          const windowStart = weeks[0]?.start
          const windowEnd = weeks.length ? new Date(weeks[weeks.length - 1].start.getTime() + 7 * 86400000) : null
          const fullyOutside = !!(windowStart && windowEnd && (endDate < windowStart || startDate > windowEnd))
          if (fullyOutside) return null
          const left = Math.max(0, from ?? 0)
          const right = Math.min(totalWeeks, to ?? totalWeeks)
          if (right <= left) return null
          return (
            <div
              key={phase.id}
              title={`${phase.name} · ${phase.progressPercent} %`}
              style={{
                position: 'absolute', top: 12, height: 22, borderRadius: 6,
                left: pct(left, totalWeeks), width: `calc(${pct(right - left, totalWeeks)} - 4px)`,
                display: 'flex', alignItems: 'center', padding: '0 9px', fontSize: 11, fontWeight: 500,
                color: 'var(--fg-2)', whiteSpace: 'nowrap', overflow: 'hidden',
                background: phase.progressPercent >= 100 ? 'var(--surface-3)' : 'var(--accent-soft)',
                border: `1px solid ${phase.progressPercent >= 100 ? 'var(--border-strong)' : 'var(--accent)'}`,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.name}</span>
            </div>
          )
        })}

        {phases.map(phase => {
          const at = dateToTimelineOffset(phase.endDate, weeks)
          if (at == null) return null
          return (
            <div
              key={`${phase.id}-gate`}
              title={`${phase.gateName} · ${phase.gateDate ?? 'kein Termin'}`}
              style={{
                position: 'absolute', top: 9, left: pct(at, totalWeeks), width: 9, height: 9,
                transform: 'translateX(-50%) rotate(45deg)', borderRadius: 2, background: GATE_COLOR[phase.gateState],
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function ProjectsTimeline({ projects, phasesByProject, customerNameFor, weeks, today, onOpen }: {
  projects: Project[]
  phasesByProject: Record<string, ProjectPhase[]>
  customerNameFor: (accountId: string) => string
  weeks: TimelineWeek[]
  today: Date
  onOpen: (id: string) => void
}) {
  const totalWeeks = weeks.length
  const todayOffset = dateToTimelineOffset(today.toISOString().slice(0, 10), weeks)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div style={{ padding: '10px 14px', fontSize: 10, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', borderRight: '1px solid var(--border)' }}>
          Projekt · Kunde
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalWeeks},1fr)` }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ padding: '8px 0 7px', textAlign: 'center', fontSize: 10, color: 'var(--fg-dim)', borderLeft: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <b style={{ display: 'block', fontWeight: 500, color: 'var(--fg-muted)', fontSize: 10.5 }}>{w.kw}</b>
              {w.monthLabel ?? ''}
            </div>
          ))}
        </div>
      </div>

      {projects.length === 0 ? (
        <div style={{ padding: '32px 20px', color: 'var(--fg-dim)', textAlign: 'center', fontSize: 13 }}>
          Kein Projekt in diesem Filter.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {todayOffset != null && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'var(--accent)', zIndex: 1, left: `calc(260px + (100% - 260px) * ${todayOffset / totalWeeks})` }} />
          )}
          {projects.map(project => (
            <ProjectLane
              key={project.id}
              project={project}
              phases={phasesByProject[project.id] ?? []}
              customerName={customerNameFor(project.accountId)}
              weeks={weeks}
              today={today}
              onOpen={() => onOpen(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
