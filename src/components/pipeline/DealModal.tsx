import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
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
  const remove = useDealsStore(s => s.remove)
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const lockedCustomer = presetCustomerId ? customers.find(c => c.id === presetCustomerId) : null

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

  const handleDelete = async () => {
    if (!initial) return
    setDeleting(true)
    try {
      await remove(initial.id)
      onClose()
    } finally {
      setDeleting(false)
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
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
          {initial ? 'Deal bearbeiten' : 'Zur Pipeline hinzufügen'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Kunde — fixe Badge wenn aus Kundenprofil, sonst Dropdown mit Profilinfos */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Kunde</label>
            {lockedCustomer ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{lockedCustomer.name}</div>
                  {(lockedCustomer.company || lockedCustomer.email) && (
                    <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 1 }}>
                      {lockedCustomer.company ?? lockedCustomer.email}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <select className="mock-input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">— Kunden auswählen —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` · ${c.company}` : ''}{c.email ? ` (${c.email})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Wofür — Hauptfeld */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Wofür</label>
            <input
              className="mock-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="z.B. Website Relaunch, SEO-Paket, Retainer…"
              autoFocus={!lockedCustomer}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Phase</label>
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
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 5 }}>Abschluss bis</label>
            <input className="mock-input" type="date" value={expectedClose} onChange={e => setExpectedClose(e.target.value)} />
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          justifyContent: 'space-between', marginTop: 24,
        }}>
          {/* Loeschen-Button nur im Edit-Modus, links separiert.
              Zwei-Klick-Confirm verhindert Fehlklicks. */}
          {initial ? (
            confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8,
                    background: 'oklch(72% 0.18 25)', color: '#fff',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  }}
                >
                  <Trash2 size={12} />
                  {deleting ? 'Loesche…' : 'Wirklich loeschen'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  style={{
                    padding: '7px 10px', borderRadius: 8,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--fg-muted)', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 11.5,
                  }}
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Deal loeschen"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--fg-muted)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 11.5,
                  transition: 'color 140ms, border-color 140ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'oklch(72% 0.18 25)'
                  e.currentTarget.style.borderColor = 'oklch(72% 0.18 25 / 0.45)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--fg-muted)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <Trash2 size={12} /> Loeschen
              </button>
            )
          ) : <span />}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12, padding: '7px 16px' }}>Abbrechen</button>
            <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary" style={{ fontSize: 12, padding: '7px 16px' }}>
              {saving ? 'Wird hinzugefügt…' : initial ? 'Speichern' : 'Zur Pipeline hinzufügen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
