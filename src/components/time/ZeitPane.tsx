import { useEffect, useState } from 'react'
import { useTimeStore } from '@/store/time.store'

interface Props {
  customerId: string
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ZeitPane({ customerId }: Props) {
  const { entries, loadForCustomer, add, remove } = useTimeStore()
  const [desc, setDesc] = useState('')
  const [hours, setHours] = useState('')
  const [mins, setMins] = useState('')
  const [date, setDate] = useState(todayISO())

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0)

  const submit = async () => {
    const description = desc.trim()
    if (!description) return
    const minutes = (parseInt(hours || '0') * 60) + parseInt(mins || '0')
    if (minutes <= 0) return
    await add({ customerId, description, minutes, date })
    setDesc('')
    setHours('')
    setMins('')
    setDate(todayISO())
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="flex gap-4">
        <div className="flex-1 p-4 rounded-lg bg-[var(--bg1)] text-center">
          <p className="text-2xl font-bold text-[var(--text)]">{formatMinutes(totalMinutes)}</p>
          <p className="text-xs text-[var(--text2)] mt-1">Gesamt</p>
        </div>
        <div className="flex-1 p-4 rounded-lg bg-[var(--bg1)] text-center">
          <p className="text-2xl font-bold text-[var(--text)]">{entries.length}</p>
          <p className="text-xs text-[var(--text2)] mt-1">Einträge</p>
        </div>
      </div>

      {/* Add form */}
      <div className="flex flex-col gap-2 p-4 rounded-lg border border-[var(--border)]">
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Neuer Eintrag</p>
        <input
          placeholder="Beschreibung *"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2">
          <input
            type="number" min="0" placeholder="Std"
            value={hours}
            onChange={e => setHours(e.target.value)}
            className="w-20 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="number" min="0" max="59" placeholder="Min"
            value={mins}
            onChange={e => setMins(e.target.value)}
            className="w-20 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={submit}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            +
          </button>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Einträge</h3>
        {entries.map(entry => (
          <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg1)] group">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text)] truncate">{entry.description}</p>
              <p className="text-xs text-[var(--text2)]">{entry.date}</p>
            </div>
            <span className="text-sm font-medium text-[var(--text)] shrink-0">
              {formatMinutes(entry.minutes)}
            </span>
            <button
              onClick={() => remove(entry.id)}
              className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-6">Keine Zeiteinträge</p>
        )}
      </div>
    </div>
  )
}
