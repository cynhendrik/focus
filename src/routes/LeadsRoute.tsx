import { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useLeadsStore } from '@/store/leads.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import { ActivitiesService } from '@/services/activities.service'
import type { Lead, LeadSource, LeadStatus, UpsertLeadPayload } from '@/types/lead.types'

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

const COLUMNS: { id: LeadStatus; label: string; hoverBg: string; dot: string }[] = [
  { id: 'new',       label: 'New In',    hoverBg: 'rgba(59,130,246,0.10)',  dot: '#60a5fa' },
  { id: 'attempted', label: 'Attempted', hoverBg: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  { id: 'warm',      label: 'Warm Lead', hoverBg: 'rgba(74,222,128,0.10)',  dot: '#4ade80' },
]

const SIDEBAR_LIMIT = 8

// ── Follow-Up Modal ───────────────────────────────────────────────────────────

function FollowUpModal({
  leads, workspaceId, onClose,
}: {
  leads: Lead[]
  workspaceId: string
  onClose: () => void
}) {
  const user = useAuthStore(s => s.user)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(tomorrow())
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await Promise.all(leads.map(lead =>
        ActivitiesService.create({
          workspaceId,
          createdBy: user?.id ?? '',
          accountId: lead.id,
          type: 'followup',
          title: title.trim(),
          dueAt: date || undefined,
          status: 'open',
          payload: JSON.stringify({ is_follow_up: true }),
        })
      ))
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

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
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
  menu, workspaceId, onClose, onFollowUp,
}: {
  menu: CtxMenu
  workspaceId: string
  onClose: () => void
  onFollowUp: (leads: Lead[]) => void
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
      {menu.lead.leadStatus !== 'warm' && (
        <CtxItem
          label="→ Warm Lead"
          color="var(--accent)"
          onClick={() => act(() => bulkUpdate({ ids: [menu.lead.id], status: 'warm' }, workspaceId))}
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
          bulkUpdate({ ids: [menu.lead.id], status: 'lost_reengage', reEngageDate: todayPlus(90) }, workspaceId)
        )}
      />
      <CtxItem
        label="Lost (6 Monate)"
        color="var(--fg-dim)"
        onClick={() => act(() =>
          bulkUpdate({ ids: [menu.lead.id], status: 'lost_reengage', reEngageDate: todayPlus(180) }, workspaceId)
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

function LeadCard({ lead, selected, onToggle, onContext, onWarm, isDragging }: {
  lead: Lead
  selected?: boolean
  onToggle?: () => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm?: () => void
  isDragging?: boolean
}) {
  const isWebinar = lead.leadSource === 'zoom'
  const showWarmBtn = isWebinar && lead.leadStatus !== 'warm' && onWarm

  return (
    <div
      className="task-card"
      data-dragging={isDragging ? 'true' : undefined}
      onClick={e => { e.stopPropagation(); onToggle?.() }}
      onContextMenu={e => { e.preventDefault(); onContext(e, lead) }}
      style={{
        marginBottom: 6, cursor: 'grab', userSelect: 'none',
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
        </div>
        {selected && (
          <div style={{
            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M1 3L3 5L7 1" stroke="var(--accent-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 10, padding: '1px 7px', borderRadius: 99, fontWeight: 700,
          background: isWebinar ? 'rgba(139,92,246,0.15)' : 'var(--surface-2)',
          color: isWebinar ? '#a78bfa' : 'var(--fg-dim)',
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
            marginTop: 8, width: '100%', padding: '4px 0',
            borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
            background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            color: 'var(--accent)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 4,
          }}
        >
          ↑ Warm Lead
        </button>
      )}
    </div>
  )
}

// ── Draggable wrapper ─────────────────────────────────────────────────────────

function DraggableLeadCard({ lead, selected, onToggle, onContext, onWarm }: {
  lead: Lead
  selected: boolean
  onToggle: () => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
  onWarm?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <LeadCard lead={lead} selected={selected} onToggle={onToggle} onContext={onContext} onWarm={onWarm} isDragging={isDragging} />
    </div>
  )
}

// ── Droppable column ──────────────────────────────────────────────────────────

function LeadColumn({ col, leads, selected, onToggle, onContext, onWarm }: {
  col: typeof COLUMNS[number]
  leads: Lead[]
  selected: Set<string>
  onToggle: (id: string) => void
  onContext: (e: React.MouseEvent, lead: Lead) => void
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
        background: isOver ? col.hoverBg : 'transparent',
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
            onWarm={() => onWarm(lead.id)}
          />
        ))}
        {leads.length === 0 && (
          <div style={{ border: '1.5px dashed var(--border)', borderRadius: 9, padding: 16, textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Leer</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Re-Engage Sidebar ─────────────────────────────────────────────────────────

function ReEngageSidebar({ leads }: { leads: Lead[] }) {
  const [expanded, setExpanded] = useState(false)

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
        borderBottom: '1px solid rgba(74,222,128,0.15)',
        background: 'linear-gradient(to bottom, rgba(74,222,128,0.04), transparent)',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#4ade80',
          boxShadow: '0 0 6px rgba(74,222,128,0.7)',
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
                      background: 'linear-gradient(to bottom, rgba(74,222,128,0.35), rgba(74,222,128,0.08))',
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

function PhasenBoard({ workspaceId, onShowCreate }: { workspaceId: string; onShowCreate: () => void }) {
  const allLeads = useLeadsStore(s => s.leads)
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const deleteLead = useLeadsStore(s => s.deleteLead)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [followUpLeads, setFollowUpLeads] = useState<Lead[] | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const boardLeads = useMemo(
    () => allLeads.filter(l => l.leadStatus === 'new' || l.leadStatus === 'attempted' || l.leadStatus === 'warm'),
    [allLeads],
  )

  const reEngageLeads = useMemo(
    () => allLeads.filter(l => l.reEngageDate != null),
    [allLeads],
  )

  const leadsForCol = (status: LeadStatus) => boardLeads.filter(l => l.leadStatus === status)

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
    const newStatus = e.over.id as LeadStatus
    const lead = boardLeads.find(l => l.id === e.active.id)
    if (lead && lead.leadStatus !== newStatus) {
      bulkUpdate({ ids: [lead.id], status: newStatus }, workspaceId)
    }
  }

  const handleContext = (e: React.MouseEvent, lead: Lead) => {
    setCtxMenu({ lead, x: e.clientX, y: e.clientY })
  }

  const handleWarm = (id: string) => {
    bulkUpdate({ ids: [id], status: 'warm' }, workspaceId)
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
            Karte anklicken zum Auswählen · Ziehen zum Verschieben · Rechtsklick für Aktionen
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onShowCreate}>
          + Lead
        </button>
      </div>

      {/* Board + Sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
            {COLUMNS.map(col => (
              <LeadColumn
                key={col.id}
                col={col}
                leads={leadsForCol(col.id)}
                selected={selected}
                onToggle={toggleSelect}
                onContext={handleContext}
                onWarm={handleWarm}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead
              ? <LeadCard lead={activeLead} onContext={() => {}} isDragging />
              : null}
          </DragOverlay>
        </DndContext>

        <ReEngageSidebar leads={reEngageLeads} />
      </div>

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          workspaceId={workspaceId}
          onClose={() => setCtxMenu(null)}
          onFollowUp={leads => { setCtxMenu(null); setFollowUpLeads(leads) }}
        />
      )}

      {followUpLeads && (
        <FollowUpModal
          leads={followUpLeads}
          workspaceId={workspaceId}
          onClose={() => setFollowUpLeads(null)}
        />
      )}
    </>
  )
}

// ── Create Lead Modal ─────────────────────────────────────────────────────────

function CreateLeadModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const upsert = useLeadsStore(s => s.upsert)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState<LeadSource>('manual')
  const [sourceDetail, setSourceDetail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const payload: UpsertLeadPayload = {
      workspaceId,
      name: name.trim(),
      email: email.trim() || undefined,
      leadSource: source,
      leadSourceDetail: sourceDetail.trim() || undefined,
      leadStatus: 'new',
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
