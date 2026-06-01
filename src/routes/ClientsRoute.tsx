import { useState, useMemo } from 'react'
import {
  UserPlus, Sparkles, ArrowRight,
  Search, ChevronRight,
} from 'lucide-react'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useCrmStore } from '@/store/crm.store'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useFinanceStore } from '@/store/finance.store'
import { useClientPickerStore } from '@/store/client-picker.store'
import { CustomerModal } from '@/components/customer/CustomerModal'
import { CustomerRoute } from './CustomerRoute'
import { StaggerList } from '@/components/ui/StaggerList'
import { INDUSTRIES, type IndustryProfile } from '@/components/onboarding/OnboardingWizard'
import type { Customer } from '@/types/customer.types'
import {
  computeClientRows, sortClientRows, countNeedsAttention,
  customerInitials, formatEuroShort, relContactLabel, clientVariation,
  type ClientRow, type ClientSortKey, type ClientSignalTone,
} from '@/lib/clients-overview'

// ── color helpers (avatar squircle) ──────────────────────────────────────────
// Alle Avatare einheitlich in dunklem Grau — kein Hash-basierter Farbtupfer,
// kein Lime-Fade. Ruhiges, neutrales Listen-Bild. (variation-Parameter bleibt
// in der Signatur, wird aktuell aber bewusst nicht ausgewertet — falls wir
// spaeter doch eine subtile Variation reinmischen wollen.)
function avatarColors(_variation: number) {
  return {
    stroke: 'var(--border-strong)',
    ink:    'var(--fg-muted)',
    bg:     'var(--surface-3)',
  }
}

function signalColors(tone: ClientSignalTone) {
  switch (tone) {
    case 'bad':  return { ink: 'oklch(72% 0.20 25)',  bg: 'oklch(72% 0.20 25 / 0.10)', stroke: 'oklch(72% 0.20 25 / 0.35)' }
    case 'warn': return { ink: 'oklch(82% 0.17 80)',  bg: 'oklch(82% 0.17 80 / 0.10)', stroke: 'oklch(82% 0.17 80 / 0.32)' }
    case 'ok':   return { ink: 'oklch(82% 0.18 145)', bg: 'oklch(82% 0.18 145 / 0.08)', stroke: 'oklch(82% 0.18 145 / 0.28)' }
  }
}

// ── ClientAvatar — colored squircle with initials ────────────────────────────

function ClientAvatar({ name, variation, size = 44 }: { name: string; variation: number; size?: number }) {
  const { stroke, ink, bg } = avatarColors(variation)
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 12,
        background: bg, border: `1.5px solid ${stroke}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: ink, fontFamily: 'var(--font-mono)',
        fontSize: size <= 28 ? 10 : 13, fontWeight: 700,
        letterSpacing: '0.04em', flexShrink: 0,
      }}
    >
      {customerInitials(name)}
    </div>
  )
}

// ── ZULETZT chip strip ───────────────────────────────────────────────────────

function ZuletztStrip({ recent, onOpen }: { recent: Customer[]; onOpen: (id: string) => void }) {
  if (recent.length === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      overflowX: 'auto', padding: '4px 0',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--fg-dim)', fontWeight: 600, flexShrink: 0,
        userSelect: 'none', paddingRight: 4,
      }}>
        Zuletzt
      </span>
      {recent.map(c => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 14px 4px 5px', borderRadius: 999,
            background: 'transparent',
            border: '1px solid var(--border)',
            cursor: 'pointer', flexShrink: 0,
            color: 'var(--fg)', fontSize: 12.5, fontWeight: 500,
            transition: 'border-color 140ms, background 140ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fg-muted)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <ClientAvatar name={c.name} variation={clientVariation(c)} size={26} />
          <span style={{ whiteSpace: 'nowrap' }}>{c.name}</span>
        </button>
      ))}
    </div>
  )
}

// ── Signal badge ─────────────────────────────────────────────────────────────

function SignalBadge({ row }: { row: ClientRow }) {
  const c = signalColors(row.signal.tone)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '5px 11px', borderRadius: 999,
      background: c.bg, border: `1px solid ${c.stroke}`,
      color: c.ink, fontFamily: 'var(--font-mono)',
      fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {row.signal.label}
    </span>
  )
}

// ── Client list row ──────────────────────────────────────────────────────────

const COL_TEMPLATE = '1.6fr 1fr 0.6fr 0.45fr 0.6fr 28px'

function ClientListRow({ row, onOpen }: { row: ClientRow; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: COL_TEMPLATE,
        alignItems: 'center', columnGap: 18,
        padding: '14px 20px', borderRadius: 14,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'border-color 140ms, background 140ms, transform 140ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--border-strong)'
        e.currentTarget.style.background = 'var(--surface-3)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'var(--surface-2)'
      }}
    >
      {/* Kunde */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <ClientAvatar name={row.customer.name} variation={row.variation} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14.5, fontWeight: 600, color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {row.customer.name}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {row.customer.industry || row.customer.company || '—'}
          </div>
        </div>
      </div>

      {/* Signal */}
      <div><SignalBadge row={row} /></div>

      {/* € im Spiel */}
      <div style={{
        fontSize: 15, fontWeight: 700, color: 'var(--fg)',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      }}>
        {row.openDealValue > 0 ? formatEuroShort(row.openDealValue) : '—'}
      </div>

      {/* Renewal */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}>
        {row.renewalInDays !== null ? `${row.renewalInDays} T` : '—'}
      </div>

      {/* Letzter Kontakt */}
      <div style={{
        fontSize: 12, color: 'var(--fg-dim)',
        whiteSpace: 'nowrap',
      }}>
        {relContactLabel(row.lastContactAt)}
      </div>

      {/* Arrow */}
      <ChevronRight size={16} style={{ color: 'var(--fg-dim)', justifySelf: 'end' }} />
    </div>
  )
}

// ── Column header (mono labels above the list) ───────────────────────────────

function ColumnHeader() {
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10.5,
    letterSpacing: '0.16em', textTransform: 'uppercase',
    color: 'var(--fg-dim)', fontWeight: 600,
  }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: COL_TEMPLATE,
      columnGap: 18, padding: '0 20px 8px',
    }}>
      <span style={labelStyle}>Kunde</span>
      <span style={labelStyle}>Signal</span>
      <span style={labelStyle}>€ im Spiel</span>
      <span style={labelStyle}>Renewal</span>
      <span style={labelStyle}>Letzter Kontakt</span>
      <span />
    </div>
  )
}

// ── Sort tabs (Brauchen dich / Wert / Zuletzt / Name) ────────────────────────

function SortTabs({
  active, onChange,
}: {
  active: ClientSortKey
  onChange: (k: ClientSortKey) => void
}) {
  const TABS: { key: ClientSortKey; label: string }[] = [
    { key: 'brauchen', label: 'Brauchen dich' },
    { key: 'wert',     label: 'Wert' },
    { key: 'zuletzt',  label: 'Zuletzt' },
    { key: 'name',     label: 'Name' },
  ]
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      padding: 3, gap: 2, background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 12,
    }}>
      {TABS.map(t => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              padding: '7px 14px', borderRadius: 9, border: 'none',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              fontFamily: 'inherit',
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)',
              transition: 'background 140ms, color 140ms',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Client Board ──────────────────────────────────────────────────────────────

function ClientBoard() {
  const customers      = useCustomersStore(s => s.customers)
  const upsertCustomer = useCustomersStore(s => s.upsert)
  const openCustomerAt = useUiStore(s => s.openCustomerAt)
  const lastActivity   = useCrmStore(s => s.lastActivity)
  const deals          = useDealsStore(s => s.deals)
  const stages         = usePipelineStore(s => s.stages)
  const invoices       = useFinanceStore(s => s.invoices)
  const offers         = useFinanceStore(s => s.offers)
  const pinnedIds      = useClientPickerStore(s => s.pinnedIds)

  const [showModal, setShowModal]         = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [search, setSearch]               = useState('')
  const [sortKey, setSortKey]             = useState<ClientSortKey>('brauchen')

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

  const allRows = useMemo(
    () => computeClientRows({ customers, deals, stages, invoices, offers, lastActivity }),
    [customers, deals, stages, invoices, offers, lastActivity],
  )

  const needsAttention = useMemo(() => countNeedsAttention(allRows), [allRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter(r =>
      r.customer.name.toLowerCase().includes(q) ||
      (r.customer.company ?? '').toLowerCase().includes(q) ||
      (r.customer.industry ?? '').toLowerCase().includes(q),
    )
  }, [allRows, search])

  const sortedRows = useMemo(() => sortClientRows(filteredRows, sortKey), [filteredRows, sortKey])

  // ZULETZT chips: pinned first, then most recent by lastContact.
  const recentForStrip = useMemo(() => {
    const byId = new Map(allRows.map(r => [r.customer.id, r]))
    const pinned = pinnedIds
      .map(id => byId.get(id)?.customer)
      .filter((c): c is Customer => !!c)
    const recent = [...allRows]
      .sort((a, b) => (new Date(b.lastContactAt ?? 0).getTime()) - (new Date(a.lastContactAt ?? 0).getTime()))
      .map(r => r.customer)
      .filter(c => !pinnedIds.includes(c.id))
    return [...pinned, ...recent].slice(0, 6)
  }, [allRows, pinnedIds])

  if (customers.length === 0) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <EmptyClientBoard
          loading={loadingSample}
          onLoadSample={loadSampleData}
          onAddManual={() => setShowModal(true)}
        />
        {showModal && <CustomerModal onClose={() => setShowModal(false)} />}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 22,
      padding: '40px 48px 48px',
      maxWidth: 1280, margin: '0 auto', width: '100%',
    }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--accent)', fontWeight: 600, marginBottom: 14,
          }}>
            Kundenübersicht
          </div>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 64, fontWeight: 700,
            letterSpacing: '-0.035em', lineHeight: 1,
            color: 'var(--fg)',
          }}>
            Clients
          </h1>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 18,
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--fg-dim)', letterSpacing: '0.04em',
        }}>
          <span>{allRows.length} {allRows.length === 1 ? 'Kunde' : 'Kunden'}</span>
          {needsAttention > 0 && (
            <span style={{ color: 'oklch(82% 0.17 80)', fontWeight: 600 }}>
              {needsAttention} brauchen dich
            </span>
          )}
          <button
            className="btn-ghost"
            onClick={() => setShowModal(true)}
            style={{ fontFamily: 'inherit' }}
          >
            <UserPlus size={14} /> Neu
          </button>
        </div>
      </div>

      {/* Search + sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
          <Search
            size={16}
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--fg-dim)', pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="In allen Kunden suchen…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '13px 18px 13px 44px',
              borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--fg)', fontSize: 13.5,
              fontFamily: 'inherit', outline: 'none',
              transition: 'border-color 140ms',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>
        <SortTabs active={sortKey} onChange={setSortKey} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--fg-dim)', letterSpacing: '0.06em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {sortedRows.length} / {allRows.length}
        </span>
      </div>

      {/* ZULETZT strip */}
      <ZuletztStrip recent={recentForStrip} onOpen={id => openCustomerAt(id, 'ueberblick')} />

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <ColumnHeader />
        {sortedRows.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: 'var(--fg-dim)', fontSize: 13,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 14,
          }}>
            Keine Kunden passen zur Suche.
          </div>
        ) : (
          <StaggerList style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedRows.map(row => (
              <ClientListRow
                key={row.customer.id}
                row={row}
                onOpen={() => openCustomerAt(row.customer.id, 'ueberblick')}
              />
            ))}
          </StaggerList>
        )}
      </div>

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
