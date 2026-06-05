import { useState, useMemo } from 'react'
import { Clock, Plus, Trash2 } from 'lucide-react'
import { useAccountsStore } from '@/store/accounts.store'

interface TimeEntry {
  id:          string
  date:        string   // ISO date
  accountId:   string | null
  description: string
  minutes:     number
}

const STORAGE_KEY = 'cynera-zeitplan-v1'

function loadEntries(): TimeEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

function saveEntries(entries: TimeEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function todayISO() {
  return new Date().toLocaleDateString('sv')
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} Min`
  if (min === 0) return `${h} Std`
  return `${h} Std ${min} Min`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const today = todayISO()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yISO = yesterday.toLocaleDateString('sv')
  if (iso === today) return 'Heute'
  if (iso === yISO) return 'Gestern'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export function ZeitmanagementRoute() {
  const accounts = useAccountsStore(s => s.accounts.filter(a => !a.isPrivate))
  const [entries, setEntries] = useState<TimeEntry[]>(loadEntries)

  // Form state
  const [date,        setDate]        = useState(todayISO())
  const [accountId,   setAccountId]   = useState<string>('')
  const [description, setDescription] = useState('')
  const [hours,       setHours]       = useState('')
  const [mins,        setMins]        = useState('')

  const addEntry = () => {
    const h = parseInt(hours || '0', 10)
    const m = parseInt(mins  || '0', 10)
    const totalMins = h * 60 + m
    if (!description.trim() || totalMins <= 0) return
    const entry: TimeEntry = {
      id:          `ze_${Date.now()}`,
      date,
      accountId:   accountId || null,
      description: description.trim(),
      minutes:     totalMins,
    }
    const next = [entry, ...entries]
    setEntries(next)
    saveEntries(next)
    setDescription('')
    setHours('')
    setMins('')
  }

  const removeEntry = (id: string) => {
    const next = entries.filter(e => e.id !== id)
    setEntries(next)
    saveEntries(next)
  }

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of entries) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

  // Total this week
  const weekTotal = useMemo(() => {
    const mon = new Date()
    const day = mon.getDay()
    mon.setDate(mon.getDate() - (day === 0 ? 6 : day - 1))
    mon.setHours(0, 0, 0, 0)
    return entries
      .filter(e => new Date(e.date) >= mon)
      .reduce((s, e) => s + e.minutes, 0)
  }, [entries])

  const todayTotal = useMemo(() =>
    entries.filter(e => e.date === todayISO()).reduce((s, e) => s + e.minutes, 0),
  [entries])

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'rgba(255,255,255,0.03)',
    color: 'var(--fg)', fontSize: 13, outline: 'none',
    fontFamily: 'inherit',
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 28px 64px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-dim)', fontWeight: 600, marginBottom: 6,
        }}>Zeitmanagement</div>
        <h1 style={{
          fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em',
          color: 'var(--fg)', margin: 0, lineHeight: 1.1,
        }}>Arbeitszeitplan</h1>
      </div>

      {/* KPI-Zeile */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Heute', value: fmtMinutes(todayTotal), dim: todayTotal === 0 },
          { label: 'Diese Woche', value: fmtMinutes(weekTotal), dim: weekTotal === 0 },
        ].map(kpi => (
          <div key={kpi.label} style={{
            padding: '16px 20px', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: kpi.dim ? 'var(--fg-dim)' : 'var(--fg)', letterSpacing: '-0.02em' }}>{kpi.dim ? '—' : kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Neue Eintragung */}
      <div style={{
        padding: '20px', borderRadius: 14,
        border: '1px solid rgba(181,240,35,0.2)',
        background: 'rgba(181,240,35,0.03)',
        marginBottom: 28,
      }}>
        <div style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, marginBottom: 12,
        }}>+ Eintrag erfassen</div>

        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, marginBottom: 8 }}>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle }}
          />
          <select
            value={accountId} onChange={e => setAccountId(e.target.value)}
            style={{ ...inputStyle }}
          >
            <option value="">Kein Kunde (intern)</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px auto', gap: 8 }}>
          <input
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Was wurde gemacht?"
            onKeyDown={e => e.key === 'Enter' && addEntry()}
            style={{ ...inputStyle }}
          />
          <input
            type="number" value={hours} onChange={e => setHours(e.target.value)}
            placeholder="Std" min="0" max="23"
            style={{ ...inputStyle, textAlign: 'center' }}
          />
          <input
            type="number" value={mins} onChange={e => setMins(e.target.value)}
            placeholder="Min" min="0" max="59" step="15"
            style={{ ...inputStyle, textAlign: 'center' }}
          />
          <button
            onClick={addEntry}
            disabled={!description.trim() || (parseInt(hours||'0')*60 + parseInt(mins||'0')) <= 0}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: !description.trim() ? 'rgba(255,255,255,0.06)' : 'var(--accent)',
              color: !description.trim() ? 'var(--fg-dim)' : 'var(--accent-ink)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Erfassen
          </button>
        </div>
      </div>

      {/* Einträge nach Tag */}
      {grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--fg-dim)' }}>
          <Clock size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 4 }}>Noch keine Einträge</div>
          <div style={{ fontSize: 12 }}>Erfasse deinen ersten Arbeitseintrag oben</div>
        </div>
      ) : (
        grouped.map(([date, dayEntries]) => {
          const dayTotal = dayEntries.reduce((s, e) => s + e.minutes, 0)
          return (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--fg-dim)',
                  fontFamily: 'var(--font-mono)',
                }}>{fmtDate(date)}</span>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  color: 'var(--fg-dim)', background: 'rgba(255,255,255,0.05)',
                  padding: '2px 8px', borderRadius: 99,
                }}>{fmtMinutes(dayTotal)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayEntries.map(entry => {
                  const account = accounts.find(a => a.id === entry.accountId)
                  return (
                    <div key={entry.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.07)',
                      background: 'rgba(255,255,255,0.02)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', marginBottom: 2 }}>
                          {entry.description}
                        </div>
                        {account && (
                          <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                            {account.name}
                          </div>
                        )}
                        {!account && (
                          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Intern</div>
                        )}
                      </div>
                      <div style={{
                        fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600,
                        color: 'var(--fg-muted)', flexShrink: 0,
                      }}>{fmtMinutes(entry.minutes)}</div>
                      <button
                        onClick={() => removeEntry(entry.id)}
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: 'none',
                          background: 'transparent', color: 'var(--fg-dim)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      ><Trash2 size={12} /></button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
