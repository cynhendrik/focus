import { useEffect, useState } from 'react'
import { useKpisStore } from '@/store/kpis.store'
import { useTodosStore } from '@/store/todos.store'
import { useCrmStore } from '@/store/crm.store'
import { computeHealthScore } from '@/lib/healthScore'
import type { Kpi } from '@/types/kpi.types'

interface Props {
  customerId: string
}

const EMPTY_FORM = { label: '', value: '', unit: '', target: '', period: '' }

export function DashboardPane({ customerId }: Props) {
  const kpis            = useKpisStore(s => s.kpis)
  const loadForCustomer = useKpisStore(s => s.loadForCustomer)
  const upsert          = useKpisStore(s => s.upsert)
  const remove          = useKpisStore(s => s.remove)
  const todos = useTodosStore(s => s.todos)
  const followUps = useCrmStore(s => s.followUps)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { loadForCustomer(customerId) }, [customerId])

  const health = computeHealthScore(todos, kpis, followUps)

  const startEdit = (kpi: Kpi) => {
    setEditingId(kpi.id)
    setForm({
      label: kpi.label,
      value: kpi.value?.toString() ?? '',
      unit: kpi.unit ?? '',
      target: kpi.target?.toString() ?? '',
      period: kpi.period ?? '',
    })
  }

  const save = async () => {
    if (!form.label.trim()) return
    await upsert({
      id: editingId ?? undefined,
      customerId,
      label: form.label.trim(),
      value: form.value ? parseFloat(form.value) : undefined,
      unit: form.unit || undefined,
      target: form.target ? parseFloat(form.target) : undefined,
      period: form.period || undefined,
    })
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const progress = (kpi: Kpi) => {
    if (kpi.value == null || kpi.target == null || kpi.target === 0) return null
    return Math.min(100, Math.round((kpi.value / kpi.target) * 100))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Health Score */}
      <div className="p-4 rounded-lg bg-[var(--bg1)] flex items-center gap-4">
        <div className={`text-4xl font-bold ${health.color}`}>{health.score}</div>
        <div>
          <p className={`text-sm font-semibold ${health.color}`}>{health.label}</p>
          <p className="text-xs text-[var(--text2)]">Health Score</p>
        </div>
        <div className="ml-auto flex gap-4 text-xs text-[var(--text2)]">
          <span>Todos {health.factors.todoCompletion}%</span>
          <span>KPIs {health.factors.kpiProgress}%</span>
          <span>CRM {health.factors.followUpHealth}%</span>
        </div>
      </div>

      <h3 className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">KPIs</h3>

      {/* KPI List */}
      <div className="flex flex-col gap-2">
        {kpis.map(kpi => {
          const pct = progress(kpi)
          return (
            <div
              key={kpi.id}
              className="p-3 rounded-lg bg-[var(--bg1)] flex items-center gap-4 group cursor-pointer"
              onClick={() => startEdit(kpi)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-[var(--text)]">{kpi.label}</span>
                  {kpi.period && <span className="text-xs text-[var(--text2)]">{kpi.period}</span>}
                </div>
                {pct !== null && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-[var(--bg)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-primary' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-lg font-semibold text-[var(--text)]">
                  {kpi.value ?? '–'}
                </span>
                {kpi.unit && <span className="text-xs text-[var(--text2)] ml-1">{kpi.unit}</span>}
                {kpi.target != null && (
                  <p className="text-xs text-[var(--text2)]">Ziel: {kpi.target}{kpi.unit ?? ''}</p>
                )}
              </div>
              <button
                onClick={e => { e.stopPropagation(); remove(kpi.id) }}
                className="opacity-0 group-hover:opacity-100 text-[var(--text2)] hover:text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          )
        })}
        {kpis.length === 0 && (
          <p className="text-sm text-[var(--text2)] text-center py-6">Noch keine KPIs</p>
        )}
      </div>

      {/* Add / Edit Form */}
      <div className="p-4 rounded-lg border border-[var(--border)] flex flex-col gap-3">
        <p className="text-xs font-semibold text-[var(--text2)] uppercase tracking-wider">
          {editingId ? 'KPI bearbeiten' : 'KPI hinzufügen'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Bezeichnung *"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="col-span-2 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            placeholder="Wert"
            type="number"
            value={form.value}
            onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            placeholder="Einheit (€, %, h…)"
            value={form.unit}
            onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
            className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            placeholder="Zielwert"
            type="number"
            value={form.target}
            onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
            className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            placeholder="Zeitraum (Q1, 2026…)"
            value={form.period}
            onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
            className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark">
            {editingId ? 'Speichern' : 'Hinzufügen'}
          </button>
          {editingId && (
            <button onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }} className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:text-[var(--text)]">
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
