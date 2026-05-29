import { useState, useMemo } from 'react'
import { useSmartListsStore } from '@/store/smart-lists.store'
import { useWorkspaceStore }  from '@/store/workspace.store'
import { useCustomersStore }  from '@/store/customers.store'
import type { SmartList, SmartListFilter } from '@/types/smart-list.types'
import type { CustomerStatus, Priority } from '@/types/customer.types'

const ICONS   = ['📋', '🔥', '⚠️', '💤', '☠️', '⭐', '🎯', '📈']

const STATUS_OPTS: { value: CustomerStatus; label: string }[] = [
  { value: 'lead',    label: 'Lead'    },
  { value: 'aktiv',  label: 'Aktiv'   },
  { value: 'inaktiv',label: 'Inaktiv' },
  { value: 'lost',   label: 'Lost'    },
]

const PRIO_OPTS: { value: Priority; label: string }[] = [
  { value: 'low',    label: 'Low'    },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High'   },
]

function toggle<T>(arr: T[] | undefined, val: T): T[] | undefined {
  const cur = arr ?? []
  const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val]
  return next.length ? next : undefined
}

export function SmartListModal({ initial, onClose }: {
  initial: SmartList | null
  onClose: () => void
}) {
  const upsert      = useSmartListsStore(s => s.upsert)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''

  const [name,   setName]   = useState(initial?.name ?? '')
  const [icon,   setIcon]   = useState(initial?.icon ?? '📋')
  const [filter, setFilter] = useState<SmartListFilter>(initial?.filter ?? {})
  const [saving, setSaving] = useState(false)

  const customers = useCustomersStore(s => s.customers)
  const availableIndustries = useMemo(() => {
    const set = new Set<string>()
    for (const c of customers) {
      if (c.industry && c.industry.trim()) set.add(c.industry.trim())
    }
    return [...set].sort()
  }, [customers])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await upsert({
        id:         initial?.id,
        workspaceId,
        name:       name.trim(),
        icon,
        filter,
        orderIndex: initial?.orderIndex,
        isSystem:   initial?.isSystem,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: 400, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          {initial ? 'Liste bearbeiten' : 'Neue Smart List'}
        </h3>

        {/* Name */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Heiße Leads"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>

        {/* Icon */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Icon</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ICONS.map(ic => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                style={{
                  width: 34, height: 34, borderRadius: 8, fontSize: 16,
                  border: `1.5px solid ${icon === ic ? 'var(--accent)' : 'var(--border)'}`,
                  background: icon === ic ? 'var(--accent-soft)' : 'transparent',
                  cursor: 'pointer',
                }}
              >{ic}</button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Status</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {STATUS_OPTS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filter.status?.includes(opt.value) ?? false}
                  onChange={() => setFilter(f => ({ ...f, status: toggle(f.status, opt.value) }))}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Priorität */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Priorität</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {PRIO_OPTS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filter.priority?.includes(opt.value) ?? false}
                  onChange={() => setFilter(f => ({ ...f, priority: toggle(f.priority, opt.value) }))}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Lead Score */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Lead Score</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span>Min</span>
            <input
              type="number" min={0} max={100}
              value={filter.scoreMin ?? ''}
              onChange={e => setFilter(f => ({ ...f, scoreMin: e.target.value ? Number(e.target.value) : undefined }))}
              style={{ width: 64, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}
            />
            <span>Max</span>
            <input
              type="number" min={0} max={100}
              value={filter.scoreMax ?? ''}
              onChange={e => setFilter(f => ({ ...f, scoreMax: e.target.value ? Number(e.target.value) : undefined }))}
              style={{ width: 64, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}
            />
          </div>
        </div>

        {/* Kein Kontakt seit */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>
            Kein Kontakt seit (Tage)
          </label>
          <input
            type="number" min={1}
            value={filter.inactiveDays ?? ''}
            onChange={e => setFilter(f => ({ ...f, inactiveDays: e.target.value ? Number(e.target.value) : undefined }))}
            placeholder="z.B. 14"
            style={{ width: 88, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 12 }}
          />
        </div>

        {/* Tags */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>
            Tags (kommagetrennt)
          </label>
          <input
            type="text"
            value={(filter.tags ?? []).join(', ')}
            onChange={e => {
              const raw = e.target.value
              const tags = raw.split(',').map(t => t.trim()).filter(Boolean)
              setFilter(f => ({ ...f, tags: tags.length ? tags : undefined }))
            }}
            placeholder="z.B. vip, webinar-2025"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>
            Kunde muss ALLE genannten Tags haben (AND-Logik).
          </div>
        </div>

        {/* Industry */}
        {availableIndustries.length > 0 && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 }}>Branche</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableIndustries.map(ind => {
                const active = filter.industry?.includes(ind) ?? false
                return (
                  <button
                    key={ind}
                    onClick={() => setFilter(f => ({ ...f, industry: toggle(f.industry, ind) }))}
                    style={{
                      padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 500,
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      color:      active ? 'var(--accent)' : 'var(--fg-muted)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {ind}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Aktionen */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: 13 }}>Abbrechen</button>
          <button
            onClick={handleSave}
            className="btn-primary"
            disabled={saving || !name.trim()}
            style={{ fontSize: 13 }}
          >{saving ? 'Speichert…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}
