import { useEffect, useState } from 'react'
import { useCrmStore } from '@/store/crm.store'
import type { FollowUpPriority, FollowUpStatus } from '@/types/crm.types'

interface Props {
  customerId: string
}

const PRIORITY_LABEL: Record<FollowUpPriority, string> = { low: 'Niedrig', normal: 'Normal', high: 'Hoch' }
const PRIORITY_COLOR: Record<FollowUpPriority, string> = {
  low: 'text-[var(--text2)]',
  normal: 'text-amber-500',
  high: 'text-red-500',
}

export function CrmPane({ customerId }: Props) {
  const { followUps, loadForCustomer, upsert, remove } = useCrmStore()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<FollowUpPriority>('normal')

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const add = async () => {
    const t = title.trim()
    if (!t || !dueDate) return
    await upsert({ customerId, title: t, dueDate, priority })
    setTitle('')
    setDueDate('')
    setPriority('normal')
  }

  const toggleStatus = (fu: { id: string; customerId: string; title: string; dueDate: string; priority: FollowUpPriority; status: FollowUpStatus }) => {
    upsert({
      id: fu.id, customerId: fu.customerId, title: fu.title, dueDate: fu.dueDate,
      priority: fu.priority, status: fu.status === 'offen' ? 'erledigt' : 'offen',
    })
  }

  const open = followUps.filter(f => f.status === 'offen')
  const done = followUps.filter(f => f.status === 'erledigt')

  return (
    <div className="flex flex-col gap-6">
      {/* Add form */}
      <div className="p-4 rounded-lg border border-[var(--border)] flex flex-col gap-3">
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">Follow-Up hinzufügen</p>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Titel *"
            className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={priority}
            onChange={e => setPriority(e.target.value as FollowUpPriority)}
            className="text-sm px-2 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none"
          >
            <option value="low">Niedrig</option>
            <option value="normal">Normal</option>
            <option value="high">Hoch</option>
          </select>
          <button onClick={add} className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">
            +
          </button>
        </div>
      </div>

      {/* Open */}
      <section>
        <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider mb-2">
          Offen ({open.length})
        </h3>
        {open.length === 0 && (
          <p className="text-sm text-[var(--text2)] py-4 text-center">Keine offenen Follow-Ups</p>
        )}
        <div className="flex flex-col gap-1.5">
          {open.map(fu => (
            <div key={fu.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg1)] group">
              <button onClick={() => toggleStatus(fu)} className="w-4 h-4 rounded border border-[var(--border)] hover:border-primary flex-shrink-0" />
              <span className="flex-1 text-sm text-[var(--text)]">{fu.title}</span>
              <span className={`text-xs ${PRIORITY_COLOR[fu.priority as FollowUpPriority]}`}>
                {PRIORITY_LABEL[fu.priority as FollowUpPriority]}
              </span>
              <span className="text-xs text-[var(--text2)]">{fu.dueDate}</span>
              <button
                onClick={() => remove(fu.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Done */}
      {done.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider mb-2">
            Erledigt ({done.length})
          </h3>
          <div className="flex flex-col gap-1.5">
            {done.map(fu => (
              <div key={fu.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg1)] group opacity-60">
                <button onClick={() => toggleStatus(fu)} className="w-4 h-4 rounded border border-green-500 bg-green-500 flex-shrink-0" />
                <span className="flex-1 text-sm text-[var(--text)] line-through">{fu.title}</span>
                <span className="text-xs text-[var(--text2)]">{fu.dueDate}</span>
                <button
                  onClick={() => remove(fu.id)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
