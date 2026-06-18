import { useState, useMemo } from 'react'
import { Plus, Search, List, LayoutGrid, CalendarClock } from 'lucide-react'
import { useLeadsStore } from '@/store/leads.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useCrmStore } from '@/store/crm.store'
import { useToastStore } from '@/store/toast.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { PhasenBoard, FollowUpModal } from '@/routes/LeadsRoute'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
import type { Lead, LeadSource, LeadStage } from '@/types/lead.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const FALLBACK_STAGE_COLOR = '#94a3b8'

/** Resolves a lead's stage (leadStatus) against the workspace's custom stage
 *  definitions — the same source the board groups by, so list ⇄ board agree. */
function resolveStage(leadStatus: string, stages: LeadStage[]): { label: string; color: string } {
  const def = stages.find(s => s.name === leadStatus)
  return { label: def?.label ?? leadStatus, color: def?.color ?? FALLBACK_STAGE_COLOR }
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  zoom: 'Zoom', generic: 'Sonstig', manual: 'Manuell',
  inbox: 'E-Mail', linkedin: 'LinkedIn', website: 'Website',
  event: 'Event', newsletter: 'Newsletter',
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: `${color}18`, color, border: `1px solid ${color}30`,
      textTransform: 'uppercase' as const, letterSpacing: '0.06em',
      whiteSpace: 'nowrap' as const, flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

function daysSince(iso: string | null): number {
  if (!iso) return -1
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Lead Row ──────────────────────────────────────────────────────────────────

function LeadRow({ lead, stages, followUpCount, onClick, onFollowUp }: {
  lead: Lead
  stages: LeadStage[]
  followUpCount: number
  onClick: () => void
  onFollowUp: () => void
}) {
  const stage = resolveStage(lead.leadStatus, stages)
  const ds = daysSince(lead.lastActivityAt)
  const isCold = ds > 14

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto auto',
        alignItems: 'center', gap: 14,
        padding: '12px 16px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        cursor: 'pointer',
        transition: 'background 100ms, border-color 100ms',
        marginBottom: 6,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--surface-2)'
        e.currentTarget.style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--surface)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: `${stage.color}18`,
        border: `1px solid ${stage.color}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color: stage.color,
        fontFamily: 'var(--font-mono)',
      }}>
        {initials(lead.name)}
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {lead.name}
          </span>
          <Chip label={stage.label} color={stage.color} />
          <Chip label={SOURCE_LABELS[lead.leadSource] ?? lead.leadSource} color="#64748b" />
          {isCold && <Chip label="Kalt" color="#f97316" />}
          {lead.reEngageDate && <Chip label="Re-Engage" color="#a855f7" />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {lead.companyName && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>
              {lead.companyName}
            </span>
          )}
          {lead.email && (
            <span style={{
              fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
            }}>
              {lead.email}
            </span>
          )}
        </div>
      </div>

      {/* Right meta */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {followUpCount > 0 && (
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
            color: 'var(--accent)', background: 'var(--accent-soft)',
            padding: '2px 8px', borderRadius: 99, border: '1px solid var(--accent-soft)',
          }}>
            {followUpCount} FU
          </span>
        )}
        <span style={{
          fontSize: 10.5, color: isCold ? '#f97316' : 'var(--fg-dim)',
          fontFamily: 'var(--font-mono)',
        }}>
          {ds < 0 ? 'Kein Eintrag' : ds === 0 ? 'Heute' : `vor ${ds}d`}
        </span>
      </div>

      {/* 1-Klick Follow-Up — ohne Umweg ins Detail oder die Inbox */}
      <button
        onClick={e => { e.stopPropagation(); onFollowUp() }}
        title="Follow-Up erstellen"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          color: 'var(--fg-muted)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
      >
        <CalendarClock size={13} /> Follow-Up
      </button>
    </div>
  )
}

// ── Quick Create Modal ─────────────────────────────────────────────────────────

function QuickCreateModal({ workspaceId, onClose, onCreated }: {
  workspaceId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const upsert = useLeadsStore(s => s.upsert)
  const stages = useLeadStagesStore(s => s.stages)
  const showToast = useToastStore(s => s.show)
  // Nur offene Stages — qualifiziert/disqualifiziert sind Endzustände.
  const openStages = useMemo(() => stages.filter(s => !s.isQualified && !s.isDisqualified), [stages])
  const [name,   setName]   = useState('')
  const [email,  setEmail]  = useState('')
  const [phone,  setPhone]  = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Stages laden async; bis dahin erste offene Stage als Fallback.
  const effectiveStatus = status || openStages[0]?.name || 'neu'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const lead = await upsert({
        workspaceId, name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        leadSource: 'manual', leadStatus: effectiveStatus,
      })
      showToast({ message: `Lead „${name.trim()}" angelegt.`, variant: 'success' })
      if (lead?.id) onCreated(lead.id)
      else onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lead konnte nicht angelegt werden'
      setError(msg)
      showToast({ message: msg, variant: 'error' })
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 28, width: 380,
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
          Lead anlegen
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Name *
            </label>
            <input
              className="mock-input"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Max Mustermann"
              style={{ fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              E-Mail
            </label>
            <input
              className="mock-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="max@firma.de"
              style={{ fontSize: 14 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Telefon
            </label>
            <input
              className="mock-input"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+49 151 1234567"
              style={{ fontSize: 14 }}
            />
          </div>
          {openStages.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                Stage
              </label>
              <select
                className="mock-input"
                value={effectiveStatus}
                onChange={e => setStatus(e.target.value)}
                style={{ fontSize: 14, cursor: 'pointer' }}
              >
                {openStages.map(s => (
                  <option key={s.id} value={s.name}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: -4 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Abbrechen
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !name.trim()}
              style={{ flex: 1 }}
            >
              {saving ? '…' : 'Anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── View Toggle ────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'board'

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const Btn = ({ m, icon: Icon, label }: { m: ViewMode; icon: typeof List; label: string }) => {
    const active = mode === m
    return (
      <button
        onClick={() => onChange(m)}
        title={label}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          border: 'none', background: active ? 'var(--surface)' : 'transparent',
          color: active ? 'var(--fg)' : 'var(--fg-dim)',
          borderRadius: 7, transition: 'all 120ms',
          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
        }}
      >
        <Icon size={13} /> {label}
      </button>
    )
  }
  return (
    <div style={{
      display: 'flex', gap: 2, padding: 3, borderRadius: 9,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      <Btn m="list"  icon={List}       label="Liste" />
      <Btn m="board" icon={LayoutGrid} label="Board" />
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function LeverageLeadsRoute() {
  const leads        = useLeadsStore(s => s.leads)
  const stages       = useLeadStagesStore(s => s.stages)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const loadAllFollowUps = useCrmStore(s => s.loadAll)
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [viewMode,    setViewMode]    = useState<ViewMode>('list')
  const [query,       setQuery]       = useState('')
  const [showCreate,  setShowCreate]  = useState(false)
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null)
  const [detailLead,  setDetailLead]  = useState<Lead | null>(null)

  const followUpsByLead = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of allFollowUps) {
      if (f.status === 'offen') map.set(f.customerId, (map.get(f.customerId) ?? 0) + 1)
    }
    return map
  }, [allFollowUps])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return leads
      .filter(l =>
        (stageFilter === 'all' || l.leadStatus === stageFilter) &&
        (!q ||
          l.name.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.companyName?.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const fuA = followUpsByLead.get(a.id) ?? 0
        const fuB = followUpsByLead.get(b.id) ?? 0
        if (fuA !== fuB) return fuB - fuA
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      })
  }, [leads, query, stageFilter, followUpsByLead])

  return (
    <div className="main-inner" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 14px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Leads<em style={{ fontStyle: 'italic', fontWeight: 300 }}>.</em>
            </h1>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>
              {leads.length} Leads total{viewMode === 'list' ? ` · ${filtered.length} angezeigt` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <button
              className="btn-primary"
              onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 14px' }}
            >
              <Plus size={13} /> Lead anlegen
            </button>
          </div>
        </div>

        {viewMode === 'list' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--fg-dim)', pointerEvents: 'none',
              }} />
              <input
                className="mock-input"
                placeholder="Name, E-Mail, Firma…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ paddingLeft: 30, fontSize: 13, width: '100%' }}
              />
            </div>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--fg)',
                fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <option value="all">Alle Stages</option>
              {stages.map(s => (
                <option key={s.id} value={s.name}>{s.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Body */}
      {viewMode === 'board' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PhasenBoard workspaceId={workspaceId} onShowCreate={() => setShowCreate(true)} showCreateButton={false} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px 32px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', fontSize: 13, color: 'var(--fg-dim)' }}>
              {query ? `Keine Leads für "${query}"` : 'Noch keine Leads.'}
            </div>
          ) : (
            filtered.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                stages={stages}
                followUpCount={followUpsByLead.get(lead.id) ?? 0}
                onClick={() => setDetailLead(lead)}
                onFollowUp={() => setFollowUpLead(lead)}
              />
            ))
          )}
        </div>
      )}

      {showCreate && (
        <QuickCreateModal
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          onCreated={id => {
            setShowCreate(false)
            // In der Liste direkt das Detail-Modal öffnen; im Board dort bleiben.
            if (viewMode === 'list') {
              const lead = useLeadsStore.getState().leads.find(l => l.id === id)
              if (lead) setDetailLead(lead)
            }
          }}
        />
      )}

      {followUpLead && (
        <FollowUpModal
          leads={[followUpLead]}
          workspaceId={workspaceId}
          onClose={() => setFollowUpLead(null)}
          onCreated={() => loadAllFollowUps(workspaceId)}
        />
      )}

      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          workspaceId={workspaceId}
          onClose={() => setDetailLead(null)}
        />
      )}
    </div>
  )
}
