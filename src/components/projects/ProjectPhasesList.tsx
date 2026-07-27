import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { GATE_COLOR, formatDateDe } from '@/lib/projects/signals'
import type { ProjectPhase, Deliverable, DeliverableStatus } from '@/types/project.types'

const GATE_LABEL: Record<ProjectPhase['gateState'], string> = {
  open: 'geplant', pending: 'Freigabe offen', approved: 'freigegeben',
}

const DELIVERABLE_NEXT: Record<DeliverableStatus, DeliverableStatus> = {
  open: 'review', review: 'done', done: 'open',
}
const DELIVERABLE_LABEL: Record<DeliverableStatus, string> = {
  open: 'offen', review: 'in Review', done: 'fertig',
}

function DeliverablesChecklist({ deliverables, onChange }: {
  deliverables: Deliverable[]
  onChange: (next: Deliverable[]) => void
}) {
  const [name, setName] = useState('')

  const add = () => {
    if (!name.trim()) return
    onChange([...deliverables, { id: crypto.randomUUID(), name: name.trim(), status: 'open' }])
    setName('')
  }
  const cycle = (id: string) => {
    onChange(deliverables.map(d => d.id === id ? { ...d, status: DELIVERABLE_NEXT[d.status] } : d))
  }
  const remove = (id: string) => {
    onChange(deliverables.filter(d => d.id !== id))
  }

  return (
    <div>
      <span style={{ display: 'block', marginBottom: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
        Ergebnisse
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {deliverables.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <button
              onClick={() => cycle(d.id)}
              title={DELIVERABLE_LABEL[d.status]}
              style={{
                width: 15, height: 15, borderRadius: 4, flex: 'none', cursor: 'pointer', padding: 0,
                border: d.status === 'open' ? '1px solid var(--border-strong)' : 'none',
                background: d.status === 'done' ? 'var(--ok)' : d.status === 'review' ? 'var(--warn)' : 'transparent',
              }}
            />
            <span style={{ flex: 1, color: d.status === 'done' ? 'var(--fg-muted)' : 'var(--fg)' }}>{d.name}</span>
            {d.status === 'review' && (
              <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--warn)', color: 'var(--warn)' }}>
                in Review
              </span>
            )}
            <button
              onClick={() => remove(d.id)} aria-label={`${d.name} entfernen`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', display: 'flex', padding: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {deliverables.length === 0 && <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Noch keine Ergebnisse erfasst.</div>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="mock-input" value={name} onChange={e => setName(e.target.value)}
          placeholder="Neues Ergebnis" style={{ fontSize: 12.5, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button className="btn-primary" style={{ fontSize: 11.5, padding: '5px 10px' }} disabled={!name.trim()} onClick={add}>
          + Deliverable
        </button>
      </div>
    </div>
  )
}

function GateSection({ phase, onRequestGate, onApproveGate, onRemind }: {
  phase: ProjectPhase
  onRequestGate: (gateDate: string | null) => void
  onApproveGate: (approvedBy: string) => void
  onRemind: () => void
}) {
  const [gateDate, setGateDate] = useState('')
  const [approvedBy, setApprovedBy] = useState('')

  if (phase.gateState === 'approved') {
    return (
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{phase.gateName}</div>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
          Freigegeben am {phase.gateDate ? formatDateDe(phase.gateDate) : '—'} — {phase.gateApprovedBy}. Die Folgephase ist entsperrt.
        </p>
      </div>
    )
  }

  if (phase.gateState === 'pending') {
    return (
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{phase.gateName}</div>
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 10px' }}>
          {phase.gateDate ? `${formatDateDe(phase.gateDate)} · ` : ''}wartet auf Freigabe. Ohne sie startet die nächste Phase nicht.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="mock-input" value={approvedBy} onChange={e => setApprovedBy(e.target.value)}
            placeholder="Wer hat freigegeben?" style={{ fontSize: 12.5, width: 180 }}
          />
          <button
            className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}
            disabled={!approvedBy.trim()} onClick={() => onApproveGate(approvedBy.trim())}
          >
            Freigabe eintragen
          </button>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onRemind}>
            Erinnern
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{phase.gateName}</div>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 10px' }}>Noch keine Freigabe angefragt.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: 'var(--fg-dim)' }}>
          Fällig bis (optional)
          <input
            type="date" className="mock-input" value={gateDate} onChange={e => setGateDate(e.target.value)}
            style={{ fontSize: 12.5 }}
          />
        </label>
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onRequestGate(gateDate || null)}>
          Freigabe anfragen
        </button>
      </div>
    </div>
  )
}

function PhaseCard({ phase, index, isCurrent, isOpen, onToggle, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind }: {
  phase: ProjectPhase
  index: number
  isCurrent: boolean
  isOpen: boolean
  onToggle: () => void
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
  onRequestGate: (phaseId: string, gateDate: string | null) => void
  onApproveGate: (phaseId: string, approvedBy: string) => void
  onUpdateDeliverables: (phaseId: string, deliverables: Deliverable[]) => void
  onRemind: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      await onDeletePhase(phase.id)
      setConfirmDelete(false)
    } catch {
      // Fehler wird vom Elternteil angezeigt.
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 14, alignItems: 'center',
          padding: '15px 17px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 600, border: '1px solid var(--border)',
          background: isCurrent ? 'var(--accent)' : 'var(--surface-2)', color: isCurrent ? 'var(--accent-ink)' : 'var(--fg-dim)',
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 14, fontWeight: 570 }}>{phase.name}</strong>
          <span style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11.5, color: 'var(--fg-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{formatDateDe(phase.startDate)} – {formatDateDe(phase.endDate)}</span>
            {isCurrent && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                <input
                  type="range" min={0} max={100} value={phase.progressPercent}
                  onChange={e => onUpdateProgress(phase.id, Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{phase.progressPercent}%</span>
              </span>
            )}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)',
            color: GATE_COLOR[phase.gateState], whiteSpace: 'nowrap',
          }}>
            {GATE_LABEL[phase.gateState]}
          </span>
          {!isCurrent && (
            confirmDelete ? (
              <span style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={handleConfirmDelete} disabled={deleting}
                  style={{ fontSize: 10.5, color: 'oklch(72% 0.18 25)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 650 }}
                >
                  {deleting ? 'Löscht…' : 'Wirklich löschen'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)} disabled={deleting}
                  style={{ fontSize: 10.5, color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Abbrechen
                </button>
              </span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} title="Phase löschen"
                style={{ display: 'flex', color: 'var(--fg-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={13} />
              </button>
            )
          )}
        </span>
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 17px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 22 }}>
          <DeliverablesChecklist deliverables={phase.deliverables} onChange={next => onUpdateDeliverables(phase.id, next)} />
          <GateSection
            phase={phase}
            onRequestGate={gateDate => onRequestGate(phase.id, gateDate)}
            onApproveGate={approvedBy => onApproveGate(phase.id, approvedBy)}
            onRemind={onRemind}
          />
        </div>
      )}
    </div>
  )
}

export function ProjectPhasesList({ phases, currentPhaseId, onDeletePhase, onUpdateProgress, onRequestGate, onApproveGate, onUpdateDeliverables, onRemind }: {
  phases: ProjectPhase[]
  currentPhaseId: string | null
  onDeletePhase: (phaseId: string) => Promise<void>
  onUpdateProgress: (phaseId: string, progressPercent: number) => void
  onRequestGate: (phaseId: string, gateDate: string | null) => void
  onApproveGate: (phaseId: string, approvedBy: string) => void
  onUpdateDeliverables: (phaseId: string, deliverables: Deliverable[]) => void
  onRemind: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(currentPhaseId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {phases.map((phase, i) => (
        <PhaseCard
          key={phase.id}
          phase={phase} index={i} isCurrent={phase.id === currentPhaseId}
          isOpen={openId === phase.id} onToggle={() => setOpenId(openId === phase.id ? null : phase.id)}
          onDeletePhase={onDeletePhase} onUpdateProgress={onUpdateProgress}
          onRequestGate={onRequestGate} onApproveGate={onApproveGate}
          onUpdateDeliverables={onUpdateDeliverables} onRemind={onRemind}
        />
      ))}
    </div>
  )
}
