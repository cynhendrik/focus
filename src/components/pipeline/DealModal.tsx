import { useState, useEffect } from 'react'
import { useDealsStore } from '@/store/deals.store'
import { usePipelineStore } from '@/store/pipeline.store'
import { useCustomersStore } from '@/store/customers.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { useAuthStore } from '@/store/auth.store'
import type { Deal, UpsertDealPayload } from '@/types/pipeline.types'

interface Props {
  initial?: Deal
  presetCustomerId?: string
  presetStage?: string
  onClose: () => void
}

export function DealModal({ initial, presetCustomerId, presetStage, onClose }: Props) {
  const upsert = useDealsStore(s => s.upsert)
  const stages = usePipelineStore(s => s.stages)
  const customers = useCustomersStore(s => s.customers)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId) ?? ''
  const user = useAuthStore(s => s.user)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? presetCustomerId ?? '')
  const [stage, setStage] = useState(initial?.stage ?? presetStage ?? stages[0]?.name ?? '')
  const [value, setValue] = useState(initial?.value?.toString() ?? '')
  const [probability, setProbability] = useState(initial?.probability?.toString() ?? '')
  const [expectedClose, setExpectedClose] = useState(initial?.expectedClose ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (stages.length > 0 && !stage) setStage(stages[0].name)
  }, [stages])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const payload: UpsertDealPayload = {
      id: initial?.id,
      workspaceId,
      createdBy: user?.email ?? 'user',
      accountId: customerId || workspaceId,
      customerId: customerId || undefined,
      title: title.trim(),
      stage,
      value: value ? parseFloat(value) : undefined,
      probability: probability ? parseInt(probability) : undefined,
      expectedClose: expectedClose || undefined,
    }
    try {
      await upsert(payload)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
          {initial ? 'Deal bearbeiten' : 'Neuer Deal'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Titel</label>
            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Website Relaunch"
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Kunde</label>
            <select className="mock-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">— Kein Kunde —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Stage</label>
            <select className="mock-input" value={stage} onChange={e => setStage(e.target.value)}>
              {stages.map(s => (
                <option key={s.id} value={s.name}>{s.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Wert (€)</label>
              <input className="mock-input" type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Wahrscheinlichkeit (%)</label>
              <input className="mock-input" type="number" min="0" max="100" value={probability} onChange={e => setProbability(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Expected Close</label>
            <input className="mock-input" type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
