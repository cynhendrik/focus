import { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useLeadsStore } from '@/store/leads.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { useToastStore } from '@/store/toast.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { ActivitiesGateway } from '@/data/activities.gateway'
import { LeadStagesManager } from '@/components/leads/LeadStagesManager'
import { QualifyModal } from '@/components/leads/QualifyModal'
import { DisqualifyModal } from '@/components/leads/DisqualifyModal'
import { LeadDetailModal } from '@/components/leads/LeadDetailModal'
import type { Lead, LeadSource, UpsertLeadPayload } from '@/types/lead.types'

// ── helpers ──────────────────────────────────────────────────────────────────

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE')
}

function sourceLabel(source: LeadSource, detail: string | null): string {
  if (detail) return detail
  if (source === 'zoom') return 'Zoom Webinar'
  if (source === 'newsletter') return 'Newsletter'
  if (source === 'generic') return 'Web'
  if (source === 'manual') return 'Manuell'
  return source
}

function relDays(iso: string): string {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (diff < 0) return 'Überfällig'
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  return `in ${diff} Tagen`
}

function dayColor(iso: string): string {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (diff < 0) return '#f87171'
  if (diff <= 7) return '#fbbf24'
  return 'var(--fg-dim)'
}

function dotColor(iso: string): string {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (diff < 0) return '#f87171'
  if (diff <= 7) return '#fbbf24'
  if (diff <= 30) return '#4ade80'
  return 'rgba(74,222,128,0.4)'
}

// ── Board columns ─────────────────────────────────────────────────────────────

const SIDEBAR_LIMIT = 8

// ── Follow-Up Modal ───────────────────────────────────────────────────────────

export function FollowUpModal({
  leads, workspaceId, onClose, onCreated,
}: {
  leads: Lead[]
  workspaceId: string
  onClose: () => void
  onCreated?: () => void
}) {
  const user = useAuthStore(s => s.user)
  const showToast = useToastStore(s => s.show)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(tomorrow())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await Promise.all(leads.map(lead =>
        ActivitiesGateway.create({
          workspaceId,
          createdBy: user?.id ?? '',
          accountId: lead.id,
          // type 'task' + is_follow_up: das ist die Konvention, die die Follow-Up-
          // Liste (get_open_tasks: WHERE type='task') und getByCustomer erwarten.
          // Mit 'followup' fällt der Eintrag aus allen Follow-Up-Listen heraus.
          type: 'task',
          title: title.trim(),
          dueAt: date || undefined,
          status: 'open',
          payload: JSON.stringify({ is_follow_up: true }),
        })
      ))
      showToast({
        message: leads.length > 1
          ? `Follow-Up für ${leads.length} Leads erstellt.`
          : `Follow-Up für ${leads[0].name} erstellt.`,
        variant: 'success',
      })
      onCreated?.()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Follow-Up konnte nicht erstellt werden'
      setError(msg)
      showToast({ message: msg, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Follow-Up erstellen</h2>
        {leads.length > 1 && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 16 }}>Für {leads.length} Leads</p>
        )}
        {leads.length === 1 && (
          <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 16 }}>{leads[0].name}</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
              Titel *
            </label>
            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Rückruf, Demo vereinbaren…"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>
              Fällig am
            </label>
            <input
              className="mock-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 11, color: '#f87171', marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: error ? 12 : 24, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!title.trim() || saving}
          >
            {saving ? 'Erstellen…' : leads.length > 1 ? `${leads.length} Follow-Ups erstellen` : 'Follow-Up erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Context Menu ──────────────────────────────────────────────────────────────

interface CtxMenu { lead: Lead; x: number; y: number }

function ContextMenu({
  menu, workspaceId, onClose, onFollowUp, warmStageName = 'warm',
}: {
  menu: CtxMenu
  workspaceId: string
  onClose: () => void
  onFollowUp: (leads: Lead[]) => void
  warmStageName?: string
}) {
  const convertToClient = useLeadsStore(s => s.convertToClient)
  const deleteLead = useLeadsStore(s => s.deleteLead)
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hide = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const hideKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', hide)
    document.addEventListener('keydown', hideKey)
    return () => {
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('keydown', hideKey)
    }
  }, [onClose])

  const act = (fn: () => void) => { fn(); onClose() }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top: menu.y, left: menu.x, zIndex: 2000,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '4px 0',
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        minWidth: 210,
      }}
    >
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--fg-dim)', fontWeight: 600 }}>
        {menu.lead.name}
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0 4px' }} />

      <CtxItem label="Follow-Up erstellen" onClick={() => act(() => onFollowUp([menu.lead]))} />
      {menu.lead.leadStatus !== warmStageName && (
        <CtxItem
          label="→ Warm Lead"
          color="var(--accent)"
          onClick={() => act(() => bulkUpdate({ ids: [menu.lead.id], status: warmStageName }, workspaceId))}
        />
      )}
      <CtxItem
        label="Zu Kunde machen ✓"
        color="var(--accent)"
        onClick={() => act(() => convertToClient(menu.lead.id))}
      />

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      <CtxItem
        label="Re-Engage (90 Tage)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'disqualifiziert', reEngageDate: todayPlus(90) }, workspaceId)
        )}
      />
      <CtxItem
        label="Lost (6 Monate)"
        color="var(--fg-dim)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'disqualifiziert', reEngageDate: todayPlus(180) }, workspaceId)
        )}
      />

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      <CtxItem
        label="Lead löschen"
        color="#f87171"
        onClick={() => act(() => deleteLead(menu.lead.id, workspaceId))}
      />
    </div>
  )
}

function CtxItem({ label, color, onClick }: { label: string; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 12px', fontSize: 12,
        color: color ?? 'var(--fg)',
        background: 'none', border: 'none', cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {label}
    </button>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, selected, onToggle, onContext, onOpen, onWarm, isDragging }: {
  lead: Lead
  selected?: boolean
  onToggle?: () => void
  onOpen?: (lead: Lead) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm?: () => void
  isDragging?: boolean
}) {
  const isWebinar    = lead.leadSource === 'zoom'
  const isNewsletter = lead.leadSource === 'newsletter'
  const showWarmBtn  = isWebinar && lead.leadStatus !== 'warm' && onWarm

  return (
    <div
      className="task-card"
      data-dragging={isDragging ? 'true' : undefined}
      onClick={e => { e.stopPropagation(); onOpen?.(lead) }}
      onContextMenu={e => { e.preventDefault(); onContext(e, lead) }}
      style={{
        marginBottom: 6, cursor: 'pointer', userSelect: 'none',
        outline: selected ? '2px solid var(--accent)' : undefined,
        outlineOffset: selected ? 1 : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3, lineHeight: 1.4 }}>
            {lead.name}
          </div>
          {lead.email && (
            <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {lead.email}
            </div>
          )}
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              onClick={e => e.stopPropagation()}
              title="Anrufen"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 10.5, color: 'var(--accent)', textDecoration: 'none',
                fontWeight: 600, marginBottom: 5, fontFamily: 'var(--font-mono)',
              }}
            >
              📞 {lead.phone}
            </a>
          ) : (
            <div
              title="Keine Telefonnummer — zum Nachtragen Karte öffnen"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 9.5, color: 'var(--fg-dim)', fontWeight: 500,
                marginBottom: 5, opacity: 0.6,
              }}
            >
              📞 —
            </div>
          )}
        </div>
        <div
          onClick={e => { e.stopPropagation(); onToggle?.() }}
          title="Auswählen"
          style={{
            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
            border: selected ? 'none' : '1.5px solid var(--border-strong)',
            background: selected ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', opacity: selected ? 1 : 0.4,
            transition: 'opacity 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = selected ? '1' : '0.4')}
        >
          {selected && (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M1 3L3 5L7 1" stroke="var(--accent-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
          background: isWebinar    ? 'color-mix(in srgb, #a78bfa 14%, transparent)'
                    : isNewsletter ? 'color-mix(in srgb, #4ade80 12%, transparent)'
                    : 'var(--surface-2)',
          color: isWebinar    ? '#a78bfa'
               : isNewsletter ? '#4ade80'
               : 'var(--fg-muted)',
        }}>
          {sourceLabel(lead.leadSource, lead.leadSourceDetail)}
        </span>
        {lead.engagementScore > 0 && (
          <span style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {lead.engagementScore}p
          </span>
        )}
      </div>

      {showWarmBtn && (
        <button
          onClick={e => { e.stopPropagation(); onWarm() }}
          style={{
            marginTop: 8, width: '100%', padding: '5px 0',
            borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 800, cursor: 'pointer',
            background: 'var(--accent-gradient)', border: 'none',
            color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 4,
            boxShadow: '0 2px 8px var(--accent-glow)',
          }}
        >
          ↑ Warm Lead
        </button>
      )}
    </div>
  )
}

// ── Draggable wrapper ─────────────────────────────────────────────────────────

function DraggableLeadCard({ lead, selected, onToggle, onContext, onOpen, onWarm }: {
  lead: Lead
  selected: boolean
  onToggle: () => void
  onOpen: (lead: Lead) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <LeadCard lead={lead} selected={selected} onToggle={onToggle} onContext={onContext} onOpen={onOpen} onWarm={onWarm} isDragging={isDragging} />
    </div>
  )
}

// ── Droppable column ──────────────────────────────────────────────────────────

type ColDef = { id: string; label: string; hoverBg: string; dot: string }

function LeadColumn({ col, leads, selected, onToggle, onContext, onOpen, onWarm }: {
  col: ColDef
  leads: Lead[]
  selected: Set<string>
  onToggle: (id: string) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onOpen: (lead: Lead) => void
  onWarm: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 200,
        borderRight: '1px solid var(--border)',
        padding: '14px 12px',
        background: isOver ? col.hoverBg : 'var(--bg-2, transparent)',
        transition: 'background 150ms',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>
          {col.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 'auto' }}>{leads.length}</span>
      </div>

      <div style={{ flex: 1 }}>
        {leads.map(lead => (
          <DraggableLeadCard
            key={lead.id}
            lead={lead}
            selected={selected.has(lead.id)}
            onToggle={() => onToggle(lead.id)}
            onContext={onContext}
            onOpen={onOpen}
            onWarm={() => onWarm(lead.id)}
          />
        ))}
        {leads.length === 0 && (
          <div style={{ border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', padding: 16, textAlign: 'center', background: 'var(--surface-2)' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Leer</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Re-Engage Sidebar ─────────────────────────────────────────────────────────

function ReEngageSidebar({ leads, workspaceId }: { leads: Lead[]; workspaceId: string }) {
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const [expanded, setExpanded] = useState(false)

  const reactivate = (lead: Lead) =>
    bulkUpdate({ ids: [lead.id], status: 'inbox' }, workspaceId)

  const sorted = useMemo(
    () => [...leads].sort((a, b) => (a.reEngageDate ?? '') < (b.reEngageDate ?? '') ? -1 : 1),
    [leads],
  )

  const visible = expanded ? sorted : sorted.slice(0, SIDEBAR_LIMIT)
  const hiddenCount = sorted.length - SIDEBAR_LIMIT

  return (
    <div style={{
      width: 230, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '13px 16px 11px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#4ade80',
          boxShadow: '0 0 6px color-mix(in srgb, #4ade80 60%, transparent)',
        }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
          Re-Engage
        </span>
        {sorted.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-dim)', marginLeft: 2 }}>
            {sorted.length}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: '20px 16px', fontSize: 11, color: 'var(--fg-dim)' }}>
          Keine geplant
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 14px' }}>
          {visible.map((lead, idx) => {
            const isLast = idx === visible.length - 1
            const color = dotColor(lead.reEngageDate!)
            return (
              <div key={lead.id} style={{ display: 'flex', alignItems: 'stretch' }}>
                {/* Timeline gutter */}
                <div style={{ width: 20, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: color,
                    boxShadow: `0 0 8px ${color}88`,
                    border: '1.5px solid var(--bg)',
                    marginTop: 3,
                  }} />
                  {!isLast && (
                    <div style={{
                      width: 1.5, flex: 1, marginTop: 3,
                      background: 'linear-gradient(to bottom, color-mix(in srgb, #4ade80 35%, transparent), color-mix(in srgb, #4ade80 8%, transparent))',
                      minHeight: 16,
                    }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, paddingLeft: 10, paddingBottom: isLast ? 4 : 22 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, lineHeight: 1.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {lead.name}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: dayColor(lead.reEngageDate!), marginTop: 3 }}>
                    {relDays(lead.reEngageDate!)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 1 }}>
                    {fmtDate(lead.reEngageDate!)}
                  </div>
                  <button
                    onClick={() => reactivate(lead)}
                    style={{
                      marginTop: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                      borderRadius: 'var(--radius-sm)', border: '1px solid color-mix(in srgb, #4ade80 30%, transparent)',
                      background: 'color-mix(in srgb, #4ade80 10%, transparent)', color: '#4ade80',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Reaktivieren
                  </button>
                </div>
              </div>
            )
          })}

          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="btn-ghost"
              style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '5px 0' }}
            >
              + {hiddenCount} weitere
            </button>
          )}
          {expanded && sorted.length > SIDEBAR_LIMIT && (
            <button
              onClick={() => setExpanded(false)}
              className="btn-ghost"
              style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '5px 0' }}
            >
              Weniger anzeigen
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Phasen Board ──────────────────────────────────────────────────────────────

export function PhasenBoard({ workspaceId, onShowCreate, showCreateButton = true }: { workspaceId: string; onShowCreate: () => void; showCreateButton?: boolean }) {
  const allLeads      = useLeadsStore(s => s.leads)
  const bulkUpdate    = useLeadsStore(s => s.bulkUpdate)
  const moveLeadStage = useLeadsStore(s => s.moveLeadStage)
  const deleteLead    = useLeadsStore(s => s.deleteLead)
  const convertToDeal = useLeadsStore(s => s.convertToDeal)
  const userId        = useAuthStore(s => s.user?.id ?? '')
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const showToast     = useToastStore(s => s.show)
  const stages        = useLeadStagesStore(s => s.stages)

  const [activeLead, setActiveLead]              = useState<Lead | null>(null)
  const [selected, setSelected]                  = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu]                    = useState<CtxMenu | null>(null)
  const [followUpLeads, setFollowUpLeads]         = useState<Lead[] | null>(null)
  const [pendingQualify, setPendingQualify]       = useState<Lead | null>(null)
  const [pendingDisqualify, setPendingDisqualify] = useState<Lead | null>(null)
  const [showStages, setShowStages]              = useState(false)
  const [detailLead, setDetailLead]              = useState<Lead | null>(null)

  // ── Filter / search / sort ──────────────────────────────────────────────
  const [search, setSearch]             = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | LeadSource>('all')
  const [noPhoneOnly, setNoPhoneOnly]   = useState(false)
  const [sortByScore, setSortByScore]   = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const boardLeads = useMemo(
    () => allLeads.filter(l => l.reEngageDate == null),
    [allLeads],
  )

  const reEngageLeads = useMemo(
    () => allLeads.filter(l => l.reEngageDate != null),
    [allLeads],
  )

  const filteredBoardLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return boardLeads.filter(l => {
      if (sourceFilter !== 'all' && l.leadSource !== sourceFilter) return false
      if (noPhoneOnly && l.phone) return false
      if (q) {
        const hay = `${l.name} ${l.email ?? ''} ${l.phone ?? ''} ${l.companyName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [boardLeads, search, sourceFilter, noPhoneOnly])

  // Group once per render instead of filtering all leads per stage; sort hottest first.
  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>()
    for (const l of filteredBoardLeads) {
      const arr = map.get(l.leadStatus)
      if (arr) arr.push(l)
      else map.set(l.leadStatus, [l])
    }
    if (sortByScore) {
      for (const arr of map.values()) {
        arr.sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0))
      }
    }
    return map
  }, [filteredBoardLeads, sortByScore])

  const leadsForStage = (stageName: string) => leadsByStage.get(stageName) ?? []

  const isFiltered = search.trim() !== '' || sourceFilter !== 'all' || noPhoneOnly

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const handleDragStart = (e: DragStartEvent) => {
    setActiveLead(boardLeads.find(l => l.id === e.active.id) ?? null)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveLead(null)
    if (!e.over) return
    const targetStageName = e.over.id as string
    const lead = boardLeads.find(l => l.id === e.active.id)
    if (!lead) return

    const targetStage = stages.find(s => s.name === targetStageName)
    if (!targetStage) return

    if (targetStage.isQualified) {
      setPendingQualify(lead)
      return
    }
    if (targetStage.isDisqualified) {
      setPendingDisqualify(lead)
      return
    }
    if (lead.leadStatus !== targetStageName) {
      moveLeadStage(lead.id, targetStageName)
    }
  }

  const handleQualifyConfirm = async (_appointmentDate?: string) => {
    if (!pendingQualify) return
    try {
      const leadId = pendingQualify.id
      await convertToDeal(leadId, workspaceId, userId)
      // Lead → Kunde: gleiche ID, History/Follow-Ups bleiben dran. Direkt zum
      // Kunden springen, damit die Kontinuität sofort sichtbar ist.
      showToast({
        message: `${pendingQualify.name} ist jetzt Kunde — Deal in der Pipeline.`,
        action: { label: '→ Kunde öffnen', onClick: () => openCustomerAt(leadId, 'verlauf') },
      })
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Konvertierung fehlgeschlagen', variant: 'error' })
    } finally {
      setPendingQualify(null)
    }
  }

  const handleDisqualifyConfirm = async (reEngageDate: string) => {
    if (!pendingDisqualify) return
    try {
      await bulkUpdate({ ids: [pendingDisqualify.id], status: 'disqualifiziert', reEngageDate }, workspaceId)
    } finally {
      setPendingDisqualify(null)
    }
  }

  const handleContext = (e: React.MouseEvent, lead: Lead) => {
    setCtxMenu({ lead, x: e.clientX, y: e.clientY })
  }

  const handleWarm = (id: string) => {
    const warmStage = stages.find(s => s.name === 'warm') ?? stages.find(s => !s.isQualified && !s.isDisqualified && s.orderIndex === 2)
    if (warmStage) bulkUpdate({ ids: [id], status: warmStage.name }, workspaceId)
  }

  const selectedLeads = boardLeads.filter(l => selected.has(l.id))

  async function deleteSelected() {
    await Promise.all(selectedLeads.map(l => deleteLead(l.id, workspaceId)))
    clearSelection()
  }

  return (
    <>
      {/* Action bar */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minHeight: 50,
        position: 'relative',
      }}>
        {selected.size > 0 ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>
              {selected.size} ausgewählt
            </span>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setFollowUpLeads(selectedLeads)}
            >
              Follow-Up erstellen
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', color: '#f87171' }}
              onClick={deleteSelected}
            >
              Löschen
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', color: 'var(--fg-dim)' }}
              onClick={clearSelection}
            >
              Auswahl aufheben
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
            Klicken zum Öffnen · Checkbox zum Auswählen · Ziehen zum Verschieben · Rechtsklick für Aktionen
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="btn-ghost"
          style={{ fontSize: 11, padding: '5px 10px' }}
          onClick={() => setShowStages(v => !v)}
        >
          Stages
        </button>
        {showCreateButton && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onShowCreate}>
            + Lead
          </button>
        )}
        {showStages && (
          <LeadStagesManager workspaceId={workspaceId} onClose={() => setShowStages(false)} />
        )}
      </div>

      {/* Filter / search toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '4px 10px', width: 220,
        }}>
          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Leads durchsuchen…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--fg)', minWidth: 0 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>

        <select
          className="mock-input"
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value as 'all' | LeadSource)}
          style={{ fontSize: 12, padding: '5px 8px', width: 'auto' }}
        >
          <option value="all">Alle Quellen</option>
          <option value="manual">Manuell</option>
          <option value="zoom">Zoom Webinar</option>
          <option value="newsletter">Newsletter</option>
          <option value="generic">Web / Sonstiges</option>
        </select>

        <button
          onClick={() => setNoPhoneOnly(v => !v)}
          style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
            background: noPhoneOnly ? 'var(--accent-soft)' : 'transparent',
            color: noPhoneOnly ? 'var(--accent)' : 'var(--fg-dim)',
            border: `1px solid ${noPhoneOnly ? 'var(--accent)' : 'var(--border)'}`,
            fontWeight: 600,
          }}
        >
          📞 Ohne Telefon
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setSortByScore(v => !v)}
          title="Heißeste Leads (Engagement-Score) zuerst"
          style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
            background: sortByScore ? 'var(--accent-soft)' : 'transparent',
            color: sortByScore ? 'var(--accent)' : 'var(--fg-dim)',
            border: `1px solid ${sortByScore ? 'var(--accent)' : 'var(--border)'}`,
            fontWeight: 600,
          }}
        >
          {sortByScore ? '↓ Score' : 'Score-Sortierung aus'}
        </button>

        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontFamily: 'var(--font-mono)' }}>
          {isFiltered ? `${filteredBoardLeads.length}/${boardLeads.length}` : boardLeads.length}
        </span>

        {isFiltered && (
          <button
            onClick={() => { setSearch(''); setSourceFilter('all'); setNoPhoneOnly(false) }}
            style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--accent)', fontWeight: 600 }}
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Board + Sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
            {stages.map(stage => (
              <LeadColumn
                key={stage.id}
                col={{
                  id: stage.name,
                  label: stage.label,
                  hoverBg: `${stage.color}1A`,
                  dot: stage.color,
                }}
                leads={leadsForStage(stage.name)}
                selected={selected}
                onToggle={toggleSelect}
                onContext={handleContext}
                onOpen={setDetailLead}
                onWarm={handleWarm}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? <LeadCard lead={activeLead} onContext={() => {}} onOpen={() => {}} isDragging /> : null}
          </DragOverlay>
        </DndContext>

        <ReEngageSidebar leads={reEngageLeads} workspaceId={workspaceId} />
      </div>

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          workspaceId={workspaceId}
          onClose={() => setCtxMenu(null)}
          onFollowUp={leads => { setCtxMenu(null); setFollowUpLeads(leads) }}
          warmStageName={stages.find(s => s.name === 'warm')?.name ?? stages.find(s => !s.isQualified && !s.isDisqualified && s.orderIndex === 2)?.name ?? 'warm'}
        />
      )}
      {followUpLeads && (
        <FollowUpModal leads={followUpLeads} workspaceId={workspaceId} onClose={() => setFollowUpLeads(null)} />
      )}
      {pendingQualify && (
        <QualifyModal
          lead={pendingQualify}
          onConfirm={handleQualifyConfirm}
          onCancel={() => setPendingQualify(null)}
        />
      )}
      {pendingDisqualify && (
        <DisqualifyModal
          lead={pendingDisqualify}
          onConfirm={handleDisqualifyConfirm}
          onCancel={() => setPendingDisqualify(null)}
        />
      )}
      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          workspaceId={workspaceId}
          onClose={() => setDetailLead(null)}
        />
      )}
    </>
  )
}

// ── Create Lead Modal ─────────────────────────────────────────────────────────

function CreateLeadModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const upsert = useLeadsStore(s => s.upsert)
  const stages = useLeadStagesStore(s => s.stages)
  // Only non-terminal stages — qualified converts to customer, disqualified
  // moves to re-engage, so a brand-new lead can't sensibly start there.
  const openStages = useMemo(() => stages.filter(s => !s.isQualified && !s.isDisqualified), [stages])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState<LeadSource>('manual')
  const [sourceDetail, setSourceDetail] = useState('')
  const [saving, setSaving] = useState(false)

  // Stages load async; fall back to the first open stage until the user picks one.
  const effectiveStatus = status || openStages[0]?.name || 'neu'

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const payload: UpsertLeadPayload = {
      workspaceId,
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      leadSource: source,
      leadSourceDetail: sourceDetail.trim() || undefined,
      leadStatus: effectiveStatus,
    }
    try {
      await upsert(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Lead anlegen</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>Name *</label>
            <input
              className="mock-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Max Mustermann"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>E-Mail</label>
            <input
              className="mock-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="max@beispiel.de"
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>Telefon</label>
            <input
              className="mock-input"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+49 123 456789"
            />
          </div>
          {openStages.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>Stage</label>
              <select className="mock-input" value={effectiveStatus} onChange={e => setStatus(e.target.value)}>
                {openStages.map(s => (
                  <option key={s.id} value={s.name}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>Quelle</label>
            <select className="mock-input" value={source} onChange={e => setSource(e.target.value as LeadSource)}>
              <option value="manual">Manuell</option>
              <option value="zoom">Zoom Webinar</option>
              <option value="generic">Web / Sonstiges</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-dim)', display: 'block', marginBottom: 5 }}>Quelle Detail</label>
            <input
              className="mock-input"
              value={sourceDetail}
              onChange={e => setSourceDetail(e.target.value)}
              placeholder="z.B. Empfehlung, Messe, Webinar-Titel…"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Speichern…' : 'Lead anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LeadsRoute ────────────────────────────────────────────────────────────────

export function LeadsRoute() {
  const [showCreate, setShowCreate] = useState(false)
  const isLoading   = useLeadsStore(s => s.isLoading)
  const totalLeads  = useLeadsStore(s => s.leads.length)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Leads.</h1>
          <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontWeight: 500 }}>{totalLeads} gesamt</span>
        </div>
      </div>

      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PhasenBoard workspaceId={workspaceId} onShowCreate={() => setShowCreate(true)} />
        </div>
      )}

      {showCreate && <CreateLeadModal workspaceId={workspaceId} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
