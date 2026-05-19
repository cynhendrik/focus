import { useState, useMemo } from 'react'
import { useLeadsStore } from '@/store/leads.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Lead, LeadSource, LeadStatus } from '@/types/lead.types'

type Tab = 'new' | 'phases' | 'reengage'

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

function SourceBadge({ source, detail }: { source: LeadSource; detail: string | null }) {
  const label = sourceLabel(source, detail)
  const isZoom = source === 'zoom'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: isZoom ? 'rgba(139,92,246,0.15)' : 'rgba(74,222,128,0.12)',
      color: isZoom ? '#a78bfa' : '#4ade80',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120,
    }}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const map: Record<LeadStatus, { label: string; bg: string; color: string }> = {
    new:           { label: 'Neu',     bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa' },
    attempted:     { label: 'Kontakt', bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
    warm:          { label: 'Warm',    bg: 'rgba(74,222,128,0.15)',  color: '#4ade80' },
    lost_reengage: { label: 'Lost',    bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  }
  const { label, bg, color } = map[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: bg, color }}>
      {label}
    </span>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }}
    />
  )
}

function NewInTab({ workspaceId }: { workspaceId: string }) {
  const allLeads = useLeadsStore(s => s.leads)
  const bulkUpdate = useLeadsStore(s => s.bulkUpdate)
  const leads = useMemo(() => allLeads.filter(l => l.leadStatus === 'new'), [allLeads])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleAll() {
    if (selected.size === leads.length && leads.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.map(l => l.id)))
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applyBulk(status: LeadStatus, reEngageDate?: string) {
    const ids = Array.from(selected)
    if (!ids.length) return
    await bulkUpdate({ ids, status, reEngageDate }, workspaceId)
    setSelected(new Set())
  }

  const allChecked = leads.length > 0 && selected.size === leads.length
  const someChecked = selected.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <Checkbox checked={allChecked} onChange={toggleAll} />
        {someChecked && (
          <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginRight: 4 }}>
            {selected.size} ausgewählt
          </span>
        )}
        {someChecked && (
          <>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => applyBulk('attempted')}
            >
              Follow-Up erstellen
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', color: '#4ade80' }}
              onClick={() => applyBulk('warm')}
            >
              Warm Lead
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', color: '#f87171' }}
              onClick={() => applyBulk('lost_reengage')}
            >
              Lost
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px', color: '#fbbf24' }}
              onClick={() => applyBulk('lost_reengage', todayPlus90())}
            >
              Re-Engage
            </button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
          + Lead
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
        {leads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
            Keine neuen Leads — Webhooks konfigurieren unter Settings → Integrationen
          </div>
        ) : (
          leads.map(lead => (
            <LeadRow
              key={lead.id}
              lead={lead}
              checked={selected.has(lead.id)}
              onToggle={() => toggle(lead.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function LeadRow({ lead, checked, onToggle }: { lead: Lead; checked: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 130px 80px 80px 100px',
        alignItems: 'center',
        gap: 8,
        padding: '9px 10px',
        borderRadius: 8,
        border: '1px solid transparent',
        borderBottom: '1px solid var(--border)',
        transition: 'background 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Checkbox checked={checked} onChange={onToggle} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {lead.name}
        </div>
        {lead.email && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {lead.email}
          </div>
        )}
      </div>
      <div><SourceBadge source={lead.leadSource} detail={lead.leadSourceDetail} /></div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Score: {lead.engagementScore}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{fmtDate(lead.createdAt)}</div>
      <div><StatusBadge status={lead.leadStatus} /></div>
    </div>
  )
}

function PhasesTab() {
  const allLeads = useLeadsStore(s => s.leads)
  const convertToClient = useLeadsStore(s => s.convertToClient)

  const attempted = useMemo(() => allLeads.filter(l => l.leadStatus === 'attempted'), [allLeads])
  const warm      = useMemo(() => allLeads.filter(l => l.leadStatus === 'warm'), [allLeads])
  const lost      = useMemo(() => allLeads.filter(l => l.leadStatus === 'lost_reengage'), [allLeads])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
      <PhaseGroup
        title="ATTEMPTED"
        color="#fbbf24"
        leads={attempted}
        renderRight={() => null}
      />
      <PhaseGroup
        title="WARM LEADS"
        color="#4ade80"
        leads={warm}
        renderRight={(lead) => (
          <button
            className="btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px', color: '#4ade80' }}
            onClick={() => convertToClient(lead.id)}
          >
            Zu Kunde machen
          </button>
        )}
      />
      <PhaseGroup
        title="LOST / RE-ENGAGE"
        color="#f87171"
        leads={lost}
        renderRight={() => null}
      />
      {attempted.length === 0 && warm.length === 0 && lost.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          Keine Leads in aktiven Phasen
        </div>
      )}
    </div>
  )
}

function PhaseGroup({
  title,
  color,
  leads,
  renderRight,
}: {
  title: string
  color: string
  leads: Lead[]
  renderRight: (lead: Lead) => React.ReactNode
}) {
  if (leads.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
        color, marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {title}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
          background: `${color}22`, color,
        }}>
          {leads.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {leads.map(lead => (
          <div key={lead.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{lead.name}</span>
              {lead.leadSourceDetail && (
                <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginLeft: 6 }}>
                  · {lead.leadSourceDetail}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)', flexShrink: 0 }}>
              {fmtDate(lead.createdAt)}
            </div>
            {renderRight(lead)}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReEngageTab({ workspaceId }: { workspaceId: string }) {
  const allLeads   = useLeadsStore(s => s.leads)
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
          Keine Re-Engage-Leads
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
              <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', flexShrink: 0 }}>
                {lead.reEngageDate ? fmtDate(lead.reEngageDate) : '—'}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexShrink: 0 }}>
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

export function LeadsRoute() {
  const [activeTab, setActiveTab] = useState<Tab>('new')
  const isLoading  = useLeadsStore(s => s.isLoading)
  const totalLeads = useLeadsStore(s => s.leads.length)
  const newCount   = useLeadsStore(s => s.leads.filter(l => l.leadStatus === 'new').length)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'new',      label: 'New In',     count: newCount },
    { id: 'phases',   label: 'Lead Phases'                 },
    { id: 'reengage', label: 'Re-Engage'                   },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
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
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 99,
                  background: activeTab === tab.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.08)',
                  color: activeTab === tab.id ? '#60a5fa' : 'var(--fg-dim)',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'new'      && <NewInTab    workspaceId={workspaceId} />}
          {activeTab === 'phases'   && <PhasesTab   />}
          {activeTab === 'reengage' && <ReEngageTab workspaceId={workspaceId} />}
        </div>
      )}
    </div>
  )
}
