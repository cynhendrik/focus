import { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useLeadsStore } from '@/store/leads.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Lead, LeadSource, LeadStatus, UpsertLeadPayload } from '@/types/lead.types'

type Tab = 'phasen' | 'reengage'

// ── helpers ──────────────────────────────────────────────────────────────────

function todayPlus90(): string {
  const d = new Date()
  d.setDate(d.getDate() + 90)
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

// ── Board columns config ──────────────────────────────────────────────────────

const COLUMNS: { id: LeadStatus; label: string; color: string; dot: string }[] = [
  { id: 'new',      label: 'New In',     color: 'rgba(59,130,246,0.12)',  dot: '#60a5fa' },
  { id: 'attempted', label: 'Attempted', color: 'rgba(251,191,36,0.10)',  dot: '#fbbf24' },
  { id: 'warm',     label: 'Warm Lead',  color: 'rgba(74,222,128,0.10)', dot: '#4ade80' },
]

// ── Context Menu ──────────────────────────────────────────────────────────────

interface CtxMenu { lead: Lead; x: number; y: number }

function ContextMenu({
  menu, onClose, workspaceId,
}: {
  menu: CtxMenu
  onClose: () => void
  workspaceId: string
}) {
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const convertToClient = useLeadsStore(s => s.convertToClient)
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

  const action = (fn: () => void) => { fn(); onClose() }

  const items: { label: string; color?: string; onClick: () => void }[] = [
    {
      label: 'Attempted → kontaktiert',
      onClick: () => action(() => bulkUpdate({ ids: [menu.lead.id], status: 'attempted' }, workspaceId)),
    },
    {
      label: 'Warm Lead',
      color: '#4ade80',
      onClick: () => action(() => bulkUpdate({ ids: [menu.lead.id], status: 'warm' }, workspaceId)),
    },
    {
      label: 'Lost · Re-Engage in 90 Tagen',
      color: '#f87171',
      onClick: () => action(() => bulkUpdate({ ids: [menu.lead.id], status: 'lost_reengage', reEngageDate: todayPlus90() }, workspaceId)),
    },
    ...(menu.lead.leadStatus === 'warm' ? [{
      label: 'Zu Kunde machen ✓',
      color: '#4ade80',
      onClick: () => action(() => convertToClient(menu.lead.id)),
    }] : []),
  ].filter(item => {
    // hide the current status action
    if (item.label.startsWith('Attempted') && menu.lead.leadStatus === 'attempted') return false
    if (item.label.startsWith('Warm Lead') && menu.lead.leadStatus === 'warm') return false
    return true
  })

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top: menu.y, left: menu.x, zIndex: 2000,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '4px 0',
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        minWidth: 220,
      }}
    >
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--fg-dim)', fontWeight: 600 }}>
        {menu.lead.name}
      </div>
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 0 4px' }} />
      {items.map(item => (
        <button
          key={item.label}
          onClick={item.onClick}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '7px 12px', fontSize: 12,
            color: item.color ?? 'var(--fg)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, onContext, isDragging }: {
  lead: Lead
  onContext: (e: React.MouseEvent, lead: Lead) => void
  isDragging?: boolean
}) {
  return (
    <div
      className="task-card"
      data-dragging={isDragging ? 'true' : undefined}
      onContextMenu={e => { e.preventDefault(); onContext(e, lead) }}
      style={{ marginBottom: 6, cursor: 'grab', userSelect: 'none' }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>
        {lead.name}
      </div>
      {lead.email && (
        <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.email}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 10, padding: '1px 7px', borderRadius: 99,
          background: lead.leadSource === 'zoom' ? 'rgba(139,92,246,0.15)' : 'rgba(74,222,128,0.12)',
          color: lead.leadSource === 'zoom' ? '#a78bfa' : '#4ade80',
          fontWeight: 700,
        }}>
          {sourceLabel(lead.leadSource, lead.leadSourceDetail)}
        </span>
        {lead.engagementScore > 0 && (
          <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {lead.engagementScore}p
          </span>
        )}
      </div>
    </div>
  )
}

// ── Draggable wrapper ─────────────────────────────────────────────────────────

function DraggableLeadCard({ lead, onContext }: {
  lead: Lead
  onContext: (e: React.MouseEvent, lead: Lead) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1 }}>
      <LeadCard lead={lead} onContext={onContext} isDragging={isDragging} />
    </div>
  )
}

// ── Droppable column ──────────────────────────────────────────────────────────

function LeadColumn({ col, leads, onContext }: {
  col: typeof COLUMNS[number]
  leads: Lead[]
  onContext: (e: React.MouseEvent, lead: Lead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1, minWidth: 200,
        borderRight: '1px solid var(--border)',
        padding: '14px 12px',
        background: isOver ? col.color : 'transparent',
        transition: 'background 150ms',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>
          {col.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 'auto' }}>{leads.length}</span>
      </div>

      <div style={{ flex: 1 }}>
        {leads.map(lead => (
          <DraggableLeadCard key={lead.id} lead={lead} onContext={onContext} />
        ))}
        {leads.length === 0 && (
          <div style={{
            border: '1.5px dashed rgba(255,255,255,0.08)',
            borderRadius: 9, padding: 16, textAlign: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Leer</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Phasen Board ──────────────────────────────────────────────────────────────

function PhasenBoard({ workspaceId, onShowCreate }: { workspaceId: string; onShowCreate: () => void }) {
  const allLeads = useLeadsStore(s => s.leads)
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const boardLeads = useMemo(
    () => allLeads.filter(l => l.leadStatus === 'new' || l.leadStatus === 'attempted' || l.leadStatus === 'warm'),
    [allLeads],
  )

  const leadsForCol = (status: LeadStatus) => boardLeads.filter(l => l.leadStatus === status)

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

  return (
    <>
      <div style={{ padding: '10px 20px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={onShowCreate}>
          + Lead
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'auto' }}>
          {COLUMNS.map(col => (
            <LeadColumn
              key={col.id}
              col={col}
              leads={leadsForCol(col.id)}
              onContext={handleContext}
            />
          ))}
        </div>
        <DragOverlay>
          {activeLead
            ? <LeadCard lead={activeLead} onContext={() => {}} isDragging />
            : null}
        </DragOverlay>
      </DndContext>

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          workspaceId={workspaceId}
        />
      )}
    </>
  )
}

// ── Re-Engage Tab ─────────────────────────────────────────────────────────────

function ReEngageTab({ workspaceId }: { workspaceId: string }) {
  const allLeads = useLeadsStore(s => s.leads)
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)

  const leads = useMemo(
    () => allLeads
      .filter(l => l.reEngageDate != null)
      .sort((a, b) => {
        const da = a.reEngageDate ?? ''
        const db = b.reEngageDate ?? ''
        return da < db ? -1 : da > db ? 1 : 0
      }),
    [allLeads],
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
      {leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          Keine Re-Engage-Leads — Leads werden hier eingetragen wenn du "Lost · Re-Engage" setzt.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {leads.map(lead => (
            <div key={lead.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 130px 200px',
              alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lead.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                  {sourceLabel(lead.leadSource, lead.leadSourceDetail)} · Score: {lead.engagementScore}
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>
                {lead.reEngageDate ? fmtDate(lead.reEngageDate) : '—'}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => bulkUpdate({ ids: [lead.id], status: 'attempted' }, workspaceId)}
                >
                  Follow-Up jetzt
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: '4px 10px', color: '#f87171' }}
                  onClick={() => bulkUpdate({ ids: [lead.id], status: 'lost_reengage', reEngageDate: todayPlus90() }, workspaceId)}
                >
                  +90 Tage
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Speichern…' : 'Lead anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LeadsRoute ────────────────────────────────────────────────────────────────

export function LeadsRoute() {
  const [activeTab, setActiveTab] = useState<Tab>('phasen')
  const [showCreate, setShowCreate] = useState(false)
  const isLoading   = useLeadsStore(s => s.isLoading)
  const totalLeads  = useLeadsStore(s => s.leads.length)
  const reEngageCount = useLeadsStore(s => s.leads.filter(l => l.reEngageDate != null).length)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'phasen',   label: 'Phasen'     },
    { id: 'reengage', label: 'Re-Engage', count: reEngageCount },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Leads.</h1>
          <span style={{ fontSize: 12, color: 'var(--fg-dim)', fontWeight: 500 }}>{totalLeads} gesamt</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: 13, fontWeight: 600,
                padding: '8px 14px', borderRadius: '8px 8px 0 0',
                border: 'none',
                background: activeTab === tab.id ? 'var(--surface)' : 'transparent',
                color: activeTab === tab.id ? 'var(--fg)' : 'var(--fg-dim)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color 120ms, background 120ms',
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                  background: 'rgba(248,113,113,0.2)', color: '#f87171',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'phasen' && (
            <PhasenBoard workspaceId={workspaceId} onShowCreate={() => setShowCreate(true)} />
          )}
          {activeTab === 'reengage' && <ReEngageTab workspaceId={workspaceId} />}
        </div>
      )}

      {showCreate && <CreateLeadModal workspaceId={workspaceId} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
