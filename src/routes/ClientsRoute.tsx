import { useEffect, useState, useMemo } from 'react'
import { UserPlus, AlertTriangle, Clock, Activity, Pin, PinOff, Sparkles, ArrowRight } from 'lucide-react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { useClientPickerStore } from '@/store/client-picker.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { CustomerRoute } from './CustomerRoute'
import { StaggerList } from '@/components/ui/StaggerList'
import { INDUSTRIES, type IndustryProfile } from '@/components/onboarding/OnboardingWizard'
import type { Customer, CustomerStatus } from '@/types/customer.types'
import type { Todo } from '@/types/todo.types'
import type { CustomerTab } from '@/store/ui.store'

// ── helpers ──────────────────────────────────────────────────────────────────

function isToday(iso: string) {
  const d = new Date(iso), n = new Date()
  return d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate()
}

function isOverdue(iso: string) {
  const d = new Date(iso); d.setHours(23, 59, 59, 999)
  return d < new Date()
}

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Heute'
  if (d === 1) return 'Gestern'
  if (d < 7)  return `vor ${d}T`
  if (d < 30) return `vor ${Math.floor(d / 7)}W`
  return `vor ${Math.floor(d / 30)}M`
}

function overdueLabel(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d === 1 ? 'Gestern' : `Seit ${d}T`
}

const STATUS_TONE: Record<CustomerStatus, string> = {
  aktiv: 'ok', lead: 'accent', inaktiv: 'warn', lost: 'bad',
}
const STATUS_LABEL: Record<CustomerStatus, string> = {
  aktiv: 'Aktiv', lead: 'Lead', inaktiv: 'Inaktiv', lost: 'Lost',
}

// ── Quick Strip ───────────────────────────────────────────────────────────────

function ClientChip({
  customer, pinned, onOpen, onTogglePin,
}: {
  customer: Customer
  pinned: boolean
  onOpen: () => void
  onTogglePin: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 12px 5px 7px', borderRadius: 99,
          background: 'var(--surface)',
          border: `1px solid ${pinned ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
          color: 'var(--fg)', transition: 'border-color 150ms, box-shadow 150ms',
          boxShadow: pinned ? '0 0 0 2px oklch(92% 0.2 125 / 0.15)' : 'none',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: pinned ? 'var(--accent)' : 'var(--surface-2)',
          color: pinned ? 'var(--accent-ink)' : 'var(--fg-muted)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700,
          transition: 'background 150ms, color 150ms',
        }}>
          {customer.name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
        </div>
        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customer.name.split(' ')[0]}
        </span>
      </button>

      {/* Pin/Unpin button — appears on hover */}
      {hovered && (
        <button
          onClick={onTogglePin}
          title={pinned ? 'Entpinnen' : 'Anpinnen'}
          style={{
            position: 'absolute', top: -7, right: -7,
            width: 18, height: 18, borderRadius: '50%',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 1,
            color: pinned ? 'var(--accent)' : 'var(--fg-dim)',
          }}
        >
          {pinned ? <PinOff size={9} /> : <Pin size={9} />}
        </button>
      )}
    </div>
  )
}

function QuickStrip({
  customers, pinnedIds, recentClients, onOpen, onTogglePin,
}: {
  customers: Customer[]
  pinnedIds: string[]
  recentClients: Customer[]
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
}) {
  const pinned = useMemo(
    () => pinnedIds.map(id => customers.find(c => c.id === id)).filter(Boolean) as Customer[],
    [customers, pinnedIds],
  )
  const recent = useMemo(
    () => recentClients.filter(c => !pinnedIds.includes(c.id)).slice(0, 6),
    [recentClients, pinnedIds],
  )
  const strip = [...pinned, ...recent].slice(0, 8)

  if (strip.length === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 0', overflowX: 'auto',
    }}>
      <span style={{
        fontSize: 11, color: 'var(--fg-dim)', fontWeight: 500,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)', flexShrink: 0,
        userSelect: 'none',
      }}>
        Zuletzt
      </span>
      <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
      {strip.map(c => (
        <ClientChip
          key={c.id}
          customer={c}
          pinned={pinnedIds.includes(c.id)}
          onOpen={() => onOpen(c.id)}
          onTogglePin={(e) => { e.stopPropagation(); onTogglePin(c.id) }}
        />
      ))}
    </div>
  )
}

// ── Board section card ────────────────────────────────────────────────────────

function SectionCard({
  title, icon, count, empty, children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  empty?: string
  children?: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '15px 20px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--fg-muted)', display: 'flex' }}>{icon}</span>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h3>
        </div>
        {count !== undefined && count > 0 && (
          <span className="chip">{count}</span>
        )}
      </div>
      <div style={{ padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {children ?? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--fg-dim)', fontSize: 12 }}>
            {empty}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Deadline row ──────────────────────────────────────────────────────────────

function DeadlineRow({ todo, name, tone, label, onClick }: {
  todo: Todo; name: string; tone: 'overdue' | 'today'; label: string; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        transition: 'opacity 100ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.72')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: tone === 'overdue' ? 'oklch(72% 0.18 25 / 0.12)' : 'oklch(85% 0.18 90 / 0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {tone === 'overdue'
          ? <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />
          : <Clock size={12} style={{ color: 'var(--warn)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {todo.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 1 }}>{name}</div>
      </div>
      <span className="chip" data-tone={tone === 'overdue' ? 'bad' : 'warn'} style={{ fontSize: 10, flexShrink: 0 }}>
        {label}
      </span>
    </div>
  )
}

// ── Client row ────────────────────────────────────────────────────────────────

function ClientRow({ customer, lastAct, tab, onClick }: {
  customer: Customer; lastAct: string; tab: CustomerTab; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 8px', borderRadius: 10, cursor: 'pointer',
        transition: 'background 80ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)',
      }}>
        {customer.name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customer.name}
        </div>
        {customer.company && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{customer.company}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
          {relTime(lastAct)}
        </span>
        <span className="chip" data-tone={STATUS_TONE[customer.status]} style={{ fontSize: 10 }}>
          {STATUS_LABEL[customer.status]}
        </span>
      </div>
    </div>
  )
}

// ── Client Board ──────────────────────────────────────────────────────────────

function ClientBoard() {
  const customers      = useCustomersStore(s => s.customers)
  const upsertCustomer = useCustomersStore(s => s.upsert)
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const allTodos       = useTodosStore(s => s.allTodos)
  const lastActivity   = useCrmStore(s => s.lastActivity)
  const pinnedIds      = useClientPickerStore(s => s.pinnedIds)
  const togglePin      = useClientPickerStore(s => s.togglePin)
  const [showModal, setShowModal] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)

  const loadSampleData = async (ind: IndustryProfile) => {
    setLoadingSample(true)
    try {
      for (const c of ind.sampleCustomers) {
        await upsertCustomer({
          name: c.name, company: c.company, email: c.email, phone: c.phone,
          city: c.city, status: c.status, priority: c.priority,
          industry: c.industry, goals: c.goals, tags: [],
        })
      }
    } catch (e) {
      console.error('Failed to load sample customers', e)
    } finally {
      setLoadingSample(false)
    }
  }

  const activityMap = useMemo(
    () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
    [lastActivity],
  )
  const customerMap = useMemo(
    () => new Map(customers.map(c => [c.id, c])),
    [customers],
  )

  const activeCount  = useMemo(() => customers.filter(c => c.status === 'aktiv').length, [customers])
  const todayTodos   = useMemo(
    () => allTodos.filter(t => t.dueDate && isToday(t.dueDate) && t.status !== 'done'),
    [allTodos],
  )
  const overdueTodos = useMemo(
    () => allTodos.filter(t => t.dueDate && isOverdue(t.dueDate) && !isToday(t.dueDate) && t.status !== 'done'),
    [allTodos],
  )

  const deadlineItems = useMemo(() => [
    ...overdueTodos.map(t => ({ todo: t, tone: 'overdue' as const, label: overdueLabel(t.dueDate!) })),
    ...todayTodos.map(t => ({ todo: t, tone: 'today' as const, label: 'Heute' })),
  ], [overdueTodos, todayTodos])

  // Risk: aktiv but no contact for 45+ days, or inaktiv
  const riskClients = useMemo(() => {
    const cutoff = Date.now() - 45 * 86400000
    return customers
      .filter(c => {
        const t = new Date(activityMap.get(c.id) ?? c.updatedAt).getTime()
        return (c.status === 'aktiv' && t < cutoff) || c.status === 'inaktiv'
      })
      .sort((a, b) => {
        const aT = new Date(activityMap.get(a.id) ?? a.updatedAt).getTime()
        const bT = new Date(activityMap.get(b.id) ?? b.updatedAt).getTime()
        return aT - bT
      })
      .slice(0, 6)
  }, [customers, activityMap])

  const recentClients = useMemo(() =>
    [...customers]
      .sort((a, b) => {
        const aT = new Date(activityMap.get(a.id) ?? a.updatedAt).getTime()
        const bT = new Date(activityMap.get(b.id) ?? b.updatedAt).getTime()
        return bT - aT
      })
      .slice(0, 6),
    [customers, activityMap],
  )

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 20,
      padding: '28px 32px',
      maxWidth: 1160, margin: '0 auto', width: '100%',
    }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
            Kunden
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>
            Prioritäten, Risiken und letzte Aktivitäten auf einen Blick
          </p>
        </div>
        <button className="btn-ghost" onClick={() => setShowModal(true)}>
          <UserPlus size={14} /> Neuer Kunde
        </button>
      </div>

      {customers.length === 0 ? (
        <EmptyClientBoard
          loading={loadingSample}
          onLoadSample={loadSampleData}
          onAddManual={() => setShowModal(true)}
        />
      ) : (<>

      {/* Quick Strip */}
      <QuickStrip
        customers={customers}
        pinnedIds={pinnedIds}
        recentClients={recentClients}
        onOpen={id => openCustomerAt(id, 'ueberblick')}
        onTogglePin={togglePin}
      />

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: 'Gesamt Clients', value: customers.length,       tone: '' },
          { label: 'Aktive Clients', value: activeCount,            tone: '' },
          { label: 'Heute fällig',   value: todayTodos.length,   tone: todayTodos.length   > 0 ? 'warn' : '' },
          { label: 'Überfällig',     value: overdueTodos.length, tone: overdueTodos.length > 0 ? 'bad'  : '' },
        ].map(s => (
          <div key={s.label} className="stat-tile" data-tone={s.tone}>
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* Left: Upcoming Deadlines — öffnet direkt Aktivitäten-Tab */}
        <SectionCard
          title="Upcoming Deadlines"
          icon={<Clock size={14} />}
          count={deadlineItems.length}
          empty="Keine fälligen To-Dos — alles im grünen Bereich."
        >
          {deadlineItems.length > 0
            ? (
              <StaggerList style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {deadlineItems.map(({ todo, tone, label }) => {
                  const c = customerMap.get(todo.customerId)
                  return (
                    <DeadlineRow
                      key={todo.id}
                      todo={todo}
                      name={c?.name ?? '—'}
                      tone={tone}
                      label={label}
                      onClick={() => c && openCustomerAt(c.id, 'historie')}
                    />
                  )
                })}
              </StaggerList>
            )
            : undefined}
        </SectionCard>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* At Risk — öffnet Dashboard-Tab */}
          <SectionCard
            title="At Risk"
            icon={<AlertTriangle size={14} />}
            count={riskClients.length}
            empty="Alle Clients sind up to date."
          >
            {riskClients.length > 0
              ? (
                <StaggerList style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {riskClients.map(c => (
                    <ClientRow
                      key={c.id}
                      customer={c}
                      lastAct={activityMap.get(c.id) ?? c.updatedAt}
                      tab="ueberblick"
                      onClick={() => openCustomerAt(c.id, 'ueberblick')}
                    />
                  ))}
                </StaggerList>
              )
              : undefined}
          </SectionCard>

          {/* Recent — öffnet Dashboard-Tab */}
          <SectionCard title="Letzte Aktivität" icon={<Activity size={14} />} empty="Noch keine Clients.">
            {recentClients.length > 0
              ? (
                <StaggerList style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {recentClients.map(c => (
                    <ClientRow
                      key={c.id}
                      customer={c}
                      lastAct={activityMap.get(c.id) ?? c.updatedAt}
                      tab="ueberblick"
                      onClick={() => openCustomerAt(c.id, 'ueberblick')}
                    />
                  ))}
                </StaggerList>
              )
              : undefined}
          </SectionCard>
        </div>
      </div>

      </>)}

      {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyClientBoard({ loading, onLoadSample, onAddManual }: {
  loading: boolean
  onLoadSample: (ind: IndustryProfile) => void
  onAddManual: () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 28,
      padding: '40px 24px',
      maxWidth: 720, margin: '20px auto 0',
      textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18, margin: '0 auto',
        background: 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <UserPlus size={28} style={{ color: 'var(--accent)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28, fontWeight: 600,
          letterSpacing: '-0.025em',
          margin: 0,
        }}>
          Noch keine Kunden.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
          Lege deinen ersten Kunden an — oder lade Beispiel-Daten um die App zu testen.
        </p>
      </div>

      {/* Primary CTA */}
      <button
        onClick={onAddManual}
        className="btn-primary"
        style={{ padding: '11px 22px', fontSize: 13.5, alignSelf: 'center' }}
      >
        <UserPlus size={14} /> Ersten Kunden anlegen
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--fg-dim)', fontWeight: 600,
        }}>
          oder
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Sample data */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{
          fontSize: 12.5, color: 'var(--fg-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Sparkles size={13} style={{ color: 'var(--accent)' }} />
          Beispiel-Daten laden
        </span>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
          marginTop: 8,
        }}>
          {INDUSTRIES.map(ind => (
            <button
              key={ind.id}
              onClick={() => onLoadSample(ind)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px',
                borderRadius: 14,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                cursor: loading ? 'wait' : 'pointer',
                textAlign: 'left',
                transition: 'all 180ms ease',
                opacity: loading ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.background = 'var(--accent-soft)'
                }
              }}
              onMouseLeave={e => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--surface-2)'
                }
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{ind.icon}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                  {ind.label}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1 }}>
                  {ind.sampleCustomers.length} Beispiel-Kunden
                </span>
              </div>
              <ArrowRight size={12} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── route entry ───────────────────────────────────────────────────────────────

export function ClientsRoute() {
  const selectedCustomerId = useUiStore(s => s.selectedCustomerId)

  if (selectedCustomerId) {
    return <CustomerRoute customerId={selectedCustomerId} />
  }

  return <ClientBoard />
}
