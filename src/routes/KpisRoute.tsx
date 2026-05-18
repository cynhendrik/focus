import { useEffect } from 'react'
import { useCrmStore } from '@/store/crm.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useUiStore } from '@/store/ui.store'
import type { FollowUp } from '@/types/crm.types'

const INACTIVITY_DAYS = 14

function daysAgo(iso: string | null): number {
  if (!iso) return 9999
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

type Urgency = 'overdue' | 'today' | 'week' | 'later'

function urgency(fu: FollowUp): Urgency {
  const today = new Date().toISOString().slice(0, 10)
  if (fu.dueDate < today) return 'overdue'
  if (fu.dueDate === today) return 'today'
  const end = new Date()
  end.setDate(end.getDate() + (7 - end.getDay()))
  if (new Date(fu.dueDate) <= end) return 'week'
  return 'later'
}

function formatDue(iso: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.ceil((new Date(iso).getTime() - new Date(today).getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d überfällig`
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Überfällig',
  today:   'Heute',
  week:    'Diese Woche',
  later:   'Später',
}

const URGENCY_COLOR: Record<Urgency, string> = {
  overdue: 'var(--danger)',
  today:   'var(--warn)',
  week:    'var(--accent)',
  later:   'var(--fg-muted)',
}

const URGENCY_ORDER: Urgency[] = ['overdue', 'today', 'week', 'later']

function FollowUpCard({ fu, customerName, onDone, onDelete, onOpenCustomer }: {
  fu: FollowUp
  customerName: string
  onDone: () => void
  onDelete: () => void
  onOpenCustomer: () => void
}) {
  const u = urgency(fu)
  return (
    <div className="task-card group" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{fu.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={onOpenCustomer}
              style={{
                fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink)',
                background: 'var(--accent-soft)', borderRadius: 99, padding: '2px 8px', cursor: 'pointer',
              }}
            >{customerName}</button>
            <span style={{ fontSize: 11, fontWeight: 600, color: URGENCY_COLOR[u] }}>
              {formatDue(fu.dueDate)}
            </span>
            {fu.priority === 'high' && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--accent-ink)',
                background: 'var(--accent)', borderRadius: 99, padding: '2px 7px',
              }}>Priorität</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={onDone}
            title="Erledigt"
            style={{
              width: 26, height: 26, borderRadius: 8, border: '1.5px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: 'var(--fg-muted)', cursor: 'pointer', background: 'transparent',
            }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent)' }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border-strong)'; el.style.color = 'var(--fg-muted)' }}
          >✓</button>
          <button
            onClick={onDelete}
            className="task-delete"
            style={{
              width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, color: 'var(--fg-dim)', cursor: 'pointer',
              opacity: 0, transition: 'opacity 180ms', background: 'transparent',
            }}
          >✕</button>
        </div>
      </div>
    </div>
  )
}

export function KpisRoute() {
  const workspaceId  = useWorkspaceStore(s => s.activeWorkspaceId)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const isLoading    = useCrmStore(s => s.isLoading)
  const loadAll      = useCrmStore(s => s.loadAll)
  const remove       = useCrmStore(s => s.remove)
  const upsert       = useCrmStore(s => s.upsert)
  const customers    = useCustomersStore(s => s.customers)
  const setSelected  = useUiStore(s => s.setSelectedCustomer)
  const setAppView   = useUiStore(s => s.setAppView)

  useEffect(() => {
    if (workspaceId) loadAll(workspaceId)
  }, [workspaceId])

  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? 'Unbekannt'

  const openCustomer = (customerId: string) => {
    setSelected(customerId)
    setAppView('clients')
  }

  const handleDone = async (fu: FollowUp) => {
    await upsert({ id: fu.id, customerId: fu.customerId, title: fu.title, dueDate: fu.dueDate, status: 'erledigt', priority: fu.priority })
    if (workspaceId) loadAll(workspaceId)
  }

  const handleDelete = async (id: string) => {
    await remove(id)
    if (workspaceId) loadAll(workspaceId)
  }

  const activityMap = new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt]))
  const inactiveCustomers = customers.filter(c => daysAgo(activityMap.get(c.id) ?? null) >= INACTIVITY_DAYS)

  const overdueCount = allFollowUps.filter(f => urgency(f) === 'overdue').length
  const todayCount   = allFollowUps.filter(f => urgency(f) === 'today').length
  const weekCount    = allFollowUps.filter(f => urgency(f) === 'week').length

  return (
    <div className="main-inner">
      <div className="greeting">
        <h1 className="greeting-title">Follow-Ups<em>.</em></h1>
        <div className="greeting-sub">
          {overdueCount > 0 && (
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{overdueCount} überfällig</span>
          )}
          <span>{todayCount} heute · {weekCount} diese Woche · {allFollowUps.length} gesamt</span>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Lädt…
        </div>
      ) : (
        <>
          {URGENCY_ORDER.map(u => {
            const items = allFollowUps.filter(f => urgency(f) === u)
            if (items.length === 0) return null
            return (
              <div key={u} style={{ marginBottom: 28 }}>
                <div className="section-head" style={{ marginTop: 0, marginBottom: 12 }}>
                  <h2 style={{ color: URGENCY_COLOR[u] }}>{URGENCY_LABEL[u]}</h2>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map(fu => (
                    <FollowUpCard
                      key={fu.id}
                      fu={fu}
                      customerName={customerName(fu.customerId)}
                      onDone={() => handleDone(fu)}
                      onDelete={() => handleDelete(fu.id)}
                      onOpenCustomer={() => openCustomer(fu.customerId)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {allFollowUps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)', fontSize: 13 }}>
              Keine offenen Follow-Ups — alles erledigt.
            </div>
          )}

          {inactiveCustomers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="section-head" style={{ marginBottom: 12 }}>
                <h2>
                  Kunden ohne Kontakt
                  <span style={{ color: 'var(--fg-dim)', fontWeight: 400, fontSize: 13, marginLeft: 6 }}>
                    ({INACTIVITY_DAYS}+ Tage)
                  </span>
                </h2>
                <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{inactiveCustomers.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {inactiveCustomers.map(c => {
                  const last = activityMap.get(c.id) ?? null
                  const days = daysAgo(last)
                  return (
                    <div key={c.id} className="task-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginLeft: 10 }}>
                          {last ? `Letzter Kontakt: vor ${days} Tagen` : 'Noch kein Kontakt erfasst'}
                        </span>
                      </div>
                      <button
                        onClick={() => openCustomer(c.id)}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
                      >
                        + Follow-Up
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      <style>{`.task-card:hover .task-delete { opacity: 1 !important; }`}</style>
    </div>
  )
}
