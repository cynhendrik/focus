import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, User, UserPlus, Briefcase, Mail, CheckSquare, Bell, Receipt, Command, ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useLeadsStore } from '@/store/leads.store'
import { useDealsStore } from '@/store/deals.store'
import { useFinanceStore } from '@/store/finance.store'
import { useMailStore } from '@/store/mail.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useUiStore, type AppView } from '@/store/ui.store'

import type { Customer } from '@/types/customer.types'
import type { PipelineStage } from '@/types/pipeline.types'

// ─────────────────────────────────────────────────────────────────────────────
// Global Spotlight + Command-Palette — durchsucht Kunden, Leads, Deals, Rechnungen,
// Mails, Tasks, Follow-ups und bietet Navigations-Befehle ("Gehe zu …").
// Tippen filtert, Pfeile navigieren, Enter springt. Leeres Suchfeld zeigt die
// Befehle als Schnell-Navigation.
//
// Scope: nur workspace-weit bereits geladene Entitäten. Notizen-/Aktivitäten-
// Volltextsuche kommt separat (braucht einen workspace-weiten Aktivitäts-Index).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

type ResultKind = 'command' | 'customer' | 'lead' | 'deal' | 'invoice' | 'mail' | 'task' | 'followup'

interface Hit {
  kind:      ResultKind
  id:        string         // stable for keyboard nav
  primary:   string         // main label
  secondary: string         // sub label
  meta?:     string         // right-side hint
  run:       () => void      // was beim Öffnen passiert
}

interface Group {
  kind:  ResultKind
  label: string
  icon:  LucideIcon
  hits:  Hit[]
}

const GROUP_META: Record<ResultKind, { label: string; icon: LucideIcon; color: string }> = {
  command:  { label: 'Befehle',     icon: Command,     color: 'oklch(72% 0.02 260)' },
  customer: { label: 'Kunden',      icon: User,        color: 'oklch(78% 0.13 200)' },
  lead:     { label: 'Leads',       icon: UserPlus,    color: 'oklch(80% 0.15 145)' },
  deal:     { label: 'Deals',       icon: Briefcase,   color: 'oklch(75% 0.17 150)' },
  invoice:  { label: 'Rechnungen',  icon: Receipt,     color: 'oklch(80% 0.13 90)'  },
  mail:     { label: 'Mails',       icon: Mail,        color: 'oklch(78% 0.13 210)' },
  task:     { label: 'Tasks',       icon: CheckSquare, color: 'oklch(78% 0.16 65)'  },
  followup: { label: 'Follow-ups',  icon: Bell,        color: 'oklch(82% 0.16 70)'  },
}

// Entitäten ranken über den Befehlen, wenn gesucht wird; bei leerem Feld zeigen
// wir nur die Befehle.
const GROUP_ORDER: ResultKind[] = ['customer', 'lead', 'deal', 'invoice', 'mail', 'task', 'followup', 'command']

const MAX_PER_GROUP = 5

function includesCI(haystack: string | undefined | null, needle: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle)
}

function relDate(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'heute'
  if (d === 1) return 'gestern'
  if (d < 7)  return `vor ${d}T`
  if (d < 30) return `vor ${Math.floor(d / 7)}W`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

function eur(n: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// ─────────────────────────────────────────────────────────────────────────────

export function CommandPalette({ open, onClose }: Props) {
  const customers    = useCustomersStore(s => s.customers)
  const leads        = useLeadsStore(s => s.leads)
  const deals        = useDealsStore(s => s.deals)
  const invoices     = useFinanceStore(s => s.invoices)
  const allEmails    = useMailStore(s => s.emails)
  const allTodos     = useTodosStore(s => s.allTodos)
  const allFollowUps = useCrmStore(s => s.allFollowUps)
  const stages       = usePipelineStore(s => s.stages)

  const setSelected      = useUiStore(s => s.setSelectedCustomer)
  const openCustomerAt   = useUiStore(s => s.openCustomerAt)
  const setAppView       = useUiStore(s => s.setAppView)
  const setLeverageLead  = useUiStore(s => s.setSelectedLeverageLeadId)

  const [query, setQuery]       = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const stageByName = useMemo(() => {
    const m = new Map<string, PipelineStage>()
    for (const s of stages) m.set(s.name, s)
    return m
  }, [stages])

  const customerById = useMemo(() => {
    const m = new Map<string, Customer>()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  // Navigations-Befehle: appView-Werte gespiegelt aus der NavSidebar.
  const commands = useMemo<{ label: string; view: AppView; lead?: boolean }[]>(() => [
    { label: 'Heute',          view: 'dashboard' },
    { label: 'Kunden',         view: 'clients' },
    { label: 'Leads',          view: 'leverage_leads' },
    { label: 'Pipeline',       view: 'leverage_pipeline' },
    { label: 'Follow-ups',     view: 'leverage_inbox' },
    { label: 'Finanzen',       view: 'invoices' },
    { label: 'Kalender',       view: 'calendar' },
    { label: 'Mail',           view: 'mail' },
    { label: 'Zeiterfassung',  view: 'zeitmanagement' },
    { label: 'Einstellungen',  view: 'settings' },
  ], [])

  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase()

    // BEFEHLE — bei leerem Feld alle, sonst nach Label gefiltert.
    const commandHits: Hit[] = commands
      .filter(c => q === '' || includesCI(c.label, q) || includesCI('gehe zu', q))
      .map<Hit>(c => ({
        kind: 'command',
        id: `cmd-${c.view}`,
        primary: `Gehe zu ${c.label}`,
        secondary: '',
        run: () => { setSelected(null); setAppView(c.view) },
      }))

    if (q === '') {
      return commandHits.length ? [{ kind: 'command', label: GROUP_META.command.label, icon: GROUP_META.command.icon, hits: commandHits }] : []
    }

    // KUNDEN
    const customerHits: Hit[] = customers
      .filter(c =>
        includesCI(c.name, q) || includesCI(c.company, q) ||
        includesCI(c.email, q) || includesCI(c.phone, q) ||
        (c.tags ?? []).some(t => includesCI(t, q)),
      )
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(c => ({
        kind: 'customer', id: c.id, primary: c.name, secondary: c.company ?? c.status,
        run: () => setSelected(c.id),
      }))

    // LEADS
    const leadHits: Hit[] = leads
      .filter(l =>
        includesCI(l.name, q) || includesCI(l.companyName, q) ||
        includesCI(l.email, q) || includesCI(l.phone, q),
      )
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(l => ({
        kind: 'lead', id: l.id, primary: l.name,
        secondary: l.companyName ?? l.leadStatus,
        run: () => { setLeverageLead(l.id); setAppView('leverage_lead_detail') },
      }))

    // DEALS
    const dealHits: Hit[] = deals
      .filter(d => includesCI(d.title, q))
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(d => {
        const stage = stageByName.get(d.stage)
        const cust  = customerById.get(d.accountId)
        const val   = d.value ? eur(d.value, d.currency ?? 'EUR') : undefined
        const metaParts = [stage?.label, val].filter(Boolean) as string[]
        return {
          kind: 'deal', id: d.id, primary: d.title, secondary: cust?.name ?? '—',
          meta: metaParts.length ? metaParts.join(' · ') : undefined,
          run: () => setSelected(d.accountId),
        }
      })

    // RECHNUNGEN — Nummer + Kundenname; öffnet den Kunden im Finanzen-Tab.
    const invoiceHits: Hit[] = invoices
      .filter(inv => {
        const cust = customerById.get(inv.accountId)
        return includesCI(inv.number, q) || includesCI(cust?.name, q) || includesCI(cust?.company, q)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(inv => {
        const cust = customerById.get(inv.accountId)
        return {
          kind: 'invoice',
          id: inv.id,
          primary: inv.number ? `Rechnung ${inv.number}` : 'Rechnung (Entwurf)',
          secondary: cust?.name ?? '—',
          meta: eur(inv.total, 'EUR'),
          run: () => openCustomerAt(inv.accountId, 'finanzen'),
        }
      })

    // MAILS
    const mailHits: Hit[] = allEmails
      .filter(e => includesCI(e.subject, q) || includesCI(e.fromName, q) || includesCI(e.fromAddr, q))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(e => {
        const cust = e.customerId ? customerById.get(e.customerId) : undefined
        const senderLabel = e.fromName || e.fromAddr
        const subParts = [senderLabel, cust?.name].filter(Boolean) as string[]
        return {
          kind: 'mail', id: e.id, primary: e.subject || '(Kein Betreff)',
          secondary: subParts.join(' · '), meta: relDate(e.sentAt),
          run: () => { setAppView('mail') },
        }
      })

    // TASKS
    const taskHits: Hit[] = allTodos
      .filter(t => includesCI(t.title, q))
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(t => {
        const cust = t.customerId ? customerById.get(t.customerId) : undefined
        return {
          kind: 'task', id: t.id, primary: t.title, secondary: cust?.name ?? '—',
          meta: t.status === 'done' ? 'erledigt' : t.dueDate ? relDate(t.dueDate) : undefined,
          run: () => { if (t.customerId) setSelected(t.customerId) },
        }
      })

    // FOLLOW-UPS
    const followupHits: Hit[] = allFollowUps
      .filter(f => includesCI(f.title, q))
      .slice(0, MAX_PER_GROUP)
      .map<Hit>(f => {
        const cust = customerById.get(f.customerId)
        return {
          kind: 'followup', id: f.id, primary: f.title, secondary: cust?.name ?? '—',
          meta: f.status === 'erledigt' ? 'erledigt' : f.dueDate ? relDate(f.dueDate) : undefined,
          run: () => setSelected(f.customerId),
        }
      })

    const buckets: Record<ResultKind, Hit[]> = {
      command:  commandHits,
      customer: customerHits,
      lead:     leadHits,
      deal:     dealHits,
      invoice:  invoiceHits,
      mail:     mailHits,
      task:     taskHits,
      followup: followupHits,
    }
    const out: Group[] = []
    for (const kind of GROUP_ORDER) {
      const hits = buckets[kind]
      if (hits.length === 0) continue
      out.push({ kind, label: GROUP_META[kind].label, icon: GROUP_META[kind].icon, hits })
    }
    return out
  }, [query, commands, customers, leads, deals, invoices, allEmails, allTodos, allFollowUps,
      stageByName, customerById, setSelected, openCustomerAt, setAppView, setLeverageLead])

  // Flat list for keyboard navigation
  const flatHits = useMemo(() => groups.flatMap(g => g.hits), [groups])

  useEffect(() => {
    if (activeIdx >= flatHits.length) setActiveIdx(Math.max(0, flatHits.length - 1))
  }, [flatHits.length, activeIdx])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.querySelector(`[data-row-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const openHit = (h: Hit) => { h.run(); onClose() }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')   { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown'){ e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flatHits.length - 1)); return }
    if (e.key === 'ArrowUp')  { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flatHits[activeIdx]
      if (hit) openHit(hit)
      return
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit   ={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'oklch(0% 0 0 / 0.55)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '15vh', paddingInline: 24,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1,    y: 0   }}
            exit   ={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.1, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              width: 640, maxWidth: '92vw',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: 'var(--shadow-2)',
              display: 'flex', flexDirection: 'column',
              maxHeight: '70vh',
            }}
          >
            {/* Search input */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <Search size={16} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
                onKeyDown={handleKey}
                placeholder="Suche Kunden, Leads, Rechnungen, Mails … oder „Gehe zu …"
                style={{
                  flex: 1, minWidth: 0,
                  background: 'transparent', border: 'none',
                  color: 'var(--fg)', fontSize: 15, letterSpacing: '-0.01em',
                }}
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus() }}
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Results */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 8px' }}>
              {query.trim() !== '' && flatHits.length === 0 && (
                <EmptyHint message={`Keine Treffer für "${query.trim()}".`} />
              )}

              {groups.map(group => {
                const baseIdx = flatHits.indexOf(group.hits[0])
                return (
                  <div key={group.kind} style={{ marginTop: 6 }}>
                    <GroupHeader label={group.label} icon={group.icon} color={GROUP_META[group.kind].color} count={group.hits.length} />
                    {group.hits.map((hit, i) => {
                      const idx = baseIdx + i
                      return (
                        <ResultRow
                          key={`${hit.kind}-${hit.id}`}
                          hit={hit}
                          active={idx === activeIdx}
                          rowIdx={idx}
                          onHover={() => setActiveIdx(idx)}
                          onClick={() => openHit(hit)}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '8px 18px',
              borderTop: '1px solid var(--border)',
              background: 'oklch(100% 0 0 / 0.015)',
              fontSize: 10.5, fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em', color: 'var(--fg-dim)', flexShrink: 0,
            }}>
              <FooterHint k="↑↓" label="navigieren" />
              <FooterHint k="↵"  label="öffnen" />
              <FooterHint k="esc" label="schließen" />
              <div style={{ flex: 1 }} />
              <span style={{ opacity: 0.7 }}>
                {flatHits.length > 0 && `${flatHits.length} Treffer`}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function GroupHeader({
  label, icon: Icon, color, count,
}: { label: string; icon: LucideIcon; color: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '8px 10px 4px',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: 'var(--fg-dim)', fontWeight: 500,
    }}>
      <Icon size={11} strokeWidth={2.4} style={{ color }} />
      {label}
      <span style={{ opacity: 0.6 }}>· {count}</span>
    </div>
  )
}

function ResultRow({
  hit, active, rowIdx, onHover, onClick,
}: {
  hit: Hit; active: boolean; rowIdx: number
  onHover: () => void; onClick: () => void
}) {
  return (
    <button
      data-row-idx={rowIdx}
      onMouseEnter={onHover}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center', gap: 12, width: '100%',
        padding: '8px 12px', borderRadius: 8,
        background: active ? 'oklch(100% 0 0 / 0.07)' : 'transparent',
        border: 'none', textAlign: 'left', cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.005em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hit.primary}
        </span>
        {hit.secondary && (
          <span style={{
            fontSize: 11.5, color: 'var(--fg-muted)', letterSpacing: '-0.005em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1,
          }}>
            {hit.secondary}
          </span>
        )}
      </div>

      {hit.meta && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--fg-dim)', letterSpacing: '0.02em', whiteSpace: 'nowrap',
        }}>
          {hit.meta}
        </span>
      )}

      <ArrowRight
        size={12}
        style={{
          color: 'var(--fg-dim)',
          opacity: active ? 1 : 0.3,
          transform: active ? 'translateX(2px)' : 'translateX(0)',
          transition: 'opacity 180ms ease, transform 180ms ease',
        }}
      />
    </button>
  )
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div style={{
      padding: '36px 16px', textAlign: 'center',
      fontSize: 12.5, color: 'var(--fg-dim)', fontStyle: 'italic',
    }}>
      {message}
    </div>
  )
}

function FooterHint({ k, label }: { k: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <kbd style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 4, padding: '1px 5px', color: 'var(--fg-muted)',
      }}>
        {k}
      </kbd>
      {label}
    </span>
  )
}
