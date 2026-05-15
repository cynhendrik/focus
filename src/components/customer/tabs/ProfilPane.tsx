import { useState, useEffect } from 'react'
import { useCustomersStore } from '@/store/customers.store'
import type { Customer, CustomerStatus, Priority, SocialLinks } from '@/types/customer.types'

const STATUS_OPTIONS: CustomerStatus[] = ['aktiv', 'lead', 'inaktiv', 'lost']
const PRIORITY_OPTIONS: Priority[] = ['normal', 'high', 'low']

interface Props { customerId: string }

export function ProfilPane({ customerId }: Props) {
  const customer = useCustomersStore(s => s.customers.find(c => c.id === customerId))
  const upsert   = useCustomersStore(s => s.upsert)

  const [form, setForm]         = useState<Partial<Customer>>({})
  const [goalInput, setGoalInput] = useState('')

  useEffect(() => {
    if (customer) setForm(customer)
  }, [customer?.id])

  if (!customer) return null

  const save = (patch: Partial<Customer>) => {
    const next = { ...form, ...patch }
    setForm(next)
    upsert({
      id: customerId,
      name: next.name ?? customer.name,
      company: next.company,
      email: next.email,
      phone: next.phone,
      status: next.status,
      priority: next.priority,
      tags: next.tags,
      industry: next.industry,
      contactPerson: next.contactPerson,
      goals: next.goals,
      socialLinks: next.socialLinks,
      internalNotes: next.internalNotes,
    })
  }

  const socialLinks: SocialLinks = (() => {
    try { return JSON.parse(form.socialLinks ?? '{}') } catch { return {} }
  })()

  const saveSocialLinks = (patch: Partial<SocialLinks>) => {
    save({ socialLinks: JSON.stringify({ ...socialLinks, ...patch }) })
  }

  const addGoal = () => {
    if (!goalInput.trim()) return
    save({ goals: [...(form.goals ?? []), goalInput.trim()] })
    setGoalInput('')
  }

  const removeGoal = (i: number) => {
    save({ goals: (form.goals ?? []).filter((_, idx) => idx !== i) })
  }

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--text2)] font-medium">{label}</label>
      {node}
    </div>
  )

  const input = (value: string | undefined, onBlur: (v: string) => void, placeholder = '') => (
    <input
      defaultValue={value ?? ''}
      onBlur={e => onBlur(e.target.value)}
      placeholder={placeholder}
      className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )

  return (
    <div className="p-6 max-w-xl flex flex-col gap-5">
      <h2 className="text-sm font-semibold text-[var(--text)]">Stammdaten</h2>

      <div className="grid grid-cols-2 gap-4">
        {field('Name', input(form.name, v => save({ name: v })))}
        {field('Unternehmen', input(form.company, v => save({ company: v })))}
        {field('Branche', input(form.industry, v => save({ industry: v }), 'z.B. Marketing'))}
        {field('Ansprechpartner', input(form.contactPerson, v => save({ contactPerson: v })))}
        {field('E-Mail', input(form.email, v => save({ email: v })))}
        {field('Telefon', input(form.phone, v => save({ phone: v })))}

        {field('Status', (
          <select
            value={form.status ?? customer.status}
            onChange={e => save({ status: e.target.value as CustomerStatus })}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ))}

        {field('Priorität', (
          <select
            value={form.priority ?? customer.priority}
            onChange={e => save({ priority: e.target.value as Priority })}
            className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none"
          >
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ))}
      </div>

      {/* Goals */}
      {field('Ziele', (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGoal()}
              placeholder="Ziel hinzufügen…"
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={addGoal} className="px-3 py-2 rounded-lg bg-primary text-white text-sm">+</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(form.goals ?? []).map((g, i) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                {g}
                <button onClick={() => removeGoal(i)} className="hover:text-red-400 ml-0.5">✕</button>
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* Social Links */}
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--text2)] font-medium">Social Links</p>
        <div className="grid grid-cols-1 gap-2">
          {field('Instagram', input(socialLinks.instagram, v => saveSocialLinks({ instagram: v }), '@handle'))}
          {field('LinkedIn', input(socialLinks.linkedin, v => saveSocialLinks({ linkedin: v }), 'linkedin.com/in/…'))}
          {field('Website', input(socialLinks.website, v => saveSocialLinks({ website: v }), 'https://…'))}
        </div>
      </div>

      {/* Internal Notes */}
      {field('Interne Infos', (
        <textarea
          defaultValue={form.internalNotes ?? ''}
          onBlur={e => save({ internalNotes: e.target.value })}
          rows={4}
          placeholder="Interne Notizen…"
          className="text-sm px-3 py-2 rounded-lg bg-[var(--bg1)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      ))}
    </div>
  )
}
