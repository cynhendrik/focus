import { useMemo } from 'react'
import { useCrmStore } from '@/store/crm.store'
import { useLeadsStore } from '@/store/leads.store'
import { useLeadStagesStore } from '@/store/lead-stages.store'
import { useUiStore } from '@/store/ui.store'
import type { FollowUp } from '@/types/crm.types'
import type { Lead, LeadStage } from '@/types/lead.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((d.getTime() - now.getTime()) / 86_400_000)
  if (diff < -1) return `${Math.abs(diff)}d überfällig`
  if (diff === -1) return 'Gestern fällig'
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  if (diff < 7) return `in ${diff} Tagen`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

const FALLBACK_STAGE_COLOR = '#94a3b8'

/** Resolve a lead's stage (leadStatus) against the workspace's custom stage
 *  definitions — keeps the inbox chips identical to the lead list and board. */
function resolveStage(leadStatus: string, stages: LeadStage[]): { label: string; color: string } {
  const def = stages.find(s => s.name === leadStatus)
  return { label: def?.label ?? leadStatus, color: def?.color || FALLBACK_STAGE_COLOR }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '20px 0 8px',
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-dim)' }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 7px',
        borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: 'var(--fg-dim)',
      }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function InboxRow({ followUp, lead, stages, isOverdue, openLead, onComplete }: {
  followUp: FollowUp
  lead: Lead | undefined
  stages: LeadStage[]
  isOverdue: boolean
  openLead: (id: string) => void
  onComplete: (f: FollowUp) => void
}) {
  const stage = lead ? resolveStage(lead.leadStatus, stages) : { label: '', color: FALLBACK_STAGE_COLOR }
  const stageColor = stage.color

  return (
    <div
      onClick={() => lead && openLead(lead.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '26px 36px 1fr auto',
        alignItems: 'center', gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        cursor: lead ? 'pointer' : 'default',
        transition: 'background 100ms, border-color 100ms',
        marginBottom: 6,
      }}
      onMouseEnter={e => {
        if (lead) {
          e.currentTarget.style.background = 'var(--surface-2)'
          e.currentTarget.style.borderColor = 'var(--border-strong)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--surface)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {/* Abhaken — erledigt den Follow-up (der Kern-Loop) */}
      <button
        onClick={e => { e.stopPropagation(); onComplete(followUp) }}
        title="Als erledigt markieren"
        aria-label="Follow-up erledigen"
        style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          border: '1.5px solid var(--border-strong)', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          transition: 'border-color 120ms, background 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ok)'; e.currentTarget.style.background = 'var(--ok)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'transparent' }}
      />

      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: isOverdue ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)',
        border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        color: isOverdue ? '#ef4444' : 'var(--fg-dim)',
        fontFamily: 'var(--font-mono)',
      }}>
        {lead ? initials(lead.name) : '?'}
      </div>

      {/* Content */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: isOverdue ? '#ef4444' : 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {followUp.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {lead && (
            <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 500 }}>
              {lead.name}
            </span>
          )}
          {lead?.companyName && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>· {lead.companyName}</span>
          )}
          {lead && (
            <span style={{
              fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
              background: `${stageColor}18`, color: stageColor, border: `1px solid ${stageColor}30`,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {stage.label}
            </span>
          )}
        </div>
      </div>

      {/* Due date */}
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
        color: isOverdue ? '#ef4444' : 'var(--fg-dim)',
        fontWeight: isOverdue ? 700 : 400,
        flexShrink: 0,
      }}>
        {followUp.dueDate ? fmtDate(followUp.dueDate) : '—'}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function LeverageInboxRoute() {
  const allFollowUps   = useCrmStore(s => s.allFollowUps)
  const upsertFollowUp = useCrmStore(s => s.upsert)
  const allLeads     = useLeadsStore(s => s.leads)
  const stages       = useLeadStagesStore(s => s.stages)
  const setAppView   = useUiStore(s => s.setAppView)
  const setLeadId    = useUiStore(s => s.setSelectedLeverageLeadId)

  const leadMap = useMemo(() => new Map(allLeads.map(l => [l.id, l])), [allLeads])

  const today = new Date().toLocaleDateString('sv')

  // Nur offene Follow-ups AN LEADS — Kunden-Follow-ups gehören nicht in den
  // Akquise-Inbox (früher tauchten sie als Geisterzeilen mit "?" auf).
  const openFollowUps = useMemo(() =>
    allFollowUps.filter(f => f.status === 'offen' && leadMap.has(f.customerId)),
    [allFollowUps, leadMap],
  )

  const completeFollowUp = (f: FollowUp) => {
    void upsertFollowUp({
      id: f.id, customerId: f.customerId, title: f.title,
      dueDate: f.dueDate, status: 'erledigt', priority: f.priority,
    })
  }

  const { overdue, dueToday, upcoming, noDue } = useMemo(() => {
    const overdue:   FollowUp[] = []
    const dueToday:  FollowUp[] = []
    const upcoming:  FollowUp[] = []
    const noDue:     FollowUp[] = []
    for (const f of openFollowUps) {
      if (!f.dueDate) { noDue.push(f); continue }
      if (f.dueDate < today)  { overdue.push(f); continue }
      if (f.dueDate === today) { dueToday.push(f); continue }
      upcoming.push(f)
    }
    overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    dueToday.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    return { overdue, dueToday, upcoming, noDue }
  }, [openFollowUps, today])

  const openLead = (id: string) => {
    setLeadId(id)
    setAppView('leverage_lead_detail')
  }

  const total = overdue.length + dueToday.length + upcoming.length + noDue.length

  return (
    <div className="main-inner" style={{ padding: '24px 28px 40px', overflowY: 'auto' }}>

      <div className="greeting" style={{ marginBottom: 20 }}>
        <h1 className="greeting-title">Inbox<em>.</em></h1>
        <div className="greeting-sub">
          <span>
            {total === 0
              ? 'Keine offenen Follow-Ups — alles erledigt.'
              : `${total} offene Follow-Ups`}
            {overdue.length > 0 && ` · ${overdue.length} überfällig`}
          </span>
        </div>
      </div>

      {total === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          fontSize: 13, color: 'var(--fg-dim)',
        }}>
          Keine offenen Follow-Ups — alles erledigt. 🎉
        </div>
      )}

      {overdue.length > 0 && (
        <>
          <SectionDivider label="Überfällig" count={overdue.length} />
          {overdue.map(f => (
            <InboxRow key={f.id} followUp={f} lead={leadMap.get(f.customerId)}
              stages={stages} isOverdue openLead={openLead} onComplete={completeFollowUp} />
          ))}
        </>
      )}

      {dueToday.length > 0 && (
        <>
          <SectionDivider label="Heute" count={dueToday.length} />
          {dueToday.map(f => (
            <InboxRow key={f.id} followUp={f} lead={leadMap.get(f.customerId)}
              stages={stages} isOverdue={false} openLead={openLead} onComplete={completeFollowUp} />
          ))}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionDivider label="Demnächst" count={upcoming.length} />
          {upcoming.map(f => (
            <InboxRow key={f.id} followUp={f} lead={leadMap.get(f.customerId)}
              stages={stages} isOverdue={false} openLead={openLead} onComplete={completeFollowUp} />
          ))}
        </>
      )}

      {noDue.length > 0 && (
        <>
          <SectionDivider label="Ohne Datum" count={noDue.length} />
          {noDue.map(f => (
            <InboxRow key={f.id} followUp={f} lead={leadMap.get(f.customerId)}
              stages={stages} isOverdue={false} openLead={openLead} onComplete={completeFollowUp} />
          ))}
        </>
      )}

    </div>
  )
}
