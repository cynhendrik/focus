import { useEffect, useState } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import type { Customer, CustomerStatus, Priority, UpsertCustomerPayload } from '@/types/customer.types'

interface Props {
  customer?: Customer | null
  onClose: () => void
}

const EMPTY: UpsertCustomerPayload = {
  name: '', company: '', email: '', phone: '',
  status: 'aktiv', priority: 'normal', tags: [],
}

export function CustomerModal({ customer, onClose }: Props) {
  const { upsert, remove } = useCustomersStore()
  const [form, setForm] = useState<UpsertCustomerPayload>(EMPTY)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (customer) {
      setForm({
        id: customer.id,
        name: customer.name,
        company: customer.company ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        status: customer.status,
        priority: customer.priority,
        tags: customer.tags ?? [],
      })
    } else {
      setForm(EMPTY)
    }
  }, [customer])

  const set = (key: keyof UpsertCustomerPayload, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || form.tags?.includes(t)) return
    setForm(f => ({ ...f, tags: [...(f.tags ?? []), t] }))
    setTagInput('')
  }

  const removeTag = (tag: string) =>
    setForm(f => ({ ...f, tags: (f.tags ?? []).filter(t => t !== tag) }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await upsert({ ...form, name: form.name.trim() })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!customer) return
    await remove(customer.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg)] rounded-2xl w-[480px] shadow-2xl border border-[var(--border)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {customer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
          </h2>
          <button onClick={onClose} className="text-[var(--text2)] hover:text-[var(--text)] text-lg">✕</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-3">
          <input
            placeholder="Name *"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            placeholder="Unternehmen"
            value={form.company ?? ''}
            onChange={e => set('company', e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="E-Mail"
              type="email"
              value={form.email ?? ''}
              onChange={e => set('email', e.target.value)}
              className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              placeholder="Telefon"
              value={form.phone ?? ''}
              onChange={e => set('phone', e.target.value)}
              className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[var(--text2)] mb-1">Status</p>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as CustomerStatus)}
                className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none"
              >
                <option value="lead">Lead</option>
                <option value="aktiv">Aktiv</option>
                <option value="inaktiv">Inaktiv</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-[var(--text2)] mb-1">Priorität</p>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value as Priority)}
                className="w-full text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none"
              >
                <option value="low">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="high">Hoch</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs text-[var(--text2)] mb-1">Tags</p>
            <div className="flex gap-2 flex-wrap mb-2">
              {(form.tags ?? []).map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-400">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                placeholder="Tag hinzufügen…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={addTag} className="px-3 py-1.5 rounded-lg bg-[var(--bg1)] text-[var(--text2)] border border-[var(--border)] text-sm hover:text-[var(--text)]">+</button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? 'Speichern…' : customer ? 'Speichern' : 'Anlegen'}
          </button>
          {customer && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-400/10"
            >
              Löschen
            </button>
          )}
          {customer && confirmDelete && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600"
            >
              Wirklich löschen?
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
