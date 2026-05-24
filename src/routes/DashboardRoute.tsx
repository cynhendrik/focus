import { useEffect } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { useFinanceStore } from '@/store/finance.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { Customer } from '@/types/customer.types'
import { useMailStore } from '@/store/mail.store'
import { DashboardEmailWidget } from '@/components/dashboard/DashboardEmailWidget'
import type { EmailHeader } from '@/types/mail.types'

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

const AGENDA = [
  { time: '09:00', title: 'Q2 Strategy Call',         sub: 'GreenLeaf Organic · Video', pill: 'JETZT', tone: 'now',    now: true  },
  { time: '10:00', title: 'Brand Guidelines Review',   sub: 'TechCorp · Zoom',           pill: 'CALL',  tone: 'accent', now: false },
  { time: '12:00', title: 'Mittagspause',              sub: '',                           pill: '',      tone: '',       now: false },
  { time: '14:00', title: 'Website Deployment',        sub: 'PixelStudio',               pill: 'DEPLOY', tone: 'warn', now: false },
  { time: '16:00', title: 'Daily Standup',             sub: 'Intern',                    pill: 'INTERN', tone: '',     now: false },
]

const DAYS    = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'Guten Morgen'
  if (h >= 11 && h < 14) return 'Guten Mittag'
  if (h >= 14 && h < 18) return 'Guten Tag'
  if (h >= 18 && h < 22) return 'Guten Abend'
  return 'Gute Nacht'
}

function attentionScore(c: Customer): number {
  let score = 75
  if (c.priority === 'high')    score -= 30
  if (c.status  === 'inaktiv')  score -= 20
  if (c.status  === 'lead')     score -= 10
  if (c.status  === 'lost')     score -= 40
  return Math.max(10, Math.min(99, score))
}

function StatCard({ label, value, trend, hint, trendColor }: {
  label: string; value: string; trend: string; hint: string; trendColor: string
}) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="card-label">{label}</span>
        <span className="mono" style={{ fontSize: 11, color: trendColor }}>{trend}</span>
      </div>
      <div className="stat-row">
        <span className="stat-value">{value}</span>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--fg-dim)' }}>{hint}</span>
    </div>
  )
}

export function DashboardRoute() {
  const customers    = useCustomersStore(s => s.customers)
  const setSelected  = useUiStore(s => s.setSelectedCustomer)
  const user         = useAuthStore(s => s.user)
  const kpis         = useFinanceStore(s => s.kpis)
  const loadKpis     = useFinanceStore(s => s.loadKpis)
  const workspaceId       = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const emails            = useMailStore(s => s.emails)
  const loadEmails        = useMailStore(s => s.loadEmails)
  const selectEmail       = useMailStore(s => s.selectEmail)
  const isLoadingMails    = useMailStore(s => s.isLoading)
  const selectedAccountId = useMailStore(s => s.selectedAccountId)
  const setAppView        = useUiStore(s => s.setAppView)

  useEffect(() => {
    if (workspaceId) loadKpis(workspaceId)
  }, [workspaceId])

  useEffect(() => {
    if (selectedAccountId && emails.length === 0) {
      loadEmails()
    }
  }, [selectedAccountId])

  const unreadEmails: EmailHeader[] = emails
    .filter(e => !e.isRead)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 8)

  function handleEmailClick(email: EmailHeader): void {
    selectEmail(email)
    setAppView('mail')
  }

  const now         = new Date()
  const dateStr     = `${DAYS[now.getDay()]} · ${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
  const firstName   = user?.email?.split('@')[0] ?? 'User'

  const aktiv       = customers.filter(c => c.status === 'aktiv').length
  const highPrio    = customers.filter(c => c.priority === 'high')
  const attnClients = [...customers].sort((a, b) => attentionScore(a) - attentionScore(b)).slice(0, 3)
  const prioCards   = highPrio.slice(0, 3)

  return (
    <div className="main-inner">
      {/* Greeting */}
      <div className="greeting">
        <h1 className="greeting-title">
          {getGreeting()},<br /><em>{firstName}.</em>
        </h1>
        <div className="greeting-sub">
          <span>{dateStr}</span>
          <span><strong>{highPrio.length} Clients</strong> brauchen Aufmerksamkeit</span>
          <span>Health Score Ø <strong>72</strong></span>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="row-4">
        <StatCard label="Aktive Clients"  value={String(aktiv)}          trend="+2"  hint="Diese Woche"    trendColor="var(--ok)"   />
        <StatCard label="Offene Tasks"    value={String(highPrio.length)} trend={highPrio.length > 3 ? "↑" : "↓"} hint="High Priority" trendColor={highPrio.length > 3 ? "var(--warn)" : "var(--ok)"} />
        <StatCard label="Outstanding €"   value={kpis ? fmt(kpis.openTotal) : '…'} trend={kpis ? `${kpis.overdueCount} überfällig` : '…'} hint={kpis ? `${kpis.openCount} offen` : 'Laden…'} trendColor={kpis && kpis.overdueCount > 0 ? 'var(--warn)' : 'var(--ok)'} />
        <StatCard label="Monatsumsatz"    value={kpis ? fmt(kpis.monthRevenue) : '…'} trend="" hint="Bezahlte Rechnungen" trendColor="var(--ok)" />
      </div>

      {/* Priority Cards */}
      {prioCards.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 0 }}>
            <h2>Drei Dinge heute <span className="count">{String(prioCards.length).padStart(2, '0')}</span></h2>
          </div>
          <div className="priorities">
            {prioCards.map((c, i) => (
              <div
                key={c.id}
                className="prio-card"
                data-tone={i === 0 ? 'hero' : ''}
                onClick={() => setSelected(c.id)}
              >
                <div className="prio-num">0{i + 1}</div>
                <h3 className="prio-title">{c.name}</h3>
                <p className="prio-meta">{c.company ?? 'Aufmerksamkeit erforderlich'}</p>
                <div className="prio-foot">
                  <span className="prio-chip">{c.status === 'lead' ? 'Lead' : c.status === 'aktiv' ? 'Aktiv' : 'Inaktiv'}</span>
                  <span>Score {attentionScore(c)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Row: Tagesplan + Aufmerksamkeit */}
      <div className="row">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Tagesplan</h2>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{AGENDA.length} EVENTS</span>
          </div>
          <div className="timeline">
            <div className="tl-bar" />
            {AGENDA.map((a, i) => (
              <div key={i} className="tl-row" data-now={String(a.now)}>
                <span className="tl-time">{a.time}</span>
                <div className="tl-dot" />
                <div className="tl-body" style={{ paddingLeft: 14 }}>
                  <span className="tl-title">{a.title}</span>
                  {a.sub && <span className="tl-sub">{a.sub}</span>}
                </div>
                {a.pill && <span className="tl-pill" data-tone={a.tone}>{a.pill}</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Benötigt Aufmerksamkeit</h2>
            {attnClients.length > 0 && <span className="chip" data-tone="bad">{attnClients.length} clients</span>}
          </div>
          {attnClients.length === 0 ? (
            <p className="empty" style={{ padding: '24px 0' }}>Alles im grünen Bereich ✓</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {attnClients.map(c => (
                <div key={c.id} className="client-row" onClick={() => setSelected(c.id)}>
                  <div className="avatar">
                    {c.name.split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="client-name">{c.name}</div>
                    <div className="client-meta">{c.company ?? c.status}</div>
                  </div>
                  <span className="chip" data-tone={attentionScore(c) < 50 ? 'bad' : 'warn'}>
                    Score {attentionScore(c)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <DashboardEmailWidget
        emails={unreadEmails}
        isLoading={isLoadingMails}
        hasAccount={selectedAccountId !== null}
        onEmailClick={handleEmailClick}
      />
    </div>
  )
}
