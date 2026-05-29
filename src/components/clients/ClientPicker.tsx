import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useClientPickerStore } from '@/store/client-picker.store'
import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'
import { useCrmStore } from '@/store/crm.store'
import type { CustomerStatus } from '@/types/customer.types'

type SortKey = 'letzte-aktivitaet' | 'alphabetisch' | 'status'

const STATUS_TONE: Record<CustomerStatus, string> = {
  aktiv:   'ok',
  lead:    'accent',
  inaktiv: 'warn',
  lost:    'bad',
}
const STATUS_LABEL: Record<CustomerStatus, string> = {
  aktiv:   'Aktiv',
  lead:    'Lead',
  inaktiv: 'Inaktiv',
  lost:    'Lost',
}
const STATUS_ORDER: CustomerStatus[] = ['aktiv', 'lead', 'inaktiv', 'lost']

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Heute'
  if (d === 1) return 'Gestern'
  if (d < 7)  return `vor ${d}T`
  if (d < 30) return `vor ${Math.floor(d / 7)}W`
  return `vor ${Math.floor(d / 30)}M`
}

const Kbd = ({ children }: { children: string }) => (
  <kbd style={{
    fontFamily: 'var(--font-mono)', fontSize: 10,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '1px 5px', color: 'var(--fg-muted)',
  }}>
    {children}
  </kbd>
)

export function ClientPicker() {
  const close       = useClientPickerStore(s => s.close)
  const customers   = useCustomersStore(s => s.customers)
  const setSelected = useUiStore(s => s.setSelectedCustomer)
  const lastActivity = useCrmStore(s => s.lastActivity)

  const [query,        setQuery]        = useState('')
  const [sort,         setSort]         = useState<SortKey>('letzte-aktivitaet')
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | null>(null)
  const [activeIdx,    setActiveIdx]    = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  const activityMap = useMemo(
    () => new Map(lastActivity.map(a => [a.accountId, a.lastActivityAt])),
    [lastActivity],
  )

  const filtered = useMemo(() => {
    let list = [...customers]

    if (statusFilter) list = list.filter(c => c.status === statusFilter)

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q),
      )
    }

    if (sort === 'alphabetisch') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    } else if (sort === 'letzte-aktivitaet') {
      list.sort((a, b) => {
        const aT = new Date(activityMap.get(a.id) ?? a.updatedAt).getTime()
        const bT = new Date(activityMap.get(b.id) ?? b.updatedAt).getTime()
        return bT - aT
      })
    } else {
      list.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
    }

    return list
  }, [customers, query, statusFilter, sort, activityMap])

  useEffect(() => { searchRef.current?.focus() }, [])
  useEffect(() => { setActiveIdx(0) }, [filtered.length])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[activeIdx]) {
        open(filtered[activeIdx].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, activeIdx, close])

  const open = (id: string) => {
    setSelected(id)
    close()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'oklch(0% 0 0 / 0.6)',
        backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
      }}
      onClick={close}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 640, maxWidth: '94vw',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-2)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '72vh', overflow: 'hidden',
        }}
      >
        {/* Search row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <Search size={17} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Client suchen…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 15, color: 'var(--fg)', fontFamily: 'var(--font-sans)',
              caretColor: 'var(--accent)',
            }}
          />
          {query && (
            <button className="icon-btn" onClick={() => setQuery('')} style={{ flexShrink: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            style={{
              fontSize: 12, background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8, padding: '4px 8px',
              color: 'var(--fg-muted)', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="letzte-aktivitaet">Letzte Aktivität</option>
            <option value="alphabetisch">Alphabetisch</option>
            <option value="status">Status</option>
          </select>

          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

          {/* Status chips */}
          {STATUS_ORDER.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(f => f === s ? null : s)}
              className="chip"
              data-tone={statusFilter === s ? STATUS_TONE[s] : ''}
              style={{
                cursor: 'pointer',
                opacity: statusFilter && statusFilter !== s ? 0.45 : 1,
                transition: 'opacity 120ms',
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {/* List */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              color: 'var(--fg-dim)', fontSize: 13,
            }}>
              Keine Clients gefunden
            </div>
          ) : (
            filtered.map((c, i) => {
              const lastAct = activityMap.get(c.id) ?? c.updatedAt
              const isActive = i === activeIdx
              return (
                <div
                  key={c.id}
                  onClick={() => open(c.id)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '10px 20px', cursor: 'pointer',
                    background: isActive ? 'var(--surface-2)' : 'none',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 60ms',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: isActive ? 'var(--accent)' : 'var(--surface-2)',
                    color: isActive ? 'var(--accent-ink)' : 'var(--fg-muted)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    transition: 'background 60ms, color 60ms',
                  }}>
                    {c.name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Name + company */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.name}
                    </div>
                    {c.company && (
                      <div style={{
                        fontSize: 11, color: 'var(--fg-dim)', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.company}
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)', fontVariantNumeric: 'tabular-nums' }}>
                      {relTime(lastAct)}
                    </span>
                    <span className="chip" data-tone={STATUS_TONE[c.status]} style={{ fontSize: 10 }}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {filtered.length} Client{filtered.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg-dim)', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Kbd>↑↓</Kbd> Navigieren</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Kbd>↵</Kbd> Öffnen</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Kbd>ESC</Kbd> Schließen</span>
          </div>
        </div>
      </div>
    </div>
  )
}
