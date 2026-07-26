import type { ProjectPhase } from '@/types/project.types'
import {
  nextMove, projectHealthZeit, projectHealthBudget, projectHealthStimmung,
  projectSignals, GATE_COLOR, type HealthLevel,
} from '@/lib/projects/signals'

const HEALTH_COLOR: Record<HealthLevel, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', unknown: 'var(--fg-dim)',
}
const HEALTH_LABEL: Record<HealthLevel, string> = {
  ok: 'im Plan', warn: 'knapp', bad: 'kritisch', unknown: 'noch nicht erfasst',
}

function NextMoveCard({ phases, today, onGoToPhases }: {
  phases: ProjectPhase[]
  today: Date
  onGoToPhases: () => void
}) {
  const move = nextMove(phases, today)
  const toneColor = move.tone === 'bad' ? 'var(--danger)' : move.tone === 'warn' ? 'var(--warn)' : 'var(--ok)'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 22, padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 3, background: toneColor }} />
      <span style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: toneColor, marginBottom: 10 }}>
        Nächster Zug
      </span>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{move.title}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--fg-muted)', maxWidth: '56ch' }}>{move.why}</p>
      {move.kind === 'gate_pending' && (
        <button className="btn-primary" onClick={onGoToPhases}>Zur Phase</button>
      )}
    </div>
  )
}

function PhasenRailCard({ phases, currentPhaseId }: { phases: ProjectPhase[]; currentPhaseId: string | null }) {
  const currentIndex = phases.findIndex(p => p.id === currentPhaseId)
  const doneCount = currentIndex < 0 ? 0 : currentIndex
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Phasen & Freigaben</h3>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--fg-dim)' }}>{doneCount} von {phases.length} Phasen</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {phases.map(phase => (
          <div key={phase.id} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden', marginBottom: 6 }}>
              <span style={{ display: 'block', height: '100%', width: `${phase.progressPercent}%`, background: 'var(--accent)' }} />
            </div>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.name}</span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3, fontSize: 10, color: 'var(--fg-dim)' }}>
              <i style={{ width: 6, height: 6, borderRadius: 1, transform: 'rotate(45deg)', background: GATE_COLOR[phase.gateState], display: 'inline-block' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.gateName}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AmpelCard({ phases, today }: { phases: ProjectPhase[]; today: Date }) {
  const items: { label: string; level: HealthLevel }[] = [
    { label: 'Zeit', level: projectHealthZeit(phases, today) },
    { label: 'Budget', level: projectHealthBudget() },
    { label: 'Stimmung', level: projectHealthStimmung() },
  ]
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 18 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600 }}>Ampel</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        {items.map(it => (
          <div key={it.label} style={{ flex: 1, padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>{it.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 12.5, fontWeight: 550 }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COLOR[it.level], display: 'block' }} />
              {HEALTH_LABEL[it.level]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignaleCard({ phases, today, onOpenPhase }: { phases: ProjectPhase[]; today: Date; onOpenPhase: () => void }) {
  const signals = projectSignals(phases, today)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Signale</h3>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--fg-dim)' }}>{signals.length}</span>
      </div>
      {signals.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', padding: '6px 0' }}>Alles ruhig.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {signals.map(sig => (
            <button
              key={sig.phaseId} onClick={onOpenPhase}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 2px',
                borderTop: '1px solid var(--border)', textAlign: 'left', width: '100%',
                background: 'none', border: 'none', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flex: 'none', background: sig.tone === 'bad' ? 'var(--danger)' : 'var(--warn)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 12.5, fontWeight: 550 }}>{sig.label}</strong>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>{sig.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProjectCockpit({ phases, currentPhaseId, today, onGoToPhases }: {
  phases: ProjectPhase[]
  currentPhaseId: string | null
  today: Date
  onGoToPhases: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <NextMoveCard phases={phases} today={today} onGoToPhases={onGoToPhases} />
      <PhasenRailCard phases={phases} currentPhaseId={currentPhaseId} />
      <AmpelCard phases={phases} today={today} />
      <SignaleCard phases={phases} today={today} onOpenPhase={onGoToPhases} />
    </div>
  )
}
