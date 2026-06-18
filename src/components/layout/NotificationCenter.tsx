import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell, Mail, RefreshCw, CreditCard, CheckSquare, Snowflake } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { useMailStore } from '@/store/mail.store'
import { useCrmStore } from '@/store/crm.store'
import { useFinanceStore } from '@/store/finance.store'
import { useTodosStore } from '@/store/todos.store'
import { useLeadsStore } from '@/store/leads.store'
import { useAccountsStore } from '@/store/accounts.store'

interface NotiItem {
  id: string
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}

// Glocke = vollständiger Überblick über ALLES Offene (breiter als HEUTE):
// ungelesene Mails · offene/überfällige Follow-ups · überfällige Rechnungen ·
// offene/fällige Aufgaben · kalte Leads. Klick springt zum jeweiligen Bereich.
export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const emails       = useMailStore(s => s.emails)
  const selectEmail  = useMailStore(s => s.selectEmail)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const lastActivity = useCrmStore(s => s.lastActivity)
  const invoices     = useFinanceStore(s => s.invoices)
  const todos        = useTodosStore(s => s.allTodos)
  const leads        = useLeadsStore(s => s.leads)
  const accounts     = useAccountsStore(s => s.accounts)
  const setAppView                = useUiStore(s => s.setAppView)
  const openCustomerAt            = useUiStore(s => s.openCustomerAt)
  const setSelectedLeverageLeadId = useUiStore(s => s.setSelectedLeverageLeadId)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const { groups, total } = useMemo(() => {
    const nameById = new Map<string, string>()
    for (const a of accounts) nameById.set(a.id, a.name)
    for (const l of leads) nameById.set(l.id, l.name)
    const nameOf = (id?: string | null) => (id ? nameById.get(id) ?? '' : '')

    const todayStr = new Date().toLocaleDateString('sv')

    const mails: NotiItem[] = emails
      .filter(e => !e.isRead && e.customerId != null)
      .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))
      .map(e => ({
        id: 'mail-' + e.id,
        icon: <Mail size={14} />,
        title: e.fromName || e.fromAddr || 'Mail',
        subtitle: e.subject || '(ohne Betreff)',
        onClick: () => { void selectEmail(e); setAppView('mail') },
      }))

    const fus: NotiItem[] = allFollowUps
      .filter(f => f.status === 'offen')
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .map(f => {
        const overdue = !!f.dueDate && f.dueDate.slice(0, 10) < todayStr
        return {
          id: 'fu-' + f.id,
          icon: <RefreshCw size={14} />,
          title: nameOf(f.customerId) || f.title,
          subtitle: overdue ? `überfällig · ${f.title}` : f.title,
          onClick: () => setAppView('leverage_inbox'),
        }
      })

    const invs: NotiItem[] = invoices
      .filter(i => {
        if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'draft') return false
        return i.status === 'overdue' || (!!i.dueDate && i.dueDate.slice(0, 10) < todayStr)
      })
      .map(i => ({
        id: 'inv-' + i.id,
        icon: <CreditCard size={14} />,
        title: nameOf(i.accountId) || (i.number ?? 'Rechnung'),
        subtitle: `überfällig${i.number ? ' · ' + i.number : ''}`,
        onClick: () => setAppView('invoices'),
      }))

    const tks: NotiItem[] = todos
      .filter(t =>
        t.status !== 'done' &&
        (t.bucket === 'today' || t.bucket === 'in_progress' || t.status === 'in_progress' ||
          (!!t.dueDate && t.dueDate.slice(0, 10) <= todayStr)),
      )
      .map(t => ({
        id: 'todo-' + t.id,
        icon: <CheckSquare size={14} />,
        title: t.title,
        subtitle: nameOf(t.customerId) || 'Aufgabe',
        onClick: () => { if (t.customerId) openCustomerAt(t.customerId); else setAppView('dashboard') },
      }))

    const lastById = new Map<string, string | null>()
    for (const la of lastActivity) lastById.set(la.accountId, la.lastActivityAt)
    const openFuLeadIds = new Set(allFollowUps.filter(f => f.status === 'offen').map(f => f.customerId))
    const cutoff = Date.now() - 14 * 86_400_000
    const colds: NotiItem[] = leads
      .filter(l => l.pipelineStage !== 'won' && l.pipelineStage !== 'lost' && !openFuLeadIds.has(l.id))
      .filter(l => {
        const la = lastById.get(l.id) ?? l.lastActivityAt ?? null
        return !la || new Date(la).getTime() < cutoff
      })
      .map(l => ({
        id: 'lead-' + l.id,
        icon: <Snowflake size={14} />,
        title: l.name,
        subtitle: 'lange kein Kontakt',
        onClick: () => { setSelectedLeverageLeadId(l.id); setAppView('leverage_lead_detail') },
      }))

    const groups = [
      { key: 'mail', label: 'Ungelesene Mails',       items: mails },
      { key: 'fu',   label: 'Follow-ups',             items: fus },
      { key: 'inv',  label: 'Überfällige Rechnungen', items: invs },
      { key: 'task', label: 'Offene Aufgaben',        items: tks },
      { key: 'cold', label: 'Kalte Leads',            items: colds },
    ].filter(g => g.items.length > 0)
    const total = groups.reduce((s, g) => s + g.items.length, 0)
    return { groups, total }
  }, [emails, allFollowUps, lastActivity, invoices, todos, leads, accounts, selectEmail, setAppView, openCustomerAt, setSelectedLeverageLeadId])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        title={total > 0 ? `Benachrichtigungen (${total})` : 'Benachrichtigungen'}
        onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', color: (open || total > 0) ? 'var(--accent)' : undefined }}
      >
        <Bell size={16} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, maxHeight: 460,
          overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-2)', zIndex: 200, padding: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 8px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>Benachrichtigungen</span>
            <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-dim)' }}>{total} offen</span>
          </div>

          {groups.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--fg-dim)', fontSize: 12.5 }}>
              Alles erledigt — nichts offen. 🎉
            </div>
          ) : groups.map(g => (
            <div key={g.key} style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--fg-dim)', padding: '6px 8px 3px',
              }}>
                {g.label} · {g.items.length}
              </div>
              {g.items.slice(0, 12).map(it => (
                <button
                  key={it.id}
                  onClick={() => { it.onClick(); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 8,
                    borderRadius: 8, color: 'var(--fg)', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ color: 'var(--accent)', flexShrink: 0, display: 'flex' }}>{it.icon}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.subtitle}</span>
                  </span>
                </button>
              ))}
              {g.items.length > 12 && (
                <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', padding: '2px 8px 4px' }}>
                  +{g.items.length - 12} weitere
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
