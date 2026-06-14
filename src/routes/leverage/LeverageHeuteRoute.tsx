import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useLeadsStore } from '@/store/leads.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useLeadsStore as useLeadsStoreForIds } from '@/store/leads.store'

// ── Sub-components ─────────────────────────────────────────────────────────────

function HeuteCard({ title, count, accent, empty, children, action }: {
  title: string
  count: number
  accent?: string
  empty: string
  children?: ReactNode
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '18px 20px',
      borderTop: `3px solid ${accent ?? 'var(--border)'}`,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--fg-dim)',
        }}>
          {title}
        </span>
        <span style={{
          fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-mono)',
          color: count > 0 ? (accent ?? 'var(--fg)') : 'var(--fg-dim)',
          lineHeight: 1,
        }}>
          {count}
        </span>
      </div>

      {count === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--fg-dim)', padding: '8px 0', flex: 1 }}>
          {empty}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
          {children}
        </div>
      )}

      {action && count > 0 && (
        <button
          onClick={action.onClick}
          className="btn-ghost"
          style={{ marginTop: 12, fontSize: 11, padding: '5px 0', width: '100%', textAlign: 'center' }}
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}

function HeuteRow({ label, sub, urgent, onClick }: {
  label: string
  sub?: string
  urgent?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 8px', borderRadius: 8,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 100ms',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        fontSize: 12, fontWeight: 600,
        color: urgent ? '#f87171' : 'var(--fg)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </div>
      {sub && (
        <div style={{
          fontSize: 10.5, color: 'var(--fg-dim)', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Main route ─────────────────────────────────────────────────────────────────

export function LeverageHeuteRoute() {
  const allLeads     = useLeadsStore(s => s.leads)
  const emails       = useMailStore(s => s.emails)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const setAppView   = useUiStore(s => s.setAppView)
  const setLeadId    = useUiStore(s => s.setSelectedLeverageLeadId)

  const leadIds = useLeadsStoreForIds(s => new Set(s.leads.map(l => l.id)))

  const today = new Date().toLocaleDateString('sv')

  const dueFollowUps = useMemo(() =>
    allFollowUps
      .filter(f => f.status === 'offen' && f.dueDate <= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [allFollowUps, today],
  )

  const reEngageDue = useMemo(() =>
    allLeads
      .filter(l => l.reEngageDate && l.reEngageDate <= today)
      .sort((a, b) => (a.reEngageDate ?? '') < (b.reEngageDate ?? '') ? -1 : 1),
    [allLeads, today],
  )

  const unmatchedMails = useMemo(() =>
    emails
      .filter(e => !e.isRead && (!e.customerId || !leadIds.has(e.customerId)))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [emails, leadIds],
  )

  const coldLeads = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString()
    return allLeads.filter(l =>
      !l.reEngageDate &&
      l.lastActivityAt != null &&
      l.lastActivityAt < cutoffStr,
    )
  }, [allLeads])

  const openLead = (id: string) => {
    setLeadId(id)
    setAppView('leverage_lead_detail')
  }

  const daysSince = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

  return (
    <div className="main-inner" style={{ padding: '28px 28px 40px', overflowY: 'auto' }}>

      <div className="greeting" style={{ marginBottom: 28 }}>
        <h1 className="greeting-title">Leverage<em>.</em></h1>
        <div className="greeting-sub">
          <span>Dein Sales-Cockpit</span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16,
        maxWidth: 860,
      }}>

        {/* Follow-Ups fällig */}
        <HeuteCard
          title="Follow-Ups fällig"
          count={dueFollowUps.length}
          accent={dueFollowUps.length > 0 ? '#f87171' : undefined}
          empty="Keine fälligen Follow-Ups — alles erledigt."
        >
          {dueFollowUps.slice(0, 5).map(f => (
            <HeuteRow
              key={f.id}
              label={f.title}
              sub={f.dueDate < today ? `Überfällig seit ${f.dueDate}` : 'Heute fällig'}
              urgent={f.dueDate < today}
            />
          ))}
        </HeuteCard>

        {/* Neue Eingänge */}
        <HeuteCard
          title="Neue Eingänge"
          count={unmatchedMails.length}
          accent={unmatchedMails.length > 0 ? 'var(--accent)' : undefined}
          empty="Keine unbekannten Absender in der Inbox."
          action={{ label: 'Mail öffnen', onClick: () => setAppView('leverage_mail') }}
        >
          {unmatchedMails.slice(0, 5).map(m => (
            <HeuteRow
              key={m.id}
              label={m.fromName || m.fromAddr}
              sub={m.subject || '(ohne Betreff)'}
            />
          ))}
        </HeuteCard>

        {/* Re-Engage fällig */}
        <HeuteCard
          title="Re-Engage fällig"
          count={reEngageDue.length}
          accent={reEngageDue.length > 0 ? '#fbbf24' : undefined}
          empty="Kein Re-Engage heute fällig."
          action={reEngageDue.length > 0
            ? { label: 'Alle Leads anzeigen', onClick: () => setAppView('leverage_leads') }
            : undefined}
        >
          {reEngageDue.slice(0, 5).map(l => (
            <HeuteRow
              key={l.id}
              label={l.name}
              sub={l.email ?? undefined}
              onClick={() => openLead(l.id)}
            />
          ))}
        </HeuteCard>

        {/* Werden kalt */}
        <HeuteCard
          title="Werden kalt"
          count={coldLeads.length}
          accent={coldLeads.length > 0 ? '#fb923c' : undefined}
          empty="Alle Leads haben aktuelle Aktivität."
          action={coldLeads.length > 0
            ? { label: 'Leads öffnen', onClick: () => setAppView('leverage_leads') }
            : undefined}
        >
          {coldLeads.slice(0, 5).map(l => (
            <HeuteRow
              key={l.id}
              label={l.name}
              sub={`Keine Aktivität seit ${daysSince(l.lastActivityAt!)} Tagen`}
              urgent={daysSince(l.lastActivityAt!) > 14}
              onClick={() => openLead(l.id)}
            />
          ))}
        </HeuteCard>

      </div>
    </div>
  )
}
